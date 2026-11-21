# Proposal

## Why

Add page numbers is the next Phase 1 tool in catalogue order: the first row of "Edit and sign", after PDF to JPG and PDF to PNG (PR #16) closed "Convert from PDF". People need it to number a report, an application bundle or a set of scans before sending or printing them. It is also the first tool that draws on the pages of a PDF the visitor brings, which Watermark and Sign PDF, next in the catalogue, will do too.

## What Changes

- **A new page, `/add-page-numbers-to-pdf`,** from a new registry entry: heading "Add page numbers to a PDF", sentence "Put a number on every page of a PDF. Your file stays on your device." The visitor picks one PDF; it is listed as one row (thumbnail of the first page, name, pages, size), as Compress PDF lists its file.
- **Two options, below the row,** set so the main button works untouched:
  - **"Where the numbers go":** six choices, "Bottom left", "Bottom centre", "Bottom right", "Top left", "Top centre", "Top right", as a group of radio buttons; "Bottom centre" is chosen at first.
  - **"First number":** a whole number from 1 to 999,999, 1 at first, for a file that carries on from another one. While the field does not hold such a number, it says "Type a whole number from 1 to 999,999." and the main button is unavailable with that sentence tied to it.
- **The main button, "Add numbers and download",** gives `report-numbered.pdf`. Every page gets its number, counting up from the first number: only the digits ("12"), with no "Page" and no "of 120".
- **How a number looks and where it sits:** black, in the standard Helvetica font, sized to the page (about 10 points on A4 or Letter, never under 8 or over 72), about three times its own height in from the two nearest edges of the page as it is shown. It sits upright at the chosen edge as the page is shown, whatever the page's turn, size or boxes, and never outside the part of the page a reader shows. It is marked as a page number, not text of the page, so in a file with accessibility tags a screen reader skips it as it skips any page number.
- **What the new file keeps:** every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. The file is written afresh, so earlier saved versions stored inside it are not kept, a digital signature stops being valid, and a file that claims to meet PDF/A no longer does, as the number's font is not inside the file; the page says so. The new file has no password and no restrictions, by the owner's decision of 13 Nov 2026, which names Add page numbers; the page says so.
- **Progress** in real units: "Reading the file", "Page 14 of 120" while the numbers are drawn, then "Writing the numbered file", with Cancel.
- **Shared code:**
  - **Options in the working area.** No tool has shown an option yet. A tool's registry words can now list options: a choice of one from several, or a whole number with its limits. `ToolWorkspace` draws them from those words, as it draws the turn buttons, the state keeps what the visitor chose, and the job sends it to the engine on top of the page's preset. Watermark and Sign PDF will use the same words.
  - **Drawing on pages, `src/engines/stamp.ts`.** A tool draws one layer page per page of the file with pdf-lib, sized to that page as it is shown; qpdf places each layer page on its page with `--overlay`, keeping everything else in the file. This step reads every page's turn and boxes first, and, on pages whose turn or boxes qpdf would read differently from a PDF reader, writes them the way readers already show them. Watermark and Sign PDF will reuse it.
- **Page text, tests and screenshots,** as for the earlier tools.

### Scope

- **One tool.** It reuses `FilePicker`, `PageGrid` (one file row), `Result` and the widget. The options are drawn by `ToolWorkspace` from the registry, with plain-function rules in `src/widget/options.ts`, so no new shared component is added (`SPEC.md` "Build phases", rule 3). If the review panel reads the options as a new shared component, task group 1's options work and task 5.1 to 5.2 move into their own change, `add-tool-options`, merged first.
- **Out of scope:**
  - "Page 3 of 12" or any words around the number, other fonts, sizes, colours or margins;
  - leaving out the first pages (a cover) or numbering only some pages, and Roman numerals; Bates numbering and headers and footers are their own phase 3 tools;
  - left and right swapped on facing pages;
  - a preview of the number on the thumbnail;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Add page numbers, `/add-page-numbers-to-pdf`, Browser, Phase 1, first under "Edit and sign".
- "Architecture and tech stack": drawing on pages with `@cantoo/pdf-lib` ("numbers" is named there), page structure with qpdf; "Rules for the code" 1 to 4.
- "Tool page anatomy" parts 1 to 7, including part 4 ("only the options this tool needs. Defaults are set so the main button works without touching any option"), and "States every tool handles".
- "Details that apply everywhere": output names; nothing downloads on its own.
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool", including mixed sizes and mixed rotation in the test set, and "Leaves alone what it was not asked to change".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, a password or a chosen option. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data (for the first page's thumbnail), and the engine with `stamp` and `qpdf-json`; at the main button, pdf-lib's file, which brings `fflate`. No dependency is added, and no request to another origin.

## Open decisions and owner questions touched

- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026, which names Add page numbers.
- **Signed files** (waiting for the owner): the page says a digital signature stops being valid, as Rotate's and Compress's do; nothing more until the owner answers.
- **Shared pieces in tool pull requests** (waiting for the owner): this change carries the options and the drawing step, as Reorder, Rotate and Compress carried theirs. The pull request names it.
- **Rotate's waiting main button** (waiting for the owner): not touched. Here the main button works as soon as the file is read, with the options as they start; it waits only while the visitor has typed a first number that is not valid, which is a typing mistake, not a missing choice.
- **New files keep accessibility tags whole** (13 Nov 2026): kept. qpdf's way of placing a layer moves each page's own content into a container on the page; PDF.js still finds every tag's content, and a hand check in Adobe Reader is added to issue #7 (see the design's risks).
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **Licence:** no dependency is added and no `LICENSE` file.
- **The agent's own choices,** named in the pull request: two options only; six places with "Bottom centre" first; the first number from 1 to 999,999; digits only; the size and margin rule; black Helvetica, not put inside the file; the number marked as a page number for screen readers; every page numbered; the output name `-numbered`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `add-page-numbers`: what the Add page numbers tool at `/add-page-numbers-to-pdf` does: choosing one file, the two options, numbering every page upright at the chosen edge, what the new file keeps, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-page`: new requirements "Options a tool needs" and "A typed option that is not valid", for the options in the working area: how they are labelled and grouped, used by keyboard and screen reader, kept and reset, and how a typed value that is not valid holds the main button.
- `tool-engines`: a new requirement, "Drawing on the pages of a PDF", for tools that draw on pages: drawn with pdf-lib, placed on each page by qpdf, upright as the page is shown and inside the part shown, with everything else in the file kept.

## Impact

- **New code:**
  - `src/engines/tools/add-page-numbers.ts`;
  - `src/engines/stamp.ts`;
  - `src/widget/options.ts`;
  - `src/content/tools/add-page-numbers-to-pdf.md`;
  - unit tests, `tests/e2e/add-page-numbers.spec.ts` and the tool's no-upload test.
- **Changed code:**
  - the registry, with the option words (`options`) and the entry;
  - `src/widget/state.ts`, with the options chosen and their action;
  - `ToolWorkspace` (the options below the row, the main button held while a typed option is not valid) and `useToolRun` (the options sent to the engine);
  - `check-worker.mjs`, which checks the engine and `stamp` load late and hold no pdf-lib code;
  - the `@cantoo/pdf-lib` line in `LICENSES.md`, whose reason now names this tool too.
- **Other tools:** no change in behaviour. They list no options, so their working areas are as before; their tests must pass unchanged.
