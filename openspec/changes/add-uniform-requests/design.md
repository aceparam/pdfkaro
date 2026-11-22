# Design: add-uniform-requests

See proposal.md, "Why", for the motivation. The requirements are in `specs/privacy/spec.md` and `specs/tool-engines/spec.md`.

## Context

How a tool page loads code today (read from the code at 18cdb2f; sizes are gzip -9 of the current `dist/_astro` build):

- **The page.** `ToolWidget` loads `ToolWorkspace` (21.4 KB, and `FilePicker` CSS, 0.3 KB) with `lazy(import())` on any pick, before it looks at the file. `useToolRun.addFiles` then checks each file's first bytes on the page. A file of the wrong kind is refused there, and no worker is started. A worker is started (`createToolWorker` → `workerFromBlob` → `tool.worker-*.js`, 4.2 KB) by the first read or the first thumbnail.
- **The worker** (`src/workers/tool.worker.ts`, `worker-core.ts`). Each message loads the tool's engine (`import.meta.glob`) together with the engine's static imports. Libraries are loaded through `tools`, each on first ask:

  | Library | How it is loaded | Fetched | Size |
  | --- | --- | --- | --- |
  | `tools.qpdf` | the wrapper `qpdf-*.js` (1.3 KB), the Emscripten glue `qpdf-*.js` (15.9 KB), then `qpdf-*.wasm` (442.8 KB) | the glue fetches the WebAssembly once for every qpdf instance made | |
  | `tools.pdfjs` | `pdf-*.js` (131.8 KB), then PDF.js's own worker `pdf.worker.min-*.mjs` (378.1 KB) | the worker is started only after the import resolves | |
  | `tools.pdfjsData` | `pdfjs-data-*.js` | | 778.4 KB |
  | `openDocument` | `thumbnail-*.js` (1.7 KB) for a PDF, or `picture-thumbnail-*.js` (0.5 KB) for a picture | | |
  | `tools.pdflib` | `pdflib-*.js` | statically imports `fflate-*.js` | 243.5 KB |
  | `tools.fflate`, `loadZip` | `fflate-*.js` | | 6.3 KB |
  | `canvas`, `decodePicture`, `pdfjsGuard` | functions inside the worker | fetch nothing | |

  The static imports that come with each engine are `inspect`, `plain`, the qpdf wrapper, `picture`, `stamp`, `option-values` and `thumbnail`, depending on the tool.
- **The worker's life.** One worker reads files and draws thumbnails. The page ends it after every job, on Cancel, on "Start again", on a failure other than the engine's own, and when a thumbnail takes more than 10 seconds. A job runs in that same worker if it is still alive, or in a fresh one if pressing the button ended it because a thumbnail was being drawn.
- **The host's cache.** GitHub Pages sends `Cache-Control: max-age=600`, an `ETag` and `Last-Modified`. Checked on the preview with `curl -sI` on 22 Nov 2026. Built file names carry a content hash.
  - For 10 minutes, a browser answers a repeated request for the same file from its own cache, and GitHub sees nothing.
  - After that, the next use of each file sends a conditional request, which GitHub answers with 304. The copy is then fresh for another 10 minutes.
  - A new private window, or a browser with its cache off or full, starts with no copies.

  So on a first visit the host sees each file the first time it is used, and later only the checks for stale copies.
- **Lint and the qpdf build.** Lint forbids `fetch` in `src/workers/`. The qpdf build (`@neslinesli93/qpdf-wasm/dist/qpdf.js`) has no `instantiateWasm` or `wasmBinary` hook: it always calls `fetch(locateFile('qpdf.wasm'))`. So a compiled module cannot be shared between instances without breaking one rule or the other.

## Audit

### When each file is fetched today, per tool page

The 17 published pages run on 14 engines.

Abbreviations:

- **WS**: the `ToolWorkspace` chunk and `FilePicker` CSS.
- **W**: `tool.worker`.
- **E**: the engine and its static imports.
- **Q**: the qpdf glue and its WebAssembly.
- **P**: PDF.js, its worker, `pdfjs-data` and `thumbnail`, 1,290 KB together.
- **T**: `picture-thumbnail`.
- **F**: `fflate`.
- **L**: `pdflib`, which brings F with it.

