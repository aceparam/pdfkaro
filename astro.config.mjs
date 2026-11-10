import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The site normally sits at the root of its address. A preview on GitHub Pages
// sits under the repo name instead, such as /pdfkaro, and sets SITE_BASE to say so.
const base = process.env.SITE_BASE || '/';

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
  integrations: [react()],
});
