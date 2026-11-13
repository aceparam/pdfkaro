# Design

## Context

- **Page tools so far** (Split, Extract, Delete) list one file's pages as a grid in `PageGrid`, with a toggle on each page and no moves.
- **Merge PDF** lists files as rows that move by "Move up", "Move down" and drag. The widget keeps that order as the order of `state.files`.
- **Reorder pages** needs Merge's moves on Split's page grid, and an order for pages, which the state does not hold yet.
- **The engine side is ready.** `keepPages` in `src/engines/plain.ts` writes the pages it is given, in the order given, through the argument file. qpdf's `--pages . 3,1,2 --` puts the pages in that order. Bookmarks point to page objects, so they follow their pages.

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
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- **`itemControls: true` on a page tool** means pages move. A page tool has had `itemControls: false` until now, and no tool has both a toggle and moves; the registry test checks a page tool does not have both.
- **The sentence says "Your file stays on your device."** The UX reviewer asked for this wording on one-file tools at Delete's stage 2. Extract, Split and Delete keep "Files" until the small fix across them.

### The page order in the state

`State` gains `order: number[] | null`. It is the page numbers in the order shown.

- `inspected` with a ready file, for a tool whose page items move, sets `order` to `1..pages`. For other tools it stays `null`, so they hold no extra list.
- `added` (replacing the file), `removed` and `reset` clear it, as they clear marks. `started`, `failed` and `cancelled` leave it, so Cancel and failure keep the order.
- A new action, `page-moved { from, to }`, moves one entry: places count from 0, and `to` is clamped to the list. For a 120,000-page file this is one `splice` on an array of 120,000 numbers, about a millisecond, so it stays well under the 100 ms rule. The e2e test measures it.
- `gridItems` builds a tool's page items from `order` when it is set: item `i` is page `order[i]`, with id `${fileId}:${page}` and title "Page N". Ids and titles stay with the page, so thumbnails, already keyed by page, follow it, and the visitor can tell pages apart.
- **`orderSummary(order)`** in `src/widget/format.ts`-style rules (a new `src/widget/order.ts`):
  - "Pages in their original order." when every page is in its place;
  - otherwise "The order has changed. N pages are in a new place.", with "1 page is" for one.

  It counts in one pass, so it is cheap on every move.

### Moves in the page grid

`PageGrid` already moves items for Merge: `move(id, by, button)` and drag call `onMove(id, to)` and keep focus. For pages:

- With `controls` and `layout === 'grid'`, each cell shows two buttons under "Page N": visible "Up" and "Down", named "Move page N up" and "Move page N down". Two short words fit side by side in a 5rem cell at 360px; "Move up" and "Move down" do not. A grid cell has no Remove.
- Rows (Merge) keep "Move up", "Move down" and "Remove" as they are.
- The first item's "Up" and the last item's "Down" are `aria-disabled`. The last item is the file's last page, not the last one shown: a page at the end of a batch can still move down.
- `ToolWorkspace` passes `onMove` as a page move when the items are pages, and a file move otherwise. `onMoved` announces "Page 3 moved to place 1 of 12.", with the place in the whole file and the file's page count.
- **Moving past the pages shown.** When a page moves to a place beyond `shown`, `ToolWorkspace` dispatches `shown-more` first, so the page stays in view and focus can follow it.

### The option and the engine

- `useToolRun` sends `{ order: state.order }` for a tool whose page items move.
- `src/engines/tools/rearrange-pdf-pages.ts`:
  1. `plainCopy`;
  2. `pageOrder(pages, options.order)` checks that the order names every page from 1 to `pages` once, in one pass with a seen-array, and refuses anything else ("The page order is not valid.");
  3. progress 0;
  4. `keepPages(tools, plain, order)`;
  5. progress 100.
- `pageOrder` lives in `src/engines/plain.ts` beside `chosenPages`, because Rotate PDF and later page tools may send a full order too. It has one caller now; if none comes, it can move into the engine.
- `keepPages` keeps every page, so the outline update is empty and no bookmark is dropped. `pageList` joins ascending runs, so an order with one move is a few ranges: "3,1-2,4-12".
- **Long orders.** A 120,000-page file with many scattered moves gives a long list, carried by the argument file. qpdf selects pages slowly from very large files, as the 20,000-page notice already warns.

### Tests

- **Unit:**
  - the reducer: order made on read, page moves, clamping, cleared on remove and replace, kept through Cancel;
  - `gridItems` from an order;
  - `orderSummary`;
  - `pageOrder` (refuses missing, repeated, extra, out of range, not whole, not an array);
  - `run` on every file in `tests/fixtures/`, with page order checked through the uncompressed result; `rich.pdf` swapped, with each bookmark pointing to the page that holds its chapter; `mixed.pdf` shapes following their pages; `tagged.pdf` keeping everything; the unchanged order.
- **Component:** grid cells with controls show "Up" and "Down" with full names and no Remove; rows still show "Move up", "Move down" and "Remove".
- **E2e:**
  - moving by keyboard, with announcement and focus;
  - drag;
  - the unavailable ends;
  - moving past the pages shown;
  - reordering and checking the page order of the download (`mixed.pdf` page sizes);
  - password, damaged, not a PDF, two files dropped;
  - Cancel keeps the order;
  - engine-load failure;
  - skip link;
  - the 20,000-page notice, with a move on the 120,000-page file blocking nothing for more than 100 ms;
  - no-upload with an exact allowlist, and the `rich.pdf` strings;
  - Merge PDF's e2e tests still pass.

## Risks and trade-offs

- **Many taps on a phone.** Moving page 40 to the front takes 39 presses of "Up". `SPEC.md` asks for move up and move down; a "move to place" field can come later. Named in issue #7's phone check and the pull request.
- **Drag in a wrapping grid** drops a page onto another and takes its place, as Merge does in rows; there is no drop line between cells. Keyboard and touch use the buttons.
- **"Up" and "Down" in a grid** mean earlier and later in the order, which can wrap to the row above. The names say "Move page N up", and the announcement gives the new place. The UX reviewer checks this.
