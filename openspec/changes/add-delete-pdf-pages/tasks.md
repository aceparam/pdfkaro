# Tasks

## 1. Registry entry

- [ ] 1.1 Add the Delete pages entry to `src/tools/registry.ts` with the kind `drop` added to `ToggleKind`; the registry test checks catalogue order and the new kind

## 2. Engine

- [ ] 2.1 Move `chosenPages`, `pageList` and `callWithArgumentFile` from `extract-pdf-pages.ts` into `src/engines/plain.ts`, and add `keepPages(tools, plain, keep)` there with the structure read, outline update, argument-file write and `qpdf --check`; Extract's `run` calls it, and Extract's tests keep their cases and expectations with only imports changed
- [ ] 2.2 Write `src/engines/tools/delete-pdf-pages.ts`: `pagesLeft` (checked by `chosenPages`, refusing every page) and `run` through `plainCopy` and `keepPages`, with writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 Unit test `pagesLeft` and `run` on every file in `tests/fixtures/`: page order and absent pages through the uncompressed result, `mixed.pdf` shapes, `rich.pdf` page 1 deleted keeping "Chapter two", `note.txt`, the link-free page and no dead bookmark, `tagged.pdf` page 2 deleted keeping its tag text but not its content, `password.pdf` with its password, damaged files, a nested outline, a 3,000-bookmark file, every other page of `pages-500.pdf`, and a refusal of every page; run the `make-large.mjs` file by hand; record each outcome in the fixtures README, and that the multilingual file is still missing

## 4. Worker wiring

- [ ] 4.1 Name `delete-pdf-pages` in `page-weight.mjs`; check `check-worker.mjs` finds the engine and keeps the shared steps out of the worker file

## 5. Page and page text

- [ ] 5.1 Add `drop` to `src/widget/toggles.ts` and give `blocked` the page count; `ToolWorkspace` passes it; unit tests for `drop`'s words (none, one, up to five, more, one left, none left) and announcements (including the one when every page becomes marked), skips, option, blocked (none, some, all), resultPages and drawsCut, and that `take` and `cut-after` are unchanged
- [ ] 5.2 Write `src/content/tools/delete-pdf-pages.md`, 250 to 500 words, marked as a draft; check against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/delete-pdf-pages.spec.ts` at 360px and 1280px: marking by mouse and keyboard, the unavailable button with each sentence only once pages are shown, delete and check the pages left, password, damaged, not-a-PDF, two-file drop, Cancel keeps marks, engine-load failure, skip link, no cut line on a marked page, and the 20,000-page notice with no long task while marking on the generated file; Extract's and Split's e2e tests still pass

## 7. No-upload test

- [ ] 7.1 Delete's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate`, Split, Merge and Extract were not, `qz7report.pdf`, its stem and the password as secrets, and `rich.pdf` and `tagged.pdf` strings as secrets for requests and the console, storage and traces

## 8. Screenshots

- [ ] 8.1 Screenshots of `/delete-pdf-pages` at 360px and 1280px, light and dark: empty, none marked, some marked, every page marked, result, password, damaged; check a marked and an unmarked toggle are told apart at a glance

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add Delete pages' hand checks to issue #7
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the missing multilingual test file, and the start with nothing marked, the refusal of every page and the output name `-pages-deleted` as the agent's choices; it does not call the tool done
