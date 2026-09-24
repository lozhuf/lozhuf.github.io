import { getCollection, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import { mediums, site, type Medium } from '../site.config';

// Every image inside an artwork folder, keyed by path. Vite resolves these at build time.
const imageModules = import.meta.glob<ImageMetadata>(
  '../content/artworks/*/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}',
  { eager: true, import: 'default' },
);

export interface ArtworkImage {
  src: string;
  srcset: string;
  width: number;
  height: number;
  alt: string;
}

export interface Artwork {
  id: string;
  data: CollectionEntry<'artworks'>['data'];
  mediumLabel: string;
  priceLabel: string;
  aspect: number;
  /** Tile-sized cover image for the grid. */
  cover: ArtworkImage;
  /** Tiny version of the cover, shown blurred while the real one loads. */
  placeholder: string;
  /** Large versions of every image, for the overlay carousel. */
  images: ArtworkImage[];
  /** Small versions of every image, for the carousel thumbnails. */
  thumbs: ArtworkImage[];
  /** 1200px JPEG used for social share previews. */
  ogImage: string;
}

function imagesFor(id: string): ImageMetadata[] {
  const prefix = `../content/artworks/${id}/`;
  const found = Object.entries(imageModules)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, img]) => img);
  if (found.length === 0) {
    throw new Error(
      `Artwork "${id}" has no images. Add at least one .jpg/.png/.webp file to src/content/artworks/${id}/`,
    );
  }
  return found;
}

export function formatPrice(data: CollectionEntry<'artworks'>['data']): string {
  if (data.status === 'sold') return 'Sold';
  if (data.price === undefined) return 'Price on request';
  return new Intl.NumberFormat(site.locale, {
    style: 'currency',
    currency: data.currency ?? site.defaultCurrency,
    maximumFractionDigits: 0,
  }).format(data.price);
}

async function responsive(img: ImageMetadata, widths: number[], alt: string): Promise<ArtworkImage> {
  const usable = widths.filter((w) => w < img.width);
  const result = await getImage({
    src: img,
    widths: [...usable, Math.min(img.width, Math.max(...widths))],
    format: 'webp',
    quality: 82,
  });
  return {
    src: result.src,
    srcset: result.srcSet.attribute,
    width: img.width,
    height: img.height,
    alt,
  };
}

function sortArtworks(a: CollectionEntry<'artworks'>, b: CollectionEntry<'artworks'>): number {
  const ao = a.data.order ?? Infinity;
  const bo = b.data.order ?? Infinity;
  if (ao !== bo) return ao - bo;
  if (a.data.year !== b.data.year) return b.data.year - a.data.year;
  return a.data.title.localeCompare(b.data.title);
}

let cache: Promise<Artwork[]> | undefined;

export function getArtworks(): Promise<Artwork[]> {
  cache ??= load();
  return cache;
}

async function load(): Promise<Artwork[]> {
  const entries = (await getCollection('artworks')).sort(sortArtworks);
  return Promise.all(
    entries.map(async (entry) => {
      const { data } = entry;
      const sources = imagesFor(entry.id);
      const coverAlt = data.alt ?? data.title;
      const altFor = (i: number) =>
        i === 0 ? coverAlt : `${data.title} — image ${i + 1} of ${sources.length}`;

      const [cover, placeholder, og, images, thumbs] = await Promise.all([
        responsive(sources[0], [480, 800, 1200, 1600], coverAlt),
        getImage({ src: sources[0], width: 24, format: 'webp', quality: 50 }),
        getImage({ src: sources[0], width: Math.min(1200, sources[0].width), format: 'jpeg' }),
        Promise.all(sources.map((s, i) => responsive(s, [800, 1400, 2000, 2800], altFor(i)))),
        Promise.all(sources.map((s, i) => responsive(s, [120, 240], altFor(i)))),
      ]);

      return {
        id: entry.id,
        data,
        mediumLabel: mediums[data.medium as Medium],
        priceLabel: formatPrice(data),
        aspect: sources[0].width / sources[0].height,
        cover,
        placeholder: placeholder.src,
        images,
        thumbs,
        ogImage: og.src,
      };
    }),
  );
}
