# Proposal

## Why

Phase 2 has started before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"). Its tools are built in catalogue order, browser tools first. The first Phase 2 row of the catalogue is **Crop PDF** (`/crop-pdf`, "Organise pages", Browser, seventh in its group after Rotate PDF). `SPEC.md` names the tool and lists "Crop" among Phase 2's "harder tools", but says nothing about how a visitor crops.

The common reasons to crop a PDF are white margins: a page that reads too small on a phone, slides exported onto a large sheet, a receipt or a chart on an A4 page. This change makes the tool that cuts those margins off **by itself**, with no option to set: the visitor picks a file and presses one button. That is the plainest way that works by keyboard, by screen reader and with one thumb on a 360 px screen, and it needs **no new shared component**, so the tool can be proposed directly, as `SPEC.md` "Build phases" rule 3 allows.

The other ways were weighed (design, "Alternatives considered"):

- **Drag handles on a page preview:** deferred by the owner as a later shared component (21 Nov 2026, Sign PDF's placement), and hard to use by keyboard and on a phone.
- **Typed margins for each side:** needs a new shared option kind (a number), which would be its own change first (`add-number-option`). It is the next step for files this change cannot help, chiefly scans with grey or dark edges, and is put to the owner as a question, not built here.
- **Margins chosen from a list (5 mm, 10 mm, …):** fits the existing choice option, but cuts the same amount from every side of every page whatever is on it, so it cuts text off one page and leaves margins on the next. Not built.

## What Changes

- **A new page, `/crop-pdf`,** from a new registry entry, seventh under "Organise pages". The visitor picks one PDF; its row shows the first page, the name, the page count and the size, as every one-file tool does. There are no options. The main button, "Crop and download", is ready as soon as the file is read.
- **How each page is cut:**
  - each page is drawn in the worker by PDF.js, as it shows in a reader (its turn, its shown box and its user unit), on white, with form fields and their values, at 72 pixels to the inch and at most 4 million pixels;
  - what is drawn and not white (any colour channel below 240 of 255) is the page's content; so are the boxes of the page's form fields, links and other annotations that a reader shows, so an empty field with no border and a link are never cut away;
  - the page's new shown box is that content, plus a margin of a fortieth of the page's shorter side (about 5 mm on A4) on each side, never larger than the page was;
  - a page with nothing drawn, or whose content already reaches within 1 point of every edge, is left as it is;
  - once PDF.js has been refused any helper data while reading a page (a character map it would need to draw Chinese, Japanese or Korean text in a font the file does not embed, for example), that page and every later page are left as they are, so text PDF.js cannot draw is never cut off.
- **What changes in the file:** only the `/CropBox` of each page that is cut, written on the page itself. The page's content is never rewritten. `/MediaBox`, `/Rotate` and `/UserUnit` are not changed. A page's own `/BleedBox`, `/TrimBox` and `/ArtBox`, where it has them, are cut back to the new crop box (their meaning by the PDF standard does not change, but a reader that ignores that rule would show the old margins); none is added. Text, links, form fields, notes, bookmarks, attached files, details and tags are kept. The file is written afresh, so earlier saved versions inside it are not kept and a digital signature stops being valid. The new file has no password and no restrictions, as every page tool's, and the page says so.
- **What cut means:** the margins are hidden, not removed. Whatever was in them is still in the file and a PDF editor can show it again. The page says so, plainly, and says not to crop to hide something private.
- **A file with nothing to cut:** when no page changes, no new file is made, and the page says "There were no white margins to cut." with what to try, using the "no new file" outcome Compress PDF and Remove a password use.
- **Progress:** "Page N of M" while pages are measured, then writing; Cancel works throughout.
- **The "Organise pages" hub words** gain cropping, as a tool joining a group with a hub must (`add-search-basics`).
- **Shared engine code, no shared component:**
  - `src/engines/thumbnail.ts`'s open document gains one more way to look at a page: where its content is, in the page's own units, or that it is blank, or that it cannot be measured safely. The canvas maker gains a way to read a canvas's pixels (the worker's `OffscreenCanvas` and the Node test's `@napi-rs/canvas` both have one);
  - the Crop engine reads each page's object, boxes and turn with `readPages` from `src/engines/stamp.ts`, unchanged, and writes the boxes with qpdf's JSON update and `cappedWrite`, as the stamp tools and Protect do.
- **Page text, tests and screenshots,** as for every tool.

### Scope

- **One tool,** with no new shared component and no new option kind.
- **Out of scope:**
  - typed or chosen margins, cutting the same box from every page, choosing which pages to cut, and drag placement (owner questions);
  - cropping scans whose paper is grey or whose edges are dark (owner question; the page says so);
  - removing what was cut away (that is Redact's job, a later Phase 2 tool);
  - a preview of where each page will be cut, and pictures of the result;
  - next steps after the result, a known gap across the site;
  - changing page size (Resize pages, the next catalogue row).

### `SPEC.md` sections

- "Tool catalogue": Crop PDF, `/crop-pdf`, Browser, Phase 2, seventh under "Organise pages".
- "What we are building": rules 1, 2, 4 ("Honest about limits": hidden, not removed; scans with dark edges) and 5.
- "Architecture and tech stack": qpdf for page structure, PDF.js for rendering; "Rules for the code" 1 to 4.
- "Tool page anatomy": parts 1 to 7, and every state in "States every tool handles".
- "Details that apply everywhere": output names.
- "SEO": "Every tool page"; "Site-wide" (the group's hub page).
- "Privacy, limits and security": "Browser tools".
- "Build phases": Phase 2, with the owner's decision of 23 Nov 2026 that it starts before the Phase 1 gate; rule 3 (no new shared component).
- "Definition of done": "Each tool", the whole test set.

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker and the PDF.js worker it starts. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf'], job: ['qpdf', 'pdfjs'] }`, so after a pick the page fetches the same kind of set as PDF to JPG minus `fflate`: the worker and workspace, qpdf and its WebAssembly, `inspect`, `plain`, the stamp step's file (for `readPages`), PDF.js, its worker and its fixed helper data, and the Crop engine. The set is chosen by tool, never by the file (`add-uniform-requests`). No dependency is added.

## Open decisions and owner questions touched

- **"No phase starts until the one before it passes its gate"** (`SPEC.md` "Build phases"): overridden by the owner's decision of 23 Nov 2026. The `tool-registry` requirement that blocked a Phase 2 tool is changed in this change to record it.
- **Passwords and restrictions:** dropped, extending the owner's decision of 13 Nov 2026 for page tools, which names the Phase 1 page tools only. Owner question, default dropped.
- **20,000 pages:** the shared notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for every tool, no link until Repair PDF is published.
- **Character maps** (open owner question for PDF to JPG and PNG): Crop ships none either, and leaves alone any page from the one where PDF.js was refused one.
- **Signed files** (open owner question): Crop, like every page tool, makes a signature invalid and says so.
- **Licence, server host, money, analytics, AI tools:** not touched. No server, no dependency.
- **New owner questions, each with the default built:** automatic cropping only, first (typed margins later through a shared number option); the margin left (a fortieth of the shorter side); each page cut to its own content, not one size for all; the white threshold (240 of 255), so scans on grey paper are left as they are; the page boxes cut back with the crop box; passwords dropped.
- **The agent's own choices,** named in the pull request: no options; the output name `-cropped`; the words; the hub words.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `crop-pdf`: what the Crop PDF tool at `/crop-pdf` does. That covers choosing one file, how each page's content is found and cut, what the new file keeps and changes, a file with nothing to cut, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-registry`: "Tools ship in phase and catalogue order" records the owner's decision of 23 Nov 2026 that Phase 2 starts before the Phase 1 gate; "Seven groups" counts seven published tools on the "Organise pages" hub.
- `tool-engines`: a new requirement, "Finding where a page's content is", for the shared step that measures a page in the worker.

## Impact

- **New code:**
  - `src/engines/tools/crop-pdf.ts`;
  - `src/content/tools/crop-pdf.md`;
  - `tests/unit/crop-pdf.test.ts` and `tests/unit/content-box.test.ts`;
  - `tests/e2e/crop-pdf.spec.ts`.
- **Changed code:**
  - `src/tools/registry.ts`: the entry, the "Organise pages" hub words, and the registry test's lists of tools that may give no file;
  - `src/engines/thumbnail.ts`: the content measure and the canvas maker's pixel read; `src/workers/tool.worker.ts` and `tests/unit/thumbnail-helpers.ts`: the pixel read in each canvas maker;
  - `scripts/page-weight.mjs` and `scripts/check-worker.mjs`, which name the new engine;
  - `tests/e2e/uniform-requests.spec.ts` and, if its file lists need it, `tests/e2e/tool-files.ts`, for the new page (the tool's own no-upload test is in `tests/e2e/crop-pdf.spec.ts`, as every tool's is);
  - `tests/fixtures/README.md`, with Crop's outcome on every file;
  - `src/pages/privacy.astro`, one draft sentence: cropping hides, it does not remove;
  - `design/README.md` is not changed.
- **Every other tool:** no change in behaviour. The new `thumbnail.ts` method is used only by Crop; thumbnails, PDF to JPG and PDF to PNG draw as before, and their tests must pass unchanged.
