# Design: add-uniform-requests

See proposal.md, "Why", for the motivation. The requirements are in `specs/privacy/spec.md` and `specs/tool-engines/spec.md`. The owner answered two questions on 22 Nov 2026: PDF.js's set is fetched after every pick on a PDF page, and a wrong-kind pick loads the set first, with the wait held to 60 seconds. The stage 1 review panel's findings are settled below; the item numbers (R1 to R17) are the panel's.

## Context

How a tool page loads code today (read from the code at 18cdb2f; sizes are gzip -9 of the current `dist/_astro` build):

- **The page.** `ToolWidget` loads `ToolWorkspace` (21.4 KB, and `FilePicker` CSS, 0.3 KB) with `lazy(import())` on any pick, before it looks at the file. `useToolRun.addFiles` then checks each file's first bytes on the page. A file of the wrong kind is refused there, and no worker is started. A worker is started (`createToolWorker` → `workerFromBlob` → `tool.worker-*.js`, 4.2 KB) by the first read or the first thumbnail.
- **The worker** (`src/workers/tool.worker.ts`, `worker-core.ts`). Each message loads the tool's engine (`import.meta.glob`) together with the engine's static imports. Libraries are loaded through `tools`, each on first ask:

  | Key | What it loads | Notes | Size |
  | --- | --- | --- | --- |
  | `qpdf` | the wrapper `qpdf-*.js` (1.3 KB), the Emscripten glue `qpdf-*.js` (15.9 KB), then `qpdf-*.wasm` (442.8 KB) | the glue fetches the WebAssembly once for every qpdf instance made | |
  | `pdfjs` | `pdf-*.js` (131.8 KB), then PDF.js's own worker `pdf.worker.min-*.mjs` (378.1 KB) | the nested worker is started only after the import resolves | |
  | `pdfjsData` | `pdfjs-data-*.js` | | 778.4 KB |
  | (none: `openDocument`) | `thumbnail-*.js` (1.7 KB) for a PDF, or `picture-thumbnail-*.js` (0.5 KB) for a picture | | |
  | `pdflib` | `pdflib-*.js` | statically imports `fflate-*.js` | 243.5 KB |
  | `fflate`, and `loadZip` beside `tools` | `fflate-*.js` | | 6.3 KB |
  | `canvas`, `decodePicture`, `pdfjsGuard` | functions inside the worker | fetch nothing | |

  The static imports that come with each engine are `inspect`, `plain`, the qpdf wrapper, `picture`, `stamp`, `option-values` and `thumbnail`, depending on the tool.
- **The worker's life.** One worker reads files and draws thumbnails. A job runs in that same worker if it is still alive, or in a fresh one if pressing the button ended it. Every way a worker is ended today is listed in the audit's third table.
- **The host's cache.** GitHub Pages sends `Cache-Control: max-age=600`, an `ETag` and `Last-Modified`. Checked on the preview with `curl -sI` on 22 Nov 2026. Built file names carry a content hash.
  - For 10 minutes, a browser answers a repeated request for the same file from its own cache, and GitHub sees nothing.
  - After that, the next use of each file sends a conditional request, which GitHub answers with 304. The copy is then fresh for another 10 minutes.
  - A request made while the same file is still arriving for another worker may go to the network again. So a worker ended mid-download, followed by a new one, can show the host a repeat.
  - A new private window, or a browser with its cache off or full, starts with no copies.
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
| Repeats from workers ended mid-download | see the next table | **leak**; fixed for every file-driven end before the set settles |
| How many times qpdf's WebAssembly is asked for | how many qpdf instances the file needed | shows only with no usable cache; not fixed (Risks, R3) |
| The page opened; any pick; the main button pressed; Cancel; "Start again"; Remove; a password typed; an option chosen; scrolling (which thumbnails are drawn) | the visitor's own actions and device | **allowed**: visitor choices, not file content. After this change, options and scrolling change no request at all |

### Every way a reading worker is ended (R1)

| Where | When | Driven by | Today | After |
| --- | --- | --- | --- | --- |
| `client.ts` `thumbnail`, 10-second limit | counted from the send, so it includes P's download (1.29 MB) | the file (only readable files ask for a thumbnail) and a slow link | ends the worker mid-download; the next worker asks for P again, so the host sees a repeat for readable files only | **fixed**: the limit starts only after the worker reports `prepared` (the set has settled). After that, an end is answered from the cache, except with stale copies (Risks) |
| `useToolRun` `stopThumbnail` → `client.end()`, from `inspect` | each further file, and each password try | the visitor's action, but how often it cuts P depends on how many files and tries there are, and whether the file reads | cuts P short | **fixed**: before the set settles, no drawing can be in progress (drawing needs P), so a waiting thumbnail is dropped by a `drop-thumbnail` message and the worker is kept. After it settles, a drawing in progress is stopped as today |
| `stopThumbnail` from `readChosenPicture` | a Sign PDF picture of the right kind | the picture's type | as above | **fixed**, as above |
| `endReplacedRead` | a Sign PDF picture chosen again while the earlier one is still read | the picture's content (a slow read) | ends at once | **fixed**: `client.retireWhenSettled()` waits up to the hold (60 s) for the set; settled, the worker is ended and the new read starts; if the hold runs out, the old worker is retired (unused, ended when its set settles) and the new read starts on a fresh one (stage 2) |
| `failAll` on a reading failure other than `engine` (memory, `engine-load`) | the read fails | the file | ends at once, maybe mid-download | **fixed**: `worker-core` posts `failed` for a read only after the set has settled, held to 60 seconds; the client then retires the worker, so it is ended only once its set has settled (stage 2) |
| `onerror` (the worker crashes) | a crash while reading | the file | ends at once | **not fixed**, a named exception (Risks) |
| `useToolRun.start`, the main button | the visitor presses it | the visitor, but if P is still arriving, how long the file took to read decides whether P is cut short | ends the worker | **kept**: the job is not held back. A named exception (Risks) |
| Cancel, "Start again", Remove of the last file, Remove during a wrong-kind wait, `pagehide`, unmount | the visitor | the visitor | ends at once | **kept**, and it also ends every retired worker of the page |
| `run` `finally`, job failures | the job ends | the job's worker, whose set loaded before the engine | ends | **kept**: nothing is left to fetch |

