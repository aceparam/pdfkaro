# Tasks

## 1. Registry entry

- [ ] 1.1 Add the Extract pages entry to `src/tools/registry.ts`, the toggle kind `take`, and `resultPages: 'chosen'`; the registry test checks catalogue order and the new kind

## 2. Engine

- [ ] 2.1 Move the outline and attachment code from `split-pdf.ts` into `src/engines/outline.ts`, with `keptOutline(outline, keep)` and `outlineUpdate(structure, keep, { dropAttachments })`; Split PDF's tests pass unchanged apart from imports
- [ ] 2.2 Write `src/engines/tools/extract-pdf-pages.ts`: `chosenPages`, and `run` on a plain decrypted copy, one write with the update and the page list as ranges, `qpdf --check`, progress; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 Unit test `chosenPages`, `keptOutline` with a set of pages, and `run` on every file in `tests/fixtures/` (with `rich.pdf` page 2, `password.pdf` with its password, damaged files, and a 3,000-bookmark file); record each outcome in the fixtures README

## 4. Worker wiring

- [ ] 4.1 Send the toggle kind's option from `useToolRun` through `toggleRules`; name `extract-pdf-pages-<hash>.js` in `page-weight.mjs`, and check `check-worker.mjs` finds it

## 5. Page and page text

- [ ] 5.1 Add `src/widget/toggles.ts` with `cut-after` (wrapping `cuts.ts`) and `take`, and `toggledMarks`; `canRun` uses the kind's `ready`; unit tests for both kinds' words, skips, options and readiness
- [ ] 5.2 `ToolWorkspace`: ask `toggleRules` for the summary, announcements, skipped pages and the tied sentence when not ready; `resultPages: 'chosen'`; component tests
- [ ] 5.3 Write `src/content/tools/extract-pdf-pages.md`, 250 to 500 words, marked as a draft; check against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/extract-pdf-pages.spec.ts` at 360px and 1280px: choosing by mouse and keyboard, the unavailable button and its sentence, extract and check the pages, password, damaged, not-a-PDF, two-file drop, Cancel keeps choices, engine-load failure, skip link; Split PDF's e2e tests still pass

## 7. No-upload test

- [ ] 7.1 Extract's no-upload test with its exact allowlist (no `fflate`), `qz7report.pdf`, its stem and the password as secrets, storage and traces

## 8. Screenshots

- [ ] 8.1 Screenshots of `/extract-pdf-pages` at 360px and 1280px, light and dark: empty, pages with none chosen, pages with some chosen, result, password, damaged; contrast of the toggle pressed and not

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add Extract pages' hand checks to issue #7
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings
