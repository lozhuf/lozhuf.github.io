/**
 * Gallery interactions: filtering, the artwork overlay (with its grow-from-tile
 * animation), the image carousel, browser history and the purchase form.
 */

const overlay = document.querySelector<HTMLDialogElement>('dialog.overlay')!;
const overlayBody = overlay.querySelector<HTMLElement>('.overlay-body')!;
const overlayClose = overlay.querySelector<HTMLAnchorElement>('.overlay-close')!;
const scrim = overlay.querySelector<HTMLElement>('.overlay-scrim')!;
const tiles = [...document.querySelectorAll<HTMLElement>('.tile')];
const filterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];
const emptyMessage = document.querySelector<HTMLElement>('.grid-empty');

const { base = '/', siteName = '', homeTitle = document.title, contact = '' } = overlay.dataset;
const basePath = base.endsWith('/') ? base : `${base}/`;
const formConfigured = overlay.dataset.formConfigured === 'true';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
const OPEN_MS = 480;
const CLOSE_MS = 380;

let currentId: string | null = null;
let carousel: Carousel | null = null;
/** True when we added the history entry for the open artwork (so closing can go "back"). */
let pushedEntry = false;
let busy = false;

// ---------------------------------------------------------------------------
// URLs and history

function artworkUrl(id: string): string {
  return `${basePath}art/${id}`;
}

function idFromLocation(): string | null {
  if (!location.pathname.startsWith(basePath)) return null;
  const match = location.pathname.slice(basePath.length).match(/^art\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function galleryUrl(): string {
  const medium = new URLSearchParams(location.search).get('medium');
  return medium ? `${basePath}?medium=${encodeURIComponent(medium)}` : basePath;
}

// ---------------------------------------------------------------------------
// Filtering

function currentFilter(): string {
  const medium = new URLSearchParams(location.search).get('medium');
  return medium && filterButtons.some((b) => b.dataset.filter === medium) ? medium : 'all';
}

function applyFilter(medium: string, animate: boolean) {
  const update = () => {
    let visible = 0;
    for (const tile of tiles) {
      const show = medium === 'all' || tile.dataset.medium === medium;
      tile.hidden = !show;
      if (show) visible++;
    }
    for (const button of filterButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === medium));
    }
    if (emptyMessage) emptyMessage.hidden = visible > 0;
  };
  if (animate && document.startViewTransition && !reducedMotion.matches) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    const medium = button.dataset.filter ?? 'all';
    const next = new URL(location.href);
    if (medium === 'all') next.searchParams.delete('medium');
    else next.searchParams.set('medium', medium);
    history.replaceState(history.state, '', next);
    applyFilter(medium, true);
  });
}

// ---------------------------------------------------------------------------
// Carousel

interface Carousel {
  index(): number;
  count: number;
  go(index: number, smooth?: boolean): void;
  /** Move by `delta` slides; returns false if that would go past either end. */
  step(delta: number): boolean;
  image(): HTMLImageElement | null;
  sync(): void;
}

function createCarousel(root: HTMLElement): Carousel | null {
  const track = root.querySelector<HTMLElement>('.slides');
  if (!track) return null;
  const slides = [...track.querySelectorAll<HTMLElement>('.slide')];
  const prev = root.querySelector<HTMLButtonElement>('.nav-prev');
  const next = root.querySelector<HTMLButtonElement>('.nav-next');
  const thumbs = [...root.querySelectorAll<HTMLButtonElement>('.thumb')];

  const index = () =>
    track.clientWidth ? Math.round(track.scrollLeft / track.clientWidth) : 0;
  // The slide we're scrolling to, so quick repeated presses keep counting from there.
  let target: number | null = null;

  const sync = () => {
    const i = index();
    if (i === target) target = null;
    // At the first/last slide the arrows move on to the neighbouring artwork, if there is one.
    if (prev) prev.disabled = i <= 0 && !neighbour(-1);
    if (next) next.disabled = i >= slides.length - 1 && !neighbour(1);
    thumbs.forEach((t, n) => t.setAttribute('aria-current', String(n === i)));
    // Play the video on the current slide (they're silent), pause any others.
    slides.forEach((slide, n) => {
      const video = slide.querySelector('video');
      if (!video) return;
      if (n === i && !reducedMotion.matches) video.play().catch(() => {});
      else video.pause();
    });
  };

  const go = (i: number, smooth = true) => {
    target = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({
      left: target * track.clientWidth,
      behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto',
    });
  };

  let frame = 0;
  track.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    },
    { passive: true },
  );
  thumbs.forEach((t) => t.addEventListener('click', () => go(Number(t.dataset.index))));
  sync();

  return {
    index,
    count: slides.length,
    go,
    step: (delta) => {
      const from = target ?? index();
      const to = from + delta;
      if (to < 0 || to >= slides.length) return false;
      go(to);
      return true;
    },
    image: () => slides[index()]?.querySelector('img') ?? null,
    sync,
  };
}

