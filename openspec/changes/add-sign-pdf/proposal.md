# Proposal

## Why

Sign PDF is the next Phase 1 tool in catalogue order: the third row of "Edit and sign", after Add page numbers (PR #19) and Watermark (PR #22, merged and archived). People use it to put their signature on a form or a letter before they send it back. `SPEC.md` "Scope notes for specific tools" says: "Sign PDF places a drawn, typed or uploaded signature image on the page. Certificate signatures are the separate phase 3 tool." It is the third tool that draws on the visitor's pages, so it reuses the drawing step (`src/engines/stamp.ts`).

This change depends on three shared changes, merged first as `SPEC.md` "Build phases" rule 3 asks: `add-option-conditions` (only the way chosen is shown), `add-drawing-option` (the drawing pad) and `add-picture-option` (a picture chosen beside the PDF). `add-watermark` is merged and archived (PR #22).

## What Changes

- **A new page, `/sign-pdf`,** from a new registry entry: heading "Sign a PDF", sentence "Put your signature on a PDF: type your name, draw it, or use a picture of it. Your file stays on your device." The visitor picks one PDF; it is listed as one row (first page's thumbnail, name, pages, size), as Watermark lists its file.
- **How the signature is made,** a choice of three, "Type your name" first:
  - **Type your name:** a field "Your name", up to 50 characters on one line, of the standard fonts' characters (letters from English and other Western European languages, numbers and common marks), drawn in the standard Times Italic font. Other scripts are refused with a sentence that points to drawing or a picture instead, by the owner's decision of 21 Nov 2026 (issue #20).
  - **Draw it:** the drawing pad, with a finger, a mouse or a pen; its hint names typing as the keyboard way.
  - **Use a picture of it:** a JPG or PNG, read in the worker; none of its details (camera, date, place) are copied. No size refuses it: over 8 MB or 16 million pixels the page shows a notice naming its size and saying to crop it to the signature or save a smaller copy, and the job still runs. Its data goes into the file still compressed and once, however many pages carry it; if it alone would pass the drawing step's size budget, the job stops with a sentence about the picture, not about a damaged file.
  - Only the way chosen is shown and sent. The signature is the job's input: the main button, "Sign and download", waits until the way chosen has a signature, with its sentence ("Type your name first.", "Draw your signature first.", "Choose a picture of your signature first.").
- **Which pages:** "Last page" (first), "First page" or "Every page".
- **Where on the page:** six places, as Add page numbers offers, "Bottom right" first.
- **How it is drawn:** black (a picture keeps its own colours), upright as each page is shown whatever its turn, size or boxes, inside the part of the page shown with a margin of a twentieth of its shorter side, at most three tenths of that side wide and a tenth of it tall (a typed name a twentieth tall), keeping the signature's own shape. Drawn above the page's own content. The signature is made once and shared by every page it is on.
- **Pages not chosen are left exactly as they were.** The drawing step gains a way to draw on some pages only; Add page numbers and Watermark still draw on every page.
- **The main button gives `report-signed.pdf`.** Everything Watermark keeps is kept: every page and everything on it, text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. The file is written afresh, so earlier saved versions inside it are not kept, a digital signature already in it stops being valid, and a file that met PDF/A no longer does. The new file has no password and no restrictions, by the owner's decision of 13 Nov 2026, which names Sign PDF. The result says that the signature is drawn on the page and is not a digital signature.
- **Progress** in real units: "Reading the file", "Page 14 of 120" when every page is signed, then "Writing the signed file", with Cancel.
- **Page text, tests and screenshots,** as for the earlier tools.

### Scope

- **One tool,** on top of the three shared changes. It reuses `FilePicker`, `PageGrid` (one file row), `Result`, the widget, the choice, text, drawing and picture options, `stampPages` and the picture reader.
- **Small shared pieces ride along**, named in the pull request: `stampPages` takes an optional choice of pages (`only`), so a page not chosen is not touched, and counts objects shared by every page once against its budget (`sharedBytes`); the table that turns a picture by its camera turn moves from Image to PDF's engine into `src/engines/picture.ts`; and a text option may give `charactersAdvice`, said after "Some characters cannot be used." (Sign PDF points to drawing or a picture). None changes another tool's behaviour.
- **Out of scope:**
  - placing the signature by dragging it on a page preview, or on any page but the first, the last or all;
  - a size, colour or font to choose; a date or initials beside it; several signatures;
  - signature fields of a form;
  - a certificate (digital) signature, the separate phase 3 tool;
  - removing a picture's background, cropping or turning it;
  - characters outside the standard fonts for a typed name (taken up later, issue #20);
  - a preview of the signature on the thumbnail;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Sign PDF, `/sign-pdf`, Browser, Phase 1, third under "Edit and sign".
- "Scope notes for specific tools": "Sign PDF places a drawn, typed or uploaded signature image on the page. Certificate signatures are the separate phase 3 tool."
- "Architecture and tech stack": drawing on pages with `@cantoo/pdf-lib` ("signature" is named there), page structure with qpdf; "Rules for the code" 1 to 4.
- "What we are building", rule 4, "Honest about limits", and rule 5, "Works on a phone".
- "Tool page anatomy" parts 1 to 7, and "States every tool handles".
- "Details that apply everywhere": output names; nothing downloads on its own.
- "Look and feel": no images but the visitor's own page thumbnails (the signature picture is not shown).
- "SEO": "Every tool page".
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool", including keyboard alone and screen reader (by typing or a picture), and "Leaves alone what it was not asked to change".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, a password, the typed name, the drawing or the picture. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data (for the first page's thumbnail), and the engine with the drawing step (`stamp`) and the picture reader; when a picture is chosen, and in any case at the main button, pdf-lib's file, which brings `fflate`. No dependency or font is added, and no request to another origin.

## Open decisions and owner questions touched

- **Fonts for other scripts later** (owner, 21 Nov 2026; issue #20): a typed name accepts only the standard font's Western European characters and refuses others with a sentence. Not reopened. The page says other scripts cannot be typed for now and that drawing or a picture works in any script.
- **Page tools drop passwords and restrictions** (owner, 13 Nov 2026), which names Sign PDF: the new file has none; the page says so.
- **Signed files** (waiting for the owner): the result and the page say a digital signature already in the file stops being valid, as the other page tools' do. The page also says this tool's signature is not a digital signature.
- **Waiting main buttons** (waiting for the owner): touched. Sign PDF's main button waits until a signature is made. When the pull request opens, that question in `CLAUDE.md` is widened to name Sign PDF.
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4): the signature is read as the job's input, not an option, as the watermark text was; the agent's reading, named in the pull request. The choices (how, which pages, where) start at values that work.
- **Picture details** (waiting for the owner): the signature picture's details are not copied, as Image to PDF does.
- **No fixed size limit** and **Very large PNGs** (waiting for the owner): kept. The signature picture is never refused for its size; over 8 MB or 16 million pixels it gets a notice, as Image to PDF's pictures do (the coordinator's decision at stage 1). The owner is asked "Refuse very large signature pictures, or keep the notice?" (from `add-picture-option`; does not block).
- **Shared pieces in tool pull requests** (waiting for the owner): the three shared components come first in their own pull requests; the small shared pieces that ride along are named: `stampPages`' `only` and its budget for shared objects, the turn table, and a text option's optional `charactersAdvice`.
- **Tagged reading order** and **tagged fields of left-out pages** (waiting for the owner): not touched. The signature is not added to a tagged file's tags; the page says a screen reader may not announce it there (a new question below).
- **20,000 pages:** the notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **Licence:** no dependency, font or `LICENSE` file is added.
- **The multilingual test file** is still missing; Sign PDF leaves existing text alone.

New questions for the owner, none of which blocks building:
- **Placing the signature.** The first version offers the first, last or every page and six places at the edge of the page. A signature line elsewhere on a page cannot be reached, and the page says so. Add placing by dragging on a page preview (with a keyboard way) later, as its own shared component? And offer "Go back to your file" on the result, so a badly placed signature can be redone without drawing it again (a shared `Result` change, later)?
- **The typed signature's look.** A typed name is drawn in Times Italic, a standard font every reader has. A handwriting-style font would have to be put inside each file. Keep Times Italic, or look at a handwriting font with issue #20?
- **Signatures in tagged files.** The signature is not added to a tagged file's tags, so a screen reader may not announce it. Add it to the tags as a figure named "Signature" later?

The agent's own choices, named in the pull request: the three ways and "Type your name" first; Times Italic; black; last page first; six places, "Bottom right" first; the size rule (margin a twentieth of the shorter side, at most three tenths wide and a tenth tall, a typed name a twentieth tall); drawn above the content; not marked as an artifact (it is the page's content) and not tagged; one shared signature form; `-signed`; the result note that it is not a digital signature.

## Capabilities

### New Capabilities

- `sign-pdf`: what the Sign PDF tool at `/sign-pdf` does: choosing one file, making the signature in one of three ways, choosing the pages and the place, drawing it, what the new file keeps, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-engines`: a new requirement, "Drawing on some pages only": the drawing step can be told which pages to draw on, and leaves every other page exactly as it was.

## Impact

- **New code:**
  - `src/engines/tools/sign-pdf.ts`;
  - `src/content/tools/sign-pdf.md`;
  - `tests/unit/sign-pdf.test.ts`, `tests/e2e/sign-pdf.spec.ts` and the tool's no-upload test.
- **Changed code:**
  - the registry entry, third under "Edit and sign", and its lines in `optionValues`, `optionTexts`, `optionDrawings` and `optionPictures` in `src/widget/option-values.ts`;
  - `src/engines/stamp.ts` (`only`, with tests in `tests/unit/stamp.test.ts`);
  - `src/engines/picture.ts` and `src/engines/tools/images-to-pdf.ts` (the turn table moved, Image to PDF's tests unchanged);
  - `check-worker.mjs`, which checks the engine loads late and holds no pdf-lib code;
  - `tests/fixtures/README.md`, with each fixture's outcome;
  - the `@cantoo/pdf-lib` line in `LICENSES.md`, whose reason names this tool too;
  - `CLAUDE.md` "Questions waiting for the owner", when the pull request opens.
- **Other tools:** no change in behaviour; their tests must pass unchanged. Add page numbers' and Watermark's related links to Sign PDF start to show.
