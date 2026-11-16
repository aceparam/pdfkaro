# Proposal

## Why

PDF to JPG and PDF to PNG are the next Phase 1 tools in catalogue order: the first two rows of "Convert from PDF", after Compress PDF (PR #15) closed the phase 1 rows of "Make smaller and fix" and Image to PDF covered the phase 1 rows of "Convert to PDF". People most often need them to send one page of a PDF as a picture, to post a page where only pictures are taken, or to put a page into a slide or a document.

## What Changes

- **One tool, `pdf-to-images`, with two pages from one registry entry:**
  - `/pdf-to-jpg`, "Convert PDF to JPG";
  - `/pdf-to-png`, "Convert PDF to PNG".

  Each page has its own title, description, heading, sentence (ending "Files stay on your device.") and text below the tool, written for its search. The page decides the format, through the registry's `preset` (`{ format: 'jpg' }` or `{ format: 'png' }`), so neither page has an option. This follows the pattern the owner chose for Image to PDF (one tool, several pages). The two rows share every part of the work except the encoder.
- **Choosing a file:** one PDF, from the picker, a drop or paste, listed as one row (first-page thumbnail, name, pages, size), as Compress PDF lists it. A protected file asks for its password; a damaged one says so.
- **The main button:** "Convert to JPG and download" or "Convert to PNG and download". Every page becomes one picture, drawn by PDF.js in the tool worker:
  - at 150 pixels to the inch, a page's own size;
  - at most 25 million pixels per picture, so a poster-sized page is drawn smaller, never in pieces;
  - on white, with form fields drawn with what was typed in them, and notes and stamps as the page shows them;
  - JPG at quality 85; PNG without loss.
- **The result:**
  - a one-page PDF gives one picture, named after the file: `report.jpg` or `report.png`;
  - a longer one gives one zip, `report.zip`, holding `report-page-01.jpg` and so on, as Split PDF's zip does.
  - The result says how many pictures, the size, and that nothing was changed in the PDF.
- **Progress:** "Page 3 of 12", then "Writing the zip".
- **Shared code:**
  - **Drawing whole pages:** `src/engines/thumbnail.ts`'s kept document gains a second way to draw a page, at a scale and as JPG or PNG, beside the thumbnail it draws now. It is renamed to say what it does: `src/engines/pdf-pages.ts`.
  - **Output names:** the widget can name a single output and the files inside a zip with an extension other than `.pdf`, from the page's preset.
  - **Presets reach the widget:** `[slug].astro` passes the page's `preset` to the widget, which sends it to the engine with the job's options.
- **Page text, tests and screenshots,** as for the earlier tools.

### Scope

- **One tool, two pages.** It reuses `FilePicker`, `PageGrid` (one row), `Result` and the zip already built for Split PDF.
- **Out of scope:**
  - choosing pages (Extract pages makes a PDF of the pages wanted first; the page text says so);
  - choosing a resolution or quality (an owner question);
  - extracting the pictures inside a PDF (phase 2, its own tool);
  - text recognition;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": PDF to JPG and PDF to PNG, Browser, Phase 1, first under "Convert from PDF".
- "Architecture and tech stack": PDF.js for "PDF to image".
- "Tool page anatomy" parts 1 to 7 and "States every tool handles".
- "Details that apply everywhere": output names built from the input; several outputs as one zip; nothing downloads on its own; sizes in plain units.
- "SEO": "Every tool page" and "Specific-search pages" (each page written for its search).
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. After a pick, the page fetches only the site's own files:
- the worker, the workspace chunk, qpdf and its WebAssembly, and `inspect`, to read the file and ask for a password;
- PDF.js, its worker and its fixed helper data, for the thumbnail and the pictures;
- the engine;
- `fflate`, for the zip.

## Open decisions and owner questions touched

- **PDF.js's helper data is one fixed set (owner, 11 Nov 2026),** with no character maps. Chinese, Japanese and Korean text in fonts a PDF does not embed is missing from thumbnails, and it will be missing from these pictures too. This change keeps the owner's fixed set, the page says so, and the pull request asks whether these tools should ship character maps.
- **The zip limit** (65,535 files, 4 GB, an agent decision) applies, as for Split PDF.
- **20,000 pages and 100 MB:** the notices are shown, as for every tool.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **The agent's own choices,** named in the pull request:
  - one tool with two pages, the format set by the page;
  - every page, with no choice of pages;
  - 150 pixels to the inch, a 25 million pixel cap, JPG quality 85;
  - a single picture for a one-page PDF, otherwise a zip;
  - the names `report.jpg` and `report-page-01.jpg`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `pdf-to-images`: what PDF to JPG and PDF to PNG do at `/pdf-to-jpg` and `/pdf-to-png`. That covers choosing one file, drawing every page as a picture, the single picture or zip, every state of "States every tool handles", nothing uploaded, and the words on each page.

### Modified Capabilities

- `tool-page`: "Output names" gains output names with the result's own extension (`.jpg`, `.png`), for a single output and inside a zip.

## Impact

- **New code:**
  - `src/engines/tools/pdf-to-images.ts`;
  - `src/content/tools/pdf-to-jpg.md` and `pdf-to-png.md`;
  - unit tests and `tests/e2e/pdf-to-images.spec.ts`.
- **Changed code:**
  - the registry entry, and an optional `extension` beside each page's `preset`;
  - `src/engines/thumbnail.ts` renamed `pdf-pages.ts`, with a page drawn at a scale as JPG or PNG; the worker's thumbnail step and its tests follow the name;
  - `[slug].astro`, `ToolWidget` and `useToolRun`, which pass the preset to the engine and name outputs with its extension;
  - `src/workers/messages.ts` and `worker-core.ts`, whose zip naming takes the extension;
  - `check-worker.mjs` and `page-weight.mjs` for the renamed file and the new engine.
- **Other tools:** no change in behaviour; their outputs stay `.pdf`.