/** The visible artwork before (-1) or after (1) the open one, in gallery order. */
function neighbour(direction: number): string | null {
  const visible = tiles.filter((t) => !t.hidden);
  const at = visible.findIndex((t) => t.dataset.id === currentId);
  if (at < 0) return null;
  return visible[at + direction]?.dataset.id ?? null;
}

/** Arrow buttons and keys: step through this artwork's images, then on to the next artwork. */
function navigate(direction: number, fromButton = false) {
  if (busy || !carousel) return;
  if (carousel.step(direction)) return;
  const id = neighbour(direction);
  if (id) switchArtwork(id, direction, fromButton);
}

/** Replace the open artwork with a neighbouring one, sliding in from the side it came from. */
async function switchArtwork(id: string, direction: number, fromButton: boolean) {
  busy = true;
  const shift = reducedMotion.matches ? 0 : 32;
  const old = overlayBody.querySelector('.detail');
  try {
    if (old) {
      await old.animate(
        [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-direction * shift}px)` }],
        { duration: 160, easing: 'ease-in', fill: 'forwards' },
      ).finished;
    }
    if (!renderDetail(id)) return;
    // Coming backwards, start on the artwork's last image.
    if (direction < 0 && carousel) carousel.go(carousel.count - 1, false);
    carousel?.sync();
    history.replaceState({ artwork: id }, '', artworkUrl(id));
    // Keep the tile in view behind the overlay, so closing can animate back to it.
    tiles.find((t) => t.dataset.id === id)?.scrollIntoView({ block: 'center' });
    const fresh = overlayBody.querySelector('.detail');
    if (fresh) {
      await fresh.animate(
        [{ opacity: 0, transform: `translateX(${direction * shift}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: EASE },
      ).finished;
    }
  } finally {
    busy = false;
  }
  // The old buttons were removed with the old artwork. If someone tabbed to an arrow and
  // pressed Enter, put them back on the new arrow; otherwise focus the overlay itself, so
  // arrow keys keep working without outlining a button.
  const button = overlayBody.querySelector<HTMLButtonElement>(direction > 0 ? '.nav-next' : '.nav-prev');
  if (fromButton && button && !button.disabled) button.focus({ preventScroll: true });
  else focusOverlay();
}

/** Focus the dialog itself: keys work, but no focus ring appears until someone presses Tab. */
function focusOverlay() {
  overlay.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Overlay animation helpers

function tileImage(id: string | null): HTMLImageElement | null {
  if (!id) return null;
  const tile = tiles.find((t) => t.dataset.id === id);
  if (!tile || tile.hidden) return null;
  return tile.querySelector('img');
}

function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}

