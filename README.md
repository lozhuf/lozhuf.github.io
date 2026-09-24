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
| `medium` | yes | One of the categories in `src/site.config.ts` (`charcoal`, `painting`, `drawing`, `print`, `mixed`). Drives the filter buttons. |
| `year` | yes | |
| `materials`, `dimensions`, `description` | no | Free text. |
| `price` | no | A number, no currency symbol. Leave out to show "Price on request". |
| `currency` | no | e.g. `"EUR"`. Defaults to the currency in `src/site.config.ts`. |
| `status` | no | `available` (default), `reserved` or `sold`. Sold pieces stay visible, with no buy button. |
| `alt` | no | Description of the main image for screen readers. Defaults to the title. |
| `order` | no | Position in the gallery, lowest first. Existing pieces are numbered 10, 20, 30… in the order of the original Google Doc, so use e.g. `5` to put a new piece first or `25` to slot it between the 2nd and 3rd. Pieces without `order` appear after all numbered ones, newest first. |
| `instagram` | no | Link to the Instagram post; shown as "View on Instagram". |

The folder name becomes the page address: `/art/harbour-at-dusk`. If a field is misspelled or has the wrong type, `npm run dev` / `npm run build` stops and names the field.

To add a category, add a line to `mediums` in `src/site.config.ts`.

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
src/components/           Gallery, Tile, Filters, ArtworkDetail, BuyForm
src/scripts/gallery.ts    filtering, overlay animation, carousel, form
src/styles/global.css     all styling; colours and fonts at the top
```
