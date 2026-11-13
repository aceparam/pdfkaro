# Tasks

## 1. Registry entry

- [x] 1.1 Record the owner's decisions of 13 Nov 2026 in `CLAUDE.md`; add the Extract pages entry to `src/tools/registry.ts` with the `ToggleKind` type and the kind `take`; the registry test checks catalogue order and the new kind

## 2. Engine

- [x] 2.1 Move the outline and attachment code from `split-pdf.ts` into `src/engines/outline.ts`, with `keptOutline(outline, keep)`, `pageRange` and `outlineUpdate(structure, keep, { dropAttachments })`, and the plain copy, page count, fresh instance and password steps into `src/engines/plain.ts`; Split PDF's tests keep the same cases and expectations, with only imports and call signatures changed
- [x] 2.2 Write `src/engines/tools/extract-pdf-pages.ts`: `chosenPages`, `pageList`, and `run` through `plainCopy`, one write through an argument file (`qpdf @/args`) with the update and the page list, `qpdf --check`, and writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [x] 3.1 Add `tagged.pdf` to `make.mjs` (on page 2: a tag with `/Alt` and `/ActualText` text, a named destination, a titled reading thread and a form field); unit test `chosenPages`, `pageList`, `plainCopy`, `keptOutline` with a set of pages, and `run` on every file in `tests/fixtures/` (with `rich.pdf` page 2, `password.pdf` with its password, damaged files, a 3,000-bookmark file, a page list over 64 KB from repeated pages of `pages-500.pdf` written through the argument-file step directly (below `chosenPages`, which refuses repeats), and `tagged.pdf` page 1 keeping page 2's tag text but not its content); run the `make-large.mjs` file by hand; record each outcome in the fixtures README, and that the multilingual file is still missing

## 4. Worker wiring

- [x] 4.1 Send the toggle kind's option and result page count from `useToolRun` through `toggleRules`; name `extract-pdf-pages` and each new shared chunk, as `dist/_astro` actually holds them, in `page-weight.mjs`, check `check-worker.mjs` finds the engine and keeps the shared chunks out of the worker file, and add the shared chunks to Split PDF's no-upload allowlist

## 5. Page and page text

- [x] 5.1 Add `src/widget/toggles.ts` with `cut-after` (wrapping `cuts.ts`) and `take`, and `toggledMarks`, used by the reducer; `canRun(state, minFiles, ready)`; move the number, list and page-list words into `format.ts`; add `isManyPages`; unit tests for both kinds' words, skips, options, blocked, resultPages and drawsCut, and for `isManyPages`
- [x] 5.2 `ToolWorkspace` and `PageGrid`: ask `toggleRules` for the summary, announcements, skipped pages and the blocked sentence (tied only once pages are shown), draw the cut line only when `drawsCut`, and show the 20,000-page notice; component tests that a pressed `take` toggle draws no line and Split's still does
- [x] 5.3 Write `src/content/tools/extract-pdf-pages.md`, 250 to 500 words, marked as a draft; check against "Banned patterns"

## 6. End-to-end test

- [x] 6.1 `tests/e2e/extract-pdf-pages.spec.ts` at 360px and 1280px: choosing by mouse and keyboard, the unavailable button and its sentence only once pages are shown, extract and check the pages, password, damaged, not-a-PDF, two-file drop, Cancel keeps choices, engine-load failure, skip link, no cut line on a chosen page, and the 20,000-page notice on the generated file, on Extract and on Split; Split PDF's e2e tests still pass

## 7. No-upload test

- [x] 7.1 Extract's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate`, Split and Merge were not, `qz7report.pdf`, its stem and the password as secrets, `rich.pdf` page 2 with its bookmark titles and attachment name as secrets for requests and the console, storage and traces

## 8. Screenshots

- [x] 8.1 Screenshots of `/extract-pdf-pages` at 360px and 1280px, light and dark: empty, pages with none chosen, pages with some chosen, result, password, damaged; check a pressed and an unpressed toggle are told apart at a glance in all four and the pressed border is at least 3 to 1, or else switch to a native checkbox before stage 2

## 9. Checks and review

- [x] 9.1 No `LICENSES.md` line: no dependency added
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [x] 9.3 Add Extract pages' hand checks to issue #7
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the many-taps limit on a phone, and the start with no pages chosen (the owner's decision)
