# Design

## Context

- **Already built:**
  - The tool worker, `src/workers/tool.worker.ts`, loads engines lazily and passes libraries to them through `tools`. qpdf is made afresh for each call.
  - `PageGrid` already has an optional `thumbnail` address on each item, drawn as an `<img alt="">` in a 52 by 68 px white box (`PageGrid.module.css`, `.thumb`).
  - `useToolRun` keeps files, passwords and the download address outside the reducer, and releases them on remove, "Start again" and `pagehide`.
- **The trial.** A scratch trial on 11 Nov 2026 used `pdfjs-dist` 6.5.438 in Chromium, inside a module worker like ours:
  - It drew page 1 of `text.pdf`, `mixed.pdf`, `scanned.pdf`, `password.pdf` (with its password), `rich.pdf` and `pages-500.pdf` at 104 px wide. Each took 10 to 145 ms, and each PNG came to 1 to 10 KB.
  - Four things had to be settled to get there (decisions 2 and 3):
    1. PDF.js's worker code, imported into our worker, attaches itself to our worker's own message channel and posts its own messages there.
    2. Its default canvas maker calls `document.createElement`, which a worker does not have, as soon as a page holds an image.
    3. Its default filter maker also needs `document`.
    4. Without its standard font files, text set in a font the PDF does not embed is not drawn.

## Goals / Non-Goals

**Goals:**
- One thumbnail per listed item, drawn off the page's thread.
- Drawn only as it comes into view, and never holding up the job.
- Forgotten with its file.

**Non-Goals:**
- Keeping a PDF open across many thumbnails. Page tools will need that; Merge PDF draws one page per file.
- Thumbnails of the result.
- Larger previews.

## Decisions

### 1. Where it is drawn: PDF.js in a worker of its own, started by the tool worker

The tool worker loads PDF.js's display code (`pdf.min.mjs`) and starts PDF.js's own worker (`pdf.worker.min.mjs`) as a nested module worker. It passes that worker to PDF.js as `workerPort`. This is PDF.js's normal layout, with the tool worker playing the part of the page. Our tool worker then draws onto an OffscreenCanvas.

The nested worker is ended with the tool worker, which already happens after every job, on Cancel, on "Start again" and on `pagehide`.

Alternatives considered:
- **PDF.js's worker code in the same thread** ("fake worker"). The trial showed it attaches to our worker's global message channel and posts `{ action: "ready" }` there. Our checks would drop those messages, but two programs sharing one channel is fragile. Rejected.
- **PDF.js on the page's thread,** drawing into real canvases. Its display code would load on the page and the drawing would run there, against "Rules for the code" 3. Rejected.
- **qpdf.** It cannot draw pages.

### 2. Canvas and filter makers that need no `document`

`src/engines/thumbnail.ts` passes PDF.js two small classes:
- **`CanvasFactory`** makes `OffscreenCanvas` objects.
- **`FilterFactory`** returns no filters. Filters are used for a few rare effects; a thumbnail does without them.

PDF.js does not export its base classes, so ours have the same methods: `create`, `reset`, `destroy` and `getNoAlphaContext`; and `addFilter` and its kin.

A unit test checks that each class has every method PDF.js's own class has, so an upgrade that adds one fails the test rather than a visitor's page.

### 3. Safe options for PDF.js

`getDocument` is called with:
- `isEvalSupported: false`: no generated code. This is the mitigation for CVE-2024-4367, alongside a current version.
- `enableXfa: false`.
- `disableFontFace: true`: glyphs are drawn as shapes, so no font is installed in the browser.
- `useSystemFonts: false`.
- `useWorkerFetch: true`, with `standardFontDataUrl`, `cMapUrl` and `wasmUrl` set to the site's own copies (decision 5).
- `password`, when one opened the file.

No scripting is turned on, and the sandbox file is never loaded. The file is passed as bytes (`data`), never as an address.

### 4. The thumbnail function and its message

`src/engines/thumbnail.ts` exports:

```ts
renderPage(file: Uint8Array, page: number, width: number, password: string | undefined, tools: EngineTools): Promise<Blob>
```

