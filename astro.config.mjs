// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // The final public URL of the site. Used for the sitemap and social share previews.
  site: 'https://www.lauriehufford.com',
  // If you publish at https://<username>.github.io/<repo>/ instead of a custom
  // domain, set this to '/<repo>'.
  base: '/',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
});
