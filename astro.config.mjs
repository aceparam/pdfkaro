import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The site normally sits at the root of its address. A preview on GitHub Pages
// sits under the repo name instead, such as /pdfkaro, and sets SITE_BASE to say so.
const base = process.env.SITE_BASE || '/';

// The base ends up in every link and script address, so only a plain path is taken.
if (!/^\/$|^(\/[A-Za-z0-9._-]+)+$/.test(base)) {
  throw new Error(`SITE_BASE must be "/" or a plain path such as "/pdfkaro", not "${base}".`);
}

// Static HTML, one file per page, so /merge-pdf is served with no trailing slash.
export default defineConfig({
  base,
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    // Stylesheets stay in files. Pages with no interactive part then carry no
    // inline style or script at all. A page with an island still carries one
    // inline style and two inline scripts from Astro's loader, which the
    // Content Security Policy (Phase 1) has to allow by hash.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  vite: {
    // Workers are ES modules, so each tool's engine stays its own file and is
    // fetched only when that tool runs.
    worker: { format: 'es' },
  },
  integrations: [react()],
});
