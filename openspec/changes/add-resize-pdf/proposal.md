# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF, the first Phase 2 row, is merged and archived (`add-crop-pdf`, PR #38). The next row is **Resize pages to A4 or Letter** (`/resize-pdf`, "Organise pages", Browser, Phase 2, eighth in its group after Crop PDF). `SPEC.md` names the tool and its address and says nothing more.

The common reasons to resize: a form portal or a printer that wants A4 and the file is Letter (or the other way round); scans of mixed sizes that should print on one paper; slides or a poster that should print on an office sheet. **The owner decided on 24 Nov 2026** (`CLAUDE.md`, "Resize pages scales to fit, A4 or Letter only"):

- **"Scale to fit":** each page becomes A4 or Letter; what is on it is made smaller or larger to fit, centred, keeping its proportions; nothing is cut off.
- **"A4 and Letter only":** A4 first; each page keeps its own orientation (a page on its side becomes A4 on its side).

So the page has one choice, "Paper size", built with the existing `ChoiceOption` and `ChoiceGroup` (`add-tool-options`). No new shared component and no new option kind is needed, so the tool is proposed directly, as `SPEC.md` "Build phases" rule 3 allows.

Not built, and why (design, decision 1): other paper sizes (the owner chose A4 and Letter only); changing the paper without scaling, which either cuts content off or adds white space only on two sides (the owner chose scale to fit); one orientation for every page (the owner chose each page's own).

## What Changes

- **A new page, `/resize-pdf`,** from a new registry entry, eighth under "Organise pages", after Crop PDF. The visitor picks one PDF; its row shows the first page, the name, the page count and the size, as every one-file tool does. Then one choice, **"Paper size"**: "A4, 210 by 297 mm" (chosen at first) and "Letter, 8.5 by 11 inches". The main button, "Resize and download", works without touching the choice.
- **How each page is resized:**
  - the page as a reader shows it (its shown box, its turn and its user unit) is fitted into the chosen paper in the same orientation as shown: wider than tall gives the paper on its side, otherwise upright (a square page is upright);
  - it is scaled by one factor, the largest at which all of it fits, so it keeps its shape and nothing is cut off; a page smaller than the paper is enlarged, a larger one shrunk (the owner's decision);
  - it is centred, so a page of another shape gets equal white space at two opposite edges; no other margin is added;
  - a page already the chosen size the same way round, to within 1 point (about 0.35 mm) on each side, is left exactly as it is.
- **What changes in the file, and how** (design, decisions 2 to 5):
  - each resized page's own content streams are not rewritten: two small new streams are put around them in `/Contents`, the first saving the drawing state, scaling and moving the page's drawing into the new paper and clipping it to where the page was shown before, the second restoring the state. This is the same `[q, own streams, Q]` wrap the stamp tools use, so marked content tied to tags, shared content streams and resources stay as they were;
  - the page's `/MediaBox` and `/CropBox` become the new paper, written on the page itself; its `/UserUnit` is removed (the scale includes it, and many readers ignore it); its `/Rotate` is kept, so it shows the same way up; its own `/BleedBox`, `/TrimBox`, `/ArtBox`, `/Thumb` (an embedded thumbnail of the old layout) and `/VP` (measuring scales that would no longer be true) are removed;
  - links, form fields, notes and other annotations on a resized page move and scale with it: their `/Rect` and the other places they store (`/QuadPoints`, `/InkList`, `/Vertices`, `/L`, `/CL`, `/RD`) go through the same scale and move. A reader fits an annotation's drawn appearance into its `/Rect`, so its look follows exactly;
  - destinations that point to a resized page (bookmarks, links, named destinations, the opening view), with their left, top or rectangle, go through the same scale and move, so a bookmark still lands on the same spot; the beads of reading threads on a resized page too;
  - text, tags, bookmarks, attached files and the document's details are kept. The file is written afresh, so earlier saved versions inside it are not kept and a digital signature stops being valid. The new file has no password and no restrictions, as every page tool's, and the page says so.
- **A file where no page changes** (every page already the chosen size): no new file is made, and the page says "Every page is already that size." with words saying the file can be used as it is, using the "no new file" outcome Compress PDF, Remove a password and Crop PDF use.
- **Progress:** "Reading the file", then "Page N of M" while the changes are worked out, then writing; Cancel works throughout.
- **The "Organise pages" hub words** gain resizing, as a tool joining a group with a hub must (`add-search-basics`).
- **Shared engine code, no shared component:** `readPages` in `src/engines/stamp.ts` gains an option to give back every object it read (`{ objects: true }`), as Crop added `{ pictures: true }`, and the two helpers that write an update in pieces (`opening`, `entryText`) are exported. The stamp tools' and Crop's behaviour does not change.
- **Page text, tests and screenshots,** as for every tool.

### Scope

- **One tool,** with no new shared component and no new option kind.
- **Out of scope:**
  - other paper sizes, a size the visitor types, and one orientation for every page (the owner's decisions of 24 Nov 2026);
  - a margin around the content, choosing which pages to resize, and changing the paper without scaling;
  - scaling the font size a form field uses when a reader draws typed text afresh (design, Risks);
  - knowing before the main button that every page is already the chosen size, and "Go back to your file" in a no-new-file result to try the other size (left for later; Remove a password has the same gap);
  - next steps after the result, a known gap across the site;
  - the missing thousands separator in "Page N of M", recorded as known since Crop.

### `SPEC.md` sections

- "Tool catalogue": Resize pages to A4 or Letter, `/resize-pdf`, Browser, Phase 2, eighth under "Organise pages".
- "What we are building": rules 1, 2, 4 ("Honest about limits": what does not scale exactly) and 5.
- "Architecture and tech stack": qpdf for page structure; "Rules for the code" 1 to 4.
- "Tool page anatomy": parts 1 to 7 (part 4: one option, with a default that makes the main button work), and every state in "States every tool handles".
- "Details that apply everywhere": output names.
- "SEO": "Every tool page"; "Site-wide" (the group's hub page).
- "Privacy, limits and security": "Browser tools".
- "Build phases": Phase 2, with the owner's decision of 23 Nov 2026; rule 3 (no new shared component).
- "Definition of done": "Each tool", the whole test set, and "Leaves alone what it was not asked to change: links, bookmarks, form fields and text stay intact".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf'], job: ['qpdf'] }`, as Rotate PDF does: after a pick the page fetches the read set (qpdf and its WebAssembly, `inspect`) and the draw set for the first page's thumbnail (PDF.js, its worker and its fixed helper data), as for every PDF tool; the job's fresh worker loads qpdf and the Resize engine with the files it imports (`plain`, `stamp`, `qpdf-json`, `option-values`). No PDF.js, pdf-lib or `fflate` in the job. The set is chosen by tool, never by the file or the paper chosen (`add-uniform-requests`). No dependency is added.

## Open decisions and owner questions touched

- **Decided by the owner, 24 Nov 2026:** scale to fit, centred, keeping proportions, nothing cut off, shrunk or enlarged; A4 and Letter only, A4 first; each page keeps its own orientation.
- **Going ahead on defaults, listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md`:**
  1. a page already the chosen size (within 1 point each way, the same way round) is left exactly as it is, and a file where every page is gives no new file;
  2. a square page becomes upright paper;
  3. no white margin is added: the content reaches two edges of the paper (a page the paper's shape reaches all four), so a printer that cannot print to the edge may leave out a thin strip when printing at actual size, as it would have before;
  4. a resized page's own bleed, trim and art boxes are removed (the new paper is the finished size), not scaled with it;
  5. passwords and restrictions dropped, extending the owner's decision of 13 Nov 2026 for page tools, as Crop did.
- **20,000 pages:** the shared notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for every tool, no link until Repair PDF is published.
- **Signed files** (open owner question): Resize, like every page tool, makes a signature invalid and says so.
- **Tagged reading order and tagged fields** (open owner questions): not touched; the tags are kept whole, and content is not rewritten, so they still point at their text.
- **Shared pieces in tool pull requests** (open owner question): the `objects` option of `readPages` and the two exported update helpers ride along with this tool, as Crop's `pictures` option did; named in the pull request.
- **Character maps:** not touched; PDF.js only draws the first page's thumbnail here.
- **Licence, server host, money, analytics, AI tools:** not touched. No server, no dependency.
- **The agent's own choices,** named in the pull request: the choice's labels, the output name `-resized`, the words, the hub words, removing `/Thumb` and `/VP`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `resize-pdf`: what the Resize pages tool at `/resize-pdf` does. That covers choosing one file, the paper-size choice, how each page is fitted, what moves with it, what the new file keeps and changes, a file where no page changes, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-registry`: "Seven groups" counts eight published tools on the "Organise pages" hub.

## Impact

- **New code:**
  - `src/engines/tools/resize-pdf.ts`;
  - `src/content/tools/resize-pdf.md`;
  - `tests/unit/resize-pdf.test.ts` (and a small `tests/unit/resize-helpers.ts` for files made in the test, if needed);
  - `tests/e2e/resize-pdf.spec.ts`.
- **Changed code:**
  - `src/tools/registry.ts`: the entry, the "Organise pages" hub words, the comment on Crop's `related` that waits for Resize; `tests/unit/registry.test.ts`: the entry test and the lists of tools that may give no file;
  - `src/widget/option-values.ts`: the `'resize-pdf': { paper: ['a4', 'letter'] }` line;
  - `src/engines/stamp.ts`: `readPages(…, { objects: true })`, and `opening` and `entryText` exported;
  - `scripts/page-weight.mjs`: the `why` text of `stamp`, which Resize now also loads; optionally the note in `scripts/check-worker.mjs` that names the stamp step's users;
  - `tests/e2e/uniform-requests.spec.ts` and, if its lists need it, `tests/e2e/tool-files.ts`; `tests/e2e/performance.spec.ts` (the 100 ms test);
  - `tests/fixtures/README.md`, with Resize's outcome on every file for each paper size.
- **Every other tool:** no change in behaviour. The stamp tools and Crop read pages as before and their tests must pass unchanged.
