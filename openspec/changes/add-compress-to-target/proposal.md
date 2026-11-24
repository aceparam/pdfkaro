# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF and Resize pages, the two Phase 2 rows of "Organise pages", are merged and archived (`add-crop-pdf`, PR #38; `add-resize-pdf`, PR #40). The next Phase 2 browser row in catalogue order is **Compress to a target size** (`/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb`, `-2mb`; "Make smaller and fix", Browser, Phase 2), second in its group after Compress PDF.

`SPEC.md` says three things about it: it "is one tool with preset pages. Each preset page opens the compressor with that target already selected" (Scope notes); target sizes are "where a new site can win first", because "upload forms with size limits make these common searches" (SEO, Specific-search pages); and "each of these pages must be the working tool with that setting already chosen, plus text written for that exact case. Pages that are the same text with one word swapped get ignored by search engines … so none are published."

**The owner decided on 24 Nov 2026** (`CLAUDE.md`, "Compress to a target size works on pictures only, and gives the smallest file it can"):

- **"Pictures only":** picture resolution and JPG quality are lowered step by step until the file fits. Text, drawings and fonts stay as they are, and no page is turned into a picture.
- **"Give the smallest, say so":** when the target cannot be reached, the smallest file made is handed back, with a sentence naming its size and saying it is over the target.

## What Changes

- **One new tool, `compress-to-target`, with five pages,** one per target, each page's preset setting its target (`{ target: '100kb' }` and so on), as PDF to JPG and PDF to PNG set their format (design, decision 1). The target is not a choice on the page: the registry already refuses a choice that would replace what a page's preset promises. It sits second under "Make smaller and fix", after Compress PDF, and its five pages are listed there on the home page and the hub, in size order.
- **Per page:** title, heading, sentence, description, main button and the text below the tool are each the page's own (design, decision 9). Heading "Compress a PDF to 200 KB", sentence "Make a PDF 200 KB or smaller. Your file stays on your device.", main button "Compress to 200 KB and download". The visitor picks one PDF, listed as one row (first page, name, pages, size) with no summary line, as Compress PDF does. There are no options.
- **A target is a number of bytes written once,** in `src/widget/option-values.ts`: 100 KB is 100,000 bytes, 200 KB 200,000, 500 KB 500,000, 1 MB 1,000,000 and 2 MB 2,000,000, the smaller of the two ways forms count, so a file that fits here fits a form that counts in 1024s too (decision 2).
- **A file already at or under the target** is not compressed: once the file is read, the main button is unavailable with a sentence tied to it, "report.pdf is already 200 KB or smaller, so there is nothing to do here. You can use it as it is." (decision 7).
- **How the size is reached** (decisions 3 to 5):
  - the same pictures Compress PDF can safely redo (8-bit grey or RGB, JPG or stored without loss, no key outside its short list, not a mask, at most 50 million pixels), with Compress PDF's own reading and limits; a picture whose data is under 4 KB is left alone, and at most the 10,000 largest pictures are worked on;
  - a ladder of seven steps of resolution and JPG quality, from Compress PDF's own setting (150 pixels to the inch across the largest page, quality 75) down to a floor of 72 pixels to the inch and quality 40, below which small text in a scan stops being readable;
  - pictures stored without loss are scaled down and stay lossless in those seven steps. Only if the seventh step does not fit, a second run of the same seven steps also saves them as JPGs, except those with a soft mask (owner question 2);
  - every picture is measured once at every step, keeping only the sizes; the step is chosen from the sizes, then the file is written, checked and, when the estimate was off, written once or twice more. Never more than three full writes; usually one or two;
  - the mildest step that fits is used, so pictures stay as sharp as the target allows. Text, drawings, fonts, links, form fields, bookmarks, attached files, tags and the document's details are kept, and qpdf writes everything else again without loss, as Compress PDF does.
