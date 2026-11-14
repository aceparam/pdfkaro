# Design

## Context

- **Page tools so far** (Split, Extract, Delete) list one file's pages as a grid in `PageGrid`, with a toggle on each page and no moves.
- **Merge PDF** lists files as rows that move by "Move up", "Move down" and drag. The widget keeps that order as the order of `state.files`.
- **Reorder pages** needs Merge's moves on Split's page grid, and an order for pages, which the state does not hold yet.
- **The engine side is nearly ready.** `keepPages` in `src/engines/plain.ts` ends by writing the pages it is given, in the order given, through the argument file; that tail becomes `writePages`, which Reorder calls without `keepPages`'s bookmark rewrite. qpdf's `--pages . 3,1,2 --` puts the pages in that order. Bookmarks point to page objects, so they follow their pages.

## Goals and non-goals

**Goals**
- Reorder pages end to end, with moves that work by keyboard, touch and mouse, on files of any length.
- Merge PDF's file moves unchanged.

**Non-goals**
- Moving several pages at once, moving to a typed place, removing or rotating pages here.

## Decisions

### The registry entry

```ts
{ id: 'rearrange-pdf-pages', group: 'organise', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['delete-pdf-pages', 'extract-pdf-pages', 'rotate-pdf', 'split-pdf', 'merge-pdf'],
  pages: [{ slug: 'rearrange-pdf-pages', name: 'Reorder pages', summary: 'Put the pages of a PDF in a new order.',
            title: 'Reorder the pages of a PDF in your browser - PDFkaro',
            description: 'Put the pages of a PDF in the order you want. The file stays on your device and is not uploaded.',
            heading: 'Reorder the pages of a PDF',
            sentence: 'Put the pages of a PDF in the order you want. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            multiple: false, minFiles: 1, tooFewFiles: 'Choose a PDF file to reorder.',
            items: 'pages', itemControls: true, outputs: 'one', outputSuffix: 'reordered', resultPages: 'input',
            actionLabel: 'Reorder and download', writingLabel: 'Writing the new file',
            doneHeading: 'Your new file is ready', failedHeading: 'The new file was not made.',
            resultNotes: ['The new file keeps every page, and its bookmarks still point to the same pages, wherever they now are. Files attached to the document are kept.',
                          'The list of bookmarks keeps its order. In a file with accessibility tags, a screen reader may still read the pages in their original order.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- **`itemControls: true` on a page tool** means pages move. A page tool has had `itemControls: false` until now, and no tool has both a toggle and moves; the registry test checks a page tool does not have both.
- **The sentence says "Your file stays on your device."** The UX reviewer asked for this wording on one-file tools at Delete's stage 2. Extract, Split and Delete keep "Files" until the small fix across them.

### The page order in the state

`State` gains `order: number[] | null`. `null` means the original order, for every tool, so the reducer needs no tool setting and a file that is never moved holds no list (the architect, stage 1).

- A new action, `page-moved { page, to }`: the page number and its new place, counted from 0. On the first move the reducer builds `1..pages` from `files[0].pages`; it finds the page's place, takes it out and puts it at `to`, clamped to the file. For a 120,000-page file this is one copy and one `splice` of 120,000 numbers, about a millisecond; the e2e test measures the 100 ms rule.
- **The next batch.** When `to` is at or past `shown`, the same action raises `shown` by `pageBatch`, so the moved page stays in view. One action, tested in Node; the component does not dispatch two in order.
- `added` (replacing the file), `removed` and `reset` set `order` back to `null`, as they clear marks. `started`, `failed` and `cancelled` leave it, so Cancel and failure keep the order.
- `gridItems` and `shownItems` take `Pick<State, 'files' | 'order'>`: item `i` is page `order[i]` (or `i + 1` when `order` is `null`), with id `${fileId}:${page}` and title "Page N". Ids and titles stay with the page, so thumbnails, keyed by page, follow it. `ToolWorkspace`'s items memo is keyed on `state.order` too.
- **`orderSummary(order, pages)`** in a new `src/widget/order.ts`, memoised on `state.order` in `ToolWorkspace` (it renders again on every thumbnail):
  - "This file has one page, so there is nothing to move." for one page;
  - "The pages are in their original order. Press “Earlier” or “Later” under a page to move it." when `order` is `null` or every page is in its place;
  - otherwise "The order has changed. Press “Earlier” or “Later” under a page to move it."

  It gives no count: after moving one page, "3 pages are in a new place" reads as a mistake (the UX reviewer, stage 1). It stops at the first page out of place. The line is not a live region; the move announcement covers that.
- `useToolRun` sends `{ order: order ?? [1..pages] }` when `words.items === 'pages' && words.itemControls`.

### Moves in the page grid

`PageGrid` already moves items for Merge: `move(id, by, button)` and drag call `onMove(id, to)` and keep focus. For pages:

- With `controls` and `layout === 'grid'`, each cell shows two buttons under "Page N", stacked, each as wide as the cell and at least 2.75rem tall, as the toggle of Split, Extract and Delete is built: visible "Earlier" and "Later", named "Move page N earlier" and "Move page N later". A grid cell has no Remove.
  - **Why "Earlier" and "Later", not SPEC's "move up" and "move down":** in a wrapping grid a move goes one cell left or right and wraps at a row's end, so "Up" would usually not move a page up. The UX reviewer asked for the words that say what happens (stage 1). SPEC's "move up and move down" describes what the buttons do; Merge's rows keep the literal words. Named in the pull request as the agent's choice.
  - Side by side, two buttons need about 115px and a cell has about 80px at 1280px and 95px at 360px (the UX reviewer's sums), so they stack.
- `.caption` may wrap, so "Page 120,000" does not overflow an 80px cell; this also applies to Split, Extract and Delete.
- Rows (Merge) keep "Move up", "Move down" and "Remove" as they are.
- **`PageGrid` gains `total?: number`,** defaulting to `items.length` (the architect, stage 1). It is used for the last item's "Later" being unavailable, the bounds check in `move`, the count in `onMoved` and the focus rule. `ToolWorkspace` passes the file's page count for pages. Without it, the grid would treat the last page drawn as the end: the page at place 500 could not move on, and moves would be announced "of 500".
- **Focus into the next batch.** After a move past the pages shown, the moved page is not drawn until the grid's next frame. `PageGrid` keeps the focus request until the button registers in `setButton`, and moves focus then, so focus never falls to the page's body (the architect, stage 1).
- `ToolWorkspace` passes `onMove` as a page move when the items are pages (`page-moved` with the item's page), and a file move otherwise. `onMoved` announces "Page 3 moved to place 1 of 12.", with the place in the whole file and the file's page count.

### The option and the engine

- `src/engines/tools/rearrange-pdf-pages.ts`:
  1. `plainCopy`;
  2. `pageOrder(pages, options.order)` checks that the order names every page from 1 to `pages` once, and refuses anything else ("The page order is not valid."). It checks `Array.isArray(order) && order.length === pages` first, so its loop is bounded by the file and not by what was sent; it tracks pages seen in a `Uint8Array(pages + 1)`; it refuses holes, `NaN`, fractions and strings; and it returns a copy;
  3. progress 0;
  4. `writePages(tools, plain, order)`;
  5. progress 100.
- **`pageOrder` lives in the engine file**, exported for its test, until a second caller needs it (the architect, stage 1), as `pagesLeft` lives in Delete's.
- **`writePages(tools, plain, list, update?)`** in `src/engines/plain.ts` is the tail of `keepPages`, split out: write the update if one is given, write `--pages . <list> --` through the argument file, and run `qpdf --check`. `keepPages` reads the structure, builds its outline update and calls it. Reorder calls it with no update and never reads the structure.
  - **Why not `keepPages`:** its outline update rewrites every bookmark even when every page is kept. It drops bookmarks with no page (headings, web-address actions), cuts outlines below 48 levels, and drops the outline when it cannot be read safely. Those trade-offs fit tools that leave pages out; a tool that keeps every page needs none of them. qpdf keeps the input's outline and other document-level data, and bookmarks point to page objects, so they follow their pages untouched (the architect, stage 1). It also means a crafted file with a huge outline costs Reorder nothing (the security reviewer, stage 1).
  - Rotate PDF, Add page numbers, Watermark and Sign keep every page too, and can call `writePages` the same way.
  - The comments on `writePages`, `keepPages` and `callWithArgumentFile` say the list may be in any order: a sorted, unique list from `chosenPages` or a permutation from `pageOrder`.
- `pageList` joins ascending runs, so an order with one move is a few ranges: "3,1-2,4-12".
- **Long orders.** A 120,000-page file with many scattered moves gives a long list, carried by the argument file; a reversed order joins no runs, about 730 KB on one line, which qpdf reads from the argument file on its heap. qpdf selects pages slowly from very large files, as the 20,000-page notice already warns.

### Tests

- **Unit:**
  - the reducer: no order until the first move, page moves, clamping, the next batch shown on a move past `shown`, back to `null` on remove, replace and reset, kept through Cancel;
  - `gridItems` and `shownItems` from an order and from `null`;
  - `orderSummary`, including one page;
  - `pageOrder` (refuses missing, repeated, extra, out of range, a hole, `NaN`, `1.5`, `'1'`, the wrong length, not an array);
  - `writePages` called by `keepPages`: Extract's and Delete's tests unchanged;
  - `run` on every file in `tests/fixtures/`, with page order checked through the uncompressed result; `rich.pdf` swapped, with each bookmark pointing to the page that holds its chapter and the outline's own order unchanged; `mixed.pdf` shapes following their pages; `tagged.pdf` keeping everything; the unchanged order; a fully reversed `pages-500.pdf`;
  - the outline comes out unchanged for a bookmark with no destination, the 100-level `deepOutline`, and the outline-as-catalog file, which `keepPages` would change.
- **Component:** grid cells with controls show "Earlier" and "Later" stacked, with full names and no Remove; `total` sets the ends and the announced count; rows still show "Move up", "Move down" and "Remove".
- **E2e:**
  - moving by keyboard, with announcement and focus;
  - drag;
  - the unavailable ends;
  - moving past the pages shown, with focus on the moved page's "Later" and the announcement "of 900";
  - a one-page file's line;
  - reordering and checking the page order of the download (`mixed.pdf` page sizes);
  - password, damaged, not a PDF, two files dropped;
  - Cancel keeps the order;
  - engine-load failure;
  - skip link;
  - the 20,000-page notice, with a move on the 120,000-page file blocking nothing for more than 100 ms;
  - no-upload with an exact allowlist; the `rich.pdf` strings; the `tagged.pdf` strings (its tag text, link address, field value and page text) in requests and the console; and the address with no query and no hash, so the order is not written there (the privacy reviewer, stage 1);
  - Merge, Split, Extract and Delete's e2e tests still pass.

### What keeps its original order

qpdf moves page objects, not the document's other structures. The outline lists bookmarks in their own order, and each still points to its page, so after a move the bookmark panel can list "Chapter one" first while its page is second. In a tagged file the structure tree, which sets the reading order for a screen reader, stays in the original order too. Rewriting either would go beyond "Leaves alone what it was not asked to change", so both stay, the page says so (a result note and an FAQ answer), and the pull request asks the owner whether the tags should follow the new order. Tests check the outline's order is unchanged and each bookmark points to its page.

## Risks and trade-offs

- **Many taps on a phone.** Moving page 40 to the front takes 39 presses of "Earlier". `SPEC.md` asks for move up and move down; a "move to place" field can come later. The page text says each press moves a page one place and that dragging is quicker for long moves on a computer. Named in issue #7's phone check and the pull request, as an owner question for later and a candidate for Known problems.
- **Drag in a wrapping grid** drops a page onto another and takes its place, as Merge does in rows; there is no drop line between cells. Keyboard and touch use the buttons.
- **"Earlier" and "Later" differ from SPEC's words** "move up" and "move down". They say what happens in a grid; the owner can ask for the literal words instead.
