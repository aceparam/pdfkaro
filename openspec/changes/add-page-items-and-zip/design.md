# Design

## Context

- **What exists:**
  - `PageGrid` lists items with a fixed thumbnail slot, a view watcher created once, and Move up, Move down and Remove on every item. Items can be dragged whenever there are two or more.
  - `useToolRun` keeps a thumbnail queue keyed by item id. `next()` walks `state.files`, and `pump` looks the file up by that id. Today an item is a file, and page 1 is asked for.
  - The worker's thumbnail call opens a document, draws one page and closes it, every time. `renderPage` comes in through `WorkerDeps`, is loaded late in `tool.worker.ts`, and is wrapped in `pdfjsLoader.guard`.
  - `worker-core` already passes every output of an engine back. `useToolRun.start()` uses only `outputs[0]`.
  - `outputName` cleans an input name and adds a suffix and an extension. There is no separate stem function.
- **The owner decided on 12 Nov 2026:**
  - zips are made with `fflate`;
  - Split PDF splits at points the visitor picks (built in `add-split-pdf`).

## Goals / Non-Goals

**Goals:**
- Page items for tools that work on one file's pages, usable on a phone with 500 pages.
- Fast thumbnails across many pages of one file, without a second copy of the file kept longer than needed.
- Several outputs as one zip, made in the worker, with requests that never depend on the file.

**Non-Goals:**
- Any tool's own controls on a page.
- Dragging or reordering pages.
- Selecting pages.

## Decisions

### 1. The registry says what a tool lists and gives

`ToolWidgetWords` gains:
- **`items: 'files' | 'pages'`.** Merge PDF stays `'files'`.
- **`itemControls: boolean`.** Whether items have Move up, Move down and Remove, and whether they can be dragged. Merge PDF keeps `true`.
- **`outputs: 'one' | 'several'`.** Whether a run can give several files. Merge PDF is `'one'`.
- **`partSuffix?`.** The word for files inside a zip, such as `part`. Needed when `outputs` is `'several'`.

A tool with `items: 'pages'` takes one file (`multiple: false`, `minFiles: 1`).

### 2. Page items, and the queue that draws them

`src/widget/items.ts` is a plain function:

```ts
gridItems(state, words) → { id, title, fileId, page }[]
```

- **For `'files'`,** it gives one item per file, as now, with `id` the file id and `page` 1.
- **For `'pages'`,** it gives nothing until the one file is `ready`. Then it gives `pages` items, with `id` `${fileId}:${page}` and `title` "Page N". Until then, the file's own line shows "Getting ready", the password field, the damaged notice or the large-file warning, as for a list of files.

The thumbnail queue changes:
- `next(queue, state, items)` walks `items` in order.
- It checks each item's readiness through `item.fileId` in `state.files`.
- It keeps its other rules: one at a time, nothing while a file is read, only while listing.

`useToolRun` keeps a map from item id to `{ fileId, page }` from the last `gridItems`, and asks for `page` of `fileId`. The unit tests cover page items, files, and an id that names a removed file.

### 3. How page items look and stay quick

- **The file line.** For `'pages'`, `ToolWorkspace` shows one line above the pages: the file's name, its page count and its size, with Remove. Removing it returns to the picker.
- **The grid.** `PageGrid` lays page items out as a wrapping grid. Each cell is the 52 by 68 slot with "Page N" under it, about 80 by 100 px. At 360 px that gives four to a row, so 500 pages take about 125 rows, roughly 12,500 px.
- **The skip link.** A plain "Skip to the main button" link sits above the grid. It moves focus to the main button, so keyboard and screen reader users never have to pass 500 pages, and a phone user can jump there.
- **What does not move.** The page order of the anatomy stays: working area, then the main button. Nothing sticks to the screen.
- **No controls, no drag.** When `itemControls` is false, items have no buttons and are not draggable. Until a tool brings page moves, the registry test refuses `items: 'pages'` with `itemControls: true`.
- **One file only.** A drop or paste can bring several files even when the picker takes one. `chooseFiles` in `src/widget/accept.ts` keeps the first, which replaces a file already listed, and the page says the others were not added.
- **Before the pages appear.** The grid is not drawn until there are pages, so no empty list shows. When the file has been read, the status region says the file line's words, such as "mixed.pdf, 4 pages, 2 KB". The large-file notice says "This file is more than 100 MB".
- **Quick re-renders.** Rows become a memoised `PageItem` component, with stable `ref` functions held in a map by id. A thumbnail arriving then re-renders only its own row. `ToolWorkspace` builds items with `useMemo` over the files and passes thumbnails as a separate map. The 500-page long-task check stays in task 5.1.

### 4. One open document in the worker, never in a job's way

- **Two entry points.** `src/engines/thumbnail.ts` gains `openDocument(file, password, tools) → { pages, render(page, box), close() }`, with `renderPage` kept as a one-off wrapper over it, which the Node tests use.
- **Loaded late, through `WorkerDeps`.** `worker-core` gets `openDocument` through `WorkerDeps`, loaded late in `tool.worker.ts` like `renderPage`. Every drawing is wrapped in `pdfjsLoader.guard`.
- **One document at a time.** The thumbnail message gains `documentKey`, the item's `fileId`, an id the page makes up and never a file name. `worker-core` keeps at most one open document, with its key:
  - the same key draws from it;
  - another key closes it and opens the new file;
  - a `run` or `inspect` message closes it at once, so a job or a read never runs beside a kept copy of a file;
  - a `close` message from the page closes it.
