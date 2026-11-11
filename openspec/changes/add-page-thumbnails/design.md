# Design

## Context

- **Already built:**
  - The tool worker (`src/workers/tool.worker.ts`) loads engines lazily and passes libraries to them through `tools`.
  - `PageGrid` has an optional `thumbnail` address on each item, drawn as an `<img alt="">` in a 52 by 68 px box (`PageGrid.module.css`, `.thumb`).
  - `useToolRun` keeps files, passwords and the download address outside the reducer, and releases them on remove, "Start again" and `pagehide`.
  - `ToolClient` ends the worker on a `memory` or `engine-load` failure, and on a worker error.
- **The trial.** A scratch trial on 11 Nov 2026 used `pdfjs-dist` 6.5.438 in Chromium, inside a module worker like ours.
  - It drew page 1 of every readable fixture at 104 px wide, in 10 to 145 ms each. Each PNG came to 1 to 10 KB.
  - It found four things to settle:
    1. PDF.js's worker code, imported into our worker, attaches itself to our worker's own message channel and posts its own messages there.
    2. Its default canvas maker calls `document.createElement` as soon as a page holds an image.
    3. Its default filter maker also needs `document`.
    4. Without its standard fonts, text in a font the PDF does not embed is not drawn.
- **The owner decided on 11 Nov 2026:**
  - PDF.js's helper data is one fixed set, the same for every file, with no character maps.
  - The Liberation Sans fonts (GPL v2 with a font exception) are shipped.
- **PDF.js 6.5 options that matter here** (checked against the package):
  - **`BinaryDataFactory`:** PDF.js asks it for each helper by kind and file name.
  - **`useWorkerFetch: false`:** makes PDF.js ask that factory instead of fetching for itself.
  - **`maxImageSize`.**
  - **`verbosity`.**
  - **`isEvalSupported` no longer exists.** PDF.js has no generated code left, so the current version is the mitigation for CVE-2024-4367.
  - **Colour profiles (`iccs/`)** would be fetched by PDF.js from `iccUrl`, outside the factory. `iccUrl` is left unset (decision 4), so none is ever fetched. PDF.js then converts CMYK colours in JavaScript, which is enough for a thumbnail.
  - **PDF.js refuses a helper address that does not end in `/`** ("Invalid factory url"). Any address we set must end in `/`.

## Goals / Non-Goals

**Goals:**
- One thumbnail per listed item, drawn off the page's thread.
- Drawn only as it comes into view, never holding up the job, and forgotten with its file.
- No request that depends on the file.

**Non-Goals:**
- Keeping a PDF open across many thumbnails, which page tools will need.
- Thumbnails of the result.
- Larger previews.

## Decisions

### 1. PDF.js in a worker of its own, started once by the tool worker

The tool worker loads PDF.js's display code (`pdf.min.mjs`) the first time a thumbnail is asked for. At the same time it starts PDF.js's own worker (`pdf.worker.min.mjs`) as a nested module worker, and passes it to PDF.js as `workerPort`.
- **One per tool worker.** The nested worker is started once for each tool worker, not once per call. It is ended with the tool worker, after every job, on Cancel, on "Start again" and on `pagehide`.
- **Its errors stay inside.** `nested.onerror` calls `preventDefault()`, so an error in it never reaches the page as a worker error, and rejects the thumbnail being drawn.
- **Once it fails, it stays failed.** After the nested worker errors, that tool worker marks PDF.js unavailable and answers every later thumbnail with `null` at once. That way the visitor never waits out the time limit for each item. The next tool worker tries again.

Alternatives considered:
- **PDF.js's worker code in the same thread.** It attaches to our channel. Rejected.
- **PDF.js on the page's thread.** Against "Rules for the code" 3. Rejected.
- **qpdf.** It cannot draw pages.

### 2. Everything PDF.js needs from outside comes through `tools`

`src/engines/thumbnail.ts` keeps the engine rules: no `document`, no `window`, no requests. It gets three things through `tools`:
- **`pdfjs`:** the PDF.js module, ready to open a document. In the worker this is the nested-worker setup above. In a Node test it is the same package, which runs its worker code in-thread there.
- **`canvas`:** `{ create(width, height) → { canvas, context }, png(canvas) → Promise<Uint8Array> }`.
  - In the worker it makes an `OffscreenCanvas` and encodes with `convertToBlob`.
  - In a Node test it uses `@napi-rs/canvas`.
- **`pdfjsData`:** the fixed helper data, by file name (decision 3).

