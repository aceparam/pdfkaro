# Design

## Context

- **What exists:**
  - `PageGrid` lists items with a fixed thumbnail slot, optional view reports, and Move up, Move down and Remove on every item.
  - `useToolRun` keeps a thumbnail queue keyed by item id, where today an item is a file, and asks for page 1.
  - The worker's thumbnail call opens a document, draws one page and closes it, every time.
  - `worker-core` already passes every output of an engine back (`Uint8Array[]`). `useToolRun.start()` uses only `outputs[0]`.
  - `ToolWidgetWords` carries a tool's words and rules.
- **The owner decided on 12 Nov 2026:**
  - zips are made with `fflate`;
  - Split PDF splits at points the visitor picks (built in `add-split-pdf`).

## Goals / Non-Goals

**Goals:**
- Page items for tools that work on one file's pages.
- Fast thumbnails across many pages of one file.
- Several outputs as one zip, made in the worker.

**Non-Goals:**
- Any tool's own controls on a page.
- Dragging or reordering pages.
- Selecting pages.

## Decisions

### 1. The registry says what a tool lists

`ToolWidgetWords` gains:
- **`items: 'files' | 'pages'`.** Merge PDF stays `'files'`.
- **`itemControls: boolean`.** Whether items have Move up, Move down and Remove. Merge PDF keeps `true`; a page tool sets `false` until it adds its own.
- **`partSuffix?`.** The word for files inside a zip, such as `part`.

A tool with `items: 'pages'` takes one file (`multiple: false`, `minFiles: 1`).

### 2. Page items

`src/widget/items.ts` is a plain function:

```ts
gridItems(state, words) → { id, title, detail, fileId, page }[]
```

- **For `'files'`,** it gives one item per file, as now (page 1).
- **For `'pages'`,** once the one file is `ready`, it gives `pages` items, with ids `${fileId}:${page}` and titles "Page N". Before that, it gives the file's item, which shows "Getting ready" or its problem.

The thumbnail queue is unchanged: it works on item ids, and `next` checks readiness through the item's `fileId`.

`useToolRun` asks for `item.page` of `item.fileId`.

`PageGrid` draws Move up, Move down and Remove only when `itemControls` is true. Its watcher, slot and blank box are unchanged. 500 rows of plain text and an empty slot are cheap to draw, which the 500-page end-to-end test checks.

### 3. One open document in the worker

`src/engines/thumbnail.ts` splits in two:
- **`openDocument(file, password, tools) → { pages, render(page, box), close() }`.**
- **`renderPage`,** kept for one-off use, opens, renders and closes.

The thumbnail message gains `documentKey`, the item's `fileId`, an id the page makes up and never a file name. `worker-core` keeps at most one open document, with its key:
- **The same key** draws from the open document, without reading the file again.
- **Another key** closes it and opens the new file.
- **When the worker ends,** everything goes with it.

Only one document is open at a time, so memory stays at one file's worth.

### 4. Several outputs become one zip, in the worker

The `run` message gains `zip?: { stem, partSuffix }`, where `stem` is the cleaned input name the page already computes. When an engine returns more than one output, `worker-core`:
1. loads `fflate` with `import()`;
2. builds entries named `${stem}-${partSuffix}-${n}.pdf`, numbered from 1, padded so they sort, such as `-01` when there are 10 or more;
3. calls `zipSync` with `level: 0`, since PDFs are already compressed and storing keeps it fast and its memory low;
4. sends back one output, the zip, with `parts: n`.

When there is one output, it is sent back as now.

`useToolRun.start()`:
- **Several files:** a `Blob` of type `application/zip`, named `outputName(input, words.outputSuffix, 'zip')`.
- **One file:** a PDF as now.

`ResultInfo` gains `parts?`. `Result` shows "N files" in its detail line when `parts > 1`, from `fileCount`.

`format.ts` gains `partName(stem, suffix, n, total)`, unit tested.

### 5. Page weight and what loads when

Nothing new loads before a pick: `items.ts` and the `PageGrid` change are in the workspace chunk. `fflate`'s zip step is about 8 KB and loads only after a job that gives several files. `page-weight.mjs` and `check-worker.mjs` name it.

### 6. Dependency

| Package | Why | Licence | Last release | Shipped |
| --- | --- | --- | --- | --- |
| `fflate` 0.8.3, exact | Joins several outputs into one zip, as `SPEC.md` asks, in the worker. The owner's choice of 12 Nov 2026 | MIT | Jul 2026 | About 8 KB gzip, only after a job that gives several files |

It is already installed as a dependency of `@cantoo/pdf-lib`. This change makes it a direct, pinned dependency.

### 7. Threats

- **A malicious PDF:** as for thumbnails. One document is open at a time, in PDF.js's own worker.
- **An oversized result:** zipping stores the files without compressing, adding about one copy of the outputs at its peak. The 100 MB warning stands.
- **A hostile file name:** names inside the zip come from the cleaned stem made by `outputName`'s rules, plus numbers. Never a path.

## Risks / Trade-offs

- **The open document holds a copy of the file** in PDF.js's worker while the list is shown. The worker is still ended after every job, on "Start again" and on leaving.
- **No tool uses these parts yet.** The end-to-end proof comes with Split PDF. This change is proven by unit tests and component tests, and by a scratch build with a made-up page tool and engine, as `add-tool-widget` was.
- **500 items in one list.** Drawing them is cheap, but if it proves slow on a phone, the list can be windowed later without changing the spec.
