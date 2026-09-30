import { getCollection, type CollectionEntry } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import { mediums, site, sizes, type Medium, type Size } from '../site.config';
import { layoutFrame, parseSize, type FrameLayout } from './frame';

// Every image and video inside an artwork folder, keyed by path. Vite resolves these at build time.
// A video (e.g. 04.mp4) needs a matching cover image (04.poster.jpg), shown until it plays.
const imageModules = import.meta.glob<ImageMetadata>(
  [
    '../content/artworks/*/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}',
    '!../content/artworks/*/*.poster.*',
  ],
  { eager: true, import: 'default' },
);
const posterModules = import.meta.glob<ImageMetadata>(
  '../content/artworks/*/*.poster.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true, import: 'default' },
);
const videoModules = import.meta.glob<string>('../content/artworks/*/*.{mp4,webm,MP4,WEBM}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface ArtworkImage {
  src: string;
  srcset: string;
  width: number;
  height: number;
  alt: string;
  /** Set when this carousel item is a video; the image fields then describe its cover. */
  video?: string;
  /** Shown inside the artwork's frame (the first carousel item of a framed artwork). */
  framed?: boolean;
}

interface MediaSource {
  image: ImageMetadata;
  video?: string;
}

export interface Artwork {
  id: string;
  data: CollectionEntry<'artworks'>['data'];
  mediumLabel: string;
  priceLabel: string;
  /** Size category (large / medium / small), from the area given by `dimensions`. */
  size: Size;
  /** Width ÷ height of the tile: the frame's when framed, otherwise the main photo's. */
  aspect: number;
  /** The frame drawn around the main photo, when `frame` is set. */
  frame: FrameLayout | null;
  /** Real height in cm of what the tile shows (the frame, when framed), if the size is known. */
  realHeight: number | null;
  /** Tile-sized cover image for the grid. */
  cover: ArtworkImage;
  /** Tiny version of the cover, shown blurred while the real one loads. */
  placeholder: string;
  /** Large versions of every image (and video cover), for the overlay carousel. */
  images: ArtworkImage[];
  /** Small versions of every image, for the carousel thumbnails. */
  thumbs: ArtworkImage[];
  /** 1200px JPEG used for social share previews. */
  ogImage: string;
}

/** File name without folder or extension, e.g. '../content/artworks/x/04.poster.jpg' -> '04.poster'. */
function stem(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
}

function mediaFor(id: string): MediaSource[] {
  const prefix = `../content/artworks/${id}/`;
  const inFolder = <T,>(modules: Record<string, T>) =>
    Object.entries(modules).filter(([path]) => path.startsWith(prefix));

  const posters = new Map(inFolder(posterModules).map(([path, img]) => [stem(path).replace(/\.poster$/, ''), img]));
  const items: [string, MediaSource][] = inFolder(imageModules).map(([path, image]) => [stem(path), { image }]);
  for (const [path, video] of inFolder(videoModules)) {
    const image = posters.get(stem(path));
    if (!image) {
      throw new Error(
        `Video ${path.replace('../', 'src/')} needs a cover image named ${stem(path)}.poster.jpg in the same folder.`,
      );
    }
    items.push([stem(path), { image, video }]);
  }
  if (items.length === 0) {
    throw new Error(
      `Artwork "${id}" has no images. Add at least one .jpg/.png/.webp file to src/content/artworks/${id}/`,
    );
  }
  return items
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, item]) => item);
}

/** Size category from free-text dimensions like "60 × 80 cm", by area (medium if unreadable). */
export function sizeOf(dimensions: string | undefined): Size {
  const numbers = parseSize(dimensions);
  if (!numbers) return 'medium';
  const area = numbers[0] * numbers[1];
  return (sizes.find((s) => area >= s.minArea) ?? sizes[sizes.length - 1]).key;
}

export function formatAmount(amount: number, currency?: string): string {
  return new Intl.NumberFormat(site.locale, {
    style: 'currency',
    currency: currency ?? site.defaultCurrency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPrice(data: CollectionEntry<'artworks'>['data']): string {
  if (data.status === 'sold') return 'Sold';
  if (data.price === undefined) return 'Price on request';
  return formatAmount(data.price, data.currency);
}

async function responsive(
  img: ImageMetadata,
  widths: number[],
  alt: string,
  video?: string,
): Promise<ArtworkImage> {
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
    video,
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
  // Hidden pieces are left out of the site entirely; the arrange and crop tools read the files directly.
  const entries = (await getCollection('artworks', ({ data }) => data.status !== 'hidden')).sort(sortArtworks);
  return Promise.all(
    entries.map(async (entry) => {
      const { data } = entry;
      const media = mediaFor(entry.id);
      const first = media[0].image;
      const coverAlt = data.alt ?? data.title;
      const altFor = (i: number) =>
        i === 0
          ? coverAlt
          : `${data.title} — ${media[i].video ? 'video' : 'image'} ${i + 1} of ${media.length}`;

      let frame: FrameLayout | null;
      try {
        frame = media[0].video ? null : layoutFrame(data.frame, data.dimensions, first.width / first.height);
      } catch (err) {
        throw new Error(`Artwork "${entry.id}" (src/content/artworks/${entry.id}/artwork.json): ${(err as Error).message}`);
      }

      const [cover, placeholder, og, images, thumbs] = await Promise.all([
        responsive(first, [480, 800, 1200, 1600], coverAlt),
        getImage({ src: first, width: 24, format: 'webp', quality: 50 }),
        getImage({ src: first, width: Math.min(1200, first.width), format: 'jpeg' }),
        Promise.all(media.map((m, i) => responsive(m.image, [800, 1400, 2000, 2800], altFor(i), m.video))),
        Promise.all(media.map((m, i) => responsive(m.image, [120, 240], altFor(i), m.video))),
      ]);

      // Height of the piece as hung: the frame's, or the artwork's (the dimension that
      // matches the photo's orientation, the same way the frame works it out).
      const dims = parseSize(data.dimensions);
      const landscape = first.width >= first.height;
      const realHeight = frame?.height ?? (dims ? (dims[0] >= dims[1] === landscape ? dims[1] : dims[0]) : null);

      // A framed piece opens on the framed view, followed by the photo on its own.
      if (frame) {
        images.unshift({ ...images[0], alt: `${coverAlt}, shown framed`, framed: true });
        thumbs.unshift({ ...thumbs[0], framed: true });
      }

      return {
        id: entry.id,
        data,
        mediumLabel: mediums[data.medium as Medium],
        priceLabel: formatPrice(data),
        size: sizeOf(data.dimensions),
        aspect: frame?.aspect ?? first.width / first.height,
        frame,
        realHeight,
        cover,
        placeholder: placeholder.src,
        images,
        thumbs,
        ogImage: og.src,
      };
    }),
  );
}