### What the host can see whatever the code does

These are visible from the requests themselves. The Privacy page says so (decision 11):

- The visitor's IP address and the headers the browser sends.
- Which tool page was opened, and when, from the page request itself.
- From the requests after a pick, that a pick was made (any pick, now also of the wrong kind) and when.
- On some tools, from the job's requests, that the main button was pressed and when. Pages whose job needs no file the pick did not already fetch (Merge, Extract, Delete, Reorder, Rotate, Protect, Remove a password) show nothing new on the first job while the cache is fresh, since the job's fresh worker is answered from the cache. So the Privacy page says the host "may be able to tell" when a job was started.
- While copies are fresh, a second pick or job shows nothing. After 10 minutes, the next use of each file shows as a conditional request.

## Goals / Non-Goals

**Goals:**

- On every tool page, the requests after a pick, and after the main button, are one fixed set chosen by the tool, each made once, while the browser keeps the copies the host's cache headers allow.
- Each request of a phase starts before the worker reads any file, so neither its happening, its order in the code nor its timing comes from the file.
- No reading worker is ended for a file-driven reason before its set has settled.
- A test that checks this the way the host sees it, across very different inputs, on all 17 pages, and on a slow link for the cases that need one.
- True, plain sentences on the Privacy page, naming what is not closed.

**Non-Goals:**

- Hiding the phases themselves (page opened, pick, job). They are the visitor's own actions and cannot be hidden from a host that serves the code.
- Closing the named exceptions in Risks. Each needs a `fetch` in the worker, a patched qpdf build, a service worker, or holding back the visitor's own button. Each is noted for later.
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

### 2. Each engine declares its sets; the thumbnail code follows from `thumbnails` (R11)

`EngineModule` gains:

```ts
loads: {
  read: readonly LibraryName[];
  job: readonly LibraryName[];
}
```

`LibraryName` is one of `'qpdf' | 'fflate' | 'pdflib' | 'pdfjs' | 'pictureThumbnail'`. It is defined in `src/engines/types.ts`, beside `EngineModule`, and `src/workers/libraries.ts` imports it: engines must not import worker code (stage 1, architect). The **draw set** is not declared. It follows from the existing `thumbnails` field: `['pictureThumbnail']` when `thumbnails === 'picture'`, otherwise `['pdfjs']`. That makes it one fact, written once. Static imports are not listed, because they always come with the engine.

The declarations, which the unit test of decision 10 confirms against every fixture:

| Engine | `read` | draw (from `thumbnails`) | `job` |
| --- | --- | --- | --- |
| `merge-pdf`, `extract-pdf-pages`, `delete-pdf-pages`, `rearrange-pdf-pages`, `rotate-pdf`, `protect-pdf`, `unlock-pdf` | qpdf | pdfjs | qpdf |
| `split-pdf`, `compress-pdf` | qpdf | pdfjs | qpdf, fflate |
| `pdf-to-images` | qpdf | pdfjs | fflate, pdfjs |
| `add-page-numbers`, `watermark-pdf` | qpdf | pdfjs | qpdf, pdflib |
| `sign-pdf` | qpdf, fflate | pdfjs | qpdf, fflate, pdflib |
| `images-to-pdf` | fflate | pictureThumbnail | fflate, pdflib |

Every tool whose registry entry has `outputs: 'several'` (Split, PDF to JPG and PNG) declares `fflate` in `job`, because the zip step comes from it (decision 5). The unit test checks this against the registry.

Why on the engine and not in the registry: the registry drives pages (`SPEC.md` rule 1). What an engine loads is the engine's own concern, like `thumbnails` today, which is also "chosen by tool, never by a file's bytes". The worker learns the sets from the engine it has just loaded, before it touches a file.

Alternatives considered:

- *A table in the worker.* It would be a second place to forget.
- *Working the sets out from the bundle.* Fragile, and it cannot see `tools.*` calls.

### 3. One table from `tools` keys to libraries (R6)

`src/workers/libraries.ts` holds, once (with `LibraryName` imported from `src/engines/types.ts`):

