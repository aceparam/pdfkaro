# Proposal

## Why

Compress PDF is the next Phase 1 tool in catalogue order: the first row of "Make smaller and fix", after Image to PDF (PR #14) closed "Organise pages". People most often need it to get a scanned or photo-heavy PDF under an upload limit. The owner decided on 13 Nov 2026 to use our own recompression, written on top of qpdf and PDF.js, not Ghostscript, so no AGPL code and no `LICENSE` file come with it.

## What Changes

- **A new page, `/compress-pdf`,** from a new registry entry: "Compress a PDF file", "Make a PDF smaller. Your file stays on your device." The visitor picks one PDF; it is listed as Merge PDF lists a file (thumbnail of the first page, name, pages, size).
- **The main button, "Compress and download",** gives `report-compressed.pdf`. There are no options: one setting, chosen so that the file gets smaller without visible loss on screen or in normal printing. (Target sizes are phase 2 pages and can bring a choice with them.)
- **What compression does, in order:**
  1. **Pictures in the file are made smaller,** when that saves space:
     - a JPG picture (`/DCTDecode`, grey or RGB, 8 bits) larger than it needs to be is scaled down so that it is no sharper than 150 pixels to the inch across the largest page, and saved again as a JPG of quality 75;
     - a JPG picture that is not too large is saved again at quality 75 only if that makes it at least 10% smaller;
     - a picture stored without loss (`/FlateDecode`, grey or RGB, 8 bits) larger than it needs to be is scaled down and stored without loss again, so drawings, text scans and screenshots never get JPG blur;
     - every other picture is left as it is: CMYK and other colour spaces, masks, 1-bit scans (CCITT, JBIG2), JPEG 2000, pictures with a decode array or colour transform setting, pictures of more than 50 million pixels, and pictures drawn inline in page content.
  2. **The whole file is written again by qpdf without loss:** data streams packed into object streams, compressed streams compressed again at the highest level, uncompressed streams compressed, and fonts, pictures and other resources nothing uses removed.
- **The result** shows the new size beside the old: "4.2 MB, was 11.8 MB" (`SPEC.md` "Details that apply everywhere"). When the file cannot be made at least 1% smaller, the page says "This file could not be made smaller." with "Start again", and offers no download, so the visitor never downloads a "compressed" file that is the same size or larger.
- **What the file keeps:** pages, text, links, form fields with their values, bookmarks, attached files, tags and the document's details. Pictures that were made smaller are slightly less sharp up close; the page says so. The file is written afresh, so earlier saved versions stored inside it are not kept and a digital signature stops being valid; the page says so.
- **Passwords and restrictions are kept:** a file opened with its password is written with the same password and restrictions, and a file with restrictions keeps them. Compress PDF is not in the owner's list of page tools that drop them (13 Nov 2026), and "Leaves alone what it was not asked to change" asks for this.
- **Progress** in real units: "Picture 3 of 40", then "Writing the compressed file".
- **Shared code:**
  - **Picture decoding and encoding for engines:** the worker's `decodePicture` takes an option to leave colours and camera turn alone, and `canvas` gains a JPG encoder, both reaching engines through `tools`.
  - **The result:** a tool can show the input's size beside the result's ("was"), and an engine can answer "no smaller file", shown as its own result.
  - **Progress:** a "picture" unit beside "file" and "page".
  - **Writing through qpdf's JSON:** a shared step that lists a PDF's objects and stream data through qpdf's JSON and writes replaced streams back with `--update-from-json`, kept beside the other shared steps in `src/engines/`.
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

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. After a pick, the page fetches only the site's own files: the worker, the workspace chunk, qpdf and its WebAssembly, the shared `inspect` and `plain` files, PDF.js and its data (for the first page's thumbnail), the shared picture code, and the Compress engine. pdf-lib is not used.

## Open decisions and owner questions touched

- **Licence and Ghostscript:** answered by the owner (13 Nov 2026): own recompression, no Ghostscript, no `LICENSE` file.
- **Passwords and restrictions:** kept, as above; the owner's list of tools that drop them does not name Compress PDF. An owner question in case the owner wants it to match the page tools.
- **20,000 pages and 100 MB:** the notices are shown, as for every tool.
- **Repair PDF link:** as for the other tools, no link until Repair PDF is published.
- **The agent's own choices,** named in the pull request: no options; 150 pixels to the inch across the largest page; JPG quality 75; the 10% rule for saving a JPG again; never JPG for a picture stored without loss; "could not be made smaller" below 1%; passwords kept.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `compress-pdf`: what the Compress PDF tool at `/compress-pdf` does: choosing one file, making its pictures smaller, writing it again without loss, the result with the old size, every state of "States every tool handles", nothing uploaded, and the words on the page.

### Modified Capabilities

None. The result's "was" size and the "no smaller file" answer are written in `compress-pdf`'s own requirements and built so later tools can use them.

## Impact

- **New code:**
  - `src/engines/tools/compress-pdf.ts`;
  - `src/engines/qpdf-json.ts`, the shared JSON read and write step;
  - `src/engines/resample.ts`, scaling raw picture samples down;
  - `src/content/tools/compress-pdf.md`;
  - fixtures, unit tests and `tests/e2e/compress-pdf.spec.ts`.
- **Changed code:**
  - the registry, with the entry and the optional words for the "was" size and the "no smaller file" result;
  - `src/engines/types.ts`, `src/workers/messages.ts`, `worker-core.ts` and `src/widget/state.ts`, for a run that gives no file, and the "picture" progress unit in `format.ts`;
  - `Result` and `ToolWorkspace`, for the "was" size and the "could not be made smaller" result;
  - `tool.worker.ts`, for `decodePicture`'s option and the JPG encoder;
  - `page-weight.mjs` (the engine list is built from the files) and `check-worker.mjs`, which checks the new shared files load late.
- **Other tools:** no change in behaviour; their results show no "was" size.
