// Picture frames drawn around an artwork's photo on the site: a moulding, a
// white mat, and the artwork raised slightly above the mat with a soft shadow.
// It's all CSS (src/styles/frame.css), so the photos themselves never change.
//
// Plain JavaScript so the arrange tool (tools/arrange) can use the same maths
// in the browser for its preview.

/** Moulding colours. "none" shows just the mat, without a moulding. */
export const FRAME_STYLES = /** @type {const} */ (['black', 'white', 'oak', 'none']);

/** @typedef {(typeof FRAME_STYLES)[number]} FrameStyle */
/** @typedef {true | { size?: string, style?: FrameStyle }} FrameOption */

/**
 * @typedef {object} FrameLayout
 * @property {FrameStyle} style
 * @property {number} width Outer width of the frame, cm.
 * @property {number} height Outer height of the frame, cm.
 * @property {number} moulding Width of the moulding, cm.
 * @property {number} aspect Outer width ÷ height.
 * @property {{ w: number, h: number }} art Size of the artwork, cm.
 * @property {boolean} common Whether the size is one of COMMON_SIZES.
 */

/** The first two numbers in free text like "60 × 80 cm", or null. */
export function parseSize(text) {
  const n = (String(text ?? '').match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return n.length >= 2 && n[0] > 0 && n[1] > 0 ? [n[0], n[1]] : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Common ready-made frame sizes (outer size, cm), preferred when a size isn't given. */
export const COMMON_SIZES = [
  [12, 17],
  [15, 20],
  [20, 26],
  [23, 32],
  [32, 42],
  [52, 72],
  [23, 23],
  [26, 26],
];

/** Width of the moulding, cm. */
const MOULDING = 1;

function mouldingFor(style) {
  return style === 'none' ? 0 : MOULDING;
}

/**
 * Work out a frame around an artwork.
 *
 * @param {FrameOption | undefined} frame The artwork's `frame` setting.
 * @param {string | undefined} dimensions The artwork's size, e.g. "13 × 18 cm".
 * @param {number} photoAspect Width ÷ height of the photo being framed.
 * @returns {FrameLayout | null}
 * @throws {Error} when the artwork has no readable size, or doesn't fit in the frame.
 */
export function layoutFrame(frame, dimensions, photoAspect) {
  if (!frame) return null;
  const options = frame === true ? {} : frame;
  const style = options.style ?? 'black';
  if (!FRAME_STYLES.includes(style)) throw new Error(`Unknown frame style "${style}" (use ${FRAME_STYLES.join(', ')})`);

  const dims = parseSize(dimensions);
  if (!dims) throw new Error('A framed artwork needs its "dimensions", e.g. "13 × 18 cm"');
  // Take the width from whichever dimension matches the photo's orientation, and the
  // height from the photo's proportions, so the photo fills its spot exactly.
  const [a, b] = dims;
  const w = a >= b === photoAspect >= 1 ? a : b;
  const h = w / photoAspect;

  let width, height, moulding;
  if (options.size) {
    const size = parseSize(options.size);
    if (!size) throw new Error(`Couldn't read the frame size "${options.size}" (write it like "30 × 40 cm")`);
    // A "30 × 40" frame hangs whichever way round suits the artwork.
    [width, height] = w !== h && size[0] >= size[1] !== w >= h ? [size[1], size[0]] : size;
    moulding = mouldingFor(style);
    if (width - 2 * moulding < w - 0.05 || height - 2 * moulding < h - 0.05) {
      throw new Error(
        `A ${size[0]} × ${size[1]} cm frame is too small for a ${round1(w)} × ${round1(h)} cm artwork ` +
          `(the moulding takes ${moulding} cm on each side)`,
      );
    }
  } else {
    // No size given. The ideal mat is about a quarter of the artwork's shorter side (at
    // least 4 cm). Use the common size whose mat comes closest to that and is most even
    // all round, as long as it isn't far too thin (under 60% of ideal) or too wide (over 2.5×).
    // Otherwise make a frame to measure, rounded up to whole centimetres.
    const ideal = Math.max(4, 0.25 * Math.min(w, h));
    moulding = mouldingFor(style);
    let best = null;
    for (const size of COMMON_SIZES) {
      const [fw, fh] = w !== h && size[0] >= size[1] !== w >= h ? [size[1], size[0]] : size;
      const matX = (fw - w) / 2 - moulding;
      const matY = (fh - h) / 2 - moulding;
      const narrowest = Math.min(matX, matY);
      const widest = Math.max(matX, matY);
      if (narrowest < 0.6 * ideal || widest > 2.5 * ideal) continue;
      const score = Math.abs(narrowest - ideal) + 0.5 * (widest - narrowest);
      if (!best || score < best.score) best = { fw, fh, score };
    }
    width = best?.fw ?? Math.ceil(w + 2 * (ideal + moulding));
    height = best?.fh ?? Math.ceil(h + 2 * (ideal + moulding));
  }

  const common = COMMON_SIZES.some(([x, y]) => (x === width && y === height) || (x === height && y === width));
  return { style, width, height, moulding, aspect: width / height, art: { w, h }, common };
}

/**
 * CSS custom properties that place the mat and artwork inside the frame, as
 * percentages of the frame, plus its real width so shadows can be sized in mm.
 */
export function frameVars(layout) {
  const { width, height, moulding, art } = layout;
  const pct = (n) => `${(n * 100).toFixed(3)}%`;
  return [
    `--ar: ${layout.aspect.toFixed(4)}`,
    `--frame-mm: ${width * 10}`,
    `--mat-x: ${pct(moulding / width)}`,
    `--mat-y: ${pct(moulding / height)}`,
    `--art-x: ${pct((width - art.w) / 2 / width)}`,
    `--art-y: ${pct((height - art.h) / 2 / height)}`,
    `--art-w: ${pct(art.w / width)}`,
    `--art-h: ${pct(art.h / height)}`,
  ].join('; ');
}
