# Tasks

## 1. Registry entry

- [x] 1.1 Add `itemTurns?: true` to the widget words and the Rotate PDF entry to `src/tools/registry.ts`; the registry test checks catalogue order, and that a tool has at most one of page moves, page turns and a toggle

## 2. Engine

- [x] 2.1 Add `writeTurned(tools, plain, groups)` to `src/engines/plain.ts` (one qpdf call through the argument file with `--rotate=+90/+180/+270:<list>` for each group that has pages and `--object-streams=generate`, then `qpdf --check`; a comment that the lists must not repeat); unit tests in `tests/unit/plain.test.ts` with all three groups, and that the result is no bigger than `pages-500.pdf` itself
- [x] 2.2 Write `src/engines/tools/rotate-pdf.ts`: `pageTurns(pages, turns)` (exported for its test; refusing a page out of range, repeated or out of order, quarters of 0, 4, a fraction or a string, an entry that is not an array of exactly two items, a list longer than the file, `all` out of range, not an object; grouping pages by their final turn in one pass) and `run` through `plainCopy`, `pageTurns` and `writeTurned`, with writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [x] 3.1 Unit test `run` on every file in `tests/fixtures/`, checking each page's turn through qpdf's JSON, resolved through `/Parent` and normalised as PDF.js does (not a multiple of 90 counts as 0, otherwise mod 360): single pages, every page, `mixed.pdf`'s already-turned pages adding to their turn, text unchanged, `rich.pdf`'s bookmarks, link and `note.txt` kept, `tagged.pdf` keeping everything, `password.pdf` with its password and `restricted.pdf` unprotected, nothing turned, damaged files, bad turns, and pages made in the test whose `/Rotate` is 45, -90, 450 or inherited from a `/Pages` node, recording whether each result matches the turned thumbnail; record each outcome in the fixtures README, and that the multilingual file is still missing; `make-large.mjs`'s one page turned by hand

## 4. State and turns

- [x] 4.1 `State.turns` (`null` for nothing turned): `page-turned { page, by }` and `all-turned { by }`, back to `null` on replace, remove and reset, kept through Cancel and failure; `src/widget/turns.ts` with `turnOf`, `turnedCount`, `turnSummary`, `turnCaption`, `turnAnnouncement`, `allAnnouncement`, `turnsBlocked` and `turnsToSend`, and `turnRules` gathering the summary, blocked sentence and option; unit tests for each, including `turnedCount` on 120,000 pages with `all` set

## 5. Page and page text

- [x] 5.1 `PageGrid`: a `turns` prop (`of`, `caption`, `onTurn`; the turn read inside the map, `onTurn` through the stable `actions`) giving each grid cell "Turn left" and "Turn right" stacked full-width, named "Turn page N left/right", no Remove, never unavailable; the caption from `turnCaption` ("Page 3, turned right"), with two lines reserved in cells that turn; the picture and blank paper drawn turned by `turn1`, `turn2` and `turn3` classes, quarter turns swapping the limits to 68 wide and 52 tall before rotating, with no fixed scale and no transition; component tests that a landscape page turned a quarter keeps its full size, that the caption reads "Page 3, turned right", and that rows and Reorder's moves are unchanged
- [x] 5.2 `ToolWorkspace` and `useToolRun`: turning a page and announcing it, "Turn every page left" and "Turn every page right" between the line and the skip link (not for one page), the line above the pages memoised on the turns, the main button unavailable with its tied sentence while nothing will be turned, and `{ turns }` sent to the engine
- [x] 5.3 Write `src/content/tools/rotate-pdf.md`, 250 to 500 words, marked as a draft, covering turning one page or all; that only quarter turns are made, so a crooked scan is not straightened; that everything else in the original file stays in the new one, including hidden text and the document's details (it is not cleaned), and only each page's turn changes; the original file; that the password and restrictions are removed; and that the page forgets the file and the turns when you press Start again or leave the page; check against "Banned patterns"
- [x] 5.4 Name `rotate-pdf` in `page-weight.mjs`; check `check-worker.mjs` finds the engine and keeps `writeTurned` out of the worker file

## 6. End-to-end test

- [x] 6.1 `tests/e2e/rotate-pdf.spec.ts` at 360px and 1280px: turning by keyboard with announcement, caption and focus, turning back, the main button unavailable with nothing turned and usable after a turn, "Turn every page right" with the next batch of a 900-page file drawn turned, turn and check each page's turn in the download (`mixed.pdf`), password, damaged, not-a-PDF, two-file drop, Cancel keeps the turns, engine-load failure, skip link, and the 20,000-page notice with "Turn every page right" and a page's "Turn right" on the generated file blocking nothing for more than 100 ms; the other tools' e2e tests still pass

- [x] 6.2 In `tests/e2e/performance.spec.ts`, with the CPU slowed four times, "Turn every page right" with 500 pages drawn and with 1,000 shown makes no task longer than 100 ms; it failed unbatched (167 ms), so the design now applies the turns to the drawn cells 50 a frame, draws pages that turn in memoised chunks of 50 with a stamp each, and gives grid cells layout containment and `content-visibility: auto`; this test must pass with that, five runs in a row

## 7. No-upload test

- [x] 7.1 Rotate's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate`, `split-pdf`, `merge-pdf`, `extract-pdf-pages`, `delete-pdf-pages` and `rearrange-pdf-pages` were not, `qz7report.pdf`, its stem and the password as secrets; `rich.pdf`'s bookmark titles, attachment name and document title ("Bookmarks, a link and an attachment"), and `tagged.pdf`'s marked strings, as secrets for requests, the console and the page title; storage and traces; and the address with no query and no hash

## 8. Screenshots

- [x] 8.1 Screenshots of `/rotate-pdf` at 360px and 1280px, light and dark: empty, pages as they are (the main button unavailable with "Turn a page to make a new file."), some pages turned (with focus on a button), every page turned, result, password, damaged; check the buttons are stacked and fit a cell at both widths and at 200% text size, and that turned thumbnails stay inside their slots

## 9. Checks and review

- [x] 9.1 No `LICENSES.md` line: no dependency added
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [x] 9.3 Add Rotate PDF's hand checks to issue #7
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the missing multilingual test file, and the agent's choices ("Turn left"/"Turn right" and "Turn every page", the main button waiting for a turn, unlike Reorder's, as an owner question, `-rotated`, "turn" in the words and "rotate" in the name); it does not call the tool done