| Page(s) | At page load | At the pick | At the first thumbnail | At the main button | Depends on the file today |
| --- | --- | --- | --- | --- | --- |
| `/merge-pdf` | HTML, CSS, island scripts only, for every page below | WS, W, E (merge, inspect, wrapper), Q | P | nothing new | P only if some file reads and has no password yet to give; wrong kind: only WS; P's timing follows how long every file took to read |
| `/split-pdf` | same | WS, W, E (+plain), Q | P | F, before the engine, on every run | as Merge |
| `/extract-pdf-pages`, `/delete-pdf-pages`, `/rearrange-pdf-pages`, `/rotate-pdf` | same | WS, W, E (+plain), Q | P | nothing new | as Merge |
| `/compress-pdf` | same | WS, W, E (+plain, picture), Q | P | F only if the file has a lossless picture (`needsLossless`) | as Merge, plus F at the job |
| `/pdf-to-jpg`, `/pdf-to-png` | same | WS, W, E (+thumbnail), Q | P | F on every run; P is reused | as Merge |
| `/add-page-numbers-to-pdf`, `/watermark-pdf` | same | WS, W, E (+stamp, option-values, plain), Q | P | L, only after the plain copy, reading the pages and the size checks | as Merge, plus L skipped when the job fails before drawing |
| `/sign-pdf` | same | WS, W, E (+stamp, option-values, picture, plain), Q; F when a signature picture is read (any type), nothing for a wrong-kind picture | P | the picture way: F, then L (`pictureParts`); typed or drawn: L after the checks | as Watermark, plus whether a chosen picture was of the right kind |
| `/protect-pdf` | same | WS, W, E (+option-values, plain), Q | P | nothing new | as Merge |
| `/unlock-pdf` | same | WS, W, E (+plain), Q | P | nothing new | as Merge; a certificate-encrypted file is `unsupported`, so it gets no P |
| `/jpg-to-pdf`, `/png-to-pdf`, `/image-to-pdf` | same | WS, W, E (+picture); F only for a PNG (`pngDataFits`) | T, only if some picture reads | L, and F if not fetched yet | F at the pick (PNG or JPG); T (every picture unreadable or `unsupported`); a wrong kind (a PDF): only WS |

On every page, these also hold today:

- Q's WebAssembly is requested after the file has been copied into the worker (`bytesOf`), so its timing grows with the file's size.
- Each qpdf instance fetches it again. How many instances there are follows the file: one per file read, two per plain copy, one per batch of Compress PDF's pictures. These repeats are answered from the browser's cache while it is fresh.
- Whether the job runs in a fresh worker depends on whether a thumbnail was being drawn when the button was pressed, which depends on how slow the file is to draw. A fresh worker asks for its files again. While the cache is fresh this costs nothing visible; after the copies go stale it shows as conditional requests.

### Which differences leak something about the file

| Difference | What it shows | Verdict |
| --- | --- | --- |
| P missing after a pick | the file is damaged, needs a password, or (Unlock) is certificate-encrypted | **leak of file content**; fixed |
| Only WS after a pick | the file was not of the page's kind | **leak of file type**; fixed |
| F at the pick on Image to PDF | a PNG was among the pictures | **leak of file type**; fixed |
| T missing on Image to PDF | no picture could be read | **leak of file content**; fixed |
| F at a Compress PDF job | the file has lossless pictures | **leak of file content** (the known case); fixed |
| L missing at a page-numbers, Watermark or Sign job | the job failed before drawing (the file's pages could not be read, a budget) | **leak of file content**; fixed |
| F at a Sign PDF picture read | a picture of the right kind was chosen | **leak of the picture's type**; fixed |
| When P, and Q's WebAssembly, are requested | how long the files took to copy and read: their size, number and complexity | **timing leak**; fixed: every request of a phase starts before any file is read |
| The job's worker reused or fresh | a thumbnail was mid-draw (slow file, or the visitor's timing) | shows only once copies are stale; fixed: every job starts a fresh worker |
| How many times qpdf's WebAssembly is asked for | how many qpdf instances the file needed | shows only with no usable cache; not fixed (Risks) |
| A reading worker started again after a thumbnail passed 10 seconds | a page of the file is slow to draw | shows only once copies are stale; not fixed (Risks) |
| A job longer than 10 minutes | the job is still running when copies go stale | a check for qpdf's WebAssembly mid-job; not fixed (Risks) |
| The page opened; any pick; the main button pressed; Cancel; "Start again"; a password typed; an option chosen; scrolling (which thumbnails are drawn) | the visitor's own actions and device | **allowed**: visitor choices, not file content. After this change, options and scrolling change no request at all |

