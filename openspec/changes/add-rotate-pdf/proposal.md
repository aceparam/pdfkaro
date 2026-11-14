# Proposal

## Why

Rotate PDF is sixth in the catalogue ("Organise pages", Phase 1), after Merge, Split, Extract, Delete and Reorder, which are built and merged (PR #8, #9, #10, #12). It turns pages of one PDF a quarter, a half or three quarters. `SPEC.md` plans a page for "rotate one page in pdf" (SEO, "Specific jobs"), so single pages must turn, and a scan that came out sideways needs every page turned at once. The page grid, the thumbnails and `writePages`-style writing exist.

## What Changes

- **A new page, `/rotate-pdf`,** from a new registry entry. The visitor picks one PDF and sees every page as a thumbnail, in batches of 500.
- **Turning pages.**
  - Each page has "Turn left" and "Turn right" buttons, stacked under its thumbnail as Reorder's are, named "Turn page 3 left" and "Turn page 3 right". Each press turns the page a quarter.
  - Above the pages, "Turn every page left" and "Turn every page right" turn every page a quarter, including pages not shown yet.
  - The thumbnail is drawn turned, at its own shape within its slot, and the caption says the turn in words ("Page 3, turned right"), for screen readers and for blank paper not yet drawn.
  - A turn is announced in the caption's words: "Page 3 is now turned right.", "… turned half round.", "… turned left." or "Page 3 is back the way it was."; for every page, where every page now is, or "Every page turned right." when some are turned on their own.
  - A line above the pages says what will happen: "No pages will be turned. Press “Turn left” or “Turn right” under a page to turn it, or turn every page at once.", "3 pages will be turned." or "Every page will be turned."
- **The main button, "Turn and download",** gives one PDF with every page, each turned as shown, named `report-rotated.pdf`. While no page will be turned it is unavailable but focusable, with "Turn a page to make a new file." tied to it, as Extract does with no page chosen, so the page never offers a "rotated" file that is not turned.
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
- **The agent's own choices,** named in the pull request: "Turn left" and "Turn right" stacked under each page, with "Turn every page left" and "Turn every page right" above the pages; the main button waiting for a turn, unlike Reorder's (an owner question too); the output name `-rotated`, after the tool's name and the search it answers.

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
  - `PageGrid` (a turn pair under each page, a turned thumbnail), `ToolWorkspace` and `useToolRun` (turning, the "Turn every page" buttons, the line above the pages, the turns sent to the engine);
  - `src/engines/plain.ts`, with `writeTurned`;
  - `page-weight.mjs`, which names the new engine, and `check-worker.mjs`, which checks `writeTurned` stays out of the worker file.
- **Every page grid (Split, Extract, Delete, Reorder and Rotate):** each cell gets `contain: layout style` and `content-visibility: auto`, so a change inside one page lays out that page only and pages far off screen are not drawn until they come near; and pages that turn are drawn in memoised chunks of 50. Both were added when the slowed-CPU test of "Turn every page" failed (see the design). Nothing on screen changes; tests read captions by their text, as text off screen is not rendered.
- **Merge, Split, Extract, Delete and Reorder:** no change in behaviour.
