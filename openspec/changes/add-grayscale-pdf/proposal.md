# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF, Resize pages and Compress to a target size are merged and archived (`add-crop-pdf`, `add-resize-pdf`, `add-compress-to-target`). The next browser row is **Grayscale PDF** (`/grayscale-pdf`, "Make smaller and fix", Browser, Phase 2, third in its group after Compress to a target size). `SPEC.md` names the tool and its address and says nothing more.

People turn a PDF grey to print it in black and white, to send it where black-and-white documents are asked for, or to save colour ink. **The owner decided on 24 Nov 2026** (`CLAUDE.md`, "Grayscale PDF turns everything grey, kept as text"):

- **"Everything, kept as text":** pictures, text colour and drawn shapes all become grey; text stays searchable, and links and forms keep working; unusual colour types that cannot be converted are left as they are, and the page says so; pages are not redrawn as pictures.
- **"Yes, looks and prints grey"** (asked on this plan): pages look and print grey through grey stand-in colour spaces while the original colour values stay in the file, so the file is not made smaller and picture extractors and colour checkers may still find colour; the page says so.

Turning colours grey means changing what the page's drawing instructions say, which Resize pages' stage 2 review showed is hard to do safely: readers disagree on tokens glued together, on where an inline picture ends, on forms and Type 3 glyphs, and qpdf decodes a whole page's content into memory when it checks a file (`add-resize-pdf`, design decision 3). The design (decision 1) therefore chooses the approach that needs the least reading of drawing instructions and never needs to follow the drawing state:

- **One grey stand-in colour space per kind of colour.** For RGB and for CMYK, one shared colour space of the same number of components (a `DeviceN` space whose alternate is `DeviceGray`, with a small function that gives the grey). Wherever the file names a colour space it can convert (in resources, on pictures, on shadings, under patterns, as the base of an indexed palette), that place is pointed at the stand-in. Every colour value stays as it was and is shown and printed as its grey.
- **Only a few operators are rewritten.** The operators that carry their own colour space (`rg`, `RG`, `k`, `K`) become the stand-in with their numbers unchanged: `1 0 0 rg` becomes `/GreyRGB cs 1 0 0 scn`. A `/DeviceRGB` or `/DeviceCMYK` operand of `cs`/`CS` becomes the stand-in name, with the starting black written after it for RGB. In every edited stream, `sc`/`SC` become `scn`/`SCN`, which mean the same for every colour space and are the only ones defined for `DeviceN`. No state is followed across saves, forms or patterns.
- **A strict content reader that fails safe**, built first in its own pull request (`add-content-reader`, see Order): it decodes drawing instructions itself with caps, reads them in two bounded passes by rules every reader agrees on, and leaves a whole stream as it was at the first doubt.

No picture is decoded and no pixel work is done.

**Order (as `add-text-option` came before Watermark):** the content reader (`src/engines/content.ts`: capped decoding of exactly the filters that reach it after `plainCopy`, the strict two-pass reader with its inline-picture rule, the editor, and the error `PageTooLarge`) is a large, security-critical shared piece that later tools need too (Redact, Edit PDF, Flatten PDF, and the stamp tools' stray `Q` left for later in `add-resize-pdf`). It gets its own OpenSpec change and pull request, `add-content-reader`, proposed once this plan passes stage 1, reviewed at both stages and merged before this tool is built. The same change adds `src/engines/zlib.ts` (`zlibDeflate`, `DeflateClass`, `Fflate`, `need`, `inflateLimited`, moved from `shrink.ts` and `picture.ts` with no change in behaviour, and a new `inflatePrefix` that reads the start of a compressed stream, used for colour profiles' headers), so this tool's job fetches neither `shrink-*.js` nor `picture-*.js`. Its rules are written in this change's design (decision 4) so the panel reviews the whole plan together now; any rule that change alters or drops is copied back into this change before this tool's task 1 starts.

