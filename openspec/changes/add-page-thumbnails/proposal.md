# Proposal

## Why

"Tool page anatomy" part 4 in `SPEC.md` says the working area shows page thumbnails once a file is chosen. Merge PDF lists its files without them, so it does not yet meet the page anatomy. Thumbnails are the last code Phase 0 needs: its gate asks that Merge PDF works end to end on a phone and passes the look-and-feel test. They are a shared part. `PageGrid` draws the items of every tool that lists files or pages, so they are built once, here, for every tool.

## What Changes

- **Rendering in the worker.** The tool worker gains PDF.js (`pdfjs-dist`), the library `SPEC.md` names for thumbnails. It draws one page of a file onto an OffscreenCanvas and sends back a small PNG. PDF.js runs in a worker of its own, which the tool worker starts. Nothing is drawn on the page's own thread.
- **`src/engines/thumbnail.ts`.** A shared function, like `inspect.ts`, that renders one page at a given width. It takes the file and any password that opened it. PDF.js reaches it through `tools`, as qpdf does.
- **A new worker message.** "Draw this page of this file at this width" gets a typed request and reply in `src/workers/messages.ts`, with the same checks as the others.
- **`PageGrid` shows a thumbnail for each item,** in the white paper box the design screens draw. It shows a blank paper box while the thumbnail loads, and keeps that box when a thumbnail cannot be drawn. Thumbnails are asked for only as items come into view.
- **`useToolRun` keeps the thumbnails.** They are held as object URLs beside the files, released when a file is removed, on "Start again" and on leaving the page, as the download link is.
- **Merge PDF** shows the first page of each file. It needs no code of its own: the widget asks for page 1 of each listed file.
- **PDF.js's own files.** PDF.js fetches a few files of its own, all common in scans or in files that do not embed their fonts:
  - its standard fonts, for PDFs that do not embed a font;
  - its character maps, for Chinese, Japanese and Korean text without embedded fonts;
  - three small WebAssembly decoders, for JPEG 2000 images, JBIG2 images and colour profiles. These are copied at build time from the package into the site, under a fixed path. A visitor fetches one only when a file needs it.

### Scope

- **One shared component, used by the one tool that exists.** No other tool is built. The `merge-pdf` spec is not changed: its working area already falls under `tool-page`, which this change refines.
- **Page tools** (Split, Rearrange, Rotate, Delete pages) will show one thumbnail per page. That grid, and keeping a document open across many pages, come with the first page tool. This change draws only the pages it is asked for, one at a time.
- **Out of scope:** larger previews, a page viewer, text selection, annotations, and anything that changes a file.

### `SPEC.md` sections

- "Tool page anatomy", part 4 (working area: page thumbnails).
- "States every tool handles", as they apply to thumbnails.
- "Details that apply everywhere": "Page thumbnails load as they scroll into view. A 500-page file must not freeze the page."
- "Architecture and tech stack": PDF.js for rendering; rules 2 to 4 (pure engine functions, in a Web Worker, loaded only after a pick).
- "Look and feel": images are allowed only as page thumbnails of the visitor's own file.

**Phase and catalogue:** Phase 0, step 4 (the shared components). It is the last Phase 0 build step before the gate. No new tool.

## Where files are processed, and new requests

Thumbnails are drawn in the visitor's browser, in workers. No request carries file contents, a file name or a password.

New requests, all to the site itself, all after a file is picked:
- PDF.js's two scripts.
- Only when a file needs them: a standard font, a character map, or a WebAssembly decoder.

The no-upload test's list of allowed files grows by exactly these.

Thumbnails are shown through `blob:` addresses. They exist only inside the browser, and the no-upload test is changed to accept the `blob:` scheme and nothing else.

## Open decisions and owner questions touched

- **Licence.** None of these files is AGPL. Each goes in `LICENSES.md`, with its own licence text copied beside it.
  - PDF.js is Apache-2.0.
  - The JBIG2 and OpenJPEG decoders are BSD-style, and the colour-profile code is MIT.
  - The character maps are Adobe's, under a BSD-style licence.
  - The Foxit fonts are BSD-style.
  - The Liberation Sans fonts are **GPL v2 with a font exception**. They are shipped as separate, unchanged files that PDF.js reads, which is putting files side by side and does not bind the project's licence. The assumed default (AGPL-3.0 with a public repo) is not changed.
  - Because the project's licence is the owner's decision, the pull request points the GPL fonts out. Leaving them out would make text in files that rely on Helvetica, the most common font PDFs do not embed, missing from thumbnails.
  - PDF.js's JavaScript sandbox (QuickJS, MIT) is not copied, because thumbnails never run a PDF's scripts.
- **Repair PDF link:** not touched.
- **Page budget:** not touched, since nothing new loads before a pick. After a pick, PDF.js adds about 515 KB gzip to the 464 KB that Merge PDF already fetches.

None of these needs more than the assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: adds what a thumbnail shows, where it is drawn, what is shown while it loads or when it cannot be drawn, and that it is decorative to a screen reader. The existing "Thumbnails load as they come into view" requirement gains a scenario for a list of files.

## Impact

- **New code:** `src/engines/thumbnail.ts`; PDF.js added to `tools` in `src/workers/tool.worker.ts`; a `thumbnail` message in `src/workers/messages.ts` and `worker-core.ts`; `ToolClient.thumbnail()`.
- **Changed code:**
  - `useToolRun` keeps thumbnail addresses and releases them.
  - `PageGrid` gains a thumbnail and a watcher that notices when items come into view.
  - `ToolWorkspace` passes them through.
- **Build:** a small step in `astro.config.mjs` copies PDF.js's fonts, character maps and decoders into the site.
- **Checks:**
  - `scripts/page-weight.mjs` names the new late-loading files.
  - `scripts/check-worker.mjs` also checks that PDF.js stays out of the worker file.
  - The no-upload test allows the new files and `blob:` addresses.
- **Dependency:** `pdfjs-dist`, pinned to an exact version.
- **Design screens:** `design/screens/merge-pdf-files.html` already draws the paper boxes. The screenshots are retaken with real thumbnails in the change's own folder.