- the canonical order `['qpdf', 'fflate', 'pdflib', 'pdfjs', 'pictureThumbnail']`;
- the table that maps every key of the worker's `tools` to the library it belongs to:

```ts
export const toolLibrary = {
  qpdf: 'qpdf',
  fflate: 'fflate',
  pdflib: 'pdflib',
  pdfjs: 'pdfjs',
  pdfjsData: 'pdfjs',
  pdfjsGuard: 'always',
  canvas: 'always',
  decodePicture: 'always',
} as const satisfies Record<keyof typeof tools, LibraryName | 'always'>;
```

`tool.worker.ts` checks its `tools` against it with `satisfies`, so a new key without a row fails the type check. A key with no row is refused at run time too. `'pdfjs'` covers `tools.pdfjs`, `tools.pdfjsData` and the `thumbnail` import used by `openDocument`. `'pictureThumbnail'` covers the `picture-thumbnail` import.

For each phase, `worker-core` hands an engine a `tools` that answers only:

- the keys whose library is in that phase's set;
- the keys marked `'always'`.

Any other key throws, so the step fails as `engine-load` and fetches nothing new. A thumbnail message's `openDocument` gets the read and draw sets.

### 4. The order, and what is waited for

`worker-core.ts` gets one memoised step per phase, `ready(phase)`. A read, a thumbnail, a picture read and a `prepare` message wait for `ready('read')`. A run waits for `ready('job')`.

`ready('read')`:

1. Load the engine and wait for it.
2. Start every `read` library in the canonical order, in one synchronous step, and wait for them all.
3. Start the draw set in the same synchronous way. Catch any failure, so a missing PDF.js means blank boxes, as today. Do not wait for it before reading.
4. Only then is the message's file copied (`bytesOf`) and read.
5. When the draw set has loaded or failed, post `prepared` once. This is the signal that the set has **settled** (decision 7).

`ready('job')` does the same with `job`, waits for all of it, and includes the zip step (decision 5). A failure there is `engine-load`, as a failed engine import is today.

Why the draw part is not waited for:

- `tool-page` "A thumbnail never holds up the job" says the main button can be used as soon as every file has been read.
- `thumbnails.spec.ts` checks that Merge still works with PDF.js held back.

Waiting for P (1.29 MB) before reading would break both.

Why the draw part starts only after the read part has loaded, and not alongside it: on a slow link, P would share bandwidth with qpdf. On 1.6 Mbit/s, qpdf alone takes about 2.3 s, and with P beside it up to about 8.8 s, so the page count would come later. Starting P right after the read libraries keeps the time to the page count as it is today. Every request is still started before any file is read.

What remains is the order in which requests started together reach the wire. That comes from the network and the browser, not the file, and it is not tested at the server (Risks, R12).

### 5. The zip step is loaded inside `ready('job')` (R5)

The separate `loadZip` dependency goes. The `fflate` library loads one module, which gives the inflater, the deflater and `zipSync`: the worker imports the `fflate` package itself, for both `tools.fflate` and the library. (Built: a module of our own re-exporting it, `src/workers/fflate.ts`, as first planned, became a 73-byte built file and a request of its own, against "no new built file", so it was dropped.) `worker-core` takes `zipSync` from the loaded `fflate` library for a run whose message asks for a zip. A zip run without `fflate` in the job set is a programming mistake: the unit test of decision 10 catches it, and at run time it fails as `engine-load`.

### 6. The first qpdf is made at the fixed point and handed on unused (R15)

`src/workers/spare-qpdf.ts` holds a plain function, tested in Node.

- Loading `'qpdf'` for a phase makes one qpdf instance, which requests the WebAssembly, and keeps it as a spare.
- The next `tools.qpdf()` call takes the spare and clears it.
- Every later call makes a new instance, as today.

qpdf stays fresh for every engine call, because the spare has never been used. For a worker that calls qpdf, it costs nothing extra: today's first instance is made after `bytesOf(file)`. A worker that never calls qpdf still compiles qpdf and holds the spare, about 16.4 MB, until it ends. Examples are a wrong-kind pick, or a reading worker started again only to draw thumbnails.

The repeated per-instance fetch stays: the build has no hook to avoid it, and lint keeps `fetch` out of the worker. While the cache is fresh, the browser answers it from the cache (Risks).

Alternatives considered:

- *A throwaway instance.* It costs an extra compile and instance per phase.
- *No early instance.* The WebAssembly's request time would then follow the file's size.

### 7. No reading worker is ended for a file-driven reason before its set settles (R1)

`ToolClient` learns, per worker, whether the set has settled, from the worker's single `prepared` message.