Not built, and why (design, decision 1): rewriting every colour to its grey value, which needs the drawing state followed through saves, forms, patterns and Type 3 glyphs; re-encoding pictures as grey data, which loses JPG quality or needs a JPG transcoder; a see-through layer that makes readers blend each page to grey, which leaves annotations in colour and the file transparent; the file's "default colour spaces", which readers support unevenly; and redrawing pages as pictures, which the owner ruled out.

## What Changes

- **A new page, `/grayscale-pdf`,** from a new registry entry, under "Make smaller and fix", after the five Compress to a target size pages. The visitor picks one PDF; its row shows the first page, the name, the page count and the size, as every one-file tool does. There are no options. The main button, "Convert to grayscale and download", works at once.
- **What becomes grey** (design, decisions 2 and 3), shown grey, and printed grey on office printers:
  - drawing in RGB or CMYK colour, whether set by the four operators or through a named colour space: text, lines, fills, coloured patterns and Type 3 glyphs, in page content, forms, tiling patterns and the appearances of notes, links and form fields;
  - colour spaces CalRGB, and ICC-based ones whose profile says RGB or CMYK with the usual ranges, treated as RGB and CMYK (an approximation, as is CMYK; owner question 2);
  - pictures in those spaces, including indexed palettes and 16-bit pictures, with their data unchanged;
  - shadings (smooth colour blends) in those spaces, with their functions unchanged;
  - the colours notes and fields are drawn again with when a reader redraws them (`/C`, `/IC`, `/MK` background and border, the colour in `/DA`, inherited `/DA` included), and bookmark text colours, written as neutral values;
  - the grey is the PDF standard's own: 0.3 R + 0.59 G + 0.11 B, and for CMYK the same after the standard's simple conversion to RGB.
- **What is left as it is, and named in plain words below the tool:** spot colours (`Separation`, `DeviceN`), Lab colours, ICC colours with unusual ranges or profiles, JPEG 2000 pictures, small pictures stored inside drawing instructions (inline pictures), soft masks (they set how see-through something is, not colour), notes' appearances and patterns that carry no resources of their own, colours in notes' rich-text styles and in scripts, an XFA form's own drawing, colour glyphs inside fonts, attached files, and any drawing stream that cannot be read with certainty. Such a stream is left byte for byte as it was; pictures and shadings it draws are still made grey, as they are changed in their own dictionaries.
- **What the new file keeps:** every token of the drawing instructions other than the rewritten operators, byte for byte, so text stays searchable and copyable and tags still point at their text; links, form fields and their values, notes, bookmarks, attached files, tags and the document's details. A page's stored thumbnail (`/Thumb`) is removed when a new file is made. The file is written afresh, so earlier saved versions are not kept and a digital signature stops being valid. The new file has no password and no restrictions, as every page tool's. It stays about the same size; this tool does not make it smaller (Compress PDF does).
- **A file with nothing to turn grey** (no colour this tool converts; a colour stored page thumbnail alone does not count): no new file is made, and the page says "Nothing in this file was turned grey.", with advice naming the kinds left alone, using the "no new file" outcome.
- **Progress:** "Reading the file", then "Page N of M" while drawing instructions are rewritten, then writing; Cancel works throughout.
- **Bounded work:** decoding is our own and capped; a drawing stream that decodes past 64 MiB, or a page whose content does, stops the job with its own sentence ("A page of this file has too much drawing on it to convert here, so no new file was made. Split the file, or delete that page, and convert the rest."), because qpdf's check of the written file would otherwise read it whole into memory (owner question 8); a total budget per job bounds time, past which the shared `output-limit` words apply; the update and the written file are capped (`sizeLimit`, `cappedWrite`).
- **The "Make smaller and fix" hub words** gain grey, as a tool joining a group with a hub must (`add-search-basics`).
- **The Privacy page draft** gains one sentence: colours turned grey stay stored in the new file. The facts about how often qpdf is fetched are listed for the owner's wording.
- **A new grey-only test file** (`tests/fixtures/grey-only.pdf`, `make.mjs` section 17): drawn only in grey, with a page `/Group /CS /DeviceRGB` and an RGB output intent, so the no-new-file case is tested against what the tool must leave alone.
- **Page text, tests and screenshots,** as for every tool.

