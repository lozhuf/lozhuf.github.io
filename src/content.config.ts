import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { mediums, type Medium } from './site.config';

const mediumKeys = Object.keys(mediums) as [Medium, ...Medium[]];

/**
 * Each artwork is a folder in src/content/artworks/ containing an artwork.json
 * and one or more images. The folder name becomes the artwork's URL:
 *   src/content/artworks/harbour-at-dusk/ -> /art/harbour-at-dusk
 */
const artworks = defineCollection({
  loader: glob({
    pattern: '*/artwork.json',
    base: './src/content/artworks',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.object({
    title: z.string().min(1),
    medium: z.enum(mediumKeys),
    /** Free text, e.g. "Oil on canvas" or "Willow charcoal on paper". */
    materials: z.string().optional(),
    /** Free text, e.g. "60 × 80 cm". */
    dimensions: z.string().optional(),
    year: z.number().int().min(1900).max(2100),
    /** Leave out to show "Price on request". */
    price: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    status: z.enum(['available', 'reserved', 'sold']).default('available'),
    description: z.string().optional(),
    /** Alt text for the main image. Defaults to the title. */
    alt: z.string().optional(),
    /** Link to the Instagram post for this piece. */
    instagram: z.url().optional(),
    /** Lower numbers appear first. Artworks without it are sorted newest first. */
    order: z.number().optional(),
  }),
});

export const collections = { artworks };
