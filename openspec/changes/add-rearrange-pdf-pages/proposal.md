# Proposal

## Why

Reorder pages is fifth in the catalogue ("Organise pages", Phase 1), after Merge PDF, Split PDF, Extract pages and Delete pages, which are built and merged (PR #8, PR #9, PR #10). It puts the pages of one PDF in a new order. `SPEC.md` "Details that apply everywhere": "Reordering works by drag and also by "move up" and "move down" buttons, so it works with a keyboard and on a small touch screen." `PageGrid` already moves files that way for Merge PDF; this change lets it move the pages of one file, and builds the tool on top.

## What Changes

- **A new page, `/rearrange-pdf-pages`,** from a new registry entry. The visitor picks one PDF and sees every page as a thumbnail, in batches of 500.
- **Moving pages.** Each page has "Earlier" and "Later" buttons, named "Move page 3 earlier" and "Move page 3 later" for screen readers, and can be dragged with a mouse. These are the same moves Merge PDF's file list has, laid out for the page grid. The first page's "Earlier" and the last page's "Later" are unavailable but focusable. A move is announced: "Page 3 moved to place 1 of 12." Focus stays on the button pressed, or moves to the other one when the pressed one can no longer be used, as for Merge.
  - Pages keep their own name ("Page 3") wherever they are moved, so the visitor can tell them apart.
  - A line above the pages says whether the order has changed and how to move a page: "Pages in their original order. Press “Earlier” or “Later” under a page to move it.", or "The order has changed. …". A one-page file says "This file has one page, so there is nothing to move."
  - A page moved down past the last page shown brings the next batch into view, so it never moves out of sight.
- **The main button, "Reorder and download",** gives one PDF of every page, in the order shown, named `report-reordered.pdf`. With the order unchanged it still works and gives the same pages in the same order, so the main button works from the start ("Defaults are set so the main button works").
- **What the new file keeps:** every page, with its text, links, form fields and notes; every bookmark, still pointing to its page wherever the page now sits; the files attached to the document; and the document's details, tags, named destinations and threads. It has no password and no restrictions, by the owner's decision of 13 Nov 2026 that names Reorder pages. The page says so. Two things keep their original order, as the agent's reading of "Leaves alone what it was not asked to change": the list of bookmarks (each still points to its page), and, in a file with accessibility tags, the reading order a screen reader follows. The page says so too.
- **Shared code:**
  - **The page order** is part of the widget's state, for a tool whose page items can move: a list of page numbers, made when the file is read and forgotten when the file is removed or replaced. Moves keep through Cancel and failure.
  - **`PageGrid`** shows "Earlier" and "Later" on each page when the tool's page items have controls; it has no Remove for a page.
  - **`writePages`** in `src/engines/plain.ts`: the write-and-check tail of `keepPages`, split out, so a tool that keeps every page writes them in any order without `keepPages`'s bookmark rewrite, which would drop bookmarks with no page and cut deep outlines. `pageOrder`, which checks that an order names every page once, stays in the Reorder engine until a second caller needs it.
- **Page text, tests and screenshots,** as for Delete pages.

### Scope

- **One tool.** Moving pages extends `PageGrid`, which exists; no new shared component is added (`SPEC.md` "Build phases", rule 3). Merge PDF's file moves are unchanged and its tests must pass unchanged.
- **Out of scope:**
  - next steps in the result, a known gap across the site against "Tool page anatomy" part 6, coming in its own change;
  - moving a page to a typed place, or several pages at once;
  - removing or rotating pages here, which Delete pages and Rotate PDF do;
  - an "original order" button: Start again or choosing the file again does that.

### `SPEC.md` sections

- "Tool catalogue": Reorder pages, `/rearrange-pdf-pages`, Browser, Phase 1, fifth under "Organise pages".
- "Tool page anatomy": parts 1 to 7, and every state in "States every tool handles".
- "Details that apply everywhere": output names; thumbnails as they scroll into view; reordering by drag and by move up and move down; a 500-page file must not freeze the page.
- "Architecture and tech stack": page structure with qpdf ("reorder" is named there).
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password.

After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data, and the Reorder engine. There is no zip, so `fflate` is not fetched. No dependency is added.

## Open decisions and owner questions touched

- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026, which names Reorder pages.
- **Bookmarks, attachments, tags:** every page is kept, so nothing is left out and all of them stay; no owner decision is needed beyond "Leaves alone what it was not asked to change".
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **The tagged-fields question** (CLAUDE.md, waiting for the owner) does not apply: no page is left out.
- **The agent's own choices,** named in the pull request: the visible labels "Earlier" and "Later", stacked in each cell, with full names "Move page N earlier/later", in place of SPEC's "move up" and "move down", because in a wrapping grid a page moves left or right; the main button working with the order unchanged; the output name `-reordered`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `rearrange-pdf-pages`: what the Reorder pages tool at `/rearrange-pdf-pages` does. That covers choosing one file, moving its pages, writing the file in the new order, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-page`: a new requirement, "Pages that a tool lets move", for what every tool whose pages move inherits (the buttons and their names, the ends, the announcement, showing the next batch). The tool's own words stay in `rearrange-pdf-pages`.

## Impact

- **New code:**
  - `src/engines/tools/rearrange-pdf-pages.ts`;
  - `src/content/tools/rearrange-pdf-pages.md`;
  - unit tests;
  - `tests/e2e/rearrange-pdf-pages.spec.ts`.
- **Changed code:**
  - the registry, with the entry;
  - `src/widget/state.ts` and `src/widget/items.ts`, with the page order and a page move;
  - `PageGrid` (moves on a page in the grid, "Earlier" and "Later" labels, no Remove for a page) and `ToolWorkspace` and `useToolRun` (moving a page, the line above the pages, the order sent to the engine);
  - `src/engines/plain.ts`, with `writePages` split out of `keepPages`, and comments saying a page list may be in any order;
  - `page-weight.mjs`, which names the new engine.
- **Merge PDF, Split PDF, Extract pages and Delete pages:** no change in behaviour.