- **Only page tools keep a document.** A list of files draws one picture from each file, so after each one the page sends `close`; Merge PDF keeps no copy between pictures.
- **Removing a file closes it.** `useToolRun.removeFile` sends `close` when the removed file is the open one, or ends the client if a thumbnail is being drawn, as now. Removing a file therefore drops its kept copy at once.
- **Ending everything.** "Start again", `pagehide` and the end of a job end the worker as now, which ends everything.

### 5. Several outputs become one zip, in the worker

- **The request.** For a tool whose `outputs` is `'several'`, every `run` message carries `zip: { stem, partSuffix }`.
- **Loading `fflate` up front.** On a run with `zip`, `worker-core` loads `fflate` through `WorkerDeps` (`import()` in `tool.worker.ts`) at the start, before the engine has given anything. So the request is the same whether the file gives one part or a hundred.
- **When there are several outputs:**
  1. entries are named `partName(stem, partSuffix, n, total)`, numbered from 1 and padded so they sort;
  2. `zipSync` runs with `level: 0`, since PDFs are already compressed. It is sync only, because `fflate`'s async API starts workers from `blob:` code;
  3. the outputs are dropped as soon as the zip exists, as the inputs already are;
  4. one output goes back, the zip, with `parts: n`.
- **When there is one output,** it goes back as now.

### 6. Names, and the checks the worker makes

- **One cleaning for every name.** `format.ts` gains `stem(input)`, split out of `outputName`, so both use the same cleaning. That cleaning also strips `: * ? " < > |` and a leading dot, which Windows refuses or hides. `outputName(input, suffix, ext)` becomes `${stem(input)}-${suffix}.${ext}`. `partName(stem, suffix, n, total)` is unit tested, including `a:b*c?.pdf` and `../x.pdf`.
- **The worker checks the new fields itself** (`isToWorker`):
  - `zip.stem`: 1 to 100 characters, no `/`, `\`, control or bidi characters, none of `: * ? " < > |`, no leading dot, and not `.` or `..`;
  - `zip.partSuffix`: the tool id pattern;
  - `documentKey`: `^f[0-9]{1,9}$`, the page's own file ids;
  - unit tests for each.
- **The result.** `useToolRun.start()` makes a `Blob` of type `application/zip` named `outputName(input, words.outputSuffix, 'zip')` when the reply has `parts`. `ResultInfo` gains `parts?`. The result block shows "N files" from `fileCount`, built in `ToolWorkspace` and passed to `Result` as its detail. No result has next steps yet; for a zip that is a known gap against part 6, put to the owner in this change's pull request, and no rule about it is written into the spec.

### 7. Page weight, memory and what loads when

- **Before a pick:** nothing new loads. `items.ts`, `PageItem` and the other changes are in the workspace chunk.
- **`fflate`'s zip step:** 4.4 KB gzip as built, loaded at the start of every run of a tool that gives several files. fflate's file is called `browser.js`, so the worker build names its chunk `fflate-<hash>.js` (`astro.config.mjs`), and `page-weight.mjs` and `check-worker.mjs` name it exactly and check it is not in the worker file.
- **Peak memory of a split:** the input in the worker and in qpdf, the parts, then the zip. The parts are dropped once the zip exists, so the peak is about the input twice plus the parts twice. For a 500-part split of a 100 MB file that is roughly 400 MB, which the 100 MB warning already covers.

### 8. Dependency

| Package | Why | Licence | Last release | Shipped |
| --- | --- | --- | --- | --- |
| `fflate` 0.8.3, exact | Joins several outputs into one zip, as `SPEC.md` asks, in the worker. The owner's choice of 12 Nov 2026 | MIT | Jul 2026 | 4.4 KB gzip as built, at the start of every run of a tool that gives several files |

It is already installed as a dependency of `@cantoo/pdf-lib`. This change makes it a direct, pinned dependency.

### 9. Threats

- **A malicious PDF:** as for thumbnails. One document is open at a time, in PDF.js's own worker, and closed before any job or read.
- **An oversized result:** see the peak above. The 100 MB warning stands.
- **A hostile file name:**
  - every name comes from the shared cleaning;
  - the worker refuses a stem that could be a path or carries characters common systems refuse;
  - zip entries are the stem plus numbers, never a path.

### 10. What Split PDF's no-upload test must cover

These checks are deferred to `add-split-pdf`, the first tool using these parts, and are written down here so they are not dropped:
- **The allowlist** names `fflate`'s chunk by exact name.
- **A run that gives one file and a run that gives several** both fetch `fflate`, and the same list of files.
- **The strings no request may carry** include the input name (`report.pdf` in the test) and the password.
- **A planted fflate request** with a body or a query string is seen and flagged, like the planted requests in Merge PDF's test.

`add-split-pdf` must also cap the page count before page items are made, with a fixture of a very large page count beside `pages-500.pdf`, so a crafted file cannot freeze the tab. The same cap bounds Split's one-file-per-page output. (Stage 2 security review of this change.)

## Risks / Trade-offs

- **About 12,500 px of grid** for 500 pages at 360 px. The skip link covers keyboard and screen reader users. A phone user scrolls, or uses the link. If it proves too long on a phone, the grid can be windowed later without changing the spec.
- **No tool uses these parts yet.** The end-to-end proof comes with Split PDF. This change is proven by unit tests and component tests, and by a scratch build with a made-up page tool and engine, as `add-tool-widget` was.