- **The thumbnail time limit** in `thumbnail()` starts its 10-second timer only once `prepared` has arrived. Before that, a thumbnail waits at most the same 60 seconds as the other waits (stage 1, architect). If the hold runs out, the thumbnail is dropped by `drop-thumbnail` and gives no picture, and the worker is kept (stage 2, privacy M1); if that drop comes too late, the set has just settled and the 10-second limit applies as usual. The visitor's own actions still end the worker at once.
- **`stopThumbnail`** before `prepared` sends `drop-thumbnail`, carrying the waiting thumbnail's request id. The worker answers the waiting thumbnail with no picture and keeps going, and the page calls it stopped. No drawing can be under way before P has loaded. After `prepared`, a drawing in progress is stopped by ending the worker, as today.
  - **A dropped thumbnail never opens its document afterwards** (stage 1, security). `worker-core` records dropped request ids. A thumbnail waits for the read set and for the draw set to settle; after that and before `openDocument`, a dropped request returns without opening anything. Otherwise a crafted PDF that stalls PDF.js's open would hold the kept-document close chain, and the next file's read with it, at "Getting ready" for ever.
  - **The handshake.** The drop is honoured only if the worker meets it before the draw set settles. The worker posts `prepared` and passes the drop check in the same turn of its event loop, so the page can tell which happened from the order of replies: the waiting thumbnail's empty answer arriving first means it was dropped; `prepared` arriving while it is still waiting means it was too late, and the page then ends the worker, which is allowed once the set has settled. `ToolClient.dropThumbnail()` resolves `'dropped'` or `'too-late'` accordingly, and `stopThumbnail` waits for it before the next read is sent, so no read is ever queued behind an open that was not dropped.
- **`endReplacedRead`** calls `client.retireWhenSettled()`. It waits until the set has settled or 60 seconds have passed. Settled, the worker is ended and the new picture's read starts a fresh one. If the hold runs out first, the worker is **retired**: the client stops using it, and it ends itself when its `prepared` arrives (or on the visitor's own end); the new read starts on a fresh worker at once.
- **A reading failure.** `worker-core` posts `failed` for a read or picture read only after `prepared`, held to 60 seconds, so the page says what happened at most a minute later. The client answers every request waiting on that worker with the failure, and retires the worker instead of ending it: it ends at once if its set has settled, otherwise when it does.
- **The wrong-kind wait** (decision 9) shows its refusal at the hold, but its worker is retired, not ended.
- **The visitor's own actions** (`end()`: Cancel, "Start again", Remove of the last file, `pagehide`, unmount, the main button) end the current worker and every retired one at once.

