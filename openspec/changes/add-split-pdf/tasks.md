# Tasks

## 1. Registry entry

- [ ] 1.1 Record the owner's decisions of 12 Nov 2026 under "Owner decisions" in `CLAUDE.md`: bookmarks per part, attachments with the first part, no password or restrictions on parts, and no next steps for a zip result
- [ ] 1.2 Add the Split PDF entry to `src/tools/registry.ts` and the optional `itemToggle` and `memoryAdvice` words, with the failure sentence using `memoryAdvice` when set; the registry test checks catalogue order, that `itemToggle` is set only with `items: 'pages'`, and that `related` names only published tools

## 2. Engine

- [ ] 2.1 Write `parts(pages, cuts)` in `src/engines/tools/split-pdf.ts`, refusing cuts that are not sorted, unique whole numbers from 1 to `pages - 1`
- [ ] 2.2 Prove `--update-from-json` in this qpdf build by rewriting the outline of a part of `rich.pdf`; if it cannot be made to work, stop and ask the owner (design, Risks)
- [ ] 2.3 Write `keptOutline(tree)`, with a depth limit of 64 and a visited set, and the step that writes the kept outline back
- [ ] 2.4 Write `run`, with outline JSON and titles never put in a log, an error message or a failure sentence: one qpdf call per part with `--decrypt`, attachments removed from parts after the first, the outline step, `qpdf --check` on each part, and progress per file; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 Unit test `parts` and `keptOutline` (flat, nested, a dropped parent with kept children, nothing kept, too deep, a cycle)
- [ ] 3.2 Unit test `run` on every file in `tests/fixtures/`: parts and their page counts, `qpdf --check`, links and form fields kept, `rich.pdf`'s bookmarks and attachment per the owner's decisions, `password.pdf`'s parts with no encryption, damaged files failing, progress per file; record each outcome in the fixtures README; also run it by hand on the file from `make-large.mjs` and on the file from `make-many-pages.mjs` with two cuts, and record those outcomes
- [ ] 3.3 Add `tests/fixtures/make-many-pages.mjs`, which writes a 120,000-page file outside the repo, as `make-large.mjs` does

## 4. Worker wiring

- [ ] 4.1 Send `options: { cuts }` from `useToolRun` when the tool has a toggle word; name `split-pdf-<hash>.js` in `page-weight.mjs`, and check `check-worker.mjs` finds it as its own late-loaded file

## 5. Page and page text

- [ ] 5.1 Keep the cuts in the reducer (`marks`): toggled by page, cleared on remove, replace and Start again, kept through Cancel and failure; unit test
- [ ] 5.2 Add `cutSummary(pages, cuts)` to `src/widget/format.ts`, with unit tests for each wording in design decision 3, including clearing the only cut, more than five cuts, and thousands separators
- [ ] 5.3 `PageGrid`: the optional per-item toggle (`aria-pressed`, at least 44px, the cell's full width with wrapping text, named "Cut after page N", none on the last page, pressed shown by a 2px border, bold text and a 2px line on the cell, never filled); `ToolWorkspace`: the summary line, the toggle announcements, a single output's page count from the input for a page tool, and the Working line ("Starting", then "File N of M", then the writing label while zipping, with the worker posting writing progress before it zips); component render tests
- [ ] 5.4 Batches of 500: a `limit` argument to `gridItems`, the "Show pages 501 to 1,000" button in real units, focus moving to the first new page's control and the count announced; unit and render tests
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