- **The result** (decision 7):
  - **under the target:** heading "Your file is now 200 KB or smaller", then the shared "was" line ("184 KB, was 1.4 MB, 3 pages") and Download;
  - **over the target:** heading "Your file is still over 200 KB", the sentence "The smallest file this tool could make is 312 KB, which is over 200 KB.", advice on what to try, and Download for that smallest file, by the owner's decision. A size that would read as the target or less is shown in bytes, so the page never says "200 KB, which is over 200 KB";
  - **no smaller file at all** (no picture this tool can redo, and qpdf's rewrite not 1% smaller): Compress PDF's "no new file" outcome, "This file could not be made smaller." with this tool's advice.
- **Passwords and restrictions are kept,** as Compress PDF keeps them (open owner question "Compress PDF keeps passwords", which covers both).
- **Progress:** "Reading the file", "Picture 3 of 40" while pictures are measured, then "Writing the compressed file" with the bar going on from where the pictures left it and never back (decision 6).
- **The "Make smaller and fix" hub words** gain target sizes, as a tool joining a group with a hub must (`add-search-basics`). Compress PDF's related links gain "Compress PDF to 200 KB".
- **Shared pieces:**
  - **before this tool, in its own pull request with no change in behaviour** (as `pages.ts` came out of `stamp.ts` before Resize): Compress PDF's picture steps (`canShrink`, `pictureContext`, `pixelLimit`, `newDictionary`, `shrinkJpeg`, `shrinkLossless`, `zlibDeflate`, `statedLength`, the limits) move from `src/engines/tools/compress-pdf.ts` into `src/engines/shrink.ts`, so this tool's engine imports a shared file and never another tool's engine. Compress PDF's output stays byte for byte the same;
  - **riding along with this tool, named in its pull request:** in `shrink.ts`, a resolution argument for `pixelLimit` (150 when left out) and `shrinkJpeg` split into a decode step and an encode step that both tools use, so Compress PDF's output stays byte for byte the same; and a **page target size** in the widget (`sizeTarget`, decision 7): the registry tool words name the preset key that holds the target, the widget reads its bytes and label from `option-values.ts`, holds the main button for a file already under it, and words the result as under or over. No new component: `ToolWorkspace` and `Result` show it.
- **Page text, tests and screenshots,** as for every tool, with five texts below the tool, each written for its own size and checked by a test to share no sentence with the others.

### Scope

- **One tool** with five pages, no new component and no new option kind. The move of Compress PDF's picture steps goes first, in its own pull request.
- **Out of scope:**
  - turning pages into pictures, lowering the quality of text, drawings or fonts, removing fonts, details, bookmarks or attached files (the owner's "pictures only");
  - a target the visitor types, or a choice of target on the page (owner question 1); other targets than the five in `SPEC.md`;
  - pictures this tool leaves alone, as Compress PDF does: CMYK, indexed colours, grey with a colour profile, 1-bit scans (CCITT, JBIG2), JPEG 2000, 16-bit, inline pictures, masks and soft masks themselves;
  - knowing before the main button whether the target can be reached;
  - next steps after the result, a known gap across the site, and handing the result to another target page;
  - the missing thousands separator in "Picture N of M", known since Crop.

### `SPEC.md` sections

- "Tool catalogue": Compress to a target size, `/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb`, `-2mb`, Browser, Phase 2, second under "Make smaller and fix"; "Scope notes for specific tools": one tool with preset pages.
- "What we are building": rules 1, 2, 4 ("Honest about limits": a target that cannot be reached is said so, with the size) and 5.
- "Architecture and tech stack": compression on qpdf and the browser's picture decoder, by the owner's decision of 13 Nov 2026 (no Ghostscript); "Rules for the code" 1 to 4.
- "Tool page anatomy": parts 1 to 7 and every state in "States every tool handles".
- "Details that apply everywhere": output names; sizes in plain units, "4.2 MB, was 11.8 MB".
- "SEO": "Every tool page" and "Specific-search pages" (the working tool with the setting chosen, and text written for that exact case); "Site-wide" (the group's hub page).
- "Privacy, limits and security": "Browser tools".
- "Build phases": Phase 2 ("target-size pages"), with the owner's decision of 23 Nov 2026.
- "Definition of done": "Each tool", the whole test set.

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. The tool declares `loads: { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, as Compress PDF does: after a pick the page fetches the read set (qpdf and its WebAssembly, `inspect`) and the draw set for the first page's thumbnail (PDF.js, its worker and its fixed helper data), as every PDF tool does; the job's fresh worker loads qpdf, `fflate` and the engine with the files it imports (`shrink`, `qpdf-json`, `picture`, `resample`, `plain`, `inspect`, `option-values`). Not pdf-lib, `pages` or `stamp`. The browser's picture decoder and canvas are used as Compress PDF uses them. The set is chosen by tool, never by the file or the page's target (`add-uniform-requests`), and is the same on all five pages. No dependency is added.

## Open decisions and owner questions touched

- **Decided by the owner, 24 Nov 2026:** pictures only, lowered step by step; give the smallest and say so.
- **Licence and Ghostscript:** answered (13 Nov 2026): own recompression, no Ghostscript, no `LICENSE` file.
- **Compress PDF keeps passwords** (open owner question): this tool keeps them too, so the two compressors match; the answer to that question applies to both.
- **Going ahead on defaults, listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md`:**
  1. the target is fixed by each page, with no choice of target on the page (a visitor who needs another size follows the related link to its page);
  2. pictures stored without loss may become JPGs, only when the seven lossless steps cannot reach the target, and never one with a soft mask;
  3. the floor: 72 pixels to the inch across the largest page and JPG quality 40;
  4. a target counts in thousands (200 KB is 200,000 bytes), so the result fits forms that count either way;
  5. a file already at or under the target is not compressed, and the main button says why;
  6. the over-target result is offered for download even when it is only a little smaller than the file chosen (at least 1% smaller), as the owner's "give the smallest" says.
- **20,000 pages and 100 MB:** the shared notices are shown.
- **Repair PDF link:** as for every tool, no link until Repair PDF is published.
- **Signed files** (open owner question): the file is written afresh, so a digital signature stops being valid, and the page says so, as Compress PDF's does.
- **Grey scans as colour JPGs** (open owner question on Compress PDF): the same happens here, through the same code; the answer applies to both.
- **Shared pieces in tool pull requests** (open owner question): the move of Compress PDF's picture steps goes first in its own pull request; the resolution argument, the split of `shrinkJpeg` and the page target size ride along, each named in the pull request.
- **Hub words** (open owner question on hub link words and the hub drafts): the "Make smaller and fix" title, sentence and description are redrafted for the owner's review in issue #7.
- **Licence, server host, money, analytics, AI tools, character maps:** not touched.
- **The agent's own choices,** named in the pull request: one tool with five pages; the ladder's steps; the 4 KB and 10,000-picture limits; at most three writes; the output name `-compressed`; the words; the related links.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `compress-to-target`: what Compress to a target size does on its five pages: one file, the target each page sets, a file already under it, which pictures change and how far, the floor, what the file keeps, the result under and over the target, the "no smaller file" outcome, every state of "States every tool handles", nothing uploaded, and the words on each page.

### Modified Capabilities

- `tool-registry`: a new requirement, "Compress to a target size is one tool with five pages", as Image to PDF and PDF to JPG and PNG have theirs.
- `tool-page`: a new requirement, "A target size a page sets": the main button held for a file already under the target, and the result worded as under or over it.

## Impact

- **Before this change, its own pull request:** `src/engines/shrink.ts` with Compress PDF's picture steps, moved unchanged; `compress-pdf.ts` imports them; `check-worker.mjs`, `page-weight.mjs` and Compress PDF's no-upload allowlist name the new chunk; Compress PDF's tests pass unchanged.
- **New code:**
  - `src/engines/tools/compress-to-target.ts` (candidates, measuring, the ladder, choosing a step, the writes);
  - `src/widget/target.ts` (the page target size's rules and words, plain functions);
  - `src/content/tools/compress-pdf-to-100kb.md`, `-200kb.md`, `-500kb.md`, `-1mb.md`, `-2mb.md`;
  - `tests/unit/compress-to-target.test.ts`, `tests/unit/target.test.ts`, `tests/e2e/compress-to-target.spec.ts`; a helper that makes a scans file of about 3 MB in the test from the committed pictures, not committed.
- **Changed code:**
  - `src/tools/registry.ts`: the entry, the "Make smaller and fix" hub words, Compress PDF's related links, and the `sizeTarget` field in `ToolWidgetWords`; `tests/unit/registry.test.ts`: the entry, the five pages, the preset rule for `sizeTarget`, the `noSmaller` lists;
  - `src/widget/option-values.ts`: `sizeTargets` (key, bytes, label) and `acceptedTarget`;
  - `src/engines/shrink.ts`: `pixelLimit`'s resolution argument and the split of `shrinkJpeg`;
  - `src/hooks/useToolRun.ts`, `src/widget/options.ts` (the hold) and `ToolWorkspace`, `Result` (the words), for the page target size;
  - `scripts/page-weight.mjs` and `scripts/check-worker.mjs` if the build makes a new chunk;
  - `tests/e2e/uniform-requests.spec.ts`, `tests/e2e/tool-files.ts`, `tests/e2e/performance.spec.ts`;
  - `tests/fixtures/make-large.mjs`, gaining a `--scans` mode (about 100 MB of JPG scans, written outside the repo) for timing;
  - `tests/fixtures/README.md`, with this tool's outcome on every file for each target.
- **Every other tool:** no change in behaviour. Compress PDF's output is byte for byte as before; its page gains one related link.
