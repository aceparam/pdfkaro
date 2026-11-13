# Tasks

This change has no tool of its own, so there is no registry entry, engine or page text. The end-to-end, no-upload and screenshot tasks for these parts come with Split PDF, the first tool to use them; design decision 10 lists what its no-upload test must cover.

## 1. Registry and words

- [x] 1.1 Add `items`, `itemControls`, `outputs` and `partSuffix` to `ToolWidgetWords`; set Merge PDF to `items: 'files'`, `itemControls: true`, `outputs: 'one'`; update the registry tests

## 2. Engine side and names

- [x] 2.1 Add `openDocument` to `src/engines/thumbnail.ts`; unit test drawing several pages of `pages-500.pdf` from one open document, and that `close` frees it
- [x] 2.2 Split `stem` out of `outputName` in `src/widget/format.ts`, strip `: * ? " < > |` and a leading dot in the shared cleaning, and add `partName`; unit test numbering, padding, `a:b*c?.pdf` and `../x.pdf`

## 3. Worker wiring

- [x] 3.1 Add `documentKey` to the thumbnail message and a `close` message, with checks; keep one open document in `worker-core` through `WorkerDeps.openDocument`, loaded late and guarded; close it on another key, on `run`, on `inspect` and on `close`; unit test each
- [x] 3.2 Add `zip { stem, partSuffix }` to the `run` message, with the worker's own checks; load `fflate` through `WorkerDeps` at the start of every run with `zip`; zip several outputs with `zipSync`, naming entries with `partName`, drop the outputs, and send back one output with `parts`; unit test with made-up engines that return one and three files, unzipping the result and checking `fflate` was loaded both times
- [x] 3.3 Add `fflate` as an exact dependency, with a `LICENSES.md` line; name its chunk in `page-weight.mjs`, and make `check-worker.mjs` fail if it is in the worker file

## 4. Page side

- [x] 4.1 Add `src/widget/items.ts` (`gridItems`); change the thumbnail queue's `next` to walk items and check readiness through `fileId`; unit test files, pages before and after reading, each problem state, and a removed file
- [x] 4.2 Use items in `useToolRun` and `ToolWorkspace`: ask for `page` of `fileId`, send `close` when the open file is removed, and make a zip `Blob` and name when the reply has `parts`
- [x] 4.3 `ToolWorkspace`: the file line above the pages with Remove named for its file ("Remove report.pdf"), and the "Skip to the main button" link, always visible, at least 44px tall, which moves focus to the main button and scrolls it into view; `PageGrid`: a wrapping grid for pages, a memoised `PageItem` with stable `ref` functions, and buttons and drag only when `itemControls` is true; the result block: "N files" for a zip; update the component render tests
- [x] 4.4 From the stage 2 review: `chooseFiles` in `src/widget/accept.ts`, so a one-file tool keeps the first file of a drop or paste, which replaces a listed file, and says the rest were not added (unit tested); a list of files sends `close` after each thumbnail, so Merge PDF keeps no document open; the registry test refuses `items: 'pages'` with `itemControls: true`

## 5. Checks

- [x] 5.1 In a scratch copy, mount a made-up page tool with a made-up engine that returns several files. Check:
  - page items in a grid at 360px and 1280px, the file line, and the skip link;
  - thumbnails of many pages, with no long task over 100 ms with `pages-500.pdf`;
  - that pages do not drag;
  - the zip download and its contents;
  - that `fflate` loads on a run that gives one file too.
- [x] 5.2 Run every file in `tests/fixtures/` through `openDocument` and record the outcome in the fixtures README
- [x] 5.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 5.4 Run the review panel (see the review-panel skill) and resolve its findings
