# Proposal

## Why

Split PDF is second in the catalogue ("Organise pages", Phase 1) and the next tool to build now that the Phase 0 gate is accepted. The shared parts it needs, page items and several outputs as one zip, are built in `add-page-items-and-zip`. This change builds the tool itself.

## What Changes

- **A new page, `/split-pdf`,** from a new registry entry. The visitor picks one PDF. Once it has been read, every page shows as a thumbnail in the page grid.
- **Marking where to cut.** By the owner's decision of 12 Nov 2026, the visitor marks cut points between pages:
  - every page but the last has a "Cut after" toggle button, named "Cut after page 3" for screen readers, which works with the keyboard and on a touch screen;
  - a line above the pages says what the main button will give: "No cuts marked. You will get one file per page, 12 files." or "Cuts after pages 3 and 7. You will get 3 files.";
  - with no cuts marked, the main button gives one file per page, so the main button works without touching any option.
- **The main button, "Split and download",** runs a qpdf engine in the tool worker. Each part keeps its pages as they were, with the bookmarks that point to them; attached files go with part 1. Several parts come back as one zip, `report-split.zip`, holding `report-part-1.pdf` and so on; the number is padded to the width of the total, so 12 parts are `report-part-01.pdf` to `report-part-12.pdf`. A one-page file gives one part, handed back as `report-split.pdf`.
- **Large page counts never freeze the page.** The grid shows pages in batches of 500, with a button in real units, "Show pages 501 to 1,000", so a crafted file with hundreds of thousands of pages cannot build that many items at once.
  - **This replaces the page-count cap** that `add-page-items-and-zip` (design decision 10) asked for after its stage 2 security review. A cap would be a fixed limit, which `SPEC.md` rules out ("There is no fixed size limit"), so setting one would be the owner's call.
  - **The output has no bound either.** No cuts on a 120,000-page file means 120,000 parts. That job runs in the worker with progress and Cancel and never blocks the page; a phone may run out of memory, which the failure message covers.
- **Page text** below the tool: how-to steps and questions, marked as a draft for the owner.
- **Tests:**
  - engine unit tests over every fixture;
  - an end-to-end test at 360px and 1280px;
  - the no-upload test, with the four checks that `add-page-items-and-zip` (design decision 10) and its privacy review asked for;
  - a generated file with a very large page count, not committed.
- **A small widget addition for the cut toggles** (see "Scope" below).

### Scope

- **One tool.** No other tool is built.
- **The cut toggle.** `PageGrid` gains an optional per-item toggle, and the registry an optional word for it. Only Split PDF uses it. It is the tool's own control, which `add-page-items-and-zip` left to this change ("Split PDF's own control, marking where to cut, comes with Split PDF"). It is not a new component.
- **Out of scope:**
  - typed page ranges ("1-3, 7"), which the owner said can come later;
  - split by size or by bookmarks;
  - selecting, moving, rotating or deleting pages;
  - next steps in the result (see the owner question below).

### `SPEC.md` sections

- "Tool catalogue": Split PDF, `/split-pdf`, Browser, Phase 1, second under "Organise pages".
- "Tool page anatomy": parts 1 to 7, and every state in "States every tool handles".
- "Details that apply everywhere": output names; several outputs as one zip; thumbnails as they scroll into view; a 500-page file must not freeze the page.
- "Architecture and tech stack": page structure with qpdf compiled to WebAssembly; "Rules for the code".
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password.

After a pick, the page fetches only the site's own files:
- the files Merge PDF already fetches (the worker, the workspace chunk, qpdf and its WebAssembly);
- the Split PDF engine;
- PDF.js and its data, for thumbnails;
- `fflate`'s zip step, at the start of every run, whatever the file gives.

No dependency is added.

## Open decisions and owner questions touched

- **Split modes:** split points, the owner's choice of 12 Nov 2026. Built here.
- **Zip:** `fflate`, the owner's choice of 12 Nov 2026, through `add-page-items-and-zip`.
- **Bookmarks and attachments in parts (owner's decisions, 12 Nov 2026).** Asked while this proposal was written, because qpdf alone either keeps every bookmark in every part, some pointing nowhere, or drops them all. The owner chose: each part keeps only the bookmarks that point to its own pages, and attached files go with the first part only. The page says both.
- **Passwords and restrictions on parts (owner's decision, 12 Nov 2026).** Asked at the stage 1 review. The owner chose to drop them, as Merge PDF does: parts have no password and no restrictions, even when the input had them, and the page says so.
- **Next steps for a zip (owner's decision, 12 Nov 2026).** "Tool page anatomy" part 6 gives every result next steps into another tool. No tool opens a zip, so a zip can offer none. The owner accepted leaving them off zips for now. No result shows next steps yet, so this change adds none.
- **Repair PDF link:** as for Merge PDF, a damaged file is offered no link until Repair PDF is published (the existing owner question in `CLAUDE.md`).
- **Licence, source code, domain, analytics, money:** not touched.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `split-pdf`: what the Split PDF tool at `/split-pdf` does. That covers:
  - choosing one file;
  - marking cut points;
  - splitting, with the result as files or a zip;
  - each state of "States every tool handles";
  - nothing uploaded;
  - the words on the page.

### Modified Capabilities

- `tool-page`: a list of pages shows them in batches of 500, so a file with a very large page count never freezes the page. This refines "a 500-page file must not freeze the page".

## Impact

- **New code:**
  - `src/engines/tools/split-pdf.ts` and its unit tests;
  - `src/content/tools/split-pdf.md`;
  - `tests/e2e/split-pdf.spec.ts`;
  - `tests/fixtures/make-many-pages.mjs`, which writes the very-large-page-count file outside the repo.
- **Changed code:**
  - `src/tools/registry.ts`: the Split PDF entry, an optional `itemToggle` with a kind, `resultPages` in place of `resultPagesAreSum`, and an optional `memoryAdvice`;
  - `PageGrid`: an optional per-item toggle button, and batches of 500;
  - `ToolWorkspace` and `useToolRun`: the toggles' state, the line saying what the button will give, and the cuts passed to the engine as options;
  - `scripts/page-weight.mjs` and `scripts/check-worker.mjs`: the new engine file.
- **Merge PDF:** unchanged. It lists files, which never reach a batch of 500 in practice, and has no toggle.