- It opens the file, draws the page so that it is `width` pixels wide, and gives back a PNG `Blob`.
- It closes the document through its loading task (`task.destroy()`) every time, even after a failure.
- `width` is twice the CSS width (104 for 52), so the picture is sharp on a phone.

It is not a tool engine, so it does not go in `src/engines/tools/` and has no registry entry. It sits beside `inspect.ts` and keeps the engine rules: no `document`, no `window`, no requests of its own.

New messages in `src/workers/messages.ts`:
- **To the worker:** `{ type: 'thumbnail', requestId, toolId, file: Blob, password?, page, width }`. The checks require `page` to be a whole number of 1 or more, and `width` a whole number from 16 to 400.
- **From the worker:** `{ type: 'thumbnail', requestId, image: Blob }`, or `failed` as now.

`worker-core.ts` handles the request without loading a tool engine. `ToolClient.thumbnail()` sends it.

### 5. PDF.js's own files are copied into the site at build time

The worker cannot be handed font files one by one, because PDF.js builds their addresses from a base address and a fixed file name. So `astro.config.mjs` gains a small integration:
- In `astro:build:done`, it copies these into `dist/pdfjs/<version>/`:
  - `standard_fonts/`;
  - `cmaps/`;
  - `wasm/jbig2.wasm`, `openjpeg.wasm` and `qcms_bg.wasm`, with the two `*_nowasm_fallback.js` files;
  - the licence file for each.
- In `astro:server:setup`, it serves the same files in development.
- Putting the version in the path keeps caches from mixing two versions.
- The addresses go through `withBase`, so they work under the preview's sub-path. `check:base` already reads addresses in scripts.
- `quickjs-eval.*` and `iccs/` are not copied.

The two PDF.js scripts themselves are bundled, through `import()` and `?url`, so they get content hashes like every other script.

Alternative considered: a `StandardFontDataFactory` that fetches each file from a hashed address made by `import.meta.glob`. That needs a `fetch` in our own worker code, which lint rightly bans there. Rejected.

### 6. Asking for thumbnails as items come into view

- **`PageGrid`:**
  - It takes `onVisible(id)` and watches its items with an `IntersectionObserver` (root margin 300px), telling the parent once per item.
  - It always draws the `.thumb` box. Without a `thumbnail` address the box is blank paper, so nothing moves when the picture arrives.
  - The box is `aria-hidden` and has `alt=""`. It is never a link or focusable.
- **`useToolRun`:**
  - It keeps a queue and draws one thumbnail at a time.
  - It asks only for files whose status is `ready` and that have come into view. A file that needs a password is asked for once it opens.
  - Results go into a `Map<id, objectURL>` held in a ref, mirrored to state for rendering.
  - A failure leaves the blank box and is not shown, announced or retried.
  - Removing a file, "Start again", `pagehide` and unmount revoke the addresses and drop the queue.
- **`ToolWorkspace`** passes `onVisible` and each item's thumbnail address to `PageGrid`.

Each request posts the `File` again, as `inspect` does. The worker reads it, draws one page, and drops it.

### 7. Keeping the job first

A thumbnail request and a merge both go to the same tool worker.
- **When "Merge and download" is pressed,** the queue is dropped and no new thumbnails are asked for until the list is back.
- **The worker is ended after the job,** as now, which also ends PDF.js's worker.
- **When the list comes back** after Cancel or a failure, missing thumbnails are asked for again as their items come into view.

### 8. Page weight and what loads when

| | Before a pick | After a pick, at most |
| --- | --- | --- |
| Today | 76.6 KB | +464 KB (qpdf) |
| With this change | 76.6 KB, unchanged | +about 515 KB more for PDF.js (`pdf.min.mjs` 136 KB, `pdf.worker.min.mjs` 378 KB, by gzip) |
| Only when a file needs them | | One standard font (about 90 KB by gzip), one character map (a few KB each), or one decoder (100 to 216 KB raw) |

PDF.js is fetched when the first thumbnail is asked for. That happens after a file has been read, so the main button and page counts never wait for it.

