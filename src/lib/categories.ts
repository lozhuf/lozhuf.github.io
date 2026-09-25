import { sizes, type Size } from '../site.config';
import type { Artwork } from './artworks';

export type Category = Size | 'all';

export const categories: { key: Category; label: string; title: string }[] = [
  ...sizes.map((s) => ({ key: s.key, label: s.label, title: `${s.label} works` })),
  { key: 'all', label: 'All', title: 'All works' },
];

export function inCategory(artwork: Artwork, category: Category): boolean {
  return category === 'all' || artwork.size === category;
}

/** How many pieces are for sale in each category. */
export function categoryCounts(artworks: Artwork[]): Record<Category, number> {
  const forSale = artworks.filter((a) => a.data.status !== 'sold');
  return Object.fromEntries(
    categories.map((c) => [c.key, forSale.filter((a) => inCategory(a, c.key)).length]),
  ) as Record<Category, number>;
}
