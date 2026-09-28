/**
 * Gallery rows: every row is the same height (--row-h) and the pieces keep their
 * proportions, so it's the space between them that changes to fill each row.
 * When that space would drop below --gap-min, the last piece moves to the next
 * row; when it would grow past --gap-max, the row takes one more piece instead,
 * shrinking a little (never below MIN_SCALE of the row height) to fit it in.
 * A piece on a row of its own fills the full width. The last row is left-aligned
 * (unless it's one piece in a single column of them, on a narrow screen).
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

function layout(grid: HTMLElement) {
  const tiles = [...grid.querySelectorAll<HTMLElement>(':scope > .tile')].filter((t) => !t.hidden);
  // Exact width: clientWidth rounds to whole pixels, which can make a full row overflow.
  const width = grid.getBoundingClientRect().width;
  const height = px(grid, '--row-h', 290);
  const gapMin = px(grid, '--gap-min', 40);
  const gapMax = px(grid, '--gap-max', 140);
  const aspects = tiles.map((t) => parseFloat(t.style.getPropertyValue('--ar')) || 1);

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
