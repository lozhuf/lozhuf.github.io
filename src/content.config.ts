import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { mediums, type Medium } from './site.config';
import { FRAME_STYLES } from './lib/frame';

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
    /** Link to buy a print of this piece, e.g. its Etsy listing. Shows a "Buy a print" button. */
    print: z.url().optional(),
    /**
     * The main photo (01) is high resolution and taken in good, even light, so it
     * could be used to make prints. Not shown on the site.
     */
    hiResPhoto: z.boolean().default(false),
    /**
     * Show the piece in a picture frame with a white mat (drawn by the site; the
     * photo isn't changed). `true` picks a size automatically, or give the frame's
     * outer size and moulding colour: { "size": "30 × 40 cm", "style": "black" }.
     */
    frame: z
      .union([
        z.literal(true),
        z.object({
          size: z.string().optional(),
          style: z.enum(FRAME_STYLES).default('black'),
        }),
      ])
      .optional(),
    /**
     * Where the piece is now, e.g. who bought it or which exhibition it's at.
     * For your own records only: never shown on the site (but visible in the
     * public GitHub repository).
     */
    location: z.string().optional(),
    /** Lower numbers appear first. Artworks without it are sorted newest first. */
    order: z.number().optional(),
  }),
});

export const collections = { artworks };
