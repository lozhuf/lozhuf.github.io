# lauriehufford.com

Portfolio and shop for original artwork. Built with [Astro](https://astro.build) and hosted on GitHub Pages.

## Preview locally

```sh
npm install      # first time only
npm run dev      # http://localhost:4321, reloads as you edit
```

To check the exact site that will be published: `npm run build && npm run preview`.

## Adding an artwork

```sh
npm run new "Harbour at Dusk"
```

This creates `src/content/artworks/harbour-at-dusk/artwork.json`. Then:

1. Copy the photos into that folder. They're shown in filename order and the first one is the cover in the gallery, so name them `01.jpg`, `02.jpg`, …
   Full-size photos are fine: smaller web versions are made automatically.
   Videos (`.mp4`) can go in the same sequence, e.g. `04.mp4`, together with a cover image named `04.poster.jpg`. They play silently on a loop when their slide is shown.
2. Fill in `artwork.json`:

```json
{
  "title": "Harbour at Dusk",
  "medium": "painting",
  "materials": "Oil on canvas",
  "dimensions": "60 × 80 cm",
  "year": 2026,
  "price": 850,
  "status": "available",
  "description": "Painted on location.\n\nA blank line starts a new paragraph."
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `medium` | yes | One of the categories in `src/site.config.ts` (`charcoal`, `painting`, `drawing`, `print`, `mixed`). Shown above the title in the details. |
| `year` | yes | |
| `materials`, `dimensions`, `description` | no | Free text. |
| `price` | no | A number, no currency symbol. Leave out to show "Price on request". |
| `currency` | no | e.g. `"EUR"`. Defaults to the currency in `src/site.config.ts`. |
| `status` | no | `available` (default), `reserved` or `sold`. Sold pieces stay visible, with no buy button. |
| `alt` | no | Description of the main image for screen readers. Defaults to the title. |
| `order` | no | Position in the gallery, lowest first. Existing pieces are numbered 10, 20, 30… in the order of the original Google Doc, so use e.g. `5` to put a new piece first or `25` to slot it between the 2nd and 3rd. Pieces without `order` appear after all numbered ones, newest first. |
| `instagram` | no | Link to the Instagram post; shown as "View on Instagram". |

The folder name becomes the page address: `/art/harbour-at-dusk`. If a field is misspelled or has the wrong type, `npm run dev` / `npm run build` stops and names the field.

To add a medium, add a line to `mediums` in `src/site.config.ts`.

## Site structure

- `/`: an overview with a card for each size (Large, Medium, Small) and a "Show all" button
- `/large`, `/medium`, `/small`: the pieces of that size, with sold pieces of that size at the bottom
- `/all`: every piece
- `/art/<folder-name>`: a single piece, opened over the gallery for its size
- `/music`: music videos

Sizes are worked out from the area in `dimensions` (width × height): 2,500 cm² or more is large (about 50 × 50 cm and up), 950 cm² or more is medium (about 31 × 31 cm and up), anything smaller is small. The limits and labels are in `sizes` in `src/site.config.ts`.

## Straightening and cropping photos

Photos taken at a slight angle can be straightened with the built-in tool:

```sh
npm run crop
```

It opens in your browser. Pick a photo on the left, drag the four red corners onto the corners of the artwork (a magnifier appears while you drag; keys `1`–`4` or `Tab` pick a corner and the arrow keys nudge it, `Shift` for bigger steps), choose the proportions, and press **OK**. The photo is straightened into a rectangle, cropped to the corners and saved over the original. Nothing else about the image is changed; JPEGs are re-saved at 95% quality.

- **Proportions**: "Match the corners" keeps the shape you marked; "Artwork size" uses the piece's real dimensions from `artwork.json`, so a 40 × 60 cm painting comes out at exactly 2:3.
- **Undo**: the first time a photo is edited, the original is copied to `.crop-backups/` (not committed to git). **Undo edits** restores it. Edited photos have a green dot.

Stop the tool with `Ctrl+C` in the terminal, then commit the changed photos as usual.

## Music videos

The Music videos page (`/music`, reached with the Artwork / Music videos buttons in the home page header) shows the videos listed in `src/content/music-videos.json`, in that order. To add one, add a line with its YouTube id (the part after `watch?v=` in the video's address), a title and the artist:

```json
{ "id": "7x3FBcNH5Ys", "title": "My Way", "artist": "Anti Atlas" }
```

## Pricing table (private)

```sh
npm run prices
```

Opens a table of every artwork with its current price and a suggested price from a formula: kr per cm of width + height (or per cm² of area), with separate rates for canvas/board and for paper, rounding and a minimum. It reads the artwork files each time, so new pieces appear automatically.

- Type a price in **New price** to set one piece by hand, or press **Keep** to hold its current price. Hand-set prices stay until you clear the box.
- **Apply new prices** writes the prices into the `artwork.json` files; they go live when you commit and push.
- **Download CSV** exports the table for a spreadsheet.

It only runs on your computer and isn't part of the website. The formula and any hand-set prices are saved in `.prices-settings.json`, which isn't committed, so nothing is public until you apply and push.

## Settings

`src/site.config.ts` holds your name, tagline, contact email, Instagram link, the currency and the purchase-form endpoint.

### Purchase requests

"Request to buy" sends a form through [Formspree](https://formspree.io) (free for up to 50 submissions a month):

1. Sign up, create a form and copy its endpoint (`https://formspree.io/f/xxxxxxx`).
2. Paste it into `formEndpoint` in `src/site.config.ts`.

Until you do this, the button opens the visitor's email app with a message addressed to `contactEmail`.

## Publishing

Every push to `master` builds and deploys the site through `.github/workflows/deploy.yml`.

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The custom domain (`www.lauriehufford.com`) is set under **Settings → Pages → Custom domain**. No `CNAME` file is needed when deploying with Actions.

## Where things live

```
src/content/artworks/     one folder per artwork (JSON + images)
src/site.config.ts        name, contact, form endpoint, categories
src/content.config.ts     the artwork.json schema
src/components/           Overview, Gallery, Tile, SiteHeader, ArtworkDetail, BuyForm
src/scripts/gallery.ts    overlay animation, carousel, browsing, form
src/styles/global.css     all styling; colours and fonts at the top
tools/crop/               the photo straightening tool (npm run crop)
tools/prices/             the private pricing table (npm run prices)
```
