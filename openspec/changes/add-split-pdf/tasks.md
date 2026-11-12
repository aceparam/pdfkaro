# Tasks

## 1. Registry entry

- [ ] 1.1 Record the owner's decisions of 12 Nov 2026 under "Owner decisions" in `CLAUDE.md`: bookmarks per part, attachments with the first part, no password or restrictions on parts, and no next steps for a zip result. Record under "Decisions the agent made for the owner": file-attachment annotations stay with their page; and a zip holds at most 65,535 files and 4 GB because `fflate`'s `zipSync` writes no ZIP64
- [ ] 1.2 Add the Split PDF entry to `src/tools/registry.ts`, and the new fields: `itemToggle: { kind: 'cut-after', label }`, `resultPages: 'sum' | 'input' | 'none'` in place of `resultPagesAreSum` (Merge PDF becomes `'sum'`), and `memoryAdvice`, with the failure sentence using it when set. The registry test checks catalogue order, that `itemToggle` is set only with `items: 'pages'`, and that `related` names only published tools

## 2. Engine

- [ ] 2.1 Write `parts(pages, cuts)` in `src/engines/tools/split-pdf.ts`, refusing cuts that are not sorted, unique whole numbers from 1 to `pages - 1`
- [ ] 2.2 Prove the one-call route (`--update-from-json` before `--pages`, whole dictionaries in the input's object numbers) on a nested outline and on a part whose catalog loses `/Outlines`; if it cannot be made to work, stop and ask the owner (design, Risks)
- [ ] 2.3 Write `keptOutline(outline, first, last)`, with a depth limit of 48 and a visited set, clearing `/First`, `/Last` and `/Count` on an item at qpdf's depth cut that still has children; and the pure step that turns it into the update's whole dictionaries, dropping `/EmbeddedFiles` and the catalog's `/AF` for parts after the first, whether `/Names` sits in the catalog or is its own object; dropping the whole outline when an outline item's object is the catalog, a page, the `/Outlines` root or the `/Names` object; the update built with `JSON.stringify` from parsed objects
- [ ] 2.4 Compile `qpdf.wasm` once per worker and hand the module to each new instance through `instantiateWasm`; count V8's "could not allocate memory" as memory in `failureKind`
- [ ] 2.5 Write `run`, with outline JSON and titles never put in a log, an error message or a failure sentence: read the page count, outline, outline and catalog objects, and attachment names once from the input; for each part, a fresh qpdf from `tools.qpdf()`, one write call with `--decrypt` and the update, `qpdf --check`, the attachment and `/AF` check on parts after the first, the 65,535-part check before any work and the 4 GB check as parts are written, with the two limits imported from a shared `src/engines/zip-limits.ts`, a `TooBigForZip` error recognised by name in `failureKind`, a new failure kind `too-big-for-zip` carried by the worker's messages and given its sentence on the page, and progress per file; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 Unit test `parts`, the 65,535-part and 4 GB checks, and `keptOutline` (flat, nested, a dropped parent with kept children, nothing kept, a cycle, a generated outline about 100 levels deep, past qpdf's cut, and an outline item that is the catalog or a page); and the attachment step on a generated file with an indirect `/Names` and a catalog `/AF`
- [ ] 3.2 Unit test `run` on every file in `tests/fixtures/`: parts and their page counts, `qpdf --check`, links and form fields kept, `rich.pdf`'s bookmarks and attachment per the owner's decisions, with part 2 holding neither the attached file's bytes nor its file entry anywhere, `password.pdf`'s parts with no encryption, damaged files failing, progress per file; record each outcome in the fixtures README; record the time and peak memory of `pages-500.pdf` with no cuts, and of the `make-large.mjs` file with no cuts and with two cuts; by hand, no cuts on the `make-many-pages.mjs` file and on a generated 5,000-page file sharing one 1 MB image, accepting only a finished file or the memory or too-big-for-zip message; put the figures in the design, merging the two Memory paragraphs of decision 2 into one, and stop if either crashes the tab; also run it by hand on the file from `make-large.mjs` and on the file from `make-many-pages.mjs` with two cuts, and record those outcomes
- [ ] 3.3 Add `tests/fixtures/make-many-pages.mjs`, which writes, outside the repo as `make-large.mjs` does, a 120,000-page file and a 5,000-page file whose pages share one 1 MB image
- [ ] 3.4 Unit test a 500-part split of `pages-500.pdf` with no cuts, every part passing `--check`

