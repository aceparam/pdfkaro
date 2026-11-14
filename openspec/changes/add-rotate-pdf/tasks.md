# Tasks

## 1. Registry entry

- [ ] 1.1 Add `itemTurns?: true` to the widget words and the Rotate PDF entry to `src/tools/registry.ts`; the registry test checks catalogue order, and that a tool has at most one of page moves, page turns and a toggle

## 2. Engine

- [ ] 2.1 Add `writeTurned(tools, plain, groups)` to `src/engines/plain.ts` (one qpdf call through the argument file with `--rotate=+90/+180/+270:<list>` for each group that has pages, then `qpdf --check`); unit tests in `tests/unit/plain.test.ts`
- [ ] 2.2 Write `src/engines/tools/rotate-pdf.ts`: `pageTurns(pages, turns)` (exported for its test; refusing a page out of range, repeated or out of order, quarters of 0, 4, a fraction or a string, a list longer than the file, `all` out of range, not an object; grouping pages by their final turn in one pass) and `run` through `plainCopy`, `pageTurns` and `writeTurned`, with writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 Unit test `run` on every file in `tests/fixtures/`, checking each page's `/Rotate` through qpdf's JSON: single pages, every page, `mixed.pdf`'s already-turned pages adding to their turn, text unchanged, `rich.pdf`'s bookmarks, link and `note.txt` kept, `tagged.pdf` keeping everything, `password.pdf` with its password and `restricted.pdf` unprotected, nothing turned, damaged files, and bad turns; record each outcome in the fixtures README, and that the multilingual file is still missing; `make-large.mjs`'s one page turned by hand

## 4. State and turns

- [ ] 4.1 `State.turns` (`null` for nothing turned): `page-turned { page, by }` and `all-turned { by }`, back to `null` on replace, remove and reset, kept through Cancel and failure; `src/widget/turns.ts` with `turnOf`, `turnedCount`, `turnSummary`, `turnAnnouncement`, `allAnnouncement` and `turnsToSend`; unit tests for each, including `turnedCount` on 120,000 pages with `all` set

## 5. Page and page text

- [ ] 5.1 `PageGrid`: a `turns` prop giving each grid cell "Left" and "Right" stacked full-width, named "Turn page N left/right", no Remove, never unavailable; the picture (and blank paper) drawn turned, scaled to fit the slot for a quarter turn; component tests
- [ ] 5.2 `ToolWorkspace` and `useToolRun`: turning a page and announcing it, "Turn all left" and "Turn all right" above the pages, the line above the pages memoised on the turns, and `{ turns }` sent to the engine
- [ ] 5.3 Write `src/content/tools/rotate-pdf.md`, 250 to 500 words, marked as a draft, covering turning one page or all, that nothing else changes, the original file, passwords, and that the page forgets the file and the turns; check against "Banned patterns"
- [ ] 5.4 Name `rotate-pdf` in `page-weight.mjs`; check `check-worker.mjs` finds the engine and keeps `writeTurned` out of the worker file

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/rotate-pdf.spec.ts` at 360px and 1280px: turning by keyboard with announcement and focus, turning back, "Turn all right" with the next batch of a 900-page file drawn turned, turn and check each page's turn in the download (`mixed.pdf`), password, damaged, not-a-PDF, two-file drop, Cancel keeps the turns, engine-load failure, skip link, and the 20,000-page notice with "Turn all right" and a page's "Right" on the generated file blocking nothing for more than 100 ms; the other tools' e2e tests still pass

## 7. No-upload test

- [ ] 7.1 Rotate's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate` and the other engines were not, `qz7report.pdf`, its stem and the password as secrets; `rich.pdf`'s bookmark titles and attachment name, and `tagged.pdf`'s marked strings, as secrets for requests and the console; storage and traces; and the address with no query and no hash

## 8. Screenshots

- [ ] 8.1 Screenshots of `/rotate-pdf` at 360px and 1280px, light and dark: empty, pages as they are, some pages turned (with focus on a button), every page turned, result, password, damaged; check the buttons are stacked and fit a cell at both widths and at 200% text size, and that turned thumbnails stay inside their slots

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add Rotate PDF's hand checks to issue #7
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the missing multilingual test file, and the agent's choices ("Left"/"Right" and "Turn all", the button working with nothing turned, `-rotated`, "turn" in the words and "rotate" in the name); it does not call the tool done
