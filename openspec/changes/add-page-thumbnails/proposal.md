# Proposal

## Why

"Tool page anatomy" part 4 in `SPEC.md` says the working area shows page thumbnails once a file is chosen. Merge PDF lists its files without them, so it does not yet meet the page anatomy.

Thumbnails are the last part of the page anatomy that Merge PDF lacks. The Phase 0 gate asks that Merge PDF works end to end on a phone and passes the look-and-feel test. The owner's browser and viewer checks remain after this change.

Thumbnails are a shared part. `PageGrid` draws the items of every tool that lists files or pages, so they are built once, here, for every tool.

## What Changes

- **Rendering in the worker.** The tool worker gains PDF.js (`pdfjs-dist`), the library `SPEC.md` names for thumbnails. It draws one page of a file and sends back a small PNG. PDF.js runs in a worker of its own, which the tool worker starts once. Nothing is drawn on the page's own thread.
- **`src/engines/thumbnail.ts`.** A shared function, like `inspect.ts`, that draws one page at a given width. It takes the file and any password that opened it. PDF.js and a canvas maker reach it through `tools`, as qpdf does, so it can be tested in Node.
- **A new worker message.** "Draw this page of this file at this width" gets a typed request and reply in `src/workers/messages.ts`, with the same checks as the others. A failed thumbnail has its own reply and never fails the tool.
- **`PageGrid` shows a thumbnail for each item,** in the white paper box the design screens draw.
  - A blank paper box shows while the thumbnail loads, and stays when a thumbnail cannot be drawn.
  - A wide page keeps its own shape, inside the same slot.
  - Thumbnails are asked for only as items come into view.
- **`useToolRun` keeps the thumbnails.** They are held as object URLs beside the files, released when a file is removed, on "Start again" and on leaving the page, as the download link is. The job always comes first: pressing the main button stops any thumbnail being drawn.
- **Merge PDF** shows the first page of each file. It needs no code of its own: the widget asks for page 1 of each listed file.
- **PDF.js's helper data comes as one fixed set,** by the owner's decision of 11 Nov 2026.
  - PDF.js needs its standard fonts, for PDFs that do not embed a font, and three small WebAssembly decoders, for JPEG 2000 images, JBIG2 images and colour profiles.
  - They are bundled into one script, the same for every file. The tool worker loads it with PDF.js and hands PDF.js the data from memory. So which helpers a PDF needs never shows in a request.
  - Character maps, for Chinese, Japanese and Korean text in fonts the PDF does not embed, are not shipped. Such text is missing from the thumbnail. The merged file is not affected.

### Scope

- **One shared component, used by the one tool that exists.** No other tool is built. The `merge-pdf` spec is not changed: its working area falls under `tool-page`, which this change refines.
- **Page tools** (Split, Rearrange, Rotate, Delete pages) will show one thumbnail per page. That grid, and keeping a document open across many pages, come with the first page tool. This change draws only the pages it is asked for, one at a time.
- **Out of scope:**
  - larger previews, a page viewer, text selection and annotations;
  - anything that changes a file.
- **The multilingual test file** (Hindi, Telugu, Arabic and Chinese) is still missing from the test set, because the build machine has no fonts for those scripts. It stays open.

### `SPEC.md` sections

- "Tool page anatomy", part 4 (working area: page thumbnails).
- "States every tool handles", as they apply to thumbnails.
- "Details that apply everywhere": "Page thumbnails load as they scroll into view. A 500-page file must not freeze the page."
- "Architecture and tech stack": PDF.js for rendering; "Rules for the code" 2 to 4 (pure engine functions, in a Web Worker, loaded only after a pick).
- "Look and feel": images are allowed only as page thumbnails of the visitor's own file; dark mode.

**Phase and catalogue:** Phase 0, step 4 (the shared components). No new tool.

## Where files are processed, and new requests

Thumbnails are drawn in the visitor's browser, in workers. No request carries file contents, a file name or a password.

New requests, all to the site itself, all after a file is picked, and the same whatever the file:
- PDF.js's two scripts;
- the one script holding its fonts and decoders;
- our own small script that draws a thumbnail.

The no-upload test's list of allowed files grows by exactly these four, by name.

Thumbnails are shown through `blob:` addresses. They exist only inside the browser. The no-upload test accepts `blob:` addresses of the site's own origin and nothing else.

## Open decisions and owner questions touched

**What PDF.js's helper requests reveal.** This was asked of the owner, who chose on 11 Nov 2026 to fetch one fixed set for every file, with no character maps. The alternatives offered were:
- fetching each helper only when a file needs it, and saying so on the Privacy page;
- a fixed set that includes the maps (about 1.6 MB);
- no helpers at all.

**Licence.** None of the files is AGPL. Each goes in `LICENSES.md`, with its own licence text kept beside it in the bundle.
- PDF.js is Apache-2.0.
- The JBIG2 and OpenJPEG decoders are BSD-style, and the colour-profile code is MIT.
- The Foxit fonts are BSD-style.
- The Liberation Sans fonts are **GPL v2 with a font exception**. They are shipped unchanged, as data PDF.js reads, which does not bind the project's licence. The assumed default (AGPL-3.0 with a public repo) is not changed.
- The owner chose on 11 Nov 2026 to ship them, having been told that without them, text in Helvetica-like fonts that a PDF does not embed would be missing from thumbnails.
- PDF.js's JavaScript sandbox (QuickJS) is not shipped, because thumbnails never run a PDF's scripts.

**Page budget.** Not touched, since nothing new loads before a pick. After a pick, PDF.js adds about 515 KB gzip and its fixed data about 810 KB, on top of the 464 KB that Merge PDF already fetches. The owner was quoted about 670 KB for the data; storing it in a script adds about 140 KB, which keeps any `fetch` out of our own code.

**Repair PDF link:** not touched.

Both owner decisions are recorded in `CLAUDE.md` as part of this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: adds what a thumbnail shows, where it is drawn, what is shown while it loads or when it cannot be drawn, that it never holds up the job, and that it is decorative to a screen reader. The existing "Thumbnails load as they come into view" requirement gains a scenario for a list of files.

## Impact

- **New code:**
  - `src/engines/thumbnail.ts`.
  - The fixed helper data module, `src/workers/pdfjs-data.ts`.
  - PDF.js and a canvas maker added to `tools` in `src/workers/tool.worker.ts`.
  - A `thumbnail` message in `src/workers/messages.ts` and `worker-core.ts`, and `ToolClient.thumbnail()`.
- **Changed code:**
  - `useToolRun`, with a thumbnail queue in `src/widget/`.
  - `PageGrid` gains a thumbnail and a watcher that notices when items come into view.
  - `ToolWorkspace` passes them through.
- **Test set:** a new `images.pdf`, with a JPEG 2000 image and CMYK colour, so the decoders and colour handling are tested.
- **Checks:**
  - `scripts/page-weight.mjs` names the new late-loading files.
  - `scripts/check-worker.mjs` also checks that PDF.js stays out of the worker file, and that the built PDF.js has no `eval` or `new Function`.
  - The no-upload test allows the four new files by name and `blob:` addresses of the site's own origin.
- **Dependencies:**
  - `pdfjs-dist`, pinned to an exact version.
  - `@napi-rs/canvas`, already installed as PDF.js's optional dependency, pinned as a test-only dependency so unit tests can draw pages in Node.
- **Design screens:** `design/screens/merge-pdf-files.html` already draws the paper boxes. Screenshots are retaken with real thumbnails in the change's own folder.
