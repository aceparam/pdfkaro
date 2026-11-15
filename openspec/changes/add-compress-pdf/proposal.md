# Proposal

## Why

Compress PDF is the next Phase 1 tool in catalogue order: the first row of "Make smaller and fix", after Image to PDF (PR #14) closed "Organise pages". People most often need it to get a scanned or photo-heavy PDF under an upload limit. The owner decided on 13 Nov 2026 to use our own recompression, written on top of qpdf and PDF.js, not Ghostscript, so no AGPL code and no `LICENSE` file come with it.

## What Changes

- **A new page, `/compress-pdf`,** from a new registry entry: "Compress a PDF file", "Make a PDF smaller. Your file stays on your device." The visitor picks one PDF; it is listed as one row (thumbnail of the first page, name, pages, size), with no summary line above it.
- **The main button, "Compress and download",** gives `report-compressed.pdf`. There are no options: one setting, chosen so that the file gets smaller without visible loss on screen. (Target sizes are phase 2 pages and can bring a choice with them.)
- **What compression does, in order:**
  1. **Pictures in the file are made smaller,** when that saves space:
     - a JPG picture (`/DCTDecode`, grey or RGB, 8 bits) larger than it needs to be is scaled down so that it is no sharper than 150 pixels to the inch across the largest page, and saved again as a JPG of quality 75;
     - a JPG picture that is not too large is saved again at quality 75 only if that makes it at least 10% smaller;
     - a picture stored without loss (`/FlateDecode`, grey or RGB, 8 bits) larger than it needs to be is scaled down and stored without loss again, so drawings, text scans and screenshots never get JPG blur;
     - every other picture is left as it is: CMYK and other colour spaces, grey pictures with a colour profile, masks and soft masks, 1-bit scans (CCITT, JBIG2), JPEG 2000, pictures with unusual dictionary entries, JPGs whose own header disagrees with their dictionary, pictures of more than 50 million pixels, and pictures drawn inline in page content.
     - Only candidate pictures are ever read and decoded, in bounded batches, with our own size limits, so a compression bomb elsewhere in the file costs time at most, not memory.
  2. **The whole file is written again by qpdf without loss:** data streams packed into object streams, compressed streams compressed again at the highest level, uncompressed streams compressed, and fonts, pictures and other resources nothing uses removed.
- **The result** shows the new size beside the old: "4.2 MB, was 11.8 MB" (`SPEC.md` "Details that apply everywhere"). When the file cannot be made at least 1% smaller, or its size would read the same, the page says "This file could not be made smaller." and why it may be ("It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more."), with "Start again" and no download, so the visitor never downloads a "compressed" file that is the same size or larger.
- **What the file keeps:** pages, text, links, form fields with their values, bookmarks, attached files, tags and the document's details. Pictures that were made smaller are slightly less sharp up close; the page says so. The file is written afresh, so earlier saved versions stored inside it are not kept and a digital signature stops being valid; the page says so.
- **Passwords and restrictions are kept:** a file opened with its password is written with the same password and restrictions, and a file with restrictions keeps them. Compress PDF is not in the owner's list of page tools that drop them (13 Nov 2026), and "Leaves alone what it was not asked to change" asks for this.
- **Progress** in real units: "Reading the file", "Picture 3 of 40", then "Writing the compressed file", with the bar not full until the file is written.
- **Shared code:**
  - **Picture decoding and encoding for engines:** the worker's `decodePicture` takes an option to leave colours and camera turn alone, and `canvas` gains a JPG encoder, both reaching engines through `tools`.
  - **The result:** a tool can show the input's size beside the result's ("was"), and an engine can answer "no smaller file", shown as its own result.
  - **Progress:** a "picture" unit beside "file" and "page".
  - **Writing through qpdf's JSON:** the qpdf JSON helpers that `outline.ts` and `plain.ts` already have move into `src/engines/qpdf-json.ts`, which adds reading dictionaries without data, reading chosen streams raw in batches, and writing replaced streams back with `--update-from-json`.
  - **One-file tools listed as a row** leave out the summary line above the row.
- **Page text, tests and screenshots,** as for the earlier tools.

### Scope

- **One tool.** It reuses `FilePicker`, `PageGrid` (one file row), `Result` and the widget, with small additions to the result and progress.
- **Out of scope:**
  - target sizes ("compress to 200 KB", phase 2) and any choice of level;
  - grayscale conversion (phase 2, its own tool);
  - subsetting or removing fonts that are used, flattening forms, removing details or bookmarks;
  - pictures in CMYK, JPEG 2000, 1-bit scans and inline pictures, as listed;
  - next steps in the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Compress PDF, `/compress-pdf`, Browser, Phase 1, first under "Make smaller and fix".
- "Architecture and tech stack": compression row, as replaced by the owner's decision of 13 Nov 2026 (own recompression on qpdf and PDF.js); "Rules for the code" 2 to 4.
- "Tool page anatomy" parts 1 to 7 and "States every tool handles".
- "Details that apply everywhere": output names; sizes in plain units, "4.2 MB, was 11.8 MB"; nothing downloads on its own.
- "SEO": "Every tool page"; "How the words should read" ("Why is my file still large after compressing?" is SPEC's own example of a real question).
- "Privacy, limits and security": "Browser tools".
- "Definition of done": "Each tool".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data (for the first page's thumbnail), the Compress engine with `qpdf-json`, `picture` and `resample`, and `fflate`. pdf-lib is not used.

## Open decisions and owner questions touched

- **Licence and Ghostscript:** answered by the owner (13 Nov 2026): own recompression, no Ghostscript, no `LICENSE` file.
- **Passwords and restrictions:** kept, as above; the owner's list of tools that drop them does not name Compress PDF. An owner question in case the owner wants it to match the page tools.
- **20,000 pages and 100 MB:** the notices are shown, as for every tool.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **The agent's own choices,** named in the pull request: no options; 150 pixels to the inch across the largest page; JPG quality 75; the 10% rule for saving a JPG again; never JPG for a picture stored without loss; "could not be made smaller" below 1%; grey JPGs without a colour profile becoming RGB JPGs; grey pictures with a profile left alone; passwords kept.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `compress-pdf`: what the Compress PDF tool at `/compress-pdf` does: choosing one file, making its pictures smaller, writing it again without loss, the result with the old size, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

- `tool-page`: "Result block" gains the "was" size for a tool that makes files smaller and the result with no new file; "Working state" gains pictures as a unit and "Reading the file".
- `tool-engines`: "Engines are pure functions" lets an engine give no file, for a tool whose words say what that means; "The library for each job" records the owner's compression decision of 13 Nov 2026 in place of Ghostscript.

## Impact

- **New code:**
  - `src/engines/tools/compress-pdf.ts`;
  - `src/engines/qpdf-json.ts`, holding the qpdf JSON helpers moved from `outline.ts` and `plain.ts`, and the new read and write steps;
  - `src/engines/resample.ts`, scaling raw picture samples down;
  - `src/content/tools/compress-pdf.md`;
  - fixtures, unit tests and `tests/e2e/compress-pdf.spec.ts`.
- **Changed code:**
  - the registry, with the entry and the optional words for the "was" size and the "no smaller file" result;
  - `src/engines/types.ts`, `src/workers/messages.ts`, `worker-core.ts` and `src/widget/state.ts`, for a run that gives no file, and the "picture" progress unit in `format.ts`;
  - `Result` and `ToolWorkspace`, for the "was" size and the "could not be made smaller" result;
  - `tool.worker.ts`, for `decodePicture`'s colour option, the JPG encoder and fflate's `Deflate`;
  - `outline.ts` and `plain.ts`, which import the moved helpers, and `qpdf.ts`, which gains `remove`;
  - `check-worker.mjs`, which checks the new shared code loads late, and `page-weight.mjs` only if the build makes a new chunk.
- **Other tools:** no change in behaviour; their results show no "was" size.
