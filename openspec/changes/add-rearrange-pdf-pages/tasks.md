# Tasks

## 1. Registry entry

- [x] 1.1 Add the Reorder pages entry to `src/tools/registry.ts` (`items: 'pages'`, `itemControls: true`, no toggle); the registry test checks catalogue order, and that no tool has both page moves and a toggle

## 2. Engine

- [x] 2.1 Split `writePages(tools, plain, list, update?)` out of `keepPages` in `src/engines/plain.ts` (write the update if given, write the pages through the argument file, `qpdf --check`); `keepPages` calls it; update the comments on `writePages`, `keepPages` and `callWithArgumentFile` to say a list may be in any order; Extract's and Delete's tests pass unchanged
- [x] 2.2 Write `src/engines/tools/rearrange-pdf-pages.ts`: `pageOrder(pages, order)` (exported for its test; length checked first, a `Uint8Array` of pages seen, a copy returned, refusing a missing, repeated, extra or out-of-range page, a hole, `NaN`, `1.5`, `'1'` and the wrong length) and `run` through `plainCopy`, `pageOrder` and `writePages` with no update, with writing progress at 0 and 100; `inspect` is `inspectPdf`

## 3. Engine unit tests

- [x] 3.1 Unit test `run` on every file in `tests/fixtures/`: page order through the uncompressed result, the unchanged order, `rich.pdf` swapped with each bookmark pointing to its chapter's page, the outline's own order unchanged, and `note.txt` and the link kept, `mixed.pdf` shapes following their pages, `tagged.pdf` keeping everything, a fully reversed order of `pages-500.pdf` through the argument file with its page order checked, the outline coming out unchanged for a bookmark with no destination, the 100-level `deepOutline` and the outline-as-catalog file, `password.pdf` with its password, `restricted.pdf`, damaged files, and refusals of orders that leave out, repeat or add a page; record each outcome in the fixtures README, and that the multilingual file is still missing (`make-large.mjs` has one page, so its only order is unchanged; run it by hand)

## 4. State and items

- [x] 4.1 `State.order` (`null` for the original order, for every tool): a `page-moved { page, to }` action that builds `1..pages` on the first move, clamps, and raises `shown` by a batch when the page moves past those shown; back to `null` on replace, remove and reset, kept through Cancel and failure; `gridItems` and `shownItems` from the order; `src/widget/order.ts` with `orderSummary(order, pages)`; unit tests for each, and that Merge's file moves and the other page tools are unchanged

## 5. Page and page text

- [x] 5.1 `PageGrid`: with controls in the grid, "Earlier" and "Later" stacked full-width in each cell, named "Move page N earlier/later", no Remove; a `total` prop (default `items.length`) for the last item's "Later", the bounds of a move, the announced count and the focus rule; a focus request kept until its button registers; `.caption` may wrap; rows unchanged; component tests for both
- [x] 5.2 `ToolWorkspace` and `useToolRun`: page moves as `page-moved`, `total` set to the file's page count, the announcement with the place in the whole file, the line above the pages memoised on the order, and `{ order: order ?? 1..pages }` sent to the engine
- [x] 5.3 Write `src/content/tools/rearrange-pdf-pages.md`, 250 to 500 words, marked as a draft, saying each press moves a page one place and dragging is quicker for long moves, and that the page forgets the file, the order and the result on Start again or on leaving the page; check against "Banned patterns"
- [x] 5.4 Name `rearrange-pdf-pages` in `page-weight.mjs`; check `check-worker.mjs` finds the engine and keeps `writePages` out of the worker file

## 6. End-to-end test

- [x] 6.1 `tests/e2e/rearrange-pdf-pages.spec.ts` at 360px and 1280px: moving by keyboard with announcement and focus, drag (and that pressing the last page's unavailable "Later" moves nothing), unavailable ends, moving past the pages shown (focus on the moved page's "Later", announcement "of 900"), a one-page file's line, reorder and check the download's page order (`mixed.pdf` sizes), password, damaged, not-a-PDF, two-file drop, Cancel keeps the order, engine-load failure, skip link, and the 20,000-page notice with a move on the generated file blocking nothing for more than 100 ms; Merge's, Split's, Extract's and Delete's e2e tests still pass

## 7. No-upload test

- [x] 7.1 Reorder's no-upload test: its exact allowlist (with the engine and shared chunks, no `fflate`), positive checks that the engine was fetched and `fflate`, Split, Merge, Extract and Delete were not, `qz7report.pdf`, its stem and the password as secrets, and `rich.pdf`'s bookmark titles and attachment name as secrets for requests and the console; storage and traces; a `tagged.pdf` run with its tag text, link address, field value and page text as secrets for requests and the console; and the address with no query and no hash after the job

## 8. Screenshots

- [x] 8.1 Screenshots of `/rearrange-pdf-pages` at 360px and 1280px, light and dark: empty, pages in original order, pages moved (with focus on a move button), result, password, damaged; check the buttons are stacked and fit a cell at 360px and 1280px and at 200% text size, and that "Page 120,000" does not overflow

## 9. Checks and review

- [x] 9.1 No `LICENSES.md` line: no dependency added
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [x] 9.3 Add Reorder pages' hand checks to issue #7, including the many-taps limit on a phone
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap, the missing multilingual test file, the many-taps limit, and the agent's choices ("Earlier"/"Later" labels, the button working with the order unchanged, `-reordered`, "Your file stays on your device." ahead of the cross-tool fix, drag as a drop onto a cell with no drop line, the bookmark list and tag reading order kept); it asks the owner whether a tagged file's reading order should follow the new page order; it does not call the tool done
