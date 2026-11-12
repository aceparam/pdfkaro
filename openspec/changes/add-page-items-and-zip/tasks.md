# Tasks

This change has no tool of its own, so there is no registry entry, engine or page text. The end-to-end, no-upload and screenshot tasks for these parts come with Split PDF, the first tool to use them.

## 1. Registry and words

- [ ] 1.1 Add `items`, `itemControls` and `partSuffix` to `ToolWidgetWords`; set Merge PDF to `items: 'files'`, `itemControls: true`; update the registry tests

## 2. Engine side

- [ ] 2.1 Split `src/engines/thumbnail.ts` into `openDocument` and `renderPage`; unit test drawing several pages of `pages-500.pdf` from one open document, and that `close` frees it
- [ ] 2.2 Add `partName` to `src/widget/format.ts`, with unit tests for numbering and padding

## 3. Worker wiring

- [ ] 3.1 Add `documentKey` to the thumbnail message and keep one open document in `worker-core`, closing it when another key comes; unit test with a made-up `openDocument`
- [ ] 3.2 Add `zip` to the `run` message; in `worker-core`, zip several outputs with `fflate` loaded by `import()`, naming entries with `partName`, and send back one output with `parts`; unit test with a made-up engine that returns three files, unzipping the result
- [ ] 3.3 Add `fflate` as an exact dependency, with a `LICENSES.md` line; name its chunk in `page-weight.mjs` and `check-worker.mjs`

## 4. Page side

- [ ] 4.1 Add `src/widget/items.ts` (`gridItems`) with unit tests for files, pages before and after reading, and a file with a problem
- [ ] 4.2 Use page items in `useToolRun` and `ToolWorkspace`: ask for `item.page` of `item.fileId`; make a zip `Blob` and name when the reply has `parts`
- [ ] 4.3 `PageGrid`: draw Move up, Move down and Remove only when `itemControls` is true; `Result`: show "N files" when `parts > 1`; update the component render tests

## 5. Checks

- [ ] 5.1 In a scratch copy, mount a made-up page tool with a made-up engine that returns several files: check page items, thumbnails of many pages, no long task over 100 ms with `pages-500.pdf`, and the zip download and its contents, at 360px and 1280px
- [ ] 5.2 Run every file in `tests/fixtures/` through `openDocument` and record the outcome in the fixtures README
- [ ] 5.3 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 5.4 Run the review panel (see the review-panel skill) and resolve its findings
