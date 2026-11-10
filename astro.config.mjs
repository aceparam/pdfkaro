import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Static HTML, one file per page, so /merge-pdf is served with no trailing slash.
export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    // Stylesheets stay in files so a strict Content Security Policy needs no inline styles.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  integrations: [react()],
});
