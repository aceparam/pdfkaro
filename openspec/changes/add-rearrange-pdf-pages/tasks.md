# Tasks

## 1. Registry entry

- [ ] 1.1 Add the Reorder pages entry to `src/tools/registry.ts` (`items: 'pages'`, `itemControls: true`, no toggle); the registry test checks catalogue order, and that no tool has both page moves and a toggle

## 2. Engine

- [ ] 2.1 Add `pageOrder(pages, order)` to `src/engines/plain.ts` (length checked first, a `Uint8Array` of pages seen, a copy returned) and an `everyPage` option to `keepPages` that skips the structure read; update the comments on `keepPages` and `callWithArgumentFile`; unit tests in `tests/unit/plain.test.ts`, refusing a missing, repeated, extra or out-of-range page, a hole (`[1, , 3]`), `NaN`, `1.5`, `'1'` and the wrong length
- [ ] 2.2 Write `src/engines/tools/rearrange-pdf-pages.ts`: `run` through `plainCopy`, `pageOrder` and `keepPages`, with writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [ ] 3.1 Unit test `run` on every file in `tests/fixtures/`: page order through the uncompressed result, the unchanged order, `rich.pdf` swapped with each bookmark pointing to its chapter's page, the outline's own order unchanged, and `note.txt` and the link kept, `mixed.pdf` shapes following their pages, `tagged.pdf` keeping everything, a fully reversed order of `pages-500.pdf` through the argument file with its page order checked, a file whose structure read would fail still reordered (showing `everyPage` skips it), `password.pdf` with its password, `restricted.pdf`, damaged files, and refusals of orders that leave out, repeat or add a page; record each outcome in the fixtures README, and that the multilingual file is still missing (`make-large.mjs` has one page, so its only order is unchanged; run it by hand)

## 4. State and items

- [ ] 4.1 `State.order`: made on read for a tool whose page items move, cleared on replace, remove and reset, kept through Cancel and failure; a `page-moved` action; `gridItems` from the order; `src/widget/order.ts` with `orderSummary`; unit tests for each, and that Merge's file moves and the other page tools are unchanged

## 5. Page and page text

- [ ] 5.1 `PageGrid`: with controls in the grid, "Up" and "Down" named "Move page N up/down", no Remove, ends unavailable by the file's page count; rows unchanged; component tests for both
- [ ] 5.2 `ToolWorkspace` and `useToolRun`: page moves (showing the next batch when a page moves past those shown), the announcement with the place in the whole file, the line above the pages, and `{ order }` sent to the engine
- [ ] 5.3 Write `src/content/tools/rearrange-pdf-pages.md`, 250 to 500 words, marked as a draft; check against "Banned patterns"
- [ ] 5.4 Name `rearrange-pdf-pages` in `page-weight.mjs`; check `check-worker.mjs` finds the engine

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/rearrange-pdf-pages.spec.ts` at 360px and 1280px: moving by keyboard with announcement and focus, drag, unavailable ends, moving past the pages shown, reorder and check the download's page order (`mixed.pdf` sizes), password, damaged, not-a-PDF, two-file drop, Cancel keeps the order, engine-load failure, skip link, and the 20,000-page notice with a move on the generated file blocking nothing for more than 100 ms; Merge's, Split's, Extract's and Delete's e2e tests still pass

## 7. No-upload test

- [ ] 7.1 Reorder's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate`, Split, Merge, Extract and Delete were not, `qz7report.pdf`, its stem and the password as secrets, and `rich.pdf`'s bookmark titles and attachment name as secrets for requests and the console; storage and traces

## 8. Screenshots

- [ ] 8.1 Screenshots of `/rearrange-pdf-pages` at 360px and 1280px, light and dark: empty, pages in original order, pages moved (with focus on a move button), result, password, damaged; check the buttons fit a cell at 360px

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add Reorder pages' hand checks to issue #7, including the many-taps limit on a phone
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the missing multilingual test file, the many-taps limit, and the agent's choices ("Up"/"Down" labels, the button working with the order unchanged, `-reordered`, "Your file stays on your device." ahead of the cross-tool fix, drag as a drop onto a cell with no drop line, the bookmark list and tag reading order kept); it asks the owner whether a tagged file's reading order should follow the new page order; it does not call the tool done
