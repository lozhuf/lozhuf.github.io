/**
 * Site-wide settings. Edit this file to change your name, contact details,
 * the purchase form endpoint and the list of artwork categories.
 */
export const site = {
  name: 'Laurie Hufford',
  tagline: 'Original artwork',
  description: 'Original charcoal drawings and paintings by Laurie Hufford.',

  /** Linked from the envelope icon in the header, and for enquiries about sold pieces. */
  contactEmail: 'lauriehufford+hello@gmail.com',
  instagram: 'https://www.instagram.com/lozhuf/',

  /**
   * Where "Request to buy" submissions are sent.
   * 1. Create a free form at https://formspree.io
   * 2. Paste its endpoint here, e.g. 'https://formspree.io/f/abcdwxyz'
   * Until then, the form falls back to opening an email to `contactEmail`.
   */
  formEndpoint: 'https://formspree.io/f/xrpbllkg',

  /** Currency used when an artwork doesn't set its own. */
  defaultCurrency: 'DKK',
  /** Controls number formatting, e.g. 'da-DK' shows "3.000 kr." */
  locale: 'da-DK',
};

/**
 * The allowed values for an artwork's "medium" field, and how each is labelled
 * (shown above the title in the artwork details).
 */
export const mediums = {
  charcoal: 'Charcoal',
  painting: 'Paintings',
  drawing: 'Drawings',
  print: 'Prints',
  mixed: 'Mixed media',
} as const;

export type Medium = keyof typeof mediums;

/**
 * Size categories, each with its own page (/large, /medium, /small), worked out
 * from each artwork's "dimensions" by area (width × height in cm²).
 * 2,500 cm² is about 50 × 50 cm; 950 cm² is about 31 × 31 cm.
 */
export const sizes = [
  { key: 'large', label: 'Large', description: 'From about 50 × 50 cm', minArea: 2500 },
  { key: 'medium', label: 'Medium', description: 'From about 31 × 31 cm', minArea: 950 },
  { key: 'small', label: 'Small', description: 'Under about 31 × 31 cm', minArea: 0 },
] as const;

export type Size = (typeof sizes)[number]['key'];