### What the host can see whatever the code does

These are visible from the requests themselves. The Privacy page says so (decision 9):

- The visitor's IP address and the headers the browser sends.
- Which tool page was opened, and when.
- From the requests after a pick, that a pick was made (any pick, now also of the wrong kind) and when.
- From the job's requests, that the main button was pressed and when. Pages whose job needs no file the pick did not already fetch (Merge, Extract, Delete, Reorder, Rotate, Protect, Remove a password) show nothing new on the first job while the cache is fresh, since the job's fresh worker is answered from the cache.
- While copies are fresh, a second pick or job shows nothing. After 10 minutes, the next use of each file shows as a conditional request.

## Goals / Non-Goals

**Goals:**

- On every tool page, the requests after a pick, and after the main button, are one fixed set chosen by the tool.
- Each request of a phase starts before the worker reads any file, so neither its happening, its order in the code nor its timing comes from the file.
- A test that checks this the way the host sees it, across very different inputs, on all 17 pages.
- A true, plain sentence on the Privacy page about it.

**Non-Goals:**

- Hiding the phases themselves (page opened, pick, job). They are the visitor's own actions and cannot be hidden from a host that serves the code.
- Closing the residual cases in Risks. Each needs either a `fetch` in the worker, a patched qpdf build or a service worker, and each is noted for later.
- Changing what any engine does to a file, its words, or the budget before a pick.

## Decisions

### 1. Two fixed sets per tool: one at the pick, one at the main button

Each tool has a **pick set** and a **job set**, both chosen by the tool:

- The pick set is the engine, its reading libraries and its thumbnail code.
- The job set is the engine and every library its job can use.

The page loads the pick set on any pick, and the job set at the main button, whatever the file.

Alternatives considered:

- *One set at the pick*, with pdf-lib and everything else. This adds 243.5 KB at every pick on four pages, where pdf-lib was deliberately kept for the main button.
- *One set for the whole site*. Every page would fetch every library.
- *Padding*: dummy requests, or requests made to look alike. The brief prefers loading the same modules. Padding is fragile and must be kept in step with every engine.
- *A service worker that caches everything at once* (phase 2). It does not change a first visit's pattern, and it is out of scope.

### 2. Each engine declares its sets

`EngineModule` gains:

```ts
loads: {
  read: readonly LibraryName[];
  draw: readonly LibraryName[];
  job: readonly LibraryName[];
}
```

`LibraryName` is one of `'qpdf' | 'fflate' | 'pdflib' | 'pdfjs' | 'pictureThumbnail'`. `'pdfjs'` stands for PDF.js, its worker, `pdfjs-data` and the `thumbnail` step together. Static imports are not listed, because they always come with the engine.

The declarations, which the unit test of decision 8 confirms against every fixture:

| Engine | `read` | `draw` | `job` |
| --- | --- | --- | --- |
| `merge-pdf`, `extract-pdf-pages`, `delete-pdf-pages`, `rearrange-pdf-pages`, `rotate-pdf`, `protect-pdf`, `unlock-pdf` | qpdf | pdfjs | qpdf |
| `split-pdf`, `compress-pdf` | qpdf | pdfjs | qpdf, fflate |
| `pdf-to-images` | qpdf | pdfjs | fflate, pdfjs |
| `add-page-numbers`, `watermark-pdf` | qpdf | pdfjs | qpdf, pdflib |
| `sign-pdf` | qpdf, fflate | pdfjs | qpdf, fflate, pdflib |
| `images-to-pdf` | fflate | pictureThumbnail | fflate, pdflib |

`draw` must match `thumbnails`: `'pictureThumbnail'` exactly when `thumbnails === 'picture'`, `'pdfjs'` otherwise. The unit test checks this.

Why on the engine and not in the registry: the registry drives pages (`SPEC.md` rule 1). What an engine loads is the engine's own concern, like `thumbnails` today, which is also "chosen by tool, never by a file's bytes". The worker learns the sets from the engine it has just loaded, before it touches a file.

