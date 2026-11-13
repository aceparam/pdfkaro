# Tasks

## 1. Registry entry

- [x] 1.1 Add the Delete pages entry to `src/tools/registry.ts` with the kind `drop` added to `ToggleKind`; the registry test checks catalogue order and the new kind

## 2. Engine

- [x] 2.1 Move `chosenPages`, `pageList` and `callWithArgumentFile` from `extract-pdf-pages.ts` into `src/engines/plain.ts`, and add `keepPages(tools, plain, keep)` there with the structure read, outline update, argument-file write and `qpdf --check`; Extract's `run` calls it, building `new Set(keep)` once; Extract's tests keep their cases and expectations with only imports changed, and the moved functions' cases move to `tests/unit/plain.test.ts`; `chosenPages` says "No pages were given."; update the comment at the top of `plain.ts`
- [x] 2.2 Write `src/engines/tools/delete-pdf-pages.ts`: `pagesLeft` (checked by `chosenPages`, refusing every page, one pass over the pages) and `run` through `plainCopy` and `keepPages`, with writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [x] 3.1 Unit test `pagesLeft` and `run` on every file in `tests/fixtures/`: page order and absent pages through the uncompressed result, `mixed.pdf` shapes, `rich.pdf` page 1 deleted keeping "Chapter two", `note.txt`, the link-free page and no dead bookmark, `tagged.pdf` page 2 deleted keeping `SECRET-ALT-TEXT`, `SECRET-ACTUAL-TEXT`, `SECRET-DEST-NAME` and `SECRET-THREAD-TITLE` while `SECRET-PAGE-TWO-TEXT` and the field `secretfield` are gone, `password.pdf` with its password, damaged files, a nested outline, a 3,000-bookmark file, every other page of `pages-500.pdf`, and a refusal of every page; a 500-page file with 3,000 bookmarks keeping most of its pages; the `make-large.mjs` file is not run, because it has one page and Delete refuses any one-page file (Extract's hand run covers reading it); record in the fixtures README that every other page of the 120,000-page file did not finish within 10 minutes at stage 1; record each outcome in the fixtures README, and that the multilingual file is still missing

## 4. Worker wiring

- [x] 4.1 Name `delete-pdf-pages` in `page-weight.mjs`; make `check-worker.mjs` scan the sentences of `plain.ts` and `outline.ts` too, and check it finds the engine and keeps the shared steps out of the worker file; if the shared chunk is renamed, name it exactly in `page-weight.mjs`

## 5. Page and page text

- [x] 5.1 Add `drop` to `src/widget/toggles.ts` and give `blocked` the page count; `ToolWorkspace` passes it; unit tests for `drop`'s words (none, one, up to five, more, one left, none left) and announcements (including the one when every page becomes marked), skips, option, blocked (none, some, all), resultPages and drawsCut, and that `take` and `cut-after` are unchanged
- [x] 5.2 Write `src/content/tools/delete-pdf-pages.md`, 250 to 500 words, marked as a draft; its answer on what stays from deleted pages says plainly that deleting a page does not remove the document-wide parts, and to check the new file before sharing it; check against "Banned patterns"

## 6. End-to-end test

- [x] 6.1 `tests/e2e/delete-pdf-pages.spec.ts` at 360px and 1280px: marking by mouse and keyboard, the unavailable button with each sentence only once pages are shown, delete and check the pages left, password, damaged, not-a-PDF, two-file drop, Cancel keeps marks, engine-load failure, skip link, no cut line on a marked page, and the 20,000-page notice with no long task while marking on the generated file; Extract's and Split's e2e tests still pass

## 7. No-upload test

- [x] 7.1 Delete's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate`, Split, Merge and Extract were not, `qz7report.pdf`, its stem and the password as secrets, and, in separate runs, `rich.pdf`'s bookmark titles and attachment name and `tagged.pdf`'s marked strings as secrets for requests and the console; storage and traces

## 8. Screenshots

- [x] 8.1 Screenshots of `/delete-pdf-pages` at 360px and 1280px, light and dark: empty, none marked, some marked, every page marked, result, password, damaged; check a marked and an unmarked toggle are told apart at a glance

## 8a. Review fix (stage 2)

- [x] 8a.1 Add a tagged, filled field, a tagged note and a tagged web link to page 2 of `tagged.pdf`; unit test that Delete and Extract keep them; say so in both tools' page text, notes shown with the result and specs; retake Delete's screenshots, and take Extract's result screen (`extract-result-*.png`) into this change

## 9. Checks and review

- [x] 9.1 No `LICENSES.md` line: no dependency added
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [x] 9.3 Add Delete pages' hand checks to issue #7
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the missing multilingual test file, and the start with nothing marked, the refusal of every page and the output name `-pages-deleted` as the agent's choices; it does not call the tool done
