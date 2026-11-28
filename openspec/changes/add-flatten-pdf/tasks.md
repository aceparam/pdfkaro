# Tasks

## 0. The owner's answers

- [ ] 0.1 Record the owner's answers to questions 1 (what flatten covers, a to g) and 2 (fields qpdf cannot draw) in `CLAUDE.md`, "Owner decisions". **Blocking: no code until both are answered.** If an answer differs from the recommendation, update `proposal.md`, the `flatten-pdf` spec delta, `design.md` and this list first (`/opsx:update`), and run stage 1 of the review panel again. Verify: `CLAUDE.md` holds both answers with their dates.

## 1. Registry entry

- [ ] 1.1 Add the `flatten-pdf` entry to `src/tools/registry.ts` as design decision 10 gives it, right after `repair-pdf`, and the `smaller` hub's new description and sentence. Add the optional widget word `unsupportedHeading` to `src/tools/catalogue.ts` and use it in `unreadableNotice` (`src/widget/failures.ts`) when set (design decision 11), every other tool unchanged. Verify: `tests/unit/registry.test.ts` (entry, order, hub words, related slugs exist) and `tests/unit/failures.test.ts` (both headings) pass.

## 2. Engine

- [ ] 2.1 Write `plan` in `src/engines/tools/flatten-pdf.ts` as design decisions 3 and 8 give it: a pure function over `readPages(…, { objects: true })`'s result, with the flattened and set-aside kinds, per-page counting of shared lists, the iterative field walk (depth 32) with inherited keys, the doubt rules, buttons, XFA and the bounds (1,000 a page, 100,000 in all). Verify: the `plan` unit tests of task 3.1.
- [ ] 2.2 Write `loads`, `inspect` and `run` as design decisions 4 to 9 give them, importing only `plain`, `pages`, `qpdf`, `qpdf-json`, `inspect` and `src/widget/option-values`: the first update with set-aside (`/PDFkaroKept`), `/OC` on drawings or wrappers, `/NeedAppearances` when needed and a planted key deleted, in one call with `--flatten-annotations=print --generate-appearances --object-streams=disable` through `callWithArgumentFile` and `cappedWrite`; the second read; the clean-up update (set-aside restored, stray widgets and popups removed, tag pointers taken out by an iterative walk with depth 64) with the final write (`--object-streams=generate`) and `--check`; progress as decision 7. Check and record in `design.md`: that a stream update with a dictionary and no data keeps the data; that a wrapper draws pixel for pixel like its original; qpdf's character tables for `/MacRomanEncoding` and `/StandardEncoding` fonts (widen decision 3 only if exact). Verify: the engine unit tests of task 3.1.
- [ ] 2.3 Stop condition: if any problem in the design's crafted-files table cannot be answered by these steps, or a hostile case of the threats table does not finish in time proportional to its size, stop and take it back to the owner before building further. Verify: recorded in `design.md` either way.

## 3. Engine unit tests

- [ ] 3.1 Write `tests/unit/flatten-pdf.test.ts` and `tests/unit/flatten-helpers.ts` (the in-memory cases) as the design's Tests list them, with timeouts set for the bound tests. Verify: `npm test` passes, and the 10,000-annotation page is refused at read in under one second.
- [ ] 3.2 Add section 19 to `tests/fixtures/make.mjs` making `flatten-kinds.pdf` and `flatten-cannot-draw.pdf` (design decision 14), and describe them in `tests/fixtures/README.md`. Verify: running `make.mjs` twice gives the same bytes for both, and the other unencrypted fixtures are unchanged.
- [ ] 3.3 Run the tool against every file in `tests/fixtures/` and record each outcome in `tests/fixtures/README.md` under "Flatten PDF" (new file, no new file, turned away, damaged, password). Add `flatten-pdf` to an `engine-loads` shard (`qpdf` reading and in the job). Verify: the README table matches the design's fixture table, and the shard passes.
- [ ] 3.4 Measure and record in `design.md`: the job on the 110 MB file, 120,000 pages and 100 pages of 1,000 fields, time and peak memory in Node and in Chromium against the shared ceilings. Verify: the figures are in "Measurements".

## 4. Worker wiring