`page-weight.mjs` names `pdf` and `pdf.worker` in `loadedLater` by exact base name, and counts files under `pdfjs/` as late files. `check-worker.mjs` also fails if PDF.js's code is found inside the tool worker file.

### 9. Dependency

| Package | Why | Licence | Last release | Shipped |
| --- | --- | --- | --- | --- |
| `pdfjs-dist` 6.5.438, exact | The library `SPEC.md` names for rendering; qpdf cannot draw pages | Apache-2.0; fonts, maps and decoders as in the proposal | 1 Nov 2026 | About 515 KB by gzip after a pick, plus files on need |

Its optional dependency `@napi-rs/canvas` (MIT) is a native drawing package for Node.
- npm installs it, with a prebuilt binary for the machine, in development and in CI.
- PDF.js loads it only in Node, through a `require` made at run time, so the bundler never pulls it into the site, and nothing in our code or tests loads it.
- `LICENSES.md` lists it under build and test, as installed but never shipped or run.
- `check-worker.mjs` fails if the text `@napi-rs` appears in any built file other than PDF.js's own script.

### 10. Tests

- **Unit, in Node:**
  - The thumbnail message checks: page and width limits, a file that is not a `Blob`, unknown fields.
  - `worker-core` handling a thumbnail request with a made-up `renderPage`.
  - The client's `thumbnail()`.
  - That the two factory classes have every method PDF.js's own classes have.
  - The queue logic in a plain function: one at a time, only for ready files, dropped on start, removed with its file.
  - Drawing itself is not unit tested in Node, because PDF.js would need a native canvas package there. It is covered end to end in Chromium.
- **End to end, at 360px and 1280px:**
  - Every readable fixture shows a thumbnail: an `img` with a `blob:` address, natural width 104.
  - `damaged-cut.pdf` keeps its blank box.
  - `password.pdf` shows its thumbnail only after the right password.
  - With 30 files listed, only items near the screen have thumbnails until the visitor scrolls, and no long task exceeds 100 ms.
  - A thumbnail is not focusable and is hidden from the accessibility tree.
  - A failure to fetch PDF.js leaves blank boxes, and the merge still works.
  - "Start again" and `pagehide` leave no `blob:` image.
  - Nothing of PDF.js loads before a pick.
- **No-upload test:**
  - The allowlist gains the PDF.js scripts and any file under `pdfjs/<version>/`.
  - `blob:` requests are accepted only for the `blob:` scheme with the site's own origin.
  - The control test gains an image whose address carries a file name under `pdfjs/`, to show the wider allowlist still catches data in an address.

## Risks / Trade-offs

- **A malicious PDF** might exploit PDF.js.
  - → It is parsed in PDF.js's own worker and drawn in the tool worker. Neither can reach the page.
  - → The version is current, eval is off, scripting is off, XFA is off and no font is installed.
  - → A crash fails only that thumbnail.
- **An oversized file** would make PDF.js hold a copy while the worker holds another.
  - → One thumbnail at a time.
  - → The document is closed after each one.
  - → The 100 MB warning stands.
  - → A failure leaves the blank box and does not stop the merge.
- **A hostile file name** never reaches PDF.js or any address. Files go in as bytes.
- **Browsers without OffscreenCanvas 2D in workers or nested module workers** (Safari before 16.4) cannot draw thumbnails.
  - → They see blank boxes, and the tool still works.
  - → Recorded as a known gap for the owner's browser check.
- **About 515 KB more after a pick** costs data on a phone.
  - → It loads only when a thumbnail is asked for, after the files are read.
- **GPL v2 fonts are shipped** as separate files.
  - → Pointed out to the owner (see the proposal).
  - → Can be dropped if the owner prefers, at the cost of missing text in some thumbnails.
- **PDF.js's internal factory methods may change** in an upgrade.
  - → The unit test compares our classes with its own.
  - → The version is pinned.
- **Thumbnails are images of the visitor's own pages** held in page memory.
  - → They are kept only as object URLs and revoked on remove, "Start again" and `pagehide`.
  - → The no-upload test checks that no image address leaves the browser.

## Open Questions

None that change the specs or the tasks. The owner may ask for the GPL fonts to be dropped, which removes three lines from the copy list.