/** A copy of an image, fixed over `rect`, used to animate between tile and overlay. */
function makeGhost(src: string, rect: DOMRect): HTMLImageElement {
  const ghost = document.createElement('img');
  ghost.className = 'ghost';
  ghost.alt = '';
  ghost.src = src;
  Object.assign(ghost.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  overlay.append(ghost);
  return ghost;
}

function transformBetween(from: DOMRect, to: DOMRect): string {
  const x = to.left - from.left;
  const y = to.top - from.top;
  return `translate(${x}px, ${y}px) scale(${to.width / from.width}, ${to.height / from.height})`;
}

/** The overlay's chrome (details panel, buttons) that fades in around the image. */
function chrome(): HTMLElement[] {
  return [
    overlayClose,
    ...overlayBody.querySelectorAll<HTMLElement>('.detail-info, .nav:not(:disabled), .thumbs'),
  ];
}

function fade(els: Element[], from: number, to: number, duration: number, shift = 0) {
  return Promise.all(
    els.map(
      (el) =>
        el.animate(
          [
            { opacity: from, transform: `translateY(${shift * (1 - from)}px)` },
            { opacity: to, transform: `translateY(${shift * (1 - to)}px)` },
          ],
          { duration, easing: EASE, fill: 'both' },
        ).finished,
    ),
  );
}

function clearAnimations() {
  for (const el of [scrim, overlayBody, ...chrome()]) {
    el.getAnimations().forEach((a) => a.cancel());
  }
}

function waitForImage(img: HTMLImageElement, maxMs: number): Promise<void> {
  const loaded = img.complete ? Promise.resolve() : img.decode().catch(() => {});
  return Promise.race([loaded, new Promise<void>((r) => setTimeout(r, maxMs))]);
}

// ---------------------------------------------------------------------------
// Opening and closing

function renderDetail(id: string): boolean {
  const template = document.querySelector<HTMLTemplateElement>(
    `template[data-detail="${CSS.escape(id)}"]`,
  );
  if (!template) return false;
  overlayBody.replaceChildren(template.content.cloneNode(true));
  overlayBody.scrollTop = 0;
  attachDetail();
  return true;
}

/** Wire up whatever artwork is currently rendered in the overlay. */
function attachDetail() {
  const detail = overlayBody.querySelector<HTMLElement>('.detail');
  if (!detail) return;
  currentId = detail.dataset.id ?? null;
  const title = detail.dataset.title ?? '';
  overlay.setAttribute('aria-label', title);
  document.title = `${title} — ${siteName}`;
  carousel = createCarousel(detail);
}

async function openArtwork(id: string, animate = true) {
  if (busy) return;
  const alreadyOpen = overlay.open;
  if (!renderDetail(id)) return;
  if (!alreadyOpen) overlay.showModal();
  focusOverlay();

  if (alreadyOpen || !animate || reducedMotion.matches) {
    if (!alreadyOpen && animate) await fade([scrim, overlayBody, overlayClose], 0, 1, 200);
    clearAnimations();
    return;
  }

  busy = true;
  const source = tileImage(id);
  const target = carousel?.image();
  try {
    if (source && target && onScreen(source)) {
      const from = source.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const ghost = makeGhost(source.currentSrc || source.src, from);
      target.style.opacity = '0';

      const flight = ghost.animate(
        [{ transform: 'none' }, { transform: transformBetween(from, to) }],
        { duration: OPEN_MS, easing: EASE, fill: 'forwards' },
      );
      await Promise.all([
        flight.finished,
        fade([scrim], 0, 1, OPEN_MS * 0.8),
        fade(chrome(), 0, 1, OPEN_MS, 16),
      ]);

      // Swap the ghost for the full-resolution image once it's ready.
      await waitForImage(target, 800);
      target.style.opacity = '';
      await ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).finished;
      ghost.remove();
    } else {
      await fade([scrim, overlayBody, overlayClose], 0, 1, 220);
    }
  } finally {
    clearAnimations();
    busy = false;
  }
}

async function closeOverlay(animate = true) {
  if (!overlay.open || busy) return;
  busy = true;
  const id = currentId;
  const source = tileImage(id);

  try {
    if (animate && !reducedMotion.matches) {
      const target = carousel?.image();
      const flyBack = source && target && carousel?.index() === 0 && onScreen(source);
      if (flyBack) {
        const from = target.getBoundingClientRect();
        const to = source.getBoundingClientRect();
        const ghost = makeGhost(target.currentSrc || target.src, from);
        target.style.opacity = '0';
        await Promise.all([
          ghost.animate([{ transform: 'none' }, { transform: transformBetween(from, to) }], {
            duration: CLOSE_MS,
            easing: EASE,
            fill: 'forwards',
          }).finished,
          fade([scrim], 1, 0, CLOSE_MS),
          fade(chrome(), 1, 0, CLOSE_MS * 0.6, 16),
        ]);
        ghost.remove();
      } else {
        await fade([scrim, overlayBody, overlayClose], 1, 0, 200);
      }
    }
  } finally {
    finishClose();
    busy = false;
  }
  source?.closest('a')?.focus({ preventScroll: true });
}

function finishClose() {
  if (overlay.open) overlay.close();
  clearAnimations();
  overlayBody.replaceChildren();
  overlay.querySelectorAll('.ghost').forEach((g) => g.remove());
  currentId = null;
  carousel = null;
  pushedEntry = false;
  document.title = homeTitle;
}

