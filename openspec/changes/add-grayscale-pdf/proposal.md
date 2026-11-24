# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF, Resize pages and Compress to a target size are merged and archived (`add-crop-pdf`, `add-resize-pdf`, `add-compress-to-target`). The next browser row is **Grayscale PDF** (`/grayscale-pdf`, "Make smaller and fix", Browser, Phase 2, third in its group after Compress to a target size). `SPEC.md` names the tool and its address and says nothing more.

People turn a PDF grey to print it in black and white, to send it where black-and-white documents are asked for, or to save colour ink. **The owner decided on 24 Nov 2026** (`CLAUDE.md`, "Grayscale PDF turns everything grey, kept as text"): "Everything, kept as text". Pictures, text colour and drawn shapes all become grey; text stays searchable, and links and forms keep working; unusual colour types that cannot be converted are left as they are, and the page says so; pages are not redrawn as pictures.

Turning colours grey means changing what the page's drawing instructions say, which Resize pages' stage 2 review showed is hard to do safely: readers disagree on tokens glued together, on where an inline picture ends, on forms and Type 3 glyphs, and qpdf decodes a whole stream into memory before any cap applies (`add-resize-pdf`, design decision 3). The design (decision 1) therefore chooses the approach that needs the least reading of drawing instructions and never needs to follow the drawing state:

- **One grey stand-in colour space per kind of colour.** For RGB and for CMYK, one shared colour space of the same number of components (a `DeviceN` space whose alternate is `DeviceGray`, with a small function that gives the grey). Wherever the file names a colour space it can convert (in resources, on pictures, on shadings, under patterns, as the base of an indexed palette), that place is pointed at the stand-in. Every colour value stays as it was and is shown and printed as its grey.
- **Only four operators are rewritten.** The operators that carry their own colour space and so cannot be pointed elsewhere (`rg`, `RG`, `k`, `K`), and the two device names given to `cs` and `CS`, become the stand-in, with their numbers unchanged: `1 0 0 rg` becomes `/GreyRGB cs 1 0 0 sc`. Nothing else in a drawing is changed, so no state has to be followed across saves, forms or patterns.
- **A strict content reader that fails safe**, built first in its own pull request (`add-content-reader`, see Order): it decodes drawing instructions itself with caps, splits them into tokens by rules every reader agrees on, and leaves a whole stream as it was at the first doubt.

So pictures are not decoded, and no pixel work is done at all. The cost, said plainly on the page and asked of the owner at stage 1 (owner question 1): the original colour values stay stored in the file underneath, so a program that takes pictures out can still get them in colour, and the file does not get smaller.

