# Proposal

## Why

Watermark is the next Phase 1 tool in catalogue order: the second row of "Edit and sign", after Add page numbers (PR #19). People use it to mark a file as a draft, a copy, or meant for one reader before they send it on. It is the second tool that draws on the visitor's pages, so it reuses the drawing step Add page numbers built (`src/engines/stamp.ts`).

This change depends on `add-text-option`, which adds a typed text to the widget and is merged first (`SPEC.md` "Build phases", rule 3).

## What Changes

- **A new page, `/watermark-pdf`,** from a new registry entry: heading "Add a watermark to a PDF", sentence "Put your own text across every page of a PDF. Your file stays on your device." The visitor picks one PDF; it is listed as one row (thumbnail of the first page, name, pages, size), as Add page numbers lists its file.
- **The watermark text is the job's input:** a field "Watermark text", empty at first, below the row, using `add-tool-options`' focus rule and `add-text-option`'s field. Up to 50 characters on one line. The main button, "Add watermark and download", waits until text is typed, with "Type the watermark text first." tied to it. Once the file is read, focus moves to the field.
- **Which characters:** the standard fonts' characters only, `add-text-option`'s `'standard-font'` rule: letters from English and other Western European languages, numbers and common marks. Hindi, Telugu, Arabic, Chinese and other scripts are refused with a sentence, never drawn as question marks. If the engine were ever sent a text it does not take, the page says "The watermark text could not be used. Check it and try again." Putting a font inside the file so any language can be used is to be taken up later (owner, 21 Nov 2026; issue #20).
- **How the watermark looks and where it sits:** drawn once on every page, across the centre of the page as a reader shows it, rising from lower left to upper right at 45 degrees, whatever the page's turn, size or boxes. Bold Helvetica (a standard font, not put inside the file), mid-grey at 40% opacity, so text under it stays readable. Sized so the whole text fits inside the part of the page shown with a margin, and never taller than a fifth of the page's shorter side. Drawn above the page's own content, so it shows over pictures and scans, and marked as a watermark, not text of the page, so a screen reader skips it.
- **The main button gives `report-watermarked.pdf`.** What the new file keeps is what Add page numbers keeps: every page and everything on it, with text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. Each page's own content stays where it was; the watermark is added after it. The file is written afresh, so earlier saved versions stored inside it are not kept, a digital signature stops being valid, and a file that met PDF/A no longer does; the page says so. The new file has no password and no restrictions, by the owner's decision of 13 Nov 2026, which names Watermark; the page says so.
- **Progress** in real units: "Reading the file", "Page 14 of 120" while the watermark is drawn, then "Writing the watermarked file", with Cancel.
- **Page text, tests and screenshots,** as for the earlier tools. No shared code changes: the drawing step, the output-limit failure and the text field are reused as they are.

### Scope

- **One tool,** on top of `add-text-option`. It reuses `FilePicker`, `PageGrid` (one file row), `Result`, the widget and `stampPages`.
- **Out of scope:**
  - any other option: size, colour, opacity, angle, place, font, a picture watermark, several lines, a watermark under the page content;
  - characters outside the standard fonts (taken up later, issue #20);
  - a watermark on some pages only;
  - a preview of the watermark on the thumbnail;
  - making the watermark hard to remove; it marks the file and does not protect it, and the page says so;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Watermark, `/watermark-pdf`, Browser, Phase 1, second under "Edit and sign".
- "Architecture and tech stack": drawing on pages with `@cantoo/pdf-lib` ("watermark" is named there), page structure with qpdf; "Rules for the code" 1 to 4.
- "What we are building", rule 3 ("No watermark") is about the site adding its own mark to results; this tool adds only the visitor's text, only when asked.
- "What we are building", rule 4, "Honest about limits": characters that cannot be drawn are refused with a sentence.
- "Tool page anatomy" parts 1 to 7, and "States every tool handles".
- "Details that apply everywhere": output names; nothing downloads on its own.
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool", including mixed sizes and mixed rotation in the test set, and "Leaves alone what it was not asked to change".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, a password or the watermark text. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data (for the first page's thumbnail), and the engine with the drawing step (`stamp`, now a file of its own, shared with Add page numbers) and the qpdf JSON helpers (inside the shared `plain` file); at the main button, pdf-lib's file, which brings `fflate`. No dependency is added, and no request to another origin.

## Open decisions and owner questions touched

- **Watermark text in other scripts: taken up later (owner, 21 Nov 2026; issue #20).** Standard Helvetica draws only Western European characters, so Hindi, Telugu, Arabic and Chinese are refused with a sentence. Drawing them needs a font put inside each new file and a library to place its letters correctly; issue #20 holds what it would take and the owner's questions on which scripts and tools. The assumed default stays the plainest: Western European characters only, with a sentence for the rest.
- **Passwords and restrictions:** dropped, by the owner's decision of 13 Nov 2026, which names Watermark.
- **Signed files** (waiting for the owner): the page says a digital signature stops being valid, as Rotate's, Compress's and Add page numbers' do.
- **Rotate's waiting main button** (waiting for the owner): touched. Watermark's main button waits until text is typed, as Extract's waits for a page. When the pull request opens, the question in `CLAUDE.md` is widened to: "Rotate's and Watermark's main buttons wait until something is done (a page turned, text typed), while Reorder's works untouched. Keep them as they are, or make them match?"
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4): the owner decided Extract pages starts with no page chosen; reading such input as not an option is the agent's, and reading the watermark text that way is the agent's too (`add-text-option`); named in the pull request.
- **Shared pieces in tool pull requests** (waiting for the owner): none ride along. The text field is `add-text-option`, and the drawing step is reused unchanged.
- **New files keep accessibility tags whole** (13 Nov 2026): kept; a test checks every tagged piece of content is still in its page's content.
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **Licence:** no dependency, font or `LICENSE` file is added.
- **The multilingual test file** is still missing; Watermark leaves existing text alone, so it changes nothing there.
- **The agent's own choices,** named in the pull request: no option but the text; 50 characters on one line; 45 degrees rising left to right across the centre; the size rule (fits inside the shown part with a margin of a twelfth of the shorter side, at most a fifth of it); bold Helvetica, mid-grey, 40% opacity; drawn above the page content; marked as a watermark artifact; every page; `-watermarked`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `watermark-pdf`: what the Watermark tool at `/watermark-pdf` does: choosing one file, typing the watermark text, drawing it across every page as the page is shown, what the new file keeps, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

None. The drawing step's requirement ("Drawing on the pages of a PDF" in `tool-engines`) already names Watermark, and the text field's requirements come with `add-text-option`.

## Impact

- **New code:**
  - `src/engines/tools/watermark-pdf.ts`;
  - `src/content/tools/watermark-pdf.md`;
  - `tests/unit/watermark-pdf.test.ts`, `tests/e2e/watermark-pdf.spec.ts` and the tool's no-upload test.
- **Changed code:**
  - the registry entry, second under "Edit and sign", and its line in `optionTexts` in `src/widget/option-values.ts`;
  - `check-worker.mjs`, which checks the engine loads late and holds no pdf-lib code;
  - `tests/fixtures/README.md`, with each fixture's outcome;
  - the `@cantoo/pdf-lib` line in `LICENSES.md`, whose reason now names this tool too;
  - `CLAUDE.md` "Questions waiting for the owner", when the pull request is opened: "Rotate's waiting main button" is widened to Watermark's. The font question was settled by the owner on 21 Nov 2026 (taken up later in issue #20).
- **Other tools:** no change in behaviour; their tests must pass unchanged, except that Add page numbers' exact no-upload allowlist names the drawing step's own file, `stamp-*.js`, which the bundler splits out of its engine once two engines import it. Add page numbers' related link to Watermark starts to show.
