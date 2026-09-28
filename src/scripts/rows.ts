/**
 * Gallery rows: every row is the same height (--row-h) and the pieces keep their
 * proportions, so it's the space between them that changes to fill each row.
 * When that space would drop below --gap-min, the last piece moves to the next
 * row; when it would grow past --gap-max, the row takes one more piece instead,
 * shrinking a little (never below MIN_SCALE of the row height) to fit it in.
 * A piece on a row of its own fills the full width. The last row is left-aligned
 * (unless it's one piece in a single column of them, on a narrow screen).
 *
 * On the All page, pieces are instead shown at relative sizes so they can be compared:
 * each one's height is scaled from its real height (data-real-h, in cm) to between
 * --rel-min and --rel-max, and they're packed together rather than set in rows: each
 * piece, in order, goes into the highest open spot it fits (leftmost on a tie).
 *
 * Without JavaScript, the CSS layout in global.css is used instead.
 */

const MIN_SCALE = 0.85;

interface Row {
  tiles: HTMLElement[];
  widths: number[];
  gap: number;
}

function px(el: Element, name: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function planRows(tiles: HTMLElement[], aspects: number[], width: number, height: number, gapMin: number, gapMax: number): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < tiles.length) {
    // As many pieces as fit at full height with at least the minimum gap.
    let n = 1;
    let sum = aspects[i] * height;
    while (i + n < tiles.length && sum + aspects[i + n] * height + n * gapMin <= width) {
      sum += aspects[i + n] * height;
      n++;
    }
    const last = i + n >= tiles.length;
    let scale = 1;
    let gap = n > 1 ? (width - sum) / (n - 1) : 0;

    if (!last && (n === 1 || gap > gapMax)) {
      // Too much space: try one more piece, slightly smaller, at the minimum gap.
      const wider = (width - n * gapMin) / (sum / height + aspects[i + n]) / height;
      if (wider >= MIN_SCALE) {
        n++;
        scale = wider;
        gap = gapMin;
      }
    }
    if (last) gap = Math.min(Math.max(gap, gapMin), (gapMin + gapMax) / 2);

    // A piece alone on its row fills the width. For the last row, only in a single column
    // (after another lone piece, or on a screen too narrow for two portrait pieces), so a
    // lone final piece on a wide screen doesn't balloon.
    const singleColumn = rows.at(-1)?.tiles.length === 1 || width < 1.5 * height + gapMin;
    if (n === 1 && (!last || singleColumn || sum > width)) scale = width / sum;

    const rowTiles = tiles.slice(i, i + n);
    const widths = aspects.slice(i, i + n).map((ar) => ar * height * scale);
    // Leave 1px spare, so the browser's rounding of the widths can never push the last
    // piece onto the next line (which would reshuffle every row below it).
    if (!last && n > 1) gap = (width - 1 - widths.reduce((a, b) => a + b, 0)) / (n - 1);
    rows.push({ tiles: rowTiles, widths, gap });
    i += n;
  }
  return rows;
}

/**
 * Pack pieces of fixed size into the grid, "skyline" style: track how far down each
 * pixel column is filled, and put each piece where it can sit highest. Returns the
 * height the grid needs.
 */
function pack(tiles: HTMLElement[], widths: number[], width: number, gapX: number, gapY: number): number {
  const cols = Math.max(1, Math.floor(width));
  const sky = new Float64Array(cols);
  // Set every width first, then read the heights (frame plus caption) in one go.
  tiles.forEach((t, k) => (t.style.width = `${Math.min(widths[k], width)}px`));
  const heights = tiles.map((t) => t.offsetHeight);
  let bottom = 0;

  tiles.forEach((t, k) => {
    const w = Math.min(Math.ceil(widths[k]), cols);
    // Candidate spots: the left edge, the right edge, and wherever the skyline steps.
    const xs = new Set([0, cols - w]);
    for (let x = 1; x < cols; x++) if (sky[x] !== sky[x - 1]) xs.add(x).add(Math.max(0, x - w - gapX));
    let best = { x: 0, y: Infinity };
    for (const x of xs) {
      if (x < 0 || x + w > cols) continue;
      let y = 0;
      for (let c = x; c < x + w; c++) if (sky[c] > y) y = sky[c];
      if (y < best.y || (y === best.y && x < best.x)) best = { x, y };
    }
    t.style.left = `${best.x}px`;
    t.style.top = `${best.y}px`;
    const filled = best.y + heights[k] + gapY;
    for (let c = best.x; c < Math.min(cols, best.x + w + gapX); c++) sky[c] = filled;
    bottom = Math.max(bottom, best.y + heights[k]);
  });
  return bottom;
}

/** Real heights (cm) of every piece on the page, for the relative sizes on the All page. */
const realHeights = [...document.querySelectorAll<HTMLElement>('.gallery .tile[data-real-h]')].map((t) =>
  Number(t.dataset.realH),
);
const realMin = Math.min(...realHeights);
const realMax = Math.max(...realHeights);

function relativeWidths(grid: HTMLElement, tiles: HTMLElement[], aspects: number[]): number[] {
  const low = px(grid, '--rel-min', 120);
  const high = px(grid, '--rel-max', 420);
  return tiles.map((t, k) => {
    const real = Number(t.dataset.realH);
    const share = Number.isFinite(real) && realMax > realMin ? (real - realMin) / (realMax - realMin) : 0.5;
    return aspects[k] * (low + share * (high - low));
  });
}

function layout(grid: HTMLElement) {
  const tiles = [...grid.querySelectorAll<HTMLElement>(':scope > .tile')].filter((t) => !t.hidden);
  // Exact width: clientWidth rounds to whole pixels, which can make a full row overflow.
  const width = grid.getBoundingClientRect().width;
  const height = px(grid, '--row-h', 290);
  const gapMin = px(grid, '--gap-min', 40);
  const gapMax = px(grid, '--gap-max', 140);
  const aspects = tiles.map((t) => parseFloat(t.style.getPropertyValue('--ar')) || 1);
  const relative = grid.closest('.gallery-all') !== null;

  if (relative) {
    grid.classList.add('grid-packed');
    grid.style.height = `${pack(tiles, relativeWidths(grid, tiles, aspects), width, gapMin, px(grid, '--pack-gap-y', 36))}px`;
    return;
  }

  grid.style.columnGap = '0px';
  for (const row of planRows(tiles, aspects, width, height, gapMin, gapMax)) {
    row.tiles.forEach((t, k) => {
      t.style.flex = 'none';
      t.style.width = `${row.widths[k]}px`;
      t.style.marginRight = k < row.tiles.length - 1 ? `${row.gap}px` : '0px';
    });
  }
}

const grids = [...document.querySelectorAll<HTMLElement>('.gallery .grid:not(.grid-lead)')];
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) layout(entry.target as HTMLElement);
});
for (const grid of grids) {
  layout(grid);
  observer.observe(grid);
}
