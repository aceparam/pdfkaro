# Proposal

## Why

Image to PDF is the next Phase 1 tool in catalogue order: it is the last row of "Organise pages", after Rotate PDF (PR #13). The owner decided on 13 Nov 2026 that it is one tool that takes JPG and PNG, served at `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf`, each page worded for its search, and that `/image2pdf` is dropped. So this change builds JPG to PDF and PNG to PDF (both Phase 1, "Convert to PDF") as well, as one tool. People most often need it to turn phone photos or screenshots of a document into one PDF to send or upload.

## What Changes

- **One new tool, `images-to-pdf`, with three pages from one registry entry:**
  - `/jpg-to-pdf`, "Convert JPG to PDF";
  - `/png-to-pdf`, "Convert PNG to PDF";
  - `/image-to-pdf`, "Convert images to PDF".
  Each has its own title, description, heading, sentence (ending "Files stay on your device.") and text below the tool, written for its search. All three take JPG and PNG, because a visitor who drops a PNG on the JPG page wants it converted, not refused.
- **Choosing pictures.** The picker reads "Choose pictures" and takes several at once. Drop and paste also work, so a pasted screenshot is taken. A file that is not a JPG or PNG is refused: "notes.txt is not a JPG or PNG picture, so it was not added. To add a picture of another kind, save it as a JPG or PNG first."
- **The list.** Each picture is listed as Merge PDF lists files: its own thumbnail, its name and its size (no page count), with "Move up", "Move down", "Remove" and drag. "Each picture becomes one page, in this order." sits under the summary. One picture is enough; the main button works with one.
- **Pictures that cannot be converted** are refused by name, from their bytes, before anything is decoded: a damaged one, and a JPG coded in a way many PDF readers cannot draw (arithmetic, 12-bit, lossless or hierarchical), with a sentence saying to save it again as a JPG.
- **Very large pictures.** A PNG of more than 50 million pixels gets no thumbnail and a notice naming its pixels and saying a phone may run out of memory; the job still runs, because `SPEC.md` sets no fixed size limit for browser tools. Whether to refuse such files is an owner question.
- **Thumbnails of pictures** are drawn in the tool worker by the browser's own image decoder, scaled down on an `OffscreenCanvas`, the same way as page thumbnails are handed back. The browser turns a photo upright as its camera recorded (EXIF orientation), so the thumbnail shows it as the visitor's gallery does.
- **The main button, "Convert and download",** gives one PDF named after the first picture: `IMG_2041.jpg` gives `IMG_2041.pdf`. The extension changes, so no word is added to the name.
- **Each page:**
  - is A4, upright for a picture taller than wide, on its side for a wider one;
  - holds its picture centred, as large as fits, but never larger than the picture's own size at 96 pixels to the inch, so a small picture is not blown up and blurred;
  - is turned and mirrored as the camera recorded, so the page matches the thumbnail;
  - has no margin.
- **The pictures are not made worse.** A JPG goes into the PDF as its own compressed data, so it is not compressed again. A PNG is decoded and stored without loss; parts that are see-through show the white page. The colour data of a picture's colour profile is kept, so an iPhone photo in Display P3 keeps its colours; the profile's text, device and date fields are left out. A 16-bit PNG is stored at 8 bits per colour, and an animated PNG gives its first picture; the PNG page text says so.
- **What the PDF keeps from a picture:** the picture and its colours. A JPG is rebuilt from a list of the parts needed to draw it, stopping at its end marker, so camera details, GPS places, thumbnails, and the second picture or video some phones add after the end are all left out. The PDF has no title, author, dates or XMP. The result note says the details are not copied.
- **Shared code:**
  - `src/engines/picture.ts` reads a JPG's or PNG's size and camera turn, checks its structure without decoding it, and rebuilds a JPG from the parts needed to draw it; used by the engine and by the thumbnail.
  - `src/engines/picture-thumbnail.ts` draws a thumbnail of a picture; the worker uses it in place of PDF.js for this tool only.
  - A new outcome of reading a file, `unsupported`, shown where `damaged` is; a notice for very large pictures; and two optional widget words: advice after a refused file, and leaving the page count out of the list.
  - pdf-lib loads through `src/workers/pdflib.ts`, so its file has a stable name the build checks can list.
  - `outputName` takes an empty suffix, giving `IMG_2041.pdf`.
  - The catalogue type gains `image-to-pdf` and drops `image2pdf`, by the owner's decision.
- **Page text, tests and screenshots,** as for the earlier tools.

### Scope

- **One tool.** It reuses `FilePicker`, `PageGrid` (rows of files), `Result` and the widget; no new shared component. The new outcome is shown by the existing damaged-file notice.
- **No options.** Page size, margin and fitting are fixed as above. SPEC.md asks for "only the options this tool needs" and defaults that work without touching one; a page size choice (A4, Letter, the picture's own size) and a margin are an owner question, and would come with a shared options control in its own change.
- **Out of scope:**
  - next steps in the result, a known gap across the site;
  - HEIC, WebP and TIFF, which are phase 2 pages (`/heic-to-pdf` and others); an iPhone turns a HEIC photo into JPG when a page asks for JPG or PNG;
  - compressing pictures, cropping, or straightening a photo of a page;
  - text recognition (OCR, phase 2).

### `SPEC.md` sections

- "Tool catalogue": Image to PDF (Organise pages, Phase 1, last row), JPG to PDF and PNG to PDF (Convert to PDF, Phase 1); the owner's decision of 13 Nov 2026 in CLAUDE.md on how they relate.
- "Architecture and tech stack": `@cantoo/pdf-lib` for "images to PDF".
- "Tool page anatomy": parts 1 to 7, and the states in "States every tool handles" that apply (no password: a picture has none).
- "Details that apply everywhere": output names, reordering by drag and by buttons, thumbnails as they come into view, plain sizes.
- "SEO": "Every tool page" for each of the three pages, and "Specific-search pages" (each page written for its search, not one text with a word swapped).
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, the engine, and the shared `picture` and `picture-thumbnail` files; at the main button, pdf-lib's file and `fflate`'s file, which pdf-lib uses. qpdf, PDF.js and its data are not fetched. The shared no-upload watcher also gains a check on request headers.

## Open decisions and owner questions touched

- **How Image to PDF relates to JPG and PNG to PDF:** answered by the owner on 13 Nov 2026; this change follows it. Image to PDF sits in "Organise pages" in the catalogue and the other two in "Convert to PDF"; one tool has one group, so all three pages are listed under "Convert to PDF", where people look for a conversion.
- **New dependency:** `@cantoo/pdf-lib`, the library `SPEC.md` names for this job, moves from a test-only dependency to one the site ships. It is MIT, as are the three packages it brings (`culori`, `node-html-better-parser`, `html-entities`), which are pinned with `overrides`. It is not under the AGPL.
- **Repair PDF link:** does not apply; a damaged picture offers to leave the file out or choose another.
- **The agent's own choices,** named in the pull request: A4 pages with no margin and no options; never enlarging past 96 pixels to the inch; the output named after the first picture with no word added; all three pages taking both types; the pages listed under "Convert to PDF"; "Choose pictures" and "Convert and download".
- **New owner questions:** whether to offer a page size and a margin; whether to keep any picture details; whether all three pages belong under "Convert to PDF"; whether PNGs of more than 50 million pixels should be refused rather than warned about.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `images-to-pdf`: what the Images to PDF tool at `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf` does. That covers choosing pictures, their order, how each becomes a page, every state of "States every tool handles" that applies, nothing uploaded, and the words on each page.

### Modified Capabilities

- `tool-registry`: "Image to PDF waits for the owner" is replaced by the owner's answer, one tool with three pages; the catalogue check knows `/image-to-pdf` and that `/image2pdf` is dropped.

## Impact

- **New code:**
  - `src/engines/tools/images-to-pdf.ts`;
  - `src/engines/picture.ts` and `src/engines/picture-thumbnail.ts`;
  - `src/content/tools/jpg-to-pdf.md`, `png-to-pdf.md` and `image-to-pdf.md`;
  - picture fixtures made by `tests/fixtures/make.mjs`;
  - unit tests and `tests/e2e/images-to-pdf.spec.ts`.
- **Changed code:**
  - the registry entry, `catalogue.ts` and its test;
  - `outputName` in `src/widget/format.ts`;
  - `InspectOutcome`, `messages.ts`, `state.ts`, `failures.ts` and `ToolWorkspace` for the new outcome, the notice and two widget words;
  - `worker-core.ts`, which tells `openDocument` which drawer a tool uses;
  - `tests/e2e/no-upload.ts`, which checks request headers;
  - `eslint.config.js`, which forbids picture decoding inside `src/engines/`;
  - `tool.worker.ts` and the new `src/workers/pdflib.ts`, which give engines `pdflib` and `fflate` and draw a picture's thumbnail without PDF.js;
  - `package.json`, with `@cantoo/pdf-lib` moved to the shipped dependencies, and `LICENSES.md`;
  - `page-weight.mjs`, which lists the new late files and builds its engine list from `src/engines/tools/`, and `check-worker.mjs`, which checks pdf-lib and the picture code stay out of the worker and engine files.
- **Merge, Split, Extract, Delete, Reorder and Rotate:** no change. Merge PDF's related link to JPG to PDF now leads to a page.