Alternatives considered:

- *A table in the worker.* It would be a second place to forget.
- *Working the sets out from the bundle.* Fragile, and it cannot see `tools.*` calls.

### 3. The order, and what is waited for

`worker-core.ts` gets one memoised step per phase, `ready(phase)`. A read, a thumbnail, a picture read and a `prepare` message wait for `ready('read')`. A run waits for `ready('job')`.

`ready('read')`:

1. Load the engine and wait for it.
2. Start every `read` library in the fixed order `qpdf`, `fflate`, `pdflib`, `pdfjs`, `pictureThumbnail`, in one synchronous step, and wait for them all.
3. Start every `draw` library in the same synchronous way. Catch any failure, so a missing PDF.js means blank boxes, as today. Do not wait for them.
4. Only then is the message's file copied (`bytesOf`) and read.

`ready('job')` does the same with `job`, and waits for all of it. A failure there is `engine-load`, as a failed engine import is today.

Why the draw part is not waited for:

- `tool-page` "A thumbnail never holds up the job" says the main button can be used as soon as every file has been read.
- `thumbnails.spec.ts` checks that Merge still works with PDF.js held back.

Waiting for P (1.29 MB) before reading would break both.

Why the draw part starts only after the read part has loaded, and not alongside it: on a slow link, P would share bandwidth with qpdf. On 1.6 Mbit/s, qpdf alone takes about 2.3 s, and with P beside it up to about 8.8 s, so the page count would come later. Starting P right after the read libraries keeps the time to the page count as it is today. Every request is still started before any file is read.

What remains is the order in which requests started together reach the wire. That comes from the network and the browser, not the file.

### 4. The first qpdf is made at the fixed point and handed on unused

In `tool.worker.ts`, loading `'qpdf'` for a phase makes one qpdf instance, which requests the WebAssembly, and keeps it as a spare. The next `tools.qpdf()` call takes the spare and clears it. Every later call makes a new instance, as today. qpdf stays fresh for every engine call, because the spare has never been used. Today's first instance is made after `bytesOf(file)`, so this costs nothing extra.

The repeated per-instance fetch stays: the build has no hook to avoid it, and lint keeps `fetch` out of the worker. While the cache is fresh, the browser answers it from the cache (Risks).

Alternatives considered:

- *A throwaway instance.* It costs an extra compile and instance per phase.
- *No early instance.* The WebAssembly's request time would then follow the file's size.

### 5. Every job runs in a fresh worker

`useToolRun.start` ends the reading worker with `client.end()` before `runJob`, instead of only stopping a thumbnail being drawn. The job's worker is always new, so its requests are always the job set, answered from the cache where the browser holds a copy.

Before, whether the job reused the reading worker depended on whether a thumbnail was mid-draw. That changed which checks for stale copies the host saw.

Cost: one worker start and the job set's modules evaluated again from the cache. Task 4.4 measures it, and it is expected to be under 200 ms on a desktop. It is off the main thread, so the 100 ms rule is not touched.

Benefits:

- The reading worker's PDF.js and kept document are gone before the job starts, so peak memory does not rise.
- `tool-page` "Pressing the main button SHALL stop any thumbnail being drawn, so the job starts at once" still holds.

### 6. A pick that takes no file still loads the pick set

`useToolRun.addFiles` sends a new `prepare` message (`ToolClient.prepare()`, a `ToWorker` type with no file) before it looks at the files. The worker answers `prepared` once `ready('read')` has loaded and every `draw` library has settled, loaded or failed.

- When some file is taken, nothing waits for `prepared`: the reads go ahead as in decision 3.
- When no file is taken, `addFiles` waits for `prepared` before it returns, so the workspace shows "Getting ready" until then. The refusal sentence and `onEmpty` follow as today.
  - The wait is held to 60 seconds, so a stalled network cannot hide the sentence. A stall is the network's doing, not the file's.
  - The worker is then ended, having never been sent a file.

Alternatives considered:

- *Say it at once and end the worker.* The set would be cut short, so a wrong pick would show as fewer requests.
- *Say it at once and let the worker finish in the background.* After "Start again" or leaving, the worker would outlive the page's own end call. That breaks the Privacy page's "the workers are closed on 'Start again'".