From these, `thumbnail.ts` builds the three classes PDF.js asks for:
- **`CanvasFactory`:** `create`, `reset`, `destroy` and `getNoAlphaContext`, over `tools.canvas`.
- **`FilterFactory`:** returns no filters. Filters serve a few rare effects; a thumbnail does without them.
- **`BinaryDataFactory`:** answers font and WebAssembly requests from `pdfjsData`, and refuses character-map requests, which PDF.js handles by leaving such text out.

PDF.js does not export its base classes, so ours carry the same methods. The Node tests draw real pages through them, and `scanned.pdf` exercises the image path that needs the canvas maker.

### 3. The fixed helper data, in one script

`src/workers/pdfjs-data.ts` imports each standard font file and the three decoders with Vite's `?inline`, which turns each into data inside the script, and exports a map from file name to bytes. That gives one hashed chunk of about 810 KB by gzip, the same for every file.

The tool worker loads it with `import()`, at the same time as PDF.js, when the first thumbnail is asked for. It is never imported statically, so a read or a merge with no thumbnail never fetches it. `check-worker.mjs` fails if the data is found inside the tool worker file. The licence files of the fonts and decoders are kept beside them in the chunk.
- **Left out:** character maps, by the owner's decision; `iccs/` (decision context); `quickjs-eval.*`.
- **Why not separate files?** Fetching a fixed list of separate files would save about 140 KB, but needs a `fetch` in our own worker code, which lint bans there.
- **If `?inline` does not handle `.pfb`, `.ttf` or `.wasm`,** a small build script writes the same module from the package's files instead. The first build task checks this.

### 4. Safe options for PDF.js

`getDocument` is called with:
- `data` (bytes, never an address);
- `password` when one opened the file;
- `enableXfa: false`;
- `disableFontFace: true`: glyphs are drawn as shapes, and no font is installed in the browser;
- `useSystemFonts: false`;
- `useWorkerFetch: false`, with our `BinaryDataFactory`;
- **no address to fetch from.**
  - `cMapUrl`, `standardFontDataUrl` and `iccUrl` are left unset, so PDF.js has nowhere to fetch character maps, fonts or colour profiles from, and requests none. Fonts reach it through the factory.
  - `wasmUrl` is set to `data:,/`, an address that is not on the network, and that ends in `/` as PDF.js requires. Our factory ignores it and serves the decoders from memory.
  - PDF.js also loads a JavaScript fallback for a decoder, from `wasmUrl` and outside the factory, if WebAssembly cannot start in the worker. With `data:,/` that load fails inside the browser, since the address is plain text and not a script, instead of reaching the site, so it can never reveal that a file holds such an image. Such an image is then simply left out of the thumbnail.
  - A unit test opens a fixture with the real `getDocument` and these exact options, so a value PDF.js refuses is caught;
- `maxImageSize: 16777216` (16 million pixels): a larger image inside the PDF is not decoded;
- `verbosity: 0`, so no warning that names a font from the file reaches the console.

No scripting is turned on, and the sandbox is never loaded. `check-worker.mjs` fails if `new Function(` or `eval(` appears in the built PDF.js files.

### 5. The thumbnail function

```ts
renderPage(file: Uint8Array, page: number, box: { width: number; height: number }, password: string | undefined, tools: EngineTools): Promise<Uint8Array>
```

- It opens the file and draws the page to fit inside `box`, keeping the page's shape. The scale is the smaller of `box.width / pageWidth` and `box.height / pageHeight`, so a 1 by 14400 page cannot ask for a huge canvas.
- It gives back PNG bytes.
- It closes the document through its loading task every time, even after a failure.
- The page asks for a box of twice the CSS slot, 104 by 136, so the picture is sharp on a phone.

It is not a tool engine, so it is not in `src/engines/tools/` and has no registry entry. It sits beside `inspect.ts`.

### 6. The message, and a failure that never fails the tool

New messages in `src/workers/messages.ts`:
- **To the worker:** `{ type: 'thumbnail', requestId, toolId, file: Blob, password?, page, box: { width, height } }`.
  - `page` must be a whole number of 1 or more.
  - Each side of `box` must be a whole number from 16 to 400.
- **From the worker:** `{ type: 'thumbnail', requestId, image: Uint8Array | null }`. The image is transferred. `null` means it could not be drawn.

`worker-core.ts` handles the request without loading a tool engine. Any error while drawing becomes `image: null`, never `failed`.

