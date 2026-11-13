# Proposal

## Why

Delete pages is fourth in the catalogue ("Organise pages", Phase 1), after Merge PDF, Split PDF and Extract pages, which are built and merged (PR #8, PR #9). It removes chosen pages from one PDF. Everything it needs exists: page items, thumbnails, the per-page toggle kinds in `src/widget/toggles.ts`, the shared plain copy and outline update, and the 20,000-page notice.

## What Changes

- **A new page, `/delete-pdf-pages`,** from a new registry entry. The visitor picks one PDF and sees every page as a thumbnail.
- **Marking pages.** Each page has a "Delete" toggle button, named "Delete page 3" for screen readers, which works with the keyboard and on a touch screen. Every page has one, the last included. A marked page draws no cut line.
  - A line above the pages says what will happen: "No pages marked. Press “Delete” under each page you want to remove.", "Page 3 will be deleted. 11 pages will be left.", "Pages 1, 3 and 7 will be deleted. 9 pages will be left." or "12 pages will be deleted. 88 pages will be left."
  - With no page marked, the main button is marked unavailable, stays focusable, and "Choose at least one page to delete." is tied to it.
  - With every page marked, the main button is unavailable in the same way, with "A PDF needs at least one page. Leave one or more pages unmarked." tied to it.
- **The main button, "Delete and download",** gives one PDF of the pages left, in page order, named `report-pages-deleted.pdf`.
- **What the new file keeps,** by the owner's decisions of 13 Nov 2026 for tools that give back one file with fewer pages, the same as Extract pages:
  - the bookmarks that point to a page left, with kept children of a dropped bookmark moved up;
  - the files attached to the document;
  - no password and no restrictions;
  - the document's title, author and other details, its accessibility tags, named destinations and reading threads, whole. These can carry text from the pages deleted.

  The page says all of this.
- **Shared code a second one-file page tool needs** (the follow-up the architect named at Extract's stage 2):
  - `chosenPages`, `pageList` and `callWithArgumentFile` move from the Extract engine into `src/engines/plain.ts`;
  - the steps from a plain copy and a set of pages to the new file (read the structure, build the outline update, write through the argument file, `qpdf --check`) become one shared function, `keepPages`, in `src/engines/plain.ts`. Extract pages calls it; its behaviour and tests are unchanged.
- **The toggle rule for an unavailable main button is told the page count,** so a kind can refuse "every page marked". `take` and `cut-after` are unchanged.
- **Page text, tests and screenshots,** as for Extract pages.

### Scope

- **One tool.** The shared move changes no behaviour of Extract pages or Split PDF, whose tests must pass unchanged.
- **Out of scope:**
  - next steps in the result, a known gap across the site against "Tool page anatomy" part 6, coming in its own change;
  - typed page ranges;
  - a cap on how many bookmarks are read (the security reviewer's low note at Extract's stage 2), which belongs to the shared outline code and its own change.

### `SPEC.md` sections

- "Tool catalogue": Delete pages, `/delete-pdf-pages`, Browser, Phase 1, fourth under "Organise pages".
- "Tool page anatomy": parts 1 to 7, and every state in "States every tool handles".
- "Details that apply everywhere": output names; thumbnails as they scroll into view; a 500-page file must not freeze the page.
- "Architecture and tech stack": page structure with qpdf ("delete" is named there).
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password.

After a pick, the page fetches only the site's own files:
- the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` file, PDF.js and its data, the shared `plain` file;
- the Delete engine.

There is no zip, so `fflate` is not fetched. No dependency is added.

## Open decisions and owner questions touched

- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026, which names Delete pages.
- **Bookmarks and attachments:** keep what still applies, by the owner's decision of 13 Nov 2026, which names Delete pages.
- **Hidden text from pages left out:** kept whole and the page says so, by the owner's decision of 13 Nov 2026.
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **Starting with no pages marked, and refusing every page marked:** the agent's reading, not an owner decision. With nothing marked there is nothing to delete, and a PDF cannot have no pages, so the main button cannot work in either case; this follows Extract's start, which the owner chose. The pull request names it.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `delete-pdf-pages`: what the Delete pages tool at `/delete-pdf-pages` does. That covers:
  - choosing one file and marking its pages;
  - writing the file without them;
  - every state of "States every tool handles";
  - nothing uploaded;
  - the words on the page.

### Modified Capabilities

None. The 20,000-page notice in `tool-page` already covers every tool that lists pages. The shared engine move is code structure, not a requirement.

## Impact

- **New code:**
  - `src/engines/tools/delete-pdf-pages.ts`;
  - `src/content/tools/delete-pdf-pages.md`;
  - unit tests;
  - `tests/e2e/delete-pdf-pages.spec.ts`.
- **Changed code:**
  - the registry and `catalogue.ts`, with the entry and a new toggle kind, `drop`;
  - `src/widget/toggles.ts`, with `drop`, and `blocked(marks, pages)`;
  - `ToolWorkspace`, which passes the page count to `blocked`;
  - `src/engines/plain.ts`, which takes `chosenPages`, `pageList`, `callWithArgumentFile` and `keepPages`;
  - `src/engines/tools/extract-pdf-pages.ts`, which calls `keepPages`;
  - `page-weight.mjs` and `check-worker.mjs`, which name the new engine;
  - the tests that import those functions.
- **Merge PDF, Split PDF and Extract pages:** no change in behaviour.
