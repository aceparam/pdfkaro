# Proposal

## Why

Extract pages is third in the catalogue ("Organise pages", Phase 1), after Merge PDF and Split PDF, which are built and merged (PR #8). It takes chosen pages out of one PDF into a new file. The shared parts it needs exist: page items, thumbnails, a per-page toggle and pages shown 500 at a time.

## What Changes

- **A new page, `/extract-pdf-pages`,** from a new registry entry. The visitor picks one PDF and sees every page as a thumbnail.
- **Choosing pages.** Each page has a "Take" toggle button, named "Take page 3" for screen readers, which works with the keyboard and on a touch screen. Every page has one, the last included.
  - A line above the pages says what the main button will give: "No pages chosen yet. Choose the pages to take out." or "Pages 1, 3 and 7 chosen. You will get one file of 3 pages."
  - With no page chosen, the main button is marked unavailable, stays focusable, and "Choose at least one page to take out." is tied to it, as Merge PDF does with too few files. This is the one tool so far whose button cannot work untouched, because extracting nothing has no result.
- **The main button, "Extract and download",** gives one PDF of the chosen pages, in page order, named `report-extracted.pdf`.
- **What the new file keeps** (the owner's decisions of 13 Nov 2026):
  - the bookmarks that point to a chosen page, with kept children of a dropped bookmark moved up;
  - the files attached to the document;
  - no password and no restrictions.

  The page says all three.
- **Shared code that a second toggle kind needs:**
  - **One module for toggle kinds.** `src/widget/toggles.ts` says, for each kind:
    - the engine option it sends;
    - which pages have no toggle;
    - the line above the pages and the announcements;
    - whether the main button can run.

    Split PDF's `cut-after` moves into it unchanged, and Extract's `take` is added. This is the follow-up the architect asked for at Split PDF's stage 2.
  - **Shared bookmark and attachment rules.** `src/engines/outline.ts` holds the outline reading and update that Split PDF built: `readOutline`, `keptOutline`, `readStructure`, the update and its checks. `keptOutline` takes the set of pages kept instead of a range. Split PDF's behaviour is unchanged.
- **Page text, tests and screenshots,** as for Split PDF.

### Scope

- **One tool.** The two shared moves are the ones Split PDF's review asked to make "when a second caller arrives". They change no behaviour of Split PDF, whose tests must pass unchanged.
- **Out of scope:**
  - typed page ranges;
  - extracting each page to its own file, which Split PDF does;
  - reordering the extracted pages.

### `SPEC.md` sections

- "Tool catalogue": Extract pages, `/extract-pdf-pages`, Browser, Phase 1, third under "Organise pages".
- "Tool page anatomy": parts 1 to 7, and every state in "States every tool handles".
- "Details that apply everywhere": output names; thumbnails as they scroll into view; a 500-page file must not freeze the page.
- "Architecture and tech stack": page structure with qpdf.
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password.

After a pick, the page fetches only the site's own files:
- the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` file, PDF.js and its data;
- the Extract engine.

There is no zip, so `fflate` is not fetched. No dependency is added.

## Open decisions and owner questions touched

- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026 for page tools.
- **Bookmarks and attachments:** keep what still applies, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for Merge and Split, no link until Repair PDF is published.
- **The four questions still open from PR #8** (accessibility tags, very large files, the zip limit, attachments drawn on a page). These touch Extract only as follows:
  - **Accessibility tags and document details:** kept whole, as in Split; the page says so.
  - **Very large files:** the same qpdf slowness applies, since a file over about 20,000 pages selects slowly.
  - **The zip limit:** does not apply, because there is one output.
  - **Attachments drawn on a page:** go with their page if it is chosen.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `extract-pdf-pages`: what the Extract pages tool at `/extract-pdf-pages` does. That covers:
  - choosing one file and its pages;
  - extracting them into one file;
  - every state of "States every tool handles";
  - nothing uploaded;
  - the words on the page.

### Modified Capabilities

None. Toggle kinds and the shared outline code are code structure, not requirements. Split PDF's requirements are unchanged.

## Impact

- **New code:**
  - `src/engines/tools/extract-pdf-pages.ts`;
  - `src/engines/outline.ts`, moved out of `split-pdf.ts`;
  - `src/widget/toggles.ts`, taking in `cuts.ts`;
  - `src/content/tools/extract-pdf-pages.md`;
  - unit tests;
  - `tests/e2e/extract-pdf-pages.spec.ts`.
- **Changed code:**
  - the registry, with the entry and a new toggle kind, `take`;
  - `ToolWorkspace` and `useToolRun`, which ask `toggles.ts` instead of naming `cut-after`;
  - `split-pdf.ts`, which imports from `outline.ts`;
  - `page-weight.mjs`, which names the new engine.
- **Merge PDF and Split PDF:** no change in behaviour.
