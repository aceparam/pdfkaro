# Licences

Every dependency the project adds is listed here, with why it is needed. Check that a library is still maintained before adding it, then add a line.

The project's own licence is not set yet. It waits on the owner's decision under "Open decisions" in `SPEC.md`.

## Shipped to visitors

| Package | Licence | Why |
| --- | --- | --- |
| `react` | MIT | Components |
| `react-dom` | MIT | Renders components to HTML at build time and wakes interactive ones in the browser |
| `@astrojs/react` | MIT | Lets Astro render React components; ships a small loader on pages with an interactive part |
| `pdfjs-dist` | Apache-2.0 | PDF.js, the library `SPEC.md` names for rendering. Draws page thumbnails in a worker, fetched only after a file is picked. Pinned to an exact version. Last release Nov 2026 |
| PDF.js's standard fonts, from `pdfjs-dist` | Foxit fonts: BSD-style (PDFium). Liberation Sans: **GPL v2 with a font exception** | Drawn into thumbnails of PDFs that do not embed a font. Shipped unchanged, bundled as data with their licence texts in `src/workers/pdfjs-data.ts`, by the owner's decision of 11 Nov 2026. Shipping them as separate data does not bind the project's licence |
| PDF.js's JBIG2 and JPEG 2000 decoders, from `pdfjs-dist` | BSD-style (PDFium JBIG2, OpenJPEG) and Apache-2.0 (PDF.js's wrappers) | Draw scanned images in thumbnails. Bundled as data with their licence texts in `src/workers/pdfjs-data.ts` |
| `@neslinesli93/qpdf-wasm` | ISC (the wrapper); qpdf itself is Apache-2.0 | qpdf compiled to WebAssembly, the library `SPEC.md` names for page structure. Merges, counts pages and opens protected files. Fetched only after a file is picked. Pinned to an exact version: it is a prebuilt binary from one maintainer. Last release Nov 2026 |
| `fflate` | MIT | Joins several results into one zip, in the tool worker, by the owner's decision of 12 Nov 2026. Fetched only when a tool that can give several files runs. Pinned to an exact version. Last release Jul 2026 |

## Used to build and test only

| Package | Licence | Why |
| --- | --- | --- |
| `astro` | MIT | Builds the static site |
| `typescript` | Apache-2.0 | Type check. Held at version 6, the newest the lint and check tools accept |
| `@astrojs/check` | MIT | Type check for `.astro` files |
| `@types/react`, `@types/react-dom` | MIT | Types for React |
| `@types/node` | MIT | Types for Node, used by the test and build configuration |
| `eslint`, `@eslint/js` | MIT | Lint |
| `globals` | MIT | Names of browser and Node globals for lint |
| `typescript-eslint` | MIT | Lint for TypeScript |
| `eslint-plugin-astro` | MIT | Lint for `.astro` files |
| `eslint-plugin-react-hooks` | MIT | Lint for React hooks |
| `vitest` | MIT | Unit tests |
| `@playwright/test` | Apache-2.0 | End-to-end tests. Pinned to an exact version so it matches the installed browser |
| `@fission-ai/openspec` | MIT | Checks OpenSpec changes and specs |
| `@napi-rs/canvas` | MIT | Draws pages in Node for the thumbnail unit tests. Also installed by npm as PDF.js's optional dependency. A native package that is never shipped; PDF.js loads it only in Node. Pinned to an exact version |
| `@cantoo/pdf-lib` | MIT | Makes the shared test PDFs and checks results in tests. The fork of pdf-lib that `SPEC.md` names. Brings in `culori`, `fflate`, `node-html-better-parser` and `tslib` (all MIT or 0BSD). Last release Sep 2026 |

`minimatch` (BlueOak-1.0.0) is not used directly. It is pinned to a patched version in `package.json` under `overrides`, because the version the lint tools ask for (`^10`) has a known advisory, GHSA-g3hv-75wg-m249. Remove the override once ESLint and `typescript-eslint` ask for version 11 themselves.

In CI, Playwright downloads a Chromium build from Microsoft's servers. That download is outside `package-lock.json`.
