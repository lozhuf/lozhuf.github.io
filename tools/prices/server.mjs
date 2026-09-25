// Private pricing table for the artworks.
//
//   npm run prices
//
// Runs only on this computer (it is not part of the website). It reads every
// artwork.json each time the page loads, so new pieces appear automatically,
// suggests prices from a formula, and can write chosen prices back to the
// artwork files. Formula settings and draft overrides are kept in
// .prices-settings.json, which is not committed to git.

import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const ARTWORKS = resolve(process.env.ARTWORKS_DIR ?? join(root, 'src/content/artworks'));
const SETTINGS = resolve(process.env.SETTINGS_FILE ?? join(root, '.prices-settings.json'));
const PORT = Number(process.env.PORT ?? 4410);
const IMAGE = /\.(jpe?g|png|webp)$/i;

const DEFAULT_SETTINGS = {
  basis: 'linear', // 'linear' = width + height (cm), 'area' = width × height (cm²)
  rateCanvas: 30, // kr per cm (linear) or per cm² (area) for canvas / board
  ratePaper: 22, // the same for works on paper
  round: 100,
  minimum: 400,
  overrides: {}, // folder -> price set by hand (kept until cleared, so the formula doesn't undo it)
  hideSold: true,
};

async function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await readFile(SETTINGS, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function folderPath(folder) {
  const full = resolve(ARTWORKS, String(folder ?? ''));
  if (!full.startsWith(ARTWORKS + sep) || !existsSync(join(full, 'artwork.json'))) {
    throw Object.assign(new Error(`Unknown artwork "${folder}"`), { status: 400 });
  }
  return full;
}

async function listArtworks() {
  const folders = (await readdir(ARTWORKS, { withFileTypes: true })).filter((d) => d.isDirectory());
  const out = [];
  for (const { name } of folders) {
    const file = join(ARTWORKS, name, 'artwork.json');
    if (!existsSync(file)) continue;
    const data = JSON.parse(await readFile(file, 'utf8'));
    const cover = (await readdir(join(ARTWORKS, name)))
      .filter((f) => IMAGE.test(f) && !f.includes('.poster.'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    out.push({ folder: name, cover: cover ? `${name}/${cover}` : null, ...data });
  }
  return out.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || b.year - a.year);
}

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
    if (req.method === 'GET' && url.pathname === '/api/data') {
      return send(res, 200, { artworks: await listArtworks(), settings: await loadSettings() });
    }
    if (req.method === 'GET' && url.pathname === '/thumb') {
      const [folder, file] = String(url.searchParams.get('path')).split('/');
      const full = join(folderPath(folder), file ?? '');
      if (!IMAGE.test(full) || !existsSync(full)) return send(res, 404, { error: 'Not found' });
      const data = await sharp(full).rotate().resize(96, 96, { fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
      return send(res, 200, data, 'image/jpeg');
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const settings = { ...(await loadSettings()), ...(await body(req)) };
      await writeFile(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/apply') {
      const { changes } = await body(req);
      if (!Array.isArray(changes)) return send(res, 400, { error: 'Bad request' });
      const applied = [];
      for (const { folder, price } of changes) {
        if (!(Number.isInteger(price) && price > 0)) throw Object.assign(new Error(`Bad price for ${folder}`), { status: 400 });
        const file = join(folderPath(folder), 'artwork.json');
        const data = JSON.parse(await readFile(file, 'utf8'));
        if (data.price === price) continue;
        applied.push({ folder, from: data.price ?? null, to: price });
        data.price = price;
        await writeFile(file, JSON.stringify(data, null, 2) + '\n');
      }
      for (const a of applied) console.log(`${a.folder}: ${a.from ?? '—'} → ${a.to}`);
      return send(res, 200, { applied });
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, err.status ?? 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const address = `http://localhost:${PORT}`;
  console.log(`Pricing table running at ${address}  (Ctrl+C to stop)`);
  console.log(`Reading ${relative(process.cwd(), ARTWORKS) || ARTWORKS}; settings in ${relative(process.cwd(), SETTINGS)}`);
  if (!process.env.NO_OPEN) execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [address], () => {});
});