## 4. Worker wiring

- [ ] 4.1 Send `options: { cuts }` from `useToolRun` for `kind: 'cut-after'`, sorted as numbers (unit test with cuts 9 and 10); name `split-pdf-<hash>.js` in `page-weight.mjs`, and check `check-worker.mjs` finds it as its own late-loaded file

## 5. Page and page text

- [ ] 5.1 Keep the cuts (`marks`) and `shown` in the reducer: cuts toggled by page, cleared on remove, replace and Start again, kept through Cancel and failure; `shown` back to 500 on remove, replace and Start again; unit test
- [ ] 5.2 Add `cutSummary(pages, cuts)` in `src/widget/cuts.ts`, with unit tests for each wording in design decision 3, including clearing the only cut, more than five cuts, and thousands separators
- [ ] 5.3 `PageGrid`: the optional per-item toggle (`aria-pressed`, at least 44px, the cell's full width with wrapping text, named "Cut after page N", none on the last page, pressed shown by a 2px border, bold text and a 2px line on the cell, never filled); `ToolWorkspace`: the summary line, the toggle announcements, a single output's page count from `resultPages`, `PageItem` getting only plain flags with the toggle's callbacks through the stable refs, and the Working line ("Starting", then "File N of M", then the writing label while zipping, with the worker posting writing progress before it zips); component render tests
- [ ] 5.4 Batches of 500: a `limit` argument to `gridItems`, passed `shown` by `ToolWorkspace` and by the thumbnail queue's `pump` (unit test that `pump` builds no more than `shown`), the "Show pages 501 to 1,000" button in real units, focus moving to the first new page's control and the count announced; unit and render tests
- [ ] 5.5 Write `src/content/tools/split-pdf.md`, 250 to 500 words, marked as a draft for the owner; check it and the page against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/split-pdf.spec.ts` at 360px and 1280px:
  - pick, mark and clear cuts by mouse and by keyboard, split, download and unzip;
  - no cuts on `text.pdf`;
  - `form.pdf` giving one PDF;
  - the password, damaged, not-a-PDF, two-file drop, replace by paste, large-file, Cancel and failure states;
  - the skip link;
  - `pages-500.pdf` shows all 500 pages with no button to show more and no long task over 100 ms;
  - batches of 500 with the generated file, with no long task over 100 ms;
  - removing the file while its pages are listed, which ends its kept document

## 7. No-upload test

- [ ] 7.1 Move `watch` and `violations` from `tests/e2e/merge-pdf.spec.ts` into `tests/e2e/no-upload.ts`, with each tool passing its own allowlist; keep Merge PDF's list exactly as it is, run the general plants once against the shared code, and keep Merge PDF's test passing
- [ ] 7.2 Split PDF's no-upload test, with the four checks of `add-page-items-and-zip` design decision 10:
  - the exact allowlist, naming `fflate-<hash>.js` and `split-pdf-<hash>.js`;
  - a one-part and a several-part run, each on a fresh page and recorded from the main button to the result, each fetching fflate, with equal sets of paths leaving out `blob:`;
  - a copy of `password.pdf` picked as `qz7report.pdf`, with the full name, the stem `qz7report` and the password as strings no request may carry;
  - fflate plants on its real path: `?x=1` reported only as data in the address, and a POST with a body reported for its method and body;
  - storage and traces after a job, with `rich.pdf`'s "Chapter one" in no request and not in the console

## 8. Screenshots

- [ ] 8.1 Screenshots of `/split-pdf` at 360px and 1280px, in light and dark: empty, pages with no cuts, pages with cuts, working, result, password, damaged; plus pages with cuts at 420px, and at 200% text size, with nothing overflowing
- [ ] 8.2 Measure the text contrast of the "Cut after" toggle, pressed and not, the cut line, and the button to show more pages, in light and dark; each must be at least 4.5 to 1 (3 to 1 for the line)

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line is needed: no dependency is added (check `package.json` is unchanged)
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add Split PDF's hand checks to issue #7, as for Merge PDF: the owner's review of the page text; the parts opened in Chrome, Firefox, Adobe Reader and macOS Preview; the page tried in Firefox, Safari and Edge and on Android Chrome and iOS Safari. The pull request reports Split PDF as not done until they pass
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings
