import videos from '../content/music-videos.json';

/** URL-friendly name for a video, e.g. "Won't Give In" → "wont-give-in". */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type MusicVideo = (typeof videos)[number] & { slug: string };

/** All music videos with a unique slug, used for /music/<slug> pages. */
export const musicVideos: MusicVideo[] = videos.map((v) => ({ ...v, slug: slugify(v.title) }));

const seen = new Set<string>();
for (const v of musicVideos) {
  if (seen.has(v.slug)) throw new Error(`Duplicate music video slug "${v.slug}" — make the titles distinct.`);
  seen.add(v.slug);
}