`ToolClient.thumbnail()` resolves to the bytes or `null`, and never calls `failAll`. It carries a time limit of 10 seconds. If that passes, the client ends the worker, which ends PDF.js's worker too, and resolves `null`. That is safe because thumbnails are asked for only while no `inspect` and no job is in flight (decision 7). The next action starts a fresh worker.

### 7. The queue, and the job first

`src/widget/thumbnails.ts` is a plain function over a small state, tested in Node:
- **What it remembers about each item:** wanted (it has come into view), drawing, drawn or failed.
- **It draws one at a time.**
- **It asks only for:**
  - files whose status is `ready`;
  - while no file is being read;
  - while the step is `listing`.
- **Removing a file** drops its entry.
- **"Start" drops the queue.**

`useToolRun` runs it:
- **The picture.** It turns the image bytes into a `Blob` of type `image/png` and an object URL, after checking that the file is still listed. A late reply for a removed file is thrown away before any URL is made.
- **Its addresses.** The URLs are kept in a ref, mirrored to state.
- **When the main button is pressed, or a file is about to be read:** if a thumbnail is in flight, it ends the client first. The job or the read then gets a fresh worker at once. A file is read when files are added or a password is typed.
  - Every file has been read before the main button can be pressed, so nothing is lost there.
  - A file about to be read has not started, so nothing is lost there either.
  - Ending the client this way means an `inspect` is never pending when the time limit ends a worker, so no file can be left on "Getting ready".
- **When the list comes back** after Cancel or a failure, wanted items that are not drawn are asked for again.
- **Revoking.** On remove, "Start again", `pagehide` and unmount, it revokes the URLs, drops the queue and ends the client as now.

### 8. `PageGrid`

- **The slot.** Every item has a 52 by 68 px slot, so the list never moves.
  - With no picture, the slot holds a blank white paper box with a line around it.
  - With one, the picture sits centred in the slot at its own shape, up to 52 by 68. The white fill and the line are on the picture, so a wide page shows as wide paper.
- **The picture is decorative.** The slot is `aria-hidden`. The `img` has `alt=""` and `draggable={false}`, and is never focusable or a link. Dragging by it moves the item, as dragging anywhere on the item does.
- **Coming into view.** `PageGrid` takes `onVisible(id)`. It watches its items with one `IntersectionObserver` (root margin 300px) and reports each item once.
- **On a phone at 360px** the slot sits left of the name, and the buttons wrap to the next row, as the design screens draw it.

### 9. Page weight and what loads when

| | Before a pick | After a pick, at most |
| --- | --- | --- |
| Today | 76.6 KB | +464 KB (qpdf and the workspace) |
| With this change | 76.6 KB, unchanged | +about 515 KB for PDF.js, +about 810 KB for its fixed data, by gzip |

PDF.js and its data are fetched when the first thumbnail is asked for, after the files have been read, so page counts and the main button never wait for them.

`page-weight.mjs` names the emitted files by their exact base names, read from the first build (for example `pdf.min`, `pdf.worker.min` and `pdfjs-data`). `check-worker.mjs` fails if:
- PDF.js's code is inside the tool worker file;
- `@napi-rs` appears in any built file other than PDF.js's own script;
- the built PDF.js has `eval(` or `new Function(`.

### 10. Dependencies

| Package | Why | Licence | Last release | Shipped |
| --- | --- | --- | --- | --- |
| `pdfjs-dist` 6.5.438, exact | The library `SPEC.md` names for rendering; qpdf cannot draw pages | Apache-2.0. Fonts: Foxit BSD-style, Liberation GPL v2 with a font exception. Decoders: BSD-style and MIT | 1 Nov 2026 | About 1.3 MB by gzip in all, after a pick |
| `@napi-rs/canvas`, exact, test only | Draws pages in Node unit tests. Already installed as PDF.js's optional dependency; pinned here so tests do not rest on an optional install | MIT | Checked when added | Never shipped. PDF.js loads it only in Node, through a `require` made at run time |

### 11. Tests

**Unit, in Node:**
- `renderPage` against every fixture, through `@napi-rs/canvas`:
  - every readable file gives a PNG that fits the box, with dark pixels where text or an image is;
  - `mixed.pdf` gives a wide picture for its landscape page when asked for page 2;
  - damaged files reject;
  - `password.pdf` rejects without its password and draws with it;
  - `images.pdf`, a new fixture with a JPEG 2000 image and CMYK colour, draws its image, so the decoders and colour handling are exercised (JBIG2 cannot be made on the build machine, and the fixtures README says so).
