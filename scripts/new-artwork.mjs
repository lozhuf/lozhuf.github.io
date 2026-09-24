// Usage: npm run new "Harbour at Dusk"
// Creates src/content/artworks/harbour-at-dusk/artwork.json ready to fill in.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: npm run new "Title of the artwork"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const dir = `src/content/artworks/${slug}`;

if (existsSync(dir)) {
  console.error(`${dir} already exists.`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const template = {
  title,
  medium: 'painting',
  materials: 'Oil on canvas',
  dimensions: '50 × 70 cm',
  year: new Date().getFullYear(),
  price: 500,
  status: 'available',
  description: '',
};
writeFileSync(`${dir}/artwork.json`, JSON.stringify(template, null, 2) + '\n');

console.log(`Created ${dir}/artwork.json

Next:
  1. Copy your photos into ${dir}/ (named 01.jpg, 02.jpg, ... — 01 is the cover)
  2. Edit artwork.json
  3. Preview with: npm run dev`);
