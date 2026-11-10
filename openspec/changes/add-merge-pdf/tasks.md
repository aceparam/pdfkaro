# Tasks

## 1. Registry

- [ ] 1.1 Add the widget words to the tool type and to the Merge PDF entry, with a unit test

## 2. Test files

- [ ] 2.1 Add `tests/fixtures/make.mjs` and the files it makes, and `make-large.mjs` for a file over 100 MB that is not committed
- [ ] 2.2 Record in `tests/fixtures/README.md` what each file is, and that the multilingual file is missing

## 3. Engine

- [ ] 3.1 Add `src/engines/types.ts` and `src/engines/qpdf.ts`
- [ ] 3.2 Add `src/engines/inspect.ts`
- [ ] 3.3 Add `src/engines/tools/merge-pdf.ts`
- [ ] 3.4 Unit test `inspect` and the merge engine against every file in `tests/fixtures/`, and check every result with qpdf's own check
- [ ] 3.5 Add the lint rule that engines use no DOM and that components and pages do not import engines

## 4. Worker

- [ ] 4.1 Add `src/workers/messages.ts`, `tool.worker.ts` and `client.ts`, with typed messages, transferred bytes, progress and cancel

## 5. Widget logic

- [ ] 5.1 Add `src/widget/state.ts` and `src/widget/format.ts`, with unit tests
- [ ] 5.2 Add `src/hooks/useToolRun.ts` and `src/hooks/useFileDrop.ts`

## 6. Components and page

- [ ] 6.1 Add `FilePicker`, `PageGrid`, `Result`, `ProgressBar`, `Notice` and `PasswordField`
- [ ] 6.2 Add `ToolWidget` and `ToolWorkspace`
- [ ] 6.3 Mount the widget in `src/pages/[slug].astro`
- [ ] 6.4 Draft the text below the tool in `src/content/tools/merge-pdf.md`, 250 to 500 words, marked for the owner

## 7. End-to-end tests

- [ ] 7.1 The whole job at 360px and 1280px, with the keyboard, checking the saved file
- [ ] 7.2 The password path, the damaged path, "Start again", and a file that is not a PDF
- [ ] 7.3 The no-upload test, and that nothing but the picker loads before a pick

## 8. Checks and housekeeping

- [ ] 8.1 Name the late-loading files in `scripts/page-weight.mjs` and record the tool page's weight before a pick
- [ ] 8.2 Add the two dependencies to `LICENSES.md`
- [ ] 8.3 Update "Where the project stands" and the questions for the owner in `CLAUDE.md`
- [ ] 8.4 Take screenshots of each state at 360px and 1280px, in light and dark mode, and check each against "Banned patterns"
- [ ] 8.5 Run `npm audit` and `openspec validate --all --strict`
- [ ] 8.6 Run the review panel (see the review-panel skill) and resolve its findings