- The message checks.
- `worker-core` turning a drawing error into `image: null`.
- The client's time limit, and that a thumbnail failure never ends a pending `inspect`.
- The queue function.

**End to end, at 360px and 1280px:**
- Every readable fixture shows a thumbnail; the damaged file keeps its blank box; the password file's thumbnail appears only after the right password; a landscape first page is wide.
- With 30 files listed, only items near the screen have thumbnails until scrolled, and no long task exceeds 100 ms.
- Thumbnails are not focusable, are hidden from the accessibility tree, and are not draggable; dragging an item by its thumbnail moves the item.
- With PDF.js held back by the test, pressing the main button merges at once.
- When PDF.js cannot be fetched, blank boxes stay and the merge works.
- After remove, "Start again" and `pagehide`, no `blob:` image is on the page, and fetching each saved thumbnail address fails.
- Nothing of PDF.js loads before a pick.

**No-upload test:**
- It waits for every thumbnail before merging.
- The allowlist gains PDF.js's two files and the data chunk, by exact name read from the build.
- It checks that `pdf.worker` and the data chunk were seen, as it does for qpdf's WebAssembly.
- It accepts `blob:` addresses of the site's own origin only.
- The control test gains a fetch from a worker inside a worker.

## Found while building

- **The colour decoder (`qcms_bg.wasm`) is not shipped.** With `useWorkerFetch: false`, PDF.js never asks for it and converts colours in JavaScript, so it would be dead weight. The fixed data is the fonts and the JPEG 2000 and JBIG2 decoders: 760 KB by gzip.
- **PDF.js's modern build needs `Promise.try`.** That means Chrome 128, Firefox 134 and Safari 18.2 or later; older browsers show blank boxes and the tool works. Node 22 lacks it too, so the unit tests use PDF.js's legacy build, the same version.
- **Vite needed `.pfb` and `.wasm` in `assetsInclude`** to bundle them with `?inline`, in `astro.config.mjs` and `vitest.config.ts`.
- **`form.pdf` was made again** with the other fixtures when `images.pdf` was added. The committed copy predated a change to `make.mjs` in `add-merge-pdf`, which gives the form field a neutral sample value. The fields and page are the same, and the Merge PDF engine tests pass on it.
- **PDF.js repairs `damaged-xref.pdf`,** which qpdf cannot read. The page asks for thumbnails only of files qpdf has read, so this never shows.
- **The PDF.js loader is its own module,** `src/workers/pdfjs-loader.ts`, so that starting PDF.js's worker once and stopping every drawing when it fails are unit tested.
- **Without the standard fonts, PDF.js still drew text** in Node, with a fallback font, so the font tests check that PDF.js asked for the font rather than counting ink.

## Risks / Trade-offs

- **A malicious PDF** might exploit PDF.js.
  - → It is parsed in PDF.js's own worker and drawn in the tool worker, and neither can reach the page.
  - → The version is current. There is no scripting, no XFA and no installed font. Images over 16 million pixels are skipped, and the box limits the canvas.
  - → A 10-second limit ends a drawing that hangs.
  - → A crash fails only that thumbnail.
- **A drawing that hogs the worker** (millions of drawing commands) could delay the job.
  - → Pressing the main button ends that worker and starts the job on a fresh one.
- **An oversized file** gives PDF.js its own copy while it draws.
  - → One thumbnail at a time, and the document is closed after each one.
  - → The 100 MB warning stands.
- **A hostile file name** never reaches PDF.js or any address. Files go in as bytes.
- **Browsers without OffscreenCanvas 2D in workers or nested module workers** (Safari before 16.4) show blank boxes, and the tool still works.
  - → Recorded for the owner's browser check.
- **About 1.3 MB more after a pick** costs data on a phone.
  - → It loads only when the first thumbnail is drawn, after the files are read.
  - → This was the owner's choice over requests that depend on the file.
- **Chinese, Japanese and Korean text in fonts a PDF does not embed** is missing from thumbnails, by the owner's decision.
- **PDF.js's internal factory methods may change** in an upgrade.
  - → The version is pinned, and the Node tests draw through our factories.
- **Content Security Policy, for the later change that adds it.** A `<meta>` policy, which is all GitHub Pages allows, does not reach workers. Workers take their policy from their script's response headers. That change will need:
  - `worker-src 'self'`;
  - `img-src 'self' blob:`;
  - `script-src 'self' 'wasm-unsafe-eval'`;
  - `connect-src 'self'`, sent as a header on the worker scripts.

## Open Questions

None that change the specs or the tasks.