### Scope

- **One tool,** with no new shared component and no new option kind. The content reader and `zlib.ts` are their own change and pull request first.
- **Out of scope:**
  - converting spot colours, Lab colours, JPEG 2000 and inline pictures (owner question 3);
  - storing pictures or colours as grey values, and making the file smaller (the owner's answer of 24 Nov 2026);
  - choosing which pages to convert, a choice of grey formula, a preview;
  - a sentence naming what was left in colour in this file (a shared result change; owner question 7);
  - qpdf's `--check` reading whole page contents into memory for every writing tool (named as a follow-up);
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
- "Definition of done": "The test set" (a new grey-only file); "Each tool", the whole test set, and "Leaves alone what it was not asked to change: links, bookmarks, form fields and text stay intact".

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, as Compress PDF does: after a pick the page fetches the read set (qpdf and its WebAssembly) and the draw set for the first page's thumbnail (PDF.js, its worker and its fixed helper data), as for every PDF tool; the job's fresh worker loads qpdf, `fflate` and the engine with the shared chunks it imports (`content`, `zlib`, `plain`, `inspect`, `pages`, `qpdf-json`, `qpdf`, as built). Not PDF.js, pdf-lib, `stamp`, `shrink` or `picture`. The set is chosen by tool, never by the file (`add-uniform-requests`). No dependency is added.

**One request difference is named,** as for Compress PDF: the number of qpdf instances a job makes depends on the file (design, decision 7: those `plainCopy` and `readPages` make, one per raw batch of at most 2,000 ids or 32 MB, and a writer only when a file is written), so under the named no-cache exception (entry 24) the number of WebAssembly requests does too. It goes into the spec requirement "The same requests for every file", is counted on the 20,000-page file in task 3.3, and is named in the pull request under the uniform-requests owner question (2). The Privacy draft's existing sentence that how often the browser asks can depend on the file must still cover it; the facts are listed for the owner, who decides the wording.

## Open decisions and owner questions touched

- **Decided by the owner, 24 Nov 2026:** "Everything, kept as text"; and, asked on this plan, "Yes, looks and prints grey": colours are shown and printed grey through grey stand-in colour spaces, the original values stay in the file, and the page says so.
- **Going ahead on defaults, listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md`:**
  2. the grey formula, 0.3 R + 0.59 G + 0.11 B; CMYK through the standard's simple conversion (red = 1 − min(1, cyan + black), and so on); CalRGB and ICC-based colours worked out from their raw components, not through their white point, gamma, matrix or profile; all three are approximations of how a reader shows the colour;
  3. what is left as it is (the list above); spot colours could be converted later for the common kinds of tint function;
  4. names: "Grayscale PDF" and "grayscale" in the name, title, heading, main button and file name (`report-grayscale.pdf`), matching the search phrase and `SPEC.md`; "grey" and "colour" in sentences, as the rest of the site writes them;
  5. a file gets no new file only when nothing would be turned grey; black set as RGB (`0 0 0 rg`, as most word processors write it) counts as a change, so most files give a new one;
  6. passwords and restrictions dropped, extending the owner's decision of 13 Nov 2026 for page tools, as Crop and Resize did; stored page thumbnails removed; bookmark colours made grey;
  7. the result has fixed notes and the text below the tool names what is left in colour, not a sentence about this file;
  8. a page whose drawing instructions take more than 64 MiB once unpacked stops the job with a sentence, so the tab does not crash when the file is checked. Keep this stop, or raise it? (default: keep). Its words name splitting the file or deleting that page, not damage, as a genuine dense map or drawing can reach it.
- **Uniform requests** (open owner question, `add-uniform-requests`, question 2): the qpdf instance count above is named under it.
- **20,000 pages:** the shared notice is shown, by the owner's decision of 13 Nov 2026.
- **Repair PDF link:** as for every tool, no link until Repair PDF is published.
- **Signed files** (open owner question): Grayscale, like every page tool, makes a signature invalid and says so.
- **Grey scans as colour JPGs** (open owner question, Compress PDF): related but not changed; this tool does not re-encode pictures.
- **Compress PDF keeps passwords** (open owner question): not touched; this tool follows the page tools, though it sits in the same group.
- **Shared pieces in tool pull requests** (open owner question): the content reader and `zlib.ts` go in their own change and pull request first. Riding along with this tool, named in the pull request: an optional id limit on `rawBatches` (Compress PDF's calls unchanged; kept here rather than in `add-content-reader`, as this tool is its only user), the shared failure kind `page-too-large` (its error class `PageTooLarge` is in `add-content-reader`; the kind, its mapping and its words ride here), and the grey-only test file.
- **Licence, server host, money, analytics, AI tools:** not touched. No server, no dependency.
- **The agent's own choices,** named in the pull request: the stand-in approach, the colourant and resource names, the words, the hub words, `-grayscale`, the limits (64 MiB a stream and a page, the total budget, 2,000 ids a batch), the words of the 64 MiB stop, the related links.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `grayscale-pdf`: what the Grayscale PDF tool at `/grayscale-pdf` does. That covers choosing one file, what becomes grey and how, what is left as it is, reading drawing instructions safely, what the new file keeps, a file with nothing to turn grey, every state of "States every tool handles", nothing uploaded, the same requests for every file, and the words on the page and on the Privacy draft.

### Modified Capabilities

None. The content reader's `tool-engines` delta is in `add-content-reader`. No existing scenario lists the "Make smaller and fix" hub's tools in full; the compress-to-target scenario that its hub description names upload limits stays true.

## Impact

- **New code:**
  - `src/engines/tools/grayscale-pdf.ts` (the plan from dictionaries, the stand-ins, the operator edits, the update);
  - `src/content/tools/grayscale-pdf.md`;
  - `tests/unit/grayscale-pdf.test.ts`, with `tests/unit/grayscale-helpers.ts` for files made in the test;
  - `tests/e2e/grayscale-pdf.spec.ts`, with coloured files made in the test;
  - `tests/fixtures/grey-only.pdf`, from a new section 17 of `tests/fixtures/make.mjs`.
- **Changed code:**
  - `src/tools/registry.ts`: the entry after `compress-to-target`, the "Make smaller and fix" hub words; `tests/unit/registry.test.ts`: the entry test and the lists of tools that may give no file;
  - `src/engines/qpdf-json.ts`: an optional id limit on `rawBatches` (Compress PDF unchanged);
  - the failure kind `page-too-large`: `FailureKind` in `src/widget/state.ts`, `failureKinds` in `src/workers/messages.ts`, the mapping by name in `src/workers/worker-core.ts`, its sentence in `src/widget/failures.ts`;
  - `src/pages/privacy.astro`: one draft sentence, and its guard in `tests/unit/privacy-page.test.ts`;
  - `tests/unit/multilingual.test.ts`: Grayscale compared token by token outside the rewritten operators, not byte for byte;
  - `tests/fixtures/make-large.mjs` (`--vector`, dense coloured vector content) and `tests/fixtures/make-many-pages.mjs` (own coloured content streams), both writing outside the repo;
  - `tests/fixtures/README.md`, with Grayscale's outcome on every file and every tool's outcome on `grey-only.pdf`;
  - `scripts/page-weight.mjs` and `scripts/check-worker.mjs` only if the build gives a new chunk a name;
  - `tests/e2e/uniform-requests.spec.ts`, `tests/e2e/tool-files.ts` if its lists need it, `tests/e2e/performance.spec.ts`, other tools' no-upload forbidden lists.
- **Every other tool:** no change in behaviour; each runs against the new grey-only file in the shared fixture loops, and its outcome is recorded.