The owner can choose instead to accept that a wrong pick shows (Open questions, 2).

### 7. PDF.js's worker starts alongside the PDF.js import

`createPdfjsLoader.load()` starts PDF.js's nested worker in the same step as `import('pdfjs-dist')`, not after the import resolves. The port is handed to PDF.js once the import is there.

Today the nested worker's request waits for the import to arrive and be evaluated. That needs the tool worker's event loop, which a long qpdf call holds, so the request's timing could follow the file. Errors are handled as today: a failed nested worker stops every drawing at once.

### 8. The tests

- **`tests/unit/worker-core.test.ts`** uses made-up loaders that write to a log.
  - For a read, the log is: engine, `read` libraries in order, `draw` libraries started, then the file read. The same log for an engine whose `inspect` answers ready, damaged or needs-password.
  - For a run, every `job` library is loaded before `engine.run` is called, also when `run` throws at once, and when it gives no file.
  - A `draw` failure does not fail the read.
  - A `prepare` message loads the read set and answers `prepared`.
- **`tests/unit/client.test.ts`**: `prepare` posts no file, and resolves on `prepared`.
- **`tests/unit/engine-loads.test.ts`** (new): for every file in `src/engines/tools/`, it runs `inspect` (and `inspectPicture`) and `run` against every file in `tests/fixtures/` (and `pictures/` for picture engines and Sign PDF's picture). It uses a valid option set per tool, from one small table in the test, and a recording `tools` filled from disk as the engine tests do. It fails if a step asks for a library outside its declared set, if `loads` is missing, or if `draw` does not match `thumbnails`. `canvas`, `decodePicture` and `pdfjsGuard` fetch nothing and are allowed everywhere. This is also how this change runs every engine against every fixture, as the tasks rule asks.
- **`tests/e2e/host-log.ts`** (new): a small `node:http` server for `dist/` that stands in for the host.
  - It serves clean URLs and the 404 page, with the content types GitHub Pages sends (`application/wasm`, `text/javascript` for `.mjs`).
  - It sends `Cache-Control: max-age=600`, an `ETag` and `Last-Modified`, and answers `If-None-Match` with 304.
  - It records `method path status` for every request, with a `mark()` to split phases.
  - It sends no Content Security Policy header, since the policy is a meta tag, as on the host.
- **`tests/e2e/uniform-requests.spec.ts`** (new, tagged `@desktop` so it runs once): one test per tool page, taken from `widgetPages` in `pages.ts`, so a new page without a row in the input table fails.
  - Each input runs in a new browser context, so the cache starts empty, with the CSP watcher from `fixtures.ts` (`watchPolicy`).
  - A phase ends when the page shows its outcome and the server has had no request for one second.
  - It compares, across a page's inputs:
    - the pick phase's multiset of `(method, path)`;
    - after a password is typed, nothing new;
    - the job phase's multiset.
  - Order is not compared at the server. Requests started together can arrive in any order, and that is not the file's doing; the order that comes from the code is checked in `worker-core.test.ts`.
  - Every request also passes `violations` from `no-upload.ts`, with the file names and passwords as secrets, against the tool's exact list of files. Those lists move from the 14 tool specs into `tests/e2e/tool-files.ts`, so each list is written once and used by both.

  The input table:

  | Pages | Pick inputs | Job inputs |
  | --- | --- | --- |
  | Every PDF page | `text.pdf`; `damaged-xref.pdf`; `password.pdf` (before and after its password); `not-a-pdf.pdf` (wrong kind); `scanned.pdf` | `text.pdf`; `rich.pdf`; `password.pdf` with its password |
  | `/merge-pdf` (and any page that takes several files) | also `text.pdf` + `rich.pdf` + `images.pdf` | also `text.pdf` + `password.pdf` |
  | `/compress-pdf` | also `compress-lossless.pdf`, `compress-text.pdf` | `compress-lossless.pdf` (smaller); `compress-text.pdf` (no new file); `compress-scans.pdf` (JPG) |
  | `/unlock-pdf` | also `restricted.pdf` | `password.pdf` with its password; `restricted.pdf`; `text.pdf` (no new file) |
  | `/sign-pdf` | also a JPG, a PNG and a PDF chosen as the signature picture | typed name; drawn line; JPG picture; PNG picture |
  | Image to PDF pages | `details.jpg`; `small.png`; `broken.png`; `arithmetic.jpg` (`unsupported`); `text.pdf` (wrong kind); `details.jpg` + `small.png` | `details.jpg`; `small.png`; `details.jpg` + `small.png` |

  Each page's own required input is given the same way for every input, such as one page chosen in Extract pages, one turn in Rotate PDF, text in Watermark, or a new password in Protect.

  A job that fails in the browser is included where a fixture makes one fail (task 6.3 looks for one). Otherwise, the worker-core test covers it.
- **Existing specs** that say a file is *not* fetched in a case that now fetches it are updated to the new rule. These are `pdf-to-images.spec.ts` "a one-page file fetches fflate too, and the same files as a longer one", which folds into the new spec, and any check that `fflate` is absent on Compress PDF. Checks that a file is absent *before the main button* (pdf-lib in `sign-pdf.spec.ts`) and *before a pick* stay as they are.

### 9. The Privacy page sentences (draft, marked for the owner)

In "What happens to your file", after "These requests carry nothing from your file: not its contents, not its name and not a password.":

> Which programs it fetches, and in what order, does not depend on what your file holds. A damaged file, a protected file or a file of the wrong kind leads to the same requests as any other file.

At the end of "Who serves the site":

> From when your browser asks for the programs, GitHub can tell that a tool page was opened, that a file was chosen and when a job was started. Your browser may ask for the same programs again later, for example after a job or when a page of your file takes long to draw.

The last sentence depends on Open questions 3. The words pass the `privacy-page.test.ts` guards: no word from its absolute list, no banned word, no `!` or `@`, no worker named outside the policy section, and no server claim.

Claim table, added to the one in `add-privacy-draft`'s design:

| Claim | Code | Proof |
| --- | --- | --- |
| Which programs are fetched, and in what order, does not depend on what the file holds; a damaged, protected or wrong-kind file leads to the same requests | `loads` on every engine; `ready(phase)` in `worker-core.ts`; `prepare` on every pick and the wait for it in `addFiles`; a fresh worker for every job (`useToolRun.start`) | `tests/e2e/uniform-requests.spec.ts` (the host's record compared across inputs on all 17 pages); `engine-loads.test.ts`; `worker-core.test.ts` order tests |
| GitHub can tell that a tool page was opened, that a file was chosen and when a job was started | Requests at page load, after a pick (`prepare`) and after the main button (the job's worker) | `uniform-requests.spec.ts` records exactly these phases; release check of the live host's headers |
| The browser may ask for the programs again later, after a job or when a page takes long to draw | The reading worker starts again after a job, Cancel, a failure or a 10-second thumbnail; the host's 10-minute cache lifetime | Risks below; release check of the host's `Cache-Control` |

## Page weight, memory and WebAssembly

**Before a pick.** No change. The budget counts only what loads before a pick, and no new file is added. The `ToolWorkspace` and `tool.worker` chunks grow by a few hundred bytes. `npm run weigh`'s "after a pick, at most" total does not change, since the same files exist.

**After a pick, on a first visit (gzip):**

| Case | Today | After |
| --- | --- | --- |
| A PDF that reads, on any PDF page | about 1,780 KB (WS 21.7 + W 4.2 + E 1–8 + Q 460 + P 1,290) | the same |
| A damaged PDF, or one waiting for its password | about 490 KB | about 1,780 KB (+1,290) |
| A wrong-kind file on a PDF page | 21.7 KB (WS only) | about 1,780 KB |
| A JPG on Image to PDF | 31.6 KB | 37.9 KB (+6.3, F moved from the job) |
| A PNG on Image to PDF | 37.9 KB | 37.9 KB |
| An unreadable picture, or a PDF, on Image to PDF | 31.1 or 21.7 KB | 37.9 KB |
| Sign PDF | +F at a picture read or the job | +F at the pick (6.3 KB, the same total once a job runs) |
| A Compress PDF job on a file with no lossless picture | Q only | +F (6.3 KB) |
| Add page numbers, Watermark, Sign PDF jobs | L after the checks | L before the engine (the same bytes) |

**Memory.**

- PDF.js's nested worker now also runs for damaged, protected and wrong-kind picks, until the reading worker ends. It is idle, and its size is measured in task 4.4, expected at about 10–20 MB.
- The spare qpdf instance replaces today's first instance, so it adds nothing.
- The job's fresh worker replaces the reading worker rather than sitting beside it.

**When WebAssembly is fetched.** At the pick, as today: now also for a wrong-kind pick, and at a fixed point before the file is read. At the main button, qpdf's WebAssembly is asked for again by the fresh worker, and the browser answers from its cache.

## Threats considered

- **A hostile PDF or picture** can no longer choose which site files are fetched. Nothing the worker reads is used before the sets are loaded. Engines can only ask for declared libraries. The unit test enforces it. In every build, the `tools` the worker hands an engine for a phase also answer an undeclared library (other than `canvas`, `decodePicture` and `pdfjsGuard`) with an error, so the job fails as `engine-load` and fetches nothing new. Its effect on timing is limited to the residuals in Risks.
- **An oversized file** has its timing effect removed. `bytesOf` now runs after every request of the phase has started.
- **A hostile file name** is not used by any of this. File names stay in the no-upload secrets of the new spec.
- **The new `prepare` message** carries no file and no password, only `toolId`. `isToWorker` checks its shape.
- **The local test server** binds to `127.0.0.1` on a free port, serves only `dist/`, refuses `..`, and is closed after the tests. It is test code, not shipped.

## Risks / Trade-offs

- [**A browser with no usable cache** (cache off, full, or a "no cache" setting) asks for qpdf's WebAssembly once per qpdf instance. How many instances there are follows the file (files read, plain copies, Compress PDF's picture batches).] → Not closed: the qpdf build has no hook, and lint keeps `fetch` out of the worker. Noted as a later option: a patched qpdf build that takes a compiled module, or a lint exception for one `WebAssembly.compileStreaming(fetch(...))` in `tool.worker.ts`. Both need security review. The Privacy sentence claims only which programs are fetched and in what order, which stays true.
- [**After 10 minutes, a thumbnail over 10 seconds** restarts the reading worker. The restart's checks for stale copies show the host that a page was slow to draw.] → Not closed. The words "when a page of your file takes long to draw" say so, by default (Open questions, 3).
- [**A job over 10 minutes** asks again for qpdf's WebAssembly mid-job once the copy goes stale.] → Not closed, and rare. The job set check at the start of the job refreshes the copy, so only a job longer than the cache lifetime shows.
- [**A slower refusal for a wrong-kind pick**: up to the whole pick set's download, about 1.78 MB on a PDF page, before "cannot be used" is shown.] → The default by decision 6, held to 60 seconds. The owner may prefer an instant sentence (Open questions, 2).
- [**More bytes for damaged, protected and wrong-kind PDFs** (+1.29 MB on a first visit).] → Only those cases pay. A readable file pays the same as today. Open questions, 1.
- [**A host other than GitHub Pages** may send different cache headers.] → Only what is asked for again later changes. The release check reads the live host's headers, and the test server's headers are one constant to change.
- [**Firefox and Safari**: the new spec runs in Chromium. The rule comes from the code, not the engine, but caches differ.] → A release check in issue #7: the host's record for `text.pdf` against `damaged-xref.pdf` on one page, in Firefox and Safari.
- [**Test time**: about 17 pages × 5–8 inputs in cold contexts.] → One test per page, so `fullyParallel` spreads them, and one project (`@desktop`). Task 6.5 records the run time. If it passes about 5 minutes, task 6.5 says so and stops for a decision; no test is cut silently.

## Migration Plan

Nothing is stored, so nothing migrates. Rollback is reverting the pull request. The engines' outputs do not change, so no fixture or engine test result changes.

## Open Questions

These are for the owner. Each has the default this change builds.

1. **PDF.js after every pick.** Fetch PDF.js's set (about 1.3 MB) after every pick on a PDF page, even for a damaged, protected or wrong-kind file? Default: yes.
2. **A wrong-kind pick.** Load the pick set first, then say the file cannot be used (a few seconds later on a slow connection)? Or say it at once, accepting that the host can tell a wrong pick from the shorter list of requests? Default: load first.
3. **"May ask again".** Keep the sentence "Your browser may ask for the same programs again later, for example after a job or when a page of your file takes long to draw."? Default: yes.
