import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPolicy } from './scripts/csp.mjs';

// The site normally sits at the root of its address. A preview on GitHub Pages
// sits under the repo name instead, such as /pdfkaro, and sets SITE_BASE to say so.
const base = process.env.SITE_BASE || '/';

// The base ends up in every link and script address, so only a plain path is taken.
if (!/^\/$|^(\/[A-Za-z0-9._-]+)+$/.test(base)) {
  throw new Error(`SITE_BASE must be "/" or a plain path such as "/pdfkaro", not "${base}".`);
}

// Every built page gets its Content Security Policy as a meta tag, straight
// after the character set tag, with the hashes of that page's own inline
// blocks taken from the file as written (scripts/csp.mjs). It runs on the
// build only: the dev server adds inline scripts of its own.
function cspMeta() {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return {
    name: 'pdfkaro-csp-meta',
    hooks: {
      'astro:build:done': ({ dir }) => {
        for (const file of walk(fileURLToPath(dir)).filter((name) => name.endsWith('.html'))) {
          writeFileSync(file, withPolicy(readFileSync(file, 'utf8')));
        }
      },
    },
  };
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
    // Content Security Policy allows by hash (cspMeta, above).
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  vite: {
    // Workers are ES modules, so each tool's engine stays its own file and is
    // fetched only when that tool runs.
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          // fflate's file is called browser.js; it is named for what it is, so the page-weight and
          // no-upload checks can name it exactly. Only a chunk made wholly of fflate gets the name,
          // so no other code can pass those checks under it.
          chunkFileNames: (chunk) =>
            chunk.moduleIds.length > 0 && chunk.moduleIds.every((id) => id.includes('/node_modules/fflate/')) ? '_astro/fflate-[hash].js' : '_astro/[name]-[hash].js',
        },
      },
    },
    // PDF.js's Type 1 fonts and decoders, bundled as data for thumbnails (src/workers/pdfjs-data.ts).
    assetsInclude: ['**/*.pfb', '**/*.wasm'],
  },
  integrations: [react(), cspMeta()],
});