/** The user asked to close (button, Esc). Keep the URL in step with what's on screen. */
function requestClose() {
  if (busy) return;
  if (pushedEntry && history.state?.artwork === currentId) {
    history.back(); // popstate closes the overlay
  } else {
    history.replaceState(null, '', galleryUrl());
    closeOverlay();
  }
}

// ---------------------------------------------------------------------------
// Events

document.addEventListener('click', (event) => {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-open]');
  if (!link || event.defaultPrevented) return;
  // Let cmd/ctrl/shift-click open the artwork page in a new tab as usual.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const id = link.dataset.open!;
  if (busy || overlay.open) return;
  history.pushState({ artwork: id }, '', artworkUrl(id));
  pushedEntry = true;
  openArtwork(id);
});

overlayClose.addEventListener('click', (event) => {
  event.preventDefault();
  requestClose();
});

overlay.addEventListener('cancel', (event) => {
  event.preventDefault();
  requestClose();
});

// If the browser closes the dialog itself (e.g. Esc pressed twice quickly), tidy up.
overlay.addEventListener('close', () => {
  // The event fires asynchronously, so the dialog may already have been reopened.
  if (overlay.open) return;
  if (currentId && !busy) {
    if (idFromLocation()) history.replaceState(null, '', galleryUrl());
    finishClose();
  }
});

overlay.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('.nav');
  // detail is 0 when the button was pressed with Enter/Space rather than clicked.
  if (button) navigate(Number(button.dataset.step), event.detail === 0);
});

overlay.addEventListener('keydown', (event) => {
  if (!carousel) return;
  const field = (event.target as Element).closest('input, textarea, select, video');
  if (field) return;
  if (event.key === 'ArrowLeft') navigate(-1);
  else if (event.key === 'ArrowRight') navigate(1);
  else return;
  event.preventDefault();
});

window.addEventListener('popstate', () => {
  applyFilter(currentFilter(), false);
  const id = idFromLocation();
  if (id && id !== currentId) {
    pushedEntry = history.state?.artwork === id;
    if (overlay.open) renderDetail(id);
    else openArtwork(id);
  } else if (!id && overlay.open) {
    closeOverlay();
  }
});

// ---------------------------------------------------------------------------
// Purchase form

overlay.addEventListener('click', (event) => {
  const toggle = (event.target as Element).closest<HTMLButtonElement>('.buy-toggle');
  if (!toggle) return;
  const form = toggle.parentElement?.querySelector<HTMLFormElement>('.buy-form');
  if (!form) return;
  const opening = form.hidden;
  form.hidden = !opening;
  toggle.setAttribute('aria-expanded', String(opening));
  if (opening) {
    form.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  }
});

overlay.addEventListener('submit', async (event) => {
  const form = (event.target as Element).closest<HTMLFormElement>('.buy-form');
  if (!form) return;
  event.preventDefault();
  const status = form.querySelector<HTMLElement>('.form-status')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  if (data.get('_gotcha')) return; // a bot filled in the hidden field

  if (!formConfigured) {
    // No form service set up yet: fall back to the visitor's email app.
    const body = `${data.get('message')}\n\n${data.get('name')}\n${data.get('email')}`;
    location.href = `mailto:${contact}?subject=${encodeURIComponent(String(data.get('_subject')))}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Opening your email app…';
    return;
  }

  submit.disabled = true;
  status.textContent = 'Sending…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(String(response.status));
    const thanks = document.createElement('p');
    thanks.className = 'form-thanks';
    thanks.setAttribute('role', 'status');
    thanks.textContent = "Thank you! Your request has been sent and I'll be in touch soon.";
    form.replaceWith(thanks);
    form.closest('.buy')?.querySelector('.buy-toggle')?.remove();
  } catch {
    submit.disabled = false;
    status.innerHTML = '';
    status.append(
      "Sorry, that didn't send. Please try again or email ",
      Object.assign(document.createElement('a'), { href: `mailto:${contact}`, textContent: contact }),
      '.',
    );
  }
});

// ---------------------------------------------------------------------------
// Start-up

applyFilter(currentFilter(), false);

// Landed directly on /art/<id>: the overlay was rendered open by the server.
// Re-open it as a proper modal so focus, Esc and scrolling behave.
if (overlay.dataset.initial) {
  overlay.close();
  overlay.showModal();
  attachDetail();
  focusOverlay();
}
