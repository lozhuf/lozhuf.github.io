/**
 * Site-wide settings. Edit this file to change your name, contact details,
 * the purchase form endpoint and the list of artwork categories.
 */
export const site = {
  name: 'Laurie Hufford',
  tagline: 'Original artwork',
  description: 'Original charcoal drawings and paintings by Laurie Hufford.',

  /** Linked from the envelope icon in the header, and for enquiries about sold pieces. */
  contactEmail: 'hello@lauriehufford.com',
  instagram: 'https://www.instagram.com/lozhuf/',

  /**
   * Where "Request to buy" submissions are sent.
   * 1. Create a free form at https://formspree.io
   * 2. Paste its endpoint here, e.g. 'https://formspree.io/f/abcdwxyz'
   * Until then, the form falls back to opening an email to `contactEmail`.
   */
  formEndpoint: 'https://formspree.io/f/xrpbllkg',

  /** Currency used when an artwork doesn't set its own. */
  defaultCurrency: 'GBP',
  locale: 'en-GB',
};

/**
 * The allowed values for an artwork's "medium" field, and how each is labelled
 * in the filter bar. Add a line here to introduce a new category.
 */
export const mediums = {
  charcoal: 'Charcoal',
  painting: 'Paintings',
  drawing: 'Drawings',
  print: 'Prints',
  mixed: 'Mixed media',
} as const;

export type Medium = keyof typeof mediums;
