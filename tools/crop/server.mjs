// Crop & straighten tool for artwork photos.
//
//   npm run crop
//
// Opens a page where you drag four corner points onto the artwork in a photo.
// Pressing OK maps that four-sided shape onto a rectangle (undoing the
// perspective of a photo taken at an angle), crops to it and saves over the
// original file. Nothing else about the image is changed. The original is kept
// in .crop-backups/ so it can be restored with Undo.

import { createServer } from 'node:http';
import { readFile, readdir, mkdir, copyFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, extname, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const ARTWORKS = resolve(process.env.ARTWORKS_DIR ?? join(root, 'src/content/artworks'));
const BACKUPS = resolve(process.env.BACKUPS_DIR ?? join(root, '.crop-backups'));
const PORT = Number(process.env.PORT ?? 4400);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// ---------------------------------------------------------------------------
// Files

/** Resolve "folder/file.jpg" inside the artworks folder, refusing anything outside it. */
function artworkPath(rel) {
  const full = resolve(ARTWORKS, String(rel ?? ''));
  if (!full.startsWith(ARTWORKS + sep) || !IMAGE_EXT.has(extname(full).toLowerCase())) {
    throw Object.assign(new Error('Invalid image path'), { status: 400 });
  }
  return full;
}

async function listImages() {
  const folders = (await readdir(ARTWORKS, { withFileTypes: true })).filter((d) => d.isDirectory());
  const out = [];
  for (const folder of folders.map((d) => d.name).sort()) {
    let info = {};
    try {
      info = JSON.parse(await readFile(join(ARTWORKS, folder, 'artwork.json'), 'utf8'));
    } catch {}
    const files = (await readdir(join(ARTWORKS, folder)))
      .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const file of files) {
      const path = `${folder}/${file}`;
      out.push({
        path,
        folder,
        file,
        title: info.title ?? folder,
        dimensions: info.dimensions ?? '',
        version: (await stat(artworkPath(path))).mtimeMs,
        hasBackup: existsSync(join(BACKUPS, folder, file)),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Perspective warp

/** Solve A·x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw Object.assign(new Error('Corners are degenerate'), { status: 400 });
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Homography taking points in `from` to points in `to` (4 pairs of [x, y]).
 * Returns [a..h] for: x' = (a·x + b·y + c) / (g·x + h·y + 1), y' = (d·x + e·y + f) / (same).
 */
function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(A, b);
}

/**
 * Map the quadrilateral `corners` (top-left, top-right, bottom-right, bottom-left,
 * in source pixels) onto a width × height rectangle, sampling bilinearly.
 */
async function warp(file, corners, width, height) {
  // .rotate() applies any EXIF orientation, matching what the browser displayed.
  const { data, info } = await sharp(file).rotate().raw().toBuffer({ resolveWithObject: true });
  const { width: sw, height: sh, channels } = info;
  const out = Buffer.alloc(width * height * channels);
  // For each output pixel centre, find where it comes from in the source.
  const rect = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const [a, b, c, d, e, f, g, h] = homography(rect, corners);
  for (let y = 0; y < height; y++) {
    const oy = y + 0.5;
    for (let x = 0; x < width; x++) {
      const ox = x + 0.5;
      const w = g * ox + h * oy + 1;
      // Source position, converted from pixel-edge to pixel-centre coordinates.
      const sx = Math.min(sw - 1, Math.max(0, (a * ox + b * oy + c) / w - 0.5));
      const sy = Math.min(sh - 1, Math.max(0, (d * ox + e * oy + f) / w - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * channels;
      const i10 = (y0 * sw + x1) * channels;
      const i01 = (y1 * sw + x0) * channels;
      const i11 = (y1 * sw + x1) * channels;
      const o = (y * width + x) * channels;
      for (let k = 0; k < channels; k++) {
        const top = data[i00 + k] + (data[i10 + k] - data[i00 + k]) * fx;
        const bottom = data[i01 + k] + (data[i11 + k] - data[i01 + k]) * fx;
        out[o + k] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  let img = sharp(out, { raw: { width, height, channels } }).keepIccProfile();
  const ext = extname(file).toLowerCase();
  if (ext === '.png') img = img.png();
  else if (ext === '.webp') img = img.webp({ quality: 95 });
  else img = img.jpeg({ quality: 95 });
  return img.toBuffer();
}

// ---------------------------------------------------------------------------
// HTTP

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, await readFile(join(here, 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/images') {
      return send(res, 200, await listImages());
    }
    if (req.method === 'GET' && url.pathname === '/image') {
      const file = artworkPath(url.searchParams.get('path'));
      const thumb = url.searchParams.has('thumb');
      const data = thumb
        ? await sharp(file).rotate().resize(160, 160, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer()
        : await readFile(file);
      const type = thumb ? 'image/jpeg' : `image/${extname(file).slice(1).replace('jpg', 'jpeg')}`;
      return send(res, 200, data, type);
    }
    if (req.method === 'POST' && url.pathname === '/api/warp') {
      const { path, corners, width, height } = await body(req);
      const file = artworkPath(path);
      const W = Math.round(width);
      const H = Math.round(height);
      if (!Array.isArray(corners) || corners.length !== 4 || !(W > 0 && H > 0 && W * H < 80e6)) {
        return send(res, 400, { error: 'Bad request' });
      }
      const result = await warp(file, corners, W, H);
      // Keep the very first original, so Undo always gets back to it.
      const backup = join(BACKUPS, relative(ARTWORKS, file));
      if (!existsSync(backup)) {
        await mkdir(dirname(backup), { recursive: true });
        await copyFile(file, backup);
      }
      await writeFile(file, result);
      console.log(`Saved ${path} (${W} × ${H})`);
      return send(res, 200, { ok: true, width: W, height: H });
    }
    if (req.method === 'POST' && url.pathname === '/api/undo') {
      const { path } = await body(req);
      const file = artworkPath(path);
      const backup = join(BACKUPS, relative(ARTWORKS, file));
      if (!existsSync(backup)) return send(res, 404, { error: 'No backup for this image' });
      await copyFile(backup, file);
      console.log(`Restored ${path} from backup`);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, err.status ?? 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const address = `http://localhost:${PORT}`;
  console.log(`Crop tool running at ${address}  (Ctrl+C to stop)`);
  console.log(`Editing images in ${relative(process.cwd(), ARTWORKS) || ARTWORKS}; originals are kept in ${basename(BACKUPS)}/`);
  if (!process.env.NO_OPEN) execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [address], () => {});
});
