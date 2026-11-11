# Tasks

Depends on `add-tool-widget` being merged.

## 1. Registry

- [ ] 1.1 Add the Merge PDF widget words to its registry entry, with a unit test

## 2. Test set

- [ ] 2.1 Add `tests/fixtures/make.mjs` and the files it makes, and `make-large.mjs`
- [ ] 2.2 Write `tests/fixtures/README.md`: each file, what each engine is expected to do with it, and that the multilingual file is missing

## 3. Engine

- [ ] 3.1 Add `src/engines/qpdf.ts`, add qpdf to `EngineTools` in the worker, and add `src/engines/inspect.ts` and `src/engines/tools/merge-pdf.ts`
- [ ] 3.2 Unit test both against every fixture; check every result with qpdf's `--check`, its page count and its page order, and that a result with a protected first file is not encrypted
- [ ] 3.3 Record the outcome for each fixture in the README

## 4. Page

- [ ] 4.1 Mount `ToolWidget` on the tool page
- [ ] 4.2 Draft `src/content/tools/merge-pdf.md`, 250 to 500 words, marked for the owner, covering bookmarks and the merged file having no password

## 5. End-to-end tests

- [ ] 5.1 Every path listed in design decision 4, at 360px and 1280px
- [ ] 5.2 The no-upload test, its control test, and the storage and traces check
- [ ] 5.4 Start again and leaving the page leave no file, name or download link behind
- [ ] 5.3 The responsiveness test with the 500-page file

## 6. Checks and housekeeping

- [ ] 6.1 Name the late-loading files in `scripts/page-weight.mjs`; measure and record the tool page before a pick
- [ ] 6.2 Run the file over 100 MB by hand and record the outcome
- [ ] 6.3 Add the two dependencies to `LICENSES.md`
- [ ] 6.4 Update the design screens in `design/screens/` for the progress words and the damaged and failed states
- [ ] 6.5 Update "Where the project stands" in `CLAUDE.md`; do not claim the Phase 0 gate; name thumbnails as the remaining Phase 0 work
- [ ] 6.6 Take screenshots of each state at 360px and 1280px, light and dark, and check each against "Banned patterns"
- [ ] 6.7 Run `npm audit` and `openspec validate --all --strict`
- [ ] 6.8 Run the review panel (see the review-panel skill) and resolve its findings
