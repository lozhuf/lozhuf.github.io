// Arrange & edit artworks.
//
//   npm run arrange
//
// Opens a local page (not part of the website) showing every artwork in site
// order. Drag to reorder, click a piece to edit its status, price and other
// details, then Save to write the changes into the artwork.json files.
// The `order` numbers are rewritten as 10, 20, 30… to match the new sequence.

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
const CONFIG = join(root, 'src/site.config.ts');
const PORT = Number(process.env.PORT ?? 4420);
const IMAGE = /\.(jpe?g|png|webp)$/i;
const STATUSES = ['available', 'reserved', 'sold'];

/** Medium keys and size thresholds, read from site.config.ts so they stay in sync. */
async function siteConfig() {
  const src = await readFile(CONFIG, 'utf8');
  const mediumsBlock = src.match(/export const mediums = \{([\s\S]*?)\}/)?.[1] ?? '';
  const mediums = [...mediumsBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map(([, key, label]) => ({ key, label }));
  const sizes = [...src.matchAll(/key: '(\w+)', label: '([^']+)'[^}]*minArea: (\d+)/g)].map(([, key, label, minArea]) => ({
    key,
    label,
    minArea: Number(minArea),
  }));
  return { mediums, sizes };
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
    const files = (await readdir(join(ARTWORKS, name))).filter((f) => IMAGE.test(f) && !f.includes('.poster.'));
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    out.push({ folder: name, cover: files[0] ? `${name}/${files[0]}` : null, photos: files.length, data });
  }
  // Same order as the website: `order` first (lowest first), then newest, then title.
  return out.sort(
    (a, b) =>
      (a.data.order ?? Infinity) - (b.data.order ?? Infinity) ||
      b.data.year - a.data.year ||
      String(a.data.title).localeCompare(String(b.data.title)),
  );
}

/** Check and tidy one artwork's edited fields. Throws with a readable message. */
function clean(folder, edits, mediums) {
  const out = {};
  const fail = (msg) => {
    throw Object.assign(new Error(`${folder}: ${msg}`), { status: 400 });
  };
  for (const [key, raw] of Object.entries(edits)) {
    const value = typeof raw === 'string' ? raw.trim() : raw;
    switch (key) {
      case 'title':
        if (!value) fail('title can’t be empty');
        out.title = value;
        break;
      case 'status':
        if (!STATUSES.includes(value)) fail(`status must be one of ${STATUSES.join(', ')}`);
        out.status = value;
        break;
      case 'medium':
        if (!mediums.some((m) => m.key === value)) fail(`unknown medium "${value}"`);
        out.medium = value;
        break;
      case 'price':
        if (value === '' || value === null) out.price = undefined;
        else if (Number.isInteger(Number(value)) && Number(value) > 0) out.price = Number(value);
        else fail('price must be a whole number (or empty for “price on request”)');
        break;
      case 'year':
        if (!(Number.isInteger(Number(value)) && Number(value) >= 1900 && Number(value) <= 2100)) fail('year looks wrong');
        out.year = Number(value);
        break;
      case 'hiResPhoto':
        out.hiResPhoto = value ? true : undefined;
        break;
      case 'instagram':
      case 'print':
        if (value && !/^https?:\/\//.test(value)) fail(`${key} must be a web address starting with https://`);
        out[key] = value || undefined;
        break;
      case 'dimensions':
      case 'materials':
      case 'description':
        out[key] = value || undefined;
        break;
      default:
        fail(`can’t edit "${key}"`);
    }
  }
  return out;
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
      return send(res, 200, { artworks: await listArtworks(), ...(await siteConfig()) });
    }
    if (req.method === 'GET' && url.pathname === '/thumb') {
      const [folder, file] = String(url.searchParams.get('path')).split('/');
      const full = join(folderPath(folder), file ?? '');
      if (!IMAGE.test(full) || !existsSync(full)) return send(res, 404, { error: 'Not found' });
      const data = await sharp(full).rotate().resize(320, 320, { fit: 'inside' }).jpeg({ quality: 75 }).toBuffer();
      return send(res, 200, data, 'image/jpeg');
    }
    if (req.method === 'POST' && url.pathname === '/api/save') {
      const { order, edits = {} } = await body(req);
      const { mediums } = await siteConfig();
      const current = await listArtworks();
      const known = new Set(current.map((a) => a.folder));
      if (!Array.isArray(order) || order.length !== known.size || !order.every((f) => known.has(f))) {
        return send(res, 409, { error: 'The artwork folders changed since the page loaded. Refresh and try again.' });
      }
      // Validate everything before writing anything.
      const cleaned = Object.fromEntries(Object.entries(edits).map(([f, e]) => [f, clean(f, e, mediums)]));
      let written = 0;
      for (const [i, folder] of order.entries()) {
        const file = join(folderPath(folder), 'artwork.json');
        const before = await readFile(file, 'utf8');
        const data = { ...JSON.parse(before), ...cleaned[folder], order: (i + 1) * 10 };
        for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
        const after = JSON.stringify(data, null, 2) + '\n';
        if (after !== before) {
          await writeFile(file, after);
          written++;
        }
      }
      console.log(`Saved: ${written} artwork file${written === 1 ? '' : 's'} updated`);
      return send(res, 200, { written });
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err.message);
    send(res, err.status ?? 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const address = `http://localhost:${PORT}`;
  console.log(`Arrange tool running at ${address}  (Ctrl+C to stop)`);
  console.log(`Editing ${relative(process.cwd(), ARTWORKS) || ARTWORKS}`);
  if (!process.env.NO_OPEN) execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [address], () => {});
});