- [ ] 4.1 Confirm the worker gives the engine `qpdf` in both steps, that `[]` reaches the page as `noSmaller`, `unsupported` from `inspect` as the tool's notice with `unsupportedHeading`, and `OutputLimit` as `output-limit`. Verify: `tests/unit/engines-match-registry.test.ts` and `client.test.ts` pass, and the e2e test of 6.1.
- [ ] 4.2 Build, then confirm with `npm run check:worker` that `flatten-pdf-*.js` is its own file loaded late and that no new shared built file appears; if one does, name it in the pull request and add it to the other tools' expectations. Verify: `check:worker` passes.

## 5. Page and page text

- [ ] 5.1 Check the built `/flatten-pdf` page: title, description, heading, sentence, the row once `form.pdf` is read, the main button, the status line. Verify: the e2e test in 6.1.
- [ ] 5.2 Write `src/content/tools/flatten-pdf.md` as design decision 12 gives it, 250 to 500 words, marked as a draft. Add the Privacy draft sentence (design decision 13) to `src/pages/privacy.astro` and its check to `tests/unit/privacy-page.test.ts`. Verify: `npm test` and `npm run check:seo` pass; a word count is between 250 and 500.

## 6. End-to-end test

- [ ] 6.1 Write `tests/e2e/flatten-pdf.spec.ts`, importing `test` from `tests/e2e/fixtures.ts`, at 360px and 1280px: the page; "Getting ready"; two files dropped; not a PDF; `form.pdf` listed and flattened with the result notes and a downloaded file with no form; `password.pdf` with a wrong and the right password; `damaged-xref.pdf` with the Repair link; `flatten-cannot-draw.pdf` turned away with its heading and advice; `text.pdf` giving no new file; Cancel; keyboard only; the status announcements. Verify: `npm run e2e -- --trace off tests/e2e/flatten-pdf.spec.ts` passes.
- [ ] 6.2 Add "Flatten PDF: flattening a 500-page file of 50 fields a page blocks the page for no more than 100 ms at a time" to `tests/e2e/performance.spec.ts`. Verify: it passes five times in a row in Chromium.

## 7. No-upload and uniform-requests tests

- [ ] 7.1 Write the no-upload tests in the same spec: `qz7form.pdf` (a protected form with `SECRET-` field names, values, a note, a link and a bookmark) flattened with its password, a file turned away and one with nothing to flatten; and add `/flatten-pdf-/` to other tools' forbidden lists. Verify: the spec and every other tool's no-upload test pass.
- [ ] 7.2 Add `/flatten-pdf` to `tests/e2e/uniform-requests.spec.ts` and `tool-files.ts` with `form.pdf`, `flatten-kinds.pdf`, `text.pdf` (`expect: 'no-file'`), `flatten-cannot-draw.pdf` and a failing job. Verify: the spec passes.

## 8. Screenshots

- [ ] 8.1 Take screenshots of `/flatten-pdf` at 360px and 1280px, light and dark, of: empty; a file read; password field; working; result with its notes; nothing to flatten; turned away; damaged. Check each against "Banned patterns" in `SPEC.md`. Verify: the screenshots are attached to the pull request.

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: confirm no new line is needed (no dependency added). Verify: `git diff LICENSES.md` is empty.
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, `check:csp`, `check:seo`, end-to-end tests, `npm audit` and `npm run spec`. Verify: each passes.
- [ ] 9.3 Write this tool's hand checks for issue #7 (`issue-7-hand-checks.md` in this change): flattened `form.pdf`, `flatten-kinds.pdf` and a real filled form opened in Chrome, Firefox, Adobe Reader and macOS Preview (values in place; hidden layer still hidden; links working; attachment icon opening its file; no form left); printing; browsers and phones; keyboard and screen reader, including a tagged file; the multilingual file. Verify: the file exists and lists each check.
- [ ] 9.4 When the pull request opens, name in it: the measurements, the owner's answers to questions 1 and 2, questions 3 to 9 with their defaults, the `unsupportedHeading` rider, the instance-count difference, and the hand checks waiting in issue #7. Verify: the pull request description holds each.
- [ ] 9.5 Run the review panel (see the review-panel skill), stage 2, and resolve its findings. Verify: the panel's verdicts are in the pull request description, using `.github/pull_request_template.md`.

## Workflow follow-up

- After the pull request is merged, run `/opsx:archive`, add the entry to "Where the project stands" in `CLAUDE.md`, and add questions 3 to 9 to "Questions waiting for the owner".
