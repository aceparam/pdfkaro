# Proposal

## Why

Add page numbers is the next Phase 1 tool in catalogue order: the first row of "Edit and sign", after PDF to JPG and PDF to PNG (PR #16) closed "Convert from PDF". People need it to number a report, an application bundle or a set of scans before sending or printing them. It is also the first tool that draws on the pages of a PDF the visitor brings, as Watermark and Sign PDF, next in the catalogue, will.

This change depends on `add-tool-options`, which adds options to the widget and is merged first (`SPEC.md` "Build phases", rule 3).

## What Changes

- **A new page, `/add-page-numbers-to-pdf`,** from a new registry entry: heading "Add page numbers to a PDF", sentence "Put a number on every page of a PDF. Your file stays on your device." The visitor picks one PDF; it is listed as one row (thumbnail of the first page, name, pages, size), as Compress PDF lists its file.
- **One option, "Where the numbers go",** below the row, using `add-tool-options`: "Bottom left", "Bottom centre", "Bottom right", "Top left", "Top centre", "Top right", with "Bottom centre" chosen at first. Once the file is read, focus moves to it.
- **The main button, "Add numbers and download",** gives `report-numbered.pdf`. Every page gets its number, from 1 on the first page: only the digits ("12"), with no "Page" and no "of 120".
- **How a number looks and where it sits:** black, in the standard Helvetica font, set at a size that follows the page (about 10 points on A4 or Letter, so the digits are about 7 points tall; never under 8 or over 72), its foot or top about three times that size from the edge (about 10 mm on A4). It sits upright at the chosen edge of the page as a reader shows it, whatever the page's turn, size or boxes, and inside the part shown. It is marked as a page number, not text of the page, so in a file with accessibility tags a screen reader skips it as it skips any page number.
- **What the new file keeps:** every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. Each page's own content stays where it was; the number is added after it. The file is written afresh, so earlier saved versions stored inside it are not kept, a digital signature stops being valid, and a file that met PDF/A no longer does; the page says so. The new file has no password and no restrictions, by the owner's decision of 13 Nov 2026, which names Add page numbers; the page says so.
- **Progress** in real units: "Reading the file", "Page 14 of 120" while the numbers are drawn, then "Writing the numbered file", with Cancel.
- **Shared code:**
  - **Drawing on pages, `src/engines/stamp.ts`.** pdf-lib draws one layer per page, sized to the page as it is shown; the step adds each layer to its page as a form XObject, with a matrix worked out from the page's shown box, turn and user unit, and writes the file through qpdf's JSON update. Watermark and Sign PDF will reuse it.
  - **A backstop on the result's size:** if the new file would grow far past what numbers add, it is not made, and the page says so in one sentence (a new failure kind).
- **Page text, tests and screenshots,** as for the earlier tools.

### Scope

- **One tool,** on top of `add-tool-options`. It reuses `FilePicker`, `PageGrid` (one file row), `Result` and the widget.
- **Out of scope:**
  - a first number other than 1, "Page 3 of 12" or any words around the number, other fonts, sizes, colours or margins;
  - leaving out a cover or numbering only some pages, and Roman numerals; Bates numbering and headers and footers are their own phase 3 tools;
  - left and right swapped on facing pages;
  - a preview of the number on the thumbnail;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Add page numbers, `/add-page-numbers-to-pdf`, Browser, Phase 1, first under "Edit and sign".
- "Architecture and tech stack": drawing on pages with `@cantoo/pdf-lib` ("numbers" is named there), page structure with qpdf; "Rules for the code" 1 to 4.
- "Tool page anatomy" parts 1 to 7, and "States every tool handles".
- "Details that apply everywhere": output names; nothing downloads on its own.
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool", including mixed sizes and mixed rotation in the test set, and "Leaves alone what it was not asked to change".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, a password or the chosen place. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data (for the first page's thumbnail), and the engine with `stamp` and `qpdf-json`; at the main button, pdf-lib's file, which brings `fflate`. No dependency is added, and no request to another origin.

## Open decisions and owner questions touched

- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026, which names Add page numbers.
- **Signed files** (waiting for the owner): the page says a digital signature stops being valid, as Rotate's and Compress's do; nothing more until the owner answers.
- **Shared pieces in tool pull requests** (waiting for the owner): the options went into their own change, `add-tool-options`, as `SPEC.md` asks. This change still carries the drawing step, which only a drawing tool can show working, and the size backstop's failure kind; the pull request names both.
- **Rotate's waiting main button** (waiting for the owner): not touched. The main button works as soon as the file is read; the option always holds a value that works.
- **New files keep accessibility tags whole** (13 Nov 2026): kept. Each page's own content, with its marked content and `/StructParents`, stays in the page's content; a test checks every tagged piece of content is still there.
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **Licence:** no dependency is added and no `LICENSE` file.
- **The agent's own choices,** named in the pull request: one option, six places with "Bottom centre" first; numbers from 1, digits only; the size and margin rule; black Helvetica, not put inside the file; the number marked as a page number; every page numbered; the placement method (pdf-lib layers added as form XObjects through qpdf's JSON update, with our own matrix, changing nothing stored on a page but its resources and content list); the size backstop; the output name `-numbered`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `add-page-numbers`: what the Add page numbers tool at `/add-page-numbers-to-pdf` does: choosing one file, choosing where the numbers go, numbering every page upright at that edge, what the new file keeps, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-engines`: a new requirement, "Drawing on the pages of a PDF", for tools that draw on pages, stated by its result: drawn with pdf-lib, upright as the page is shown, inside the part shown, above the page's own content, with nothing else changed.

## Impact

- **New code:**
  - `src/engines/tools/add-page-numbers.ts`;
  - `src/engines/stamp.ts`;
  - `src/content/tools/add-page-numbers-to-pdf.md`;
  - unit tests, `tests/e2e/add-page-numbers.spec.ts` and the tool's no-upload test.
- **Changed code:**
  - the registry entry, and its line in `src/widget/option-values.ts`;
  - `src/engines/qpdf.ts`, which gains `append`, so the update can be written in pieces, and `refused`, which says whether a capped file refused a write (qpdf can finish with exit 0 after one);
  - the failure kind `output-limit`, in `src/widget/state.ts`, `failures.ts` and `worker-core.ts`;
  - `check-worker.mjs`, which checks the engine and `stamp` load late and hold no pdf-lib code;
  - the `@cantoo/pdf-lib` line in `LICENSES.md`, whose reason now names this tool too.
- **Other tools:** no change in behaviour; their tests must pass unchanged.