**Order (as `add-text-option` came before Watermark):** the content reader (`src/engines/content.ts`: capped decoding of Flate, ASCII85 and ASCIIHex data, the strict tokenizer with its inline-picture rule, and an editor that changes only named byte ranges) is a large, security-critical shared piece that later tools need too (Redact, Edit PDF, Flatten PDF, and the stamp tools' stray `Q` left for later in `add-resize-pdf`). It gets its own OpenSpec change and pull request, `add-content-reader`, proposed once this plan passes stage 1, reviewed at both stages like any change and merged before this tool is built. Its rules are written in this change's design (decision 4) so that the panel reviews the whole plan together now; its spec delta (`tool-engines`) goes in its own change.

Not built, and why (design, decision 1): rewriting every colour to its grey value, which needs the drawing state followed through saves, forms, patterns and Type 3 glyphs; re-encoding pictures as grey data, which loses JPG quality or needs a JPG transcoder; a see-through layer that makes readers blend each page to grey, which leaves the file in colour for printers and checkers; the file's "default colour spaces", which readers support unevenly; and redrawing pages as pictures, which the owner ruled out.

## What Changes

- **A new page, `/grayscale-pdf`,** from a new registry entry, under "Make smaller and fix", after the five Compress to a target size pages. The visitor picks one PDF; its row shows the first page, the name, the page count and the size, as every one-file tool does. There are no options. The main button, "Convert to grayscale and download", works at once.
- **What becomes grey** (design, decisions 2 and 3):
  - drawing in RGB or CMYK colour, whether set by the four operators or through a named colour space: text, lines, fills, coloured patterns and Type 3 glyphs, in page content, forms, tiling patterns and the appearances of notes, links and form fields;
  - colour spaces CalRGB and ICC-based with three or four components and their usual ranges, treated as RGB and CMYK;
  - pictures in those spaces, including indexed palettes and 16-bit pictures, with their data unchanged;
  - shadings (smooth colour blends) in those spaces, with their functions unchanged;
  - the colours notes and fields are drawn again with when a reader redraws them (`/C`, `/IC`, `/MK` background and border, the colour in `/DA`), and bookmark text colours, written as neutral values;
  - the grey is the PDF standard's own: 0.3 R + 0.59 G + 0.11 B, and for CMYK the same after the standard's simple conversion to RGB (owner question 2).
- **What is left as it is, and said:** spot colours (`Separation`, `DeviceN`), Lab colours, ICC colours with unusual ranges, JPEG 2000 pictures, small pictures stored inside drawing instructions (inline pictures), soft masks (they set how see-through something is, not colour), colours in notes' rich-text styles and in scripts, an XFA form's own drawing, colour glyphs inside fonts, attached files, and any part whose drawing instructions cannot be read with certainty (an unusual compression, a doubtful token, an inline picture whose end is unclear, a stream decoded past 64 MiB). Such a part is left exactly as it was, never half changed.
- **What the new file keeps:** every token of the drawing instructions other than the rewritten operators, byte for byte, so text stays searchable and copyable and tags still point at their text; links, form fields and their values, notes, bookmarks, attached files, tags and the document's details. A page's stored thumbnail (`/Thumb`) is removed. The file is written afresh, so earlier saved versions are not kept and a digital signature stops being valid. The new file has no password and no restrictions, as every page tool's.
- **A file with nothing to change** (no RGB or CMYK colour anywhere this tool converts): no new file is made, and the page says "Nothing in this file needed turning grey.", using the "no new file" outcome.
- **Progress:** "Reading the file", then "Page N of M" while drawing instructions are rewritten, then writing; Cancel works throughout.
- **Bounded work:** decoding is our own, capped at 64 MiB per stream and at a total budget per job; the update and the written file are capped (`sizeLimit`, `cappedWrite`); past the total budget the job stops with the shared `output-limit` words.
- **The "Make smaller and fix" hub words** gain grey, as a tool joining a group with a hub must (`add-search-basics`).
- **The Privacy page draft** gains one sentence: colours turned grey stay stored in the new file.
- **Page text, tests and screenshots,** as for every tool.

### Scope

- **One tool,** with no new shared component and no new option kind. The content reader is its own change and pull request first.
- **Out of scope:**
  - converting spot colours, Lab colours, JPEG 2000 and inline pictures (owner question 3);
  - storing pictures or colours as grey values, and making the file smaller (owner question 1);
  - choosing which pages to convert, a choice of grey formula, a preview;
  - a sentence naming what was left in colour in this file (a shared result change; owner question 7);
  - next steps after the result, a known gap across the site; the missing thousands separator in "Page N of M".

### `SPEC.md` sections

- "Tool catalogue": Grayscale PDF, `/grayscale-pdf`, Browser, Phase 2, third under "Make smaller and fix".
- "What we are building": honest about limits (what is left in colour; colours kept underneath).
- "Architecture and tech stack": qpdf for page structure; "Rules for the code" 1 to 4.
- "Tool page anatomy": parts 1 to 7 (part 4: no option needed), every state in "States every tool handles".
- "Details that apply everywhere": output names.
- "SEO": "Every tool page"; "Site-wide" (the group's hub page).
- "Privacy, limits and security": "Browser tools"; "Whole site" (the Privacy page matches the code).
- "Build phases": Phase 2, with the owner's decision of 23 Nov 2026; rule 3 (the content reader in its own pull request first).
- "Definition of done": "Each tool", the whole test set, and "Leaves alone what it was not asked to change: links, bookmarks, form fields and text stay intact".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, as Compress PDF does: after a pick the page fetches the read set (qpdf and its WebAssembly) and the draw set for the first page's thumbnail (PDF.js, its worker and its fixed helper data), as for every PDF tool; the job's fresh worker loads qpdf, `fflate` and the engine with the shared files it imports (`content`, `plain`, `inspect`, `pages`, `qpdf-json`, `qpdf`, and the files holding `inflateLimited` and `zlibDeflate`). Not PDF.js, pdf-lib or `stamp`. The set is chosen by tool, never by the file (`add-uniform-requests`). No dependency is added. One request difference is named, as for Compress PDF: the number of qpdf instances that read raw data depends on the file, so under the named no-cache exception (entry 24) the number of WebAssembly requests does too.

## Open decisions and owner questions touched

- **Decided by the owner, 24 Nov 2026:** "Everything, kept as text".
- **Asked at stage 1** (it bears on the owner's words "pictures become grey"):
  1. Colours are shown and printed grey through a grey stand-in colour space, and their original values stay stored in the file: a program that takes pictures out may get them in colour, a program that checks a file for colour may still find it, the colourant names `GreyR`, `GreyG`, `GreyB` (and `GreyC` to `GreyK`) show in print shops' tools, and the file does not get smaller. The other way, storing grey values, needs the drawing state followed through every form and pattern and pictures decoded and encoded again (JPGs lose quality once, or need a JPG transcoder): a much larger change. Default: as designed.
- **Going ahead on defaults, listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md`:**
  2. the grey formula, 0.3 R + 0.59 G + 0.11 B, and CMYK through the standard's simple conversion (red = 1 − min(1, cyan + black), and so on);
  3. what is left as it is (the list above); spot colours could be converted later for the common kinds of tint function;
  4. names: "Grayscale PDF" and "grayscale" in the name, title, heading, main button and file name (`report-grayscale.pdf`), matching the search phrase and `SPEC.md`; "grey" and "colour" in sentences, as the rest of the site writes them;
  5. a file gets no new file only when nothing would change; black set as RGB (`0 0 0 rg`, as most word processors write it) counts as a change, so most files give a new one;
  6. passwords and restrictions dropped, extending the owner's decision of 13 Nov 2026 for page tools, as Crop and Resize did; stored page thumbnails removed; bookmark text colours made grey;
  7. the result has fixed notes naming what is left in colour, not a sentence about this file.
- **20,000 pages:** the shared notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for every tool, no link until Repair PDF is published.
- **Signed files** (open owner question): Grayscale, like every page tool, makes a signature invalid and says so.
- **Grey scans as colour JPGs** (open owner question, Compress PDF): related but not changed; this tool does not re-encode pictures.
- **Compress PDF keeps passwords** (open owner question): not touched; this tool follows the page tools, though it sits in the same group.
- **Shared pieces in tool pull requests** (open owner question): the content reader goes in its own change and pull request first. Riding along with this tool, named in the pull request: nothing shared beyond the registry and hub words, unless the build finds a need, which is then added to this change first.
- **Licence, server host, money, analytics, AI tools:** not touched. No server, no dependency.
- **The agent's own choices,** named in the pull request: the stand-in approach, the colourant and resource names, the words, the hub words, `-grayscale`, the limits (64 MiB a stream, the total budget), the related links.

No open decision needs more than its assumed default; owner question 1 is put to the owner at stage 1 because it explains what the owner's words mean in the file.

## Capabilities

### New Capabilities

- `grayscale-pdf`: what the Grayscale PDF tool at `/grayscale-pdf` does. That covers choosing one file, what becomes grey and how, what is left as it is, reading drawing instructions safely, what the new file keeps, a file with nothing to change, every state of "States every tool handles", nothing uploaded, the same requests for every file, and the words on the page and on the Privacy draft.

### Modified Capabilities

None. The content reader's `tool-engines` delta is in `add-content-reader`. No existing scenario lists the "Make smaller and fix" hub's tools in full; the compress-to-target scenario that its hub description names upload limits stays true.

## Impact

- **New code:**
  - `src/engines/tools/grayscale-pdf.ts` (the plan from dictionaries, the stand-ins, the operator edits, the update);
  - `src/content/tools/grayscale-pdf.md`;
  - `tests/unit/grayscale-pdf.test.ts`, with `tests/unit/grayscale-helpers.ts` for files made in the test;
  - `tests/e2e/grayscale-pdf.spec.ts`, with coloured files made in the test.
- **Changed code:**
  - `src/tools/registry.ts`: the entry after `compress-to-target`, the "Make smaller and fix" hub words; `tests/unit/registry.test.ts`: the entry test and the lists of tools that may give no file;
  - `src/pages/privacy.astro`: one draft sentence, and its guard in `tests/unit/privacy-page.test.ts`;
  - `tests/unit/multilingual.test.ts`: Grayscale compared token by token outside the rewritten operators, not byte for byte;
  - `scripts/page-weight.mjs` and `scripts/check-worker.mjs` only if the build gives a new chunk a name;
  - `tests/e2e/uniform-requests.spec.ts`, `tests/e2e/tool-files.ts` if its lists need it, `tests/e2e/performance.spec.ts`, other tools' no-upload forbidden lists;
  - `tests/fixtures/README.md`, with Grayscale's outcome on every file.
- **Every other tool:** no change in behaviour.
