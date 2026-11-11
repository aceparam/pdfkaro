# Tasks

Depends on `add-tool-widget` being merged.

## 1. Registry

- [x] 1.1 Add the Merge PDF widget words to its registry entry, with a unit test

## 2. Test set

- [x] 2.1 Add `tests/fixtures/make.mjs` and the files it makes, and `make-large.mjs`
- [x] 2.2 Write `tests/fixtures/README.md`: each file, what each engine is expected to do with it, and that the multilingual file is missing

## 3. Engine

- [x] 3.1 Add `src/engines/qpdf.ts`, add qpdf to `EngineTools` in the worker, and add `src/engines/inspect.ts` and `src/engines/tools/merge-pdf.ts`
- [x] 3.2 Unit test both against every fixture; check every result with qpdf's `--check`, its page count and its page order, and that a result with a protected first file is not encrypted
- [x] 3.3 Record the outcome for each fixture in the README
- [x] 3.4 Add the unit test that every browser tool in the registry has exactly one engine file, and every engine file a registry tool

## 4. Page

- [x] 4.1 Mount `ToolWidget` on the tool page
- [x] 4.2 Draft `src/content/tools/merge-pdf.md`, 250 to 500 words, marked for the owner, covering bookmarks and the merged file having no password

## 5. End-to-end tests

- [x] 5.1 Every path listed in design decision 4, at 360px and 1280px
- [x] 5.2 The no-upload test, its control test, and the storage and traces check
- [x] 5.4 Start again and leaving the page leave no file, name or download link behind
- [x] 5.3 The responsiveness test with the 500-page file

## 6. Checks and housekeeping

- [x] 6.1a Add a build check that no engine's code lands in the worker file, and show it failing when an engine is imported eagerly (moved from `add-tool-widget` task 1.4)
- [x] 6.1 Name the late-loading files in `scripts/page-weight.mjs`; measure and record the tool page before a pick
- [x] 6.2 Run the file over 100 MB by hand and record the outcome
- [x] 6.3 Add the two dependencies to `LICENSES.md`
- [x] 6.4 Update the design screens in `design/screens/` for the progress words and the damaged and failed states
- [x] 6.5 Update "Where the project stands" in `CLAUDE.md`; do not claim the Phase 0 gate; name thumbnails as the remaining Phase 0 work
- [x] 6.6 Take screenshots of each state at 360px and 1280px, light and dark, and check each against "Banned patterns"
- [x] 6.7 Run `npm audit` and `openspec validate --all --strict`
- [ ] 6.8 Run the review panel (see the review-panel skill) and resolve its findings
