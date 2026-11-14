# Proposal

## Why

Rotate PDF is sixth in the catalogue ("Organise pages", Phase 1), after Merge, Split, Extract, Delete and Reorder, which are built and merged (PR #8, #9, #10, #12). It turns pages of one PDF a quarter, a half or three quarters. `SPEC.md` plans a page for "rotate one page in pdf" (SEO, "Specific jobs"), so single pages must turn, and a scan that came out sideways needs every page turned at once. The page grid, the thumbnails and `writePages`-style writing exist.

## What Changes

- **A new page, `/rotate-pdf`,** from a new registry entry. The visitor picks one PDF and sees every page as a thumbnail, in batches of 500.
- **Turning pages.**
  - Each page has "Left" and "Right" buttons, stacked under its thumbnail as Reorder's are, named "Turn page 3 left" and "Turn page 3 right". Each press turns the page a quarter.
  - Above the pages, "Turn all left" and "Turn all right" turn every page a quarter, including pages not shown yet.
  - The thumbnail is drawn turned, scaled to fit its slot, so the visitor sees the result.
  - A turn is announced with where the page now points: "Page 3 turned right. It is now a quarter turn right of how it was." / "… It is now half a turn from how it was." / "… It is back the way it was."; for all pages: "Every page turned right."
  - A line above the pages says what will happen: "No pages will be turned. Press “Left” or “Right” under a page to turn it, or turn them all.", "3 pages will be turned." or "Every page will be turned."
- **The main button, "Turn and download",** gives one PDF with every page, each turned as shown, named `report-rotated.pdf`. With nothing turned it still works and gives the pages as they were, so the main button works from the start.
- **What the new file keeps:** every page and everything on it, untouched; only each page's turn changes (its `/Rotate`), so text, links, form fields, notes, bookmarks, attachments, details and tags stay as they were. It has no password and no restrictions, by the owner's decision of 13 Nov 2026 that names Rotate PDF. The page says so.
- **Shared code:**
  - **Page turns in the widget's state:** a turn for every page (`all`, 0 to 3 quarters) and a turn for single pages on top of it, so turning all pages of a 120,000-page file is one number, not 120,000. Forgotten when the file is removed or replaced; kept through Cancel and failure.
  - **`PageGrid`** gains a per-page pair of actions for a tool that turns pages, built like Reorder's moves, and draws a thumbnail turned.
  - **`writeTurned(tools, plain, turns)`** beside `writePages` in `src/engines/plain.ts`: one qpdf write through the argument file with `--rotate` for each group of pages, and `qpdf --check`.
- **Page text, tests and screenshots,** as for Reorder.

### Scope

- **One tool.** Turning extends `PageGrid` and the widget's state, which exist; no new shared component (`SPEC.md` "Build phases", rule 3). Reorder's moves and the toggle tools are unchanged, and their tests must pass unchanged.
- **Out of scope:**
  - next steps in the result, a known gap across the site;
  - turning by angles other than quarters;
  - turning only odd or even pages, or a typed range;
  - straightening a crooked scan (that would change the page's content, not its turn).

### `SPEC.md` sections

- "Tool catalogue": Rotate PDF, `/rotate-pdf`, Browser, Phase 1, sixth under "Organise pages".
- "Tool page anatomy": parts 1 to 7, and every state in "States every tool handles".
- "Details that apply everywhere": output names; thumbnails as they scroll into view; a 500-page file must not freeze the page.
- "Architecture and tech stack": page structure with qpdf ("rotate" is named there).
- "SEO": "Every tool page", and "Specific jobs" ("rotate one page in pdf", for a later page).
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool", including mixed sizes and mixed rotation in the test set.

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data, and the Rotate engine. There is no zip, so `fflate` is not fetched. No dependency is added.

## Open decisions and owner questions touched

- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026, which names Rotate PDF.
- **Bookmarks, attachments, tags:** every page is kept and only its turn changes, so all of them stay, as "Leaves alone what it was not asked to change" asks.
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **The agent's own choices,** named in the pull request: "Left" and "Right" stacked under each page, with "Turn all left" and "Turn all right" above the pages; the main button working with nothing turned; the output name `-rotated`, after the tool's name and the search it answers.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `rotate-pdf`: what the Rotate PDF tool at `/rotate-pdf` does. That covers choosing one file, turning its pages, writing the file with the turns, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-page`: a new requirement, "Pages that a tool lets turn", for what a tool whose pages turn shows (the buttons and their names, the turned thumbnail, the announcement, turning every page).

## Impact

- **New code:**
  - `src/engines/tools/rotate-pdf.ts`;
  - `src/widget/turns.ts`;
  - `src/content/tools/rotate-pdf.md`;
  - unit tests;
  - `tests/e2e/rotate-pdf.spec.ts`.
- **Changed code:**
  - the registry, with the entry and a way to say a tool's pages turn;
  - `src/widget/state.ts`, with the turns and their actions;
  - `PageGrid` (a turn pair under each page, a turned thumbnail), `ToolWorkspace` and `useToolRun` (turning, the "Turn all" buttons, the line above the pages, the turns sent to the engine);
  - `src/engines/plain.ts`, with `writeTurned`;
  - `page-weight.mjs`, which names the new engine, and `check-worker.mjs`, which checks `writeTurned` stays out of the worker file.
- **Merge, Split, Extract, Delete and Reorder:** no change in behaviour.