**No hold ever ends a worker** (stage 2, privacy M1). Below about 240 kbit/s the 1.78 MB pick set takes longer than 60 seconds; ending the worker then would cut its files short only for files that wait (a readable file's thumbnail, a wrong-kind pick, a failing read), so the host could tell. A hold only stops the page from waiting: the message is shown, and the worker's end is deferred until its set settles. A new worker started meanwhile, which may ask again for files still arriving for the retired one, is only ever started by the visitor (another pick, a password, "Go back to your file", a new picture), never by the file. The hold is one constant, `settleHoldMs` in `src/workers/messages.ts`, read by the client and `worker-core`.

Alternatives considered:

- *Keep the old worker until it settles while a new one starts.* The new worker would ask for the same files while they are still arriving for the old one, and that can reach the network again. So it was rejected.

### 8. Every job runs in a fresh worker

`useToolRun.start` ends the reading worker with `client.end()` before `runJob`. The job's worker is always new, so its requests are always the job set, answered from the cache where the browser holds a copy.

Before, whether the job reused the reading worker depended on whether a thumbnail was mid-draw. That changed which checks for stale copies the host saw.

The job is never held back to let P finish (Risks).

Cost: one worker start and the job set's modules evaluated again from the cache, measured in task 4.5. It is off the main thread, so the 100 ms rule is not touched.

**Owner decision (22 Nov 2026): accept the slower job start on PDF to JPG and PDF to PNG, and keep every job in a fresh worker on every page.** Task 4.5 measured, in Chromium, the median ms from the main button to the result heading, before (7d79211) and after, on a local server with GitHub Pages' cache headers (CPU slowdown by CDP, which may not slow worker threads):

| Job | Before | After | Difference |
| --- | --- | --- | --- |
| Merge, text.pdf, 1× | 114 | 124 | +10 |
| Merge, text.pdf, 4× | 140 | 210 | +70 |
| Merge, 100 MB, 1× | 1335 | 1346 | +11 |
| Merge, 100 MB, 4× | 1726 | 2067 | **+341** |
| PDF to JPG, text.pdf, 1× | 213 | 832 | **+619** |
| PDF to JPG, text.pdf, 4× | 322 | 936 | **+614** |
| PDF to JPG, 100 MB, 1× | 226 | 362 | +136 |
| PDF to JPG, 100 MB, 4× | 382 | 424 | +42 |
| Sign, text.pdf, 1× | 211 | 342 | +131 (noisy: runs 209 to 355) |
| Sign, text.pdf, 4× | 292 | 414 | +122 |
| Sign, 100 MB, 1× | 1849 | 1868 | +19 |
| Sign, 100 MB, 4× | 2691 | 2297 | −394 |

PDF to JPG and PNG pay about 0.6 s because the fresh job worker loads and evaluates PDF.js, its data and its own worker again before the engine runs. Merge at 100 MB with 4× CPU also passes 200 ms (+341 ms). Memory: peak resident memory on the 100 MB file went 1264 → 1130 MB (Merge), 636 → 577 MB (PDF to JPG), 1898 → 1909 MB (Sign); PDF.js's idle worker after a `damaged-xref.pdf` pick adds about 15 MB (30 → 44 to 47 MB); the spare qpdf reserves 16.4 MB of WebAssembly memory (6.1 MB resident in Node).

Benefits:

- The reading worker's PDF.js and kept document are gone before the job starts.
- `tool-page` "Pressing the main button SHALL stop any thumbnail being drawn, so the job starts at once" still holds.

### 9. A pick that takes no file waits for the set, visibly (R4; owner, 22 Nov 2026)

`useToolRun.addFiles` sends `prepare` (`ToolClient.prepare()`, a `ToWorker` type with no file) before it looks at the files.

- When some file is taken, nothing waits for `prepared`. The reads go ahead as in decision 4.
- When no file is taken, the workspace shows the line the reading path shows today, the file name with "Getting ready" beside it and its Remove button ("notes.docx, Getting ready"). For several files it shows the summary line with "Getting ready".
  - Focus moves to that line (`summaryRef`, `tabIndex={-1}`), as it does after a pick today.
  - The wait ends when `prepared` arrives, when the set fails to load (at once), or after 60 seconds (`ToolClient.prepare(settleHoldMs)`). The picker returns with the refusal sentence in its status line, which is read out, and focus moves to the picker, as `onEmpty` does today. The worker, never sent a file, is ended if its set has settled; if the hold ran out, it is retired and lingers, unused, until its set settles (stage 2). Because the workspace that owns it unmounts when the picker returns, such a client is kept in a small list in `useToolRun.ts`, ended when its set settles, on `pagehide`, or at the visitor's next pick.
  - A drop or paste during the wait is ignored, with nothing said: the workspace takes drops only while files are listed, and the picker's own handler is not active until it returns (UX note at stage 2; known, not changed).
  - Remove during the wait ends the wait and the worker, and returns to the picker as removing the last file does. This is the visitor's own action.
  - **For the owner (Open question 3):** as built, Remove also appears for a pick of several files of the wrong kind, on the summary line, labelled for screen readers "Remove 2 files" (the file count). The design first showed it for one file only; it is kept so a multi-file pick has the same way out.

Alternatives considered:

- *Say it at once and end the worker.* The set would be cut short, so a wrong pick would show as fewer requests. The owner rejected this.
- *Say it at once and let the worker finish in the background.* After "Start again" or leaving, the worker would outlive the page's own end call. That breaks the Privacy page's "the workers are closed on 'Start again'".

### 10. PDF.js's worker starts alongside the PDF.js import, guarded from its first moment (R9)

`createPdfjsLoader.load()` starts PDF.js's nested worker in the same step as `import('pdfjs-dist')`, not after the import resolves.

- Its `onerror`, which calls `preventDefault` and sets the failed flag, is attached as soon as `startWorker()` returns.
- If the import rejects, the nested worker is terminated.
- The port is handed to PDF.js once the import is there.

Today the nested worker's request waits for the import to arrive and be evaluated. That needs the tool worker's event loop, which a long qpdf call holds, so the request's timing could follow the file. Unit tests cover these cases:

- the worker starts before the import resolves;
- an early nested error before the import resolves leaves PDF.js failed;
- a rejected import terminates the nested worker.

### 11. The tests

- **`tests/unit/worker-core.test.ts`** uses made-up loaders that write to a log.
  - For a read, the log is: engine, `read` libraries in order, draw set started, then the file read. The same log for an engine whose `inspect` answers ready, damaged or needs-password.
  - For a run, every `job` library, the zip step included, is loaded before `engine.run`, also when `run` throws at once or gives no file.
  - A draw failure does not fail the read.
  - `prepared` is posted once, after the draw set settles.
  - A reading failure is posted only after `prepared` (held to 60 s).
  - `drop-thumbnail` answers a waiting thumbnail with no picture.
  - A thumbnail dropped while its library is loading never calls `openDocument` (stage 1, security).
  - An undeclared key fails as `engine-load`.
- **`tests/unit/client.test.ts`**:
  - `prepare` posts no file and resolves on `prepared`;
  - the thumbnail limit does not end a worker whose set has not settled, and does once it has;
  - `endWhenSettled` waits for `prepared` or 60 seconds;
  - a thumbnail asked for before the set settles waits at most 60 seconds for it;
  - `dropThumbnail` resolves `'dropped'` when the empty answer comes first and `'too-late'` when `prepared` does;
  - `end()` ends a worker waiting in `endWhenSettled` at once.
- **`tests/unit/engine-loads.test.ts`** (new; as built, the per-engine runs are split over `engine-loads-a.test.ts` to `-d.test.ts`, with the shared steps in `engine-loads-helpers.ts`, so Vitest runs them side by side: one file took 261 s, four take about 155 s): for every file in `src/engines/tools/`, it runs `inspect` (and `inspectPicture`) and `run` against every file in `tests/fixtures/` (and `pictures/` for picture engines and Sign PDF's picture). It uses a valid option set per tool, from one small table in the test, and a recording `tools` filled from disk, as the engine tests do. It fails when:
  - a step asks for a library outside its declared set;
  - `loads` is missing;
  - a tool with `outputs: 'several'` lacks `fflate` in `job`.

  `'always'` keys are allowed everywhere. This is also how this change runs every engine against every fixture, as the tasks rule asks.
- **`npm run check:worker`** gains a rule (R12): the draw-set chunks (`pdf`, `pdfjs-data`, `thumbnail`, `picture-thumbnail`) may statically import only chunks the worker and the tool's engine already load. So starting the draw set never brings a request that the file could delay.
- **`tests/e2e/host-log.ts`** (new): a small `node:http` server for `dist/` that stands in for the host (R10).
  - It binds to `127.0.0.1` on a free port and answers `GET` and `HEAD` only.
  - It percent-decodes the path once, refuses NUL, resolves with `path.resolve(distRoot, '.' + decoded)`, and refuses anything whose `fs.realpath` is not inside `realpath(distRoot) + sep`.
  - It serves clean URLs and the 404 page, with GitHub Pages' content types (`application/wasm`, `text/javascript` for `.mjs`).
  - It sends `Cache-Control: max-age=600`, an `ETag` and `Last-Modified`, and answers `If-None-Match` with 304. It sends no CORS headers and no Content Security Policy header, since the policy is a meta tag, as on the host.
  - It records `method path status` for every request, with a `mark()` to split phases.
  - It has a **slow mode** that holds each response for P's files (`pdf-*.js`, `pdf.worker.min-*.mjs`, `pdfjs-data-*.js`, `thumbnail-*.js`) for 12 seconds, longer than the thumbnail limit (R2). Holding at the server keeps the browser's cache on, where Chromium's `route` would turn it off.
- **`tests/e2e/uniform-requests.spec.ts`** (new, tagged `@desktop` so it runs once): one test per tool page, taken from `widgetPages` in `pages.ts`, so a new page without a row in the input table fails.
  - Each input runs in a new browser context, so the cache starts empty, with `watchPolicy` from `fixtures.ts`. No compared context uses `route` or `routeFromHAR`, which switch off the HTTP cache (R7).
  - Each job input's context also counts as a pick input, and duplicate inputs are dropped (R14).
  - A phase ends when every request expected for it has arrived and none is still open, then one short quiet (`quietMs`, one named constant). The expected requests come from the file table below. The job phase expects the job libraries not already fetched at the pick; the rest come from the browser's cache (stage 1, architect).
  - It compares, across a page's inputs:
    - the pick phase's multiset of `(method, path)`;
    - after a password is typed, nothing new;
    - the job phase's multiset.

    A mismatch is reported as "expected X, got Y", with the page and the inputs.
  - Order is not compared at the server (decision 4).
  - **Slow mode cases:** `text.pdf` against `damaged-xref.pdf` on `/merge-pdf`, and one file against three on `/merge-pdf`. Each fails if any request differs or is repeated.
  - **The "Getting ready" check** for a wrong-kind pick runs in its own context with the server in slow mode, outside the comparisons (R7). It checks the line, its Remove button, focus, then the sentence.
  - Every request also passes `violations` from `no-upload.ts`, with the file names and passwords as secrets. Each fixture is picked as a buffer under a unique long name (`qz7pick<n>x<file>`), so every name and stem is a secret no site file can hold (stage 2, privacy S3; this replaced a rule that left out stems under six letters).
  - A pick phase is read only once the pick has shown its outcome (a thumbnail, an unreadable file's line, a password field, or the picker's refusal), and nothing may arrive between phases or after the last one (stage 2, privacy S1).
  - The judging rules (each phase against the tool's list, every gap empty, each phase the same across inputs) are plain functions in `tests/e2e/request-record.ts`, and `tests/unit/request-record.test.ts` feeds them a recorded log in which Compress PDF fetches `fflate` for one input only: they must report `/compress-pdf` (stage 2, privacy S2).

  **Each tool's exact list of files** is built in `tests/e2e/tool-files.ts` (R11), replacing the 14 hand-written lists. It is made from:
  - one table from `LibraryName` to built-file patterns;
  - the shared files (WS, W);
  - the static imports the engine's built chunk names, read from `dist/`.

  The tool specs import it. That keeps one source for "what this tool may fetch" and for "what each phase expects".

  The input table:

  | Pages | Pick inputs | Job inputs (also pick inputs) |
  | --- | --- | --- |
  | Every PDF page | `damaged-xref.pdf`; `password.pdf` (before and after its password); `not-a-pdf.pdf` (wrong kind); `scanned.pdf` | `text.pdf`; `rich.pdf`; `password.pdf` with its password |
  | `/merge-pdf` | also `text.pdf` + `rich.pdf` + `images.pdf` | also `text.pdf` + `password.pdf` |
  | `/compress-pdf` | — | `compress-lossless.pdf` (smaller); `compress-text.pdf` (no new file); `compress-scans.pdf` (JPG) |
  | `/unlock-pdf` | — | `password.pdf` with its password; `restricted.pdf`; `text.pdf` (no new file) |
  | `/sign-pdf` | a PDF chosen as the signature picture | typed name; drawn line; JPG picture; PNG picture |
  | Image to PDF pages | `broken.png`; `arithmetic.jpg` (`unsupported`); `text.pdf` (wrong kind) | `details.jpg`; `small.png`; `details.jpg` + `small.png` |

  Each page's own required input is given the same way for every input, such as one page chosen in Extract pages, one turn in Rotate PDF, text in Watermark, or a new password in Protect.

  A job that fails in the browser is included where a fixture makes one fail (task 6.3 looks for one). Otherwise, the worker-core test covers it.
- **Existing specs** that say a file is *not* fetched in a case that now fetches it are updated to the new rule. These are `pdf-to-images.spec.ts` "a one-page file fetches fflate too, and the same files as a longer one", which folds into the new spec, and any check that `fflate` is absent on Compress PDF. Checks that a file is absent *before the main button* (pdf-lib in `sign-pdf.spec.ts`) and *before a pick* stay as they are. Tests that hold PDF.js back with `route` (`thumbnails.spec.ts`) are not part of the comparison and stay as they are.

### 12. The Privacy page sentences (draft, marked for the owner; R3, R17)

In "What happens to your file", after "These requests carry nothing from your file: not its contents, not its name and not a password.":

> Which programs the page fetches does not depend on what your file holds. This is true for a damaged file, a protected file or a file of the wrong kind too.

At the end of "Who serves the site":

> From your browser's requests, GitHub can tell which tool page you opened and when you chose a file: in practice your first file, and later ones once your browser's copies of the programs are about 10 minutes old, or if your browser keeps no copies. It may be able to tell when you started a job. GitHub does not receive your file, its name or a password. Your browser may ask for a program more than once, and in a few cases how often it asks can depend on your file. If a page of your file is slow to show, asking again can tell GitHub that.

Reworded at stage 2 (privacy M2, UX): "when you first chose a file" was not true once copies are old or with no cache. "does not receive" stands where "never" would trip the page's absolute-word guard.

Both are marked for the owner. The last two sentences are Open question 1 either way.

The words claim neither an order nor identical requests. They pass the `privacy-page.test.ts` guards: no word from its absolute list, no banned word, no `!` or `@`, no worker named outside the policy section, and no server claim. Task 5.2 checks them against the named exceptions.

Claim table, added to the one in `add-privacy-draft`'s design:

| Claim | Code | Proof |
| --- | --- | --- |
| Which programs are fetched does not depend on what the file holds, damaged, protected and wrong-kind files included | `loads` on every engine; draw set from `thumbnails`; `toolLibrary` and phase-gated `tools`; `ready(phase)` in `worker-core.ts`; `prepare` on every pick and the wrong-kind wait; no file-driven end before `prepared`; a fresh worker for every job | `uniform-requests.spec.ts` (the host's record compared across inputs on all 17 pages, and the slow-mode cases); `engine-loads.test.ts` with `engine-loads-a` to `-d.test.ts` (the engines split over four files so they run side by side); `worker-core.test.ts`; `client.test.ts` |
| GitHub can tell which tool page was opened and when a file was chosen (in practice the first pick, and later ones once its copies are about 10 minutes old or with no cache), may be able to tell when a job was started, and does not receive the file, its name or a password | Requests at page load, after a pick (`prepare`), and after the main button only when the job needs a file not yet fetched; `max-age=600`; no request carries the file, its name or a password | `uniform-requests.spec.ts` records exactly these phases and runs every request through the no-upload watcher with every input's name, stem and password as secrets; the tool specs' no-upload tests; release check of the live host's headers |
| A program may be asked for more than once, and in a few cases how often can depend on the file; a page slow to show can be told that way | The named exceptions in Risks: no usable cache, stale copies, a thumbnail over 10 seconds after the set settled, the main button while P arrives, a crash, jobs over the cache lifetime; no hold ends a worker (decision 7) | Risks below; the host's `Cache-Control` read again at release |

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

- PDF.js's nested worker now also runs for damaged, protected and wrong-kind picks, until the reading worker ends. It is idle, and task 4.4 measures it.
- The spare qpdf replaces today's first instance in workers that call qpdf. In a worker that never calls qpdf, it adds a compile and about 16.4 MB until the worker ends (decision 6).
- The job's fresh worker replaces the reading worker rather than sitting beside it.
- A retired worker (decision 7) lingers until its set settles, which on a stalled link can be minutes. It holds what it loaded: the spare qpdf (16.4 MB reserved, about 6 MB resident), and PDF.js with its idle worker (about 15 MB) once those arrive. It sits beside a new worker only when the visitor started one. At most one is retired at a time in practice, and "Start again", the visitor's next pick and leaving end them all.

**When WebAssembly is fetched.** At the pick, as today: now also for a wrong-kind pick, and at a fixed point before the file is read. At the main button, qpdf's WebAssembly is asked for again by the fresh worker, and the browser answers from its cache.

## Threats considered

- **A hostile PDF or picture** can no longer choose which site files are fetched, or end a worker before its set settles. Nothing the worker reads is used before the sets are loaded. Engines can only reach libraries declared for the step (decision 3). Its effect is limited to the named exceptions in Risks.
- **An oversized file** has its timing effect removed. `bytesOf` now runs after every request of the phase has started.
- **A hostile file name** is not used by any of this. File names stay in the no-upload secrets of the new spec.
- **The new messages.** `prepare`, `prepared` and `drop-thumbnail` carry no file and no password, only `toolId` and a request id. `isToWorker` and `isFromWorker` check their shape.
- **The local test server** binds to `127.0.0.1`, answers `GET` and `HEAD` only, and refuses NUL and any path whose real path leaves `dist/` (a self-test asks for `/%2e%2e/package.json`). It sends no CORS headers and is closed after the tests. It is test code, not shipped.

## Risks / Trade-offs

These are the named exceptions. The Privacy page does not claim them closed, and Open question 2 asks the owner to accept them for now.

- [**No usable cache** (cache off, full, or a "no cache" setting): the browser asks for qpdf's WebAssembly once per qpdf instance, and how many instances there are follows the file.] → Not closed: the qpdf build has no hook, and lint keeps `fetch` out of the worker. A later option is a patched qpdf build that takes a compiled module, or a lint exception for one `WebAssembly.compileStreaming(fetch(...))`. Either needs security review.
- [**Copies older than about 10 minutes**: the next use of each file is a conditional request. A reading worker started again after its set settled, because a thumbnail passed 10 seconds or a drawing was stopped by a further file, therefore shows the host its checks. How often that happens follows how slow the file is to draw and how many files there are.] → Not closed. The Privacy sentence "If a page of your file is slow to show, asking again can tell GitHub that." says so (Open question 1).
- [**The main button while P is still arriving**: the reading worker is ended, P is cut short, and P is not asked for again by the job unless the job uses it. Whether P was still arriving follows how long the file took to read, so a big file pressed quickly can show fewer P bytes.] → Not closed. The job is not held back, because the visitor asked for it. This was the panel's choice in R1.
- [**A worker crash while reading**: the worker ends at once, mid-download.] → Not closed. It is rare, and a crash is itself the browser's failure.
- [**A job longer than the cache lifetime** asks again for qpdf's WebAssembly mid-job.] → Not closed, and rare. The job set check at the start refreshes the copy.
- [**The order on the wire is not tested at the server** (R12).] → Requests started together arrive in any order. The order from the code is tested in `worker-core.test.ts`, and the `check:worker` rule keeps the draw set from pulling in late requests.
- [**A slower refusal for a wrong-kind pick**: up to the whole pick set's download, about 1.78 MB on a PDF page, before "cannot be used".] → The owner's answer of 22 Nov 2026, held to 60 seconds, with Remove as a way out (decision 9). Issue #7 gets a phone hand check on a slow connection (R16).
- [**A reading failure, or a replaced Sign picture, waits for the set**, up to 60 seconds on a stalled link.] → The visitor sees the file's line with "Getting ready" meanwhile, and can Cancel, Remove or press "Start again". Past the hold the page goes on, and the worker is retired, not ended (decision 7).
- [**A link slower than about 240 kbit/s.** Past the 60-second hold, a new worker started by the visitor may ask again for files still arriving for a retired one.] → Not closed. Each such new worker is started by the visitor, not the file (decision 7). Covered by the "asked again" Privacy sentence.
- [**A thumbnail started between a drop and a late "too late"** (stage 2, code review). Removing a file sends a drop and lets the next file's thumbnail start on the same worker; if the drop comes back too late, the page ends the worker under that new drawing.] → Fixed: `stopThumbnail` forgets any drawing started meanwhile (it is asked for again) before it ends the worker, then nudges the queue. Not covered by an automated test: the window is one message round trip at the moment the set settles, which a test cannot hit on purpose; named here instead.
- [**More bytes for damaged, protected and wrong-kind PDFs** (+1.29 MB on a first visit).] → The owner's answer of 22 Nov 2026.
- [**A host other than GitHub Pages** may send different cache headers.] → Only what is asked for again later changes. The release check reads the live host's headers, and the test server's headers are one constant to change.
- [**Firefox and Safari**: the new spec runs in Chromium.] → A release check in issue #7: the host's record for `text.pdf` against `damaged-xref.pdf` on one page, in Firefox and Safari.
- [**Test time.**] → Decision 11 cuts it: job inputs double as pick inputs, phases end on expected requests, and there is one quiet constant. Task 6.5 records it. If it passes about 5 minutes, task 6.5 says so and stops for a decision; no test is cut silently.

## Migration Plan

Nothing is stored, so nothing migrates. Rollback is reverting the pull request. The engines' outputs do not change, so no fixture or engine test result changes.

## Open Questions

The owner answered two questions on 22 Nov 2026: PDF.js's set after every pick on a PDF page, and a wrong-kind pick loads the set first with the wait held to 60 seconds. Three remain, for the owner, each with the default this change builds:

1. **The "asked again" sentences on the Privacy page.** Keep "Your browser may ask for a program more than once, and in a few cases how often it asks can depend on your file. If a page of your file is slow to show, asking again can tell GitHub that."? Default: yes, marked for review.
2. **The named exceptions.** Accept the rare cases in Risks for now: no usable cache; copies older than 10 minutes; a page slow to draw; the main button while PDF.js is arriving; a crash; jobs over 10 minutes. The Privacy page will not claim them closed. Default: yes.
3. **Remove for several wrong-kind files.** When several files of the wrong kind are picked, keep a Remove button on the "Getting ready" summary line (read out as "Remove 2 files")? Default: yes.
