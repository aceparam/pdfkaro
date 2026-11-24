# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF and Resize pages, the two Phase 2 rows of "Organise pages", are merged and archived (`add-crop-pdf`, PR #38; `add-resize-pdf`, PR #40). The next Phase 2 browser row in catalogue order is **Compress to a target size** (`/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb`, `-2mb`; "Make smaller and fix", Browser, Phase 2), second in its group after Compress PDF.

`SPEC.md` says it "is one tool with preset pages. Each preset page opens the compressor with that target already selected" (Scope notes); that target sizes are "where a new site can win first", because "upload forms with size limits make these common searches" (SEO, Specific-search pages); and that "each of these pages must be the working tool with that setting already chosen, plus text written for that exact case. Pages that are the same text with one word swapped get ignored by search engines … so none are published."

**The owner decided on 24 Nov 2026** (`CLAUDE.md`):

- **"Pictures only":** picture resolution and JPG quality are lowered step by step until the file fits. Text, drawings and fonts stay as they are, and no page is turned into a picture.
- **"Give the smallest, say so":** when the target cannot be reached, the smallest file made is handed back, with a sentence naming its size and saying it is over the target.
- **"No, keep them lossless"** (asked at stage 1): pictures stored without loss are never saved as JPGs, even as a last step. They may still be scaled down and stored without loss again, as Compress PDF does.

## What Changes

- **One new tool, `compress-to-target`, with five pages,** each page's preset setting its target (`{ target: '100kb' }` and so on), as PDF to JPG and PNG set their format (design, decision 1). The target is not a choice on the page. It sits second under "Make smaller and fix", after Compress PDF, its pages in size order.
- **Per page:** title, heading, sentence, description, main button and text below the tool are each the page's own (decision 10). Heading "Compress a PDF to 200 KB", sentence "Make a PDF 200 KB or smaller. Your file stays on your device.", main button "Compress to 200 KB and download". One PDF, listed as one row, no options.
- **A target is bytes, counted in thousands,** written once in `src/widget/option-values.ts` (200 KB is 200,000 bytes), so the file fits forms that count either way. **One byte rule** decides how a size over the target is shown: in bytes with a thousands separator whenever the usual 1024-based form would not read as more than the target (decision 2).
- **A file already at or under the target** is held from the pick: the main button is unavailable with "report.pdf is already 200 KB or smaller, so there is nothing to do here. You can use it as it is.", and no password is asked for it (decision 8).
- **How the size is reached** (decisions 3 to 6):
  - Compress PDF's own candidates, with a stated and real length of at least 4 KB, at most the 10,000 largest, within a fixed pixel-work budget (lossless pixels weighted by a calibrated cost) planned from the dictionaries before any raw data is read;
  - a ladder of seven steps, from Compress PDF's own setting (150 pixels to the inch across the largest page, quality 75) to a floor of 72 pixels to the inch and quality 40. JPG pictures are scaled and saved again; lossless pictures are scaled and stay lossless;
  - every picture measured once at every step, keeping only sizes; the mildest step whose estimate fits within 99% of the target is written, and the written file's real size decides; at most three writes, each through `cappedWrite` with its own fresh qpdf;
  - any written file at or under the target is given, whatever it saves. When none fits, the smallest written is given if at least 1% smaller than the original; otherwise "no new file".
- **The result:** under the target, "Your file is now 200 KB or smaller" and the shared "was" line; over it, "Your file is still over 200 KB", "The smallest file this tool could make is 312 KB, which is over 200 KB.", advice and Download, with the "was" line using the same form of the size; no smaller file, "This file could not be made smaller." with advice.
- **Passwords and restrictions are kept,** as Compress PDF keeps them.
- **Progress:** "Reading the file", "Picture N of M" while measuring, then "Writing the compressed file", the bar never going back.
- **The "Make smaller and fix" hub words** gain upload limits. Compress PDF's related links gain "Compress PDF to 200 KB". The home filter finds "200kb" as "200 KB".
- **Shared pieces:**
  - **before this tool, in its own pull request with no change in behaviour:** Compress PDF's picture work moves into `src/engines/shrink.ts`, including `losslessOptions`, `keepBelow`, a `listCandidates` taken out of `run`, `pixelLimit`'s resolution argument and `shrinkJpeg` split into a decode step and an encode step, checked byte for byte. This tool's pull request changes no Compress PDF code;
  - **riding along, named in the pull request:** the page target size (`sizeTarget` and `src/widget/target.ts`: the hold, the result words and the byte rule); the home filter ignoring spaces; a `check:worker` rule that no engine file imports another engine's file, and `shrink.ts` in its late-loaded list; `uniform-requests.spec.ts` gaining `expect: 'over'`, a held row and generated files over each target.
- **Page text, tests and screenshots,** with five texts below the tool, checked by a test to share no run of eight words once target sizes are replaced by one token.

### Scope

- **One tool** with five pages, no new component and no new option kind. The picture-steps move goes first.
- **Out of scope:**
  - turning pages into pictures, saving lossless pictures as JPGs, removing fonts, details, bookmarks or attached files;
  - a target the visitor types or chooses on the page (owner question 1); other targets;
  - pictures Compress PDF leaves alone: CMYK, indexed colours, grey with a colour profile, 1-bit scans, JPEG 2000, 16-bit, inline pictures, masks and soft masks themselves;
  - knowing before the main button whether the target can be reached;
  - next steps after the result, and handing the result to another target page;
  - the missing thousands separator in "Picture N of M".

### `SPEC.md` sections

- "Tool catalogue": Compress to a target size, Browser, Phase 2, second under "Make smaller and fix"; "Scope notes for specific tools": one tool with preset pages.
- "What we are building": rules 1, 2, 4 ("Honest about limits") and 5.
- "Architecture and tech stack": compression on qpdf and the browser's picture decoder, by the owner's decision of 13 Nov 2026; "Rules for the code" 1 to 4.
- "Tool page anatomy": parts 1 to 7 and every state in "States every tool handles".
- "Details that apply everywhere": output names; sizes in plain units, "4.2 MB, was 11.8 MB".
- "SEO": "Every tool page", "Specific-search pages", "Site-wide".
- "Privacy, limits and security": "Browser tools".
- "Build phases": Phase 2 ("target-size pages"), with the owner's decision of 23 Nov 2026.
- "Definition of done": "Each tool", the whole test set.

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name or a password. `loads: { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, as Compress PDF: after a pick the read set and the draw set, as for every PDF tool; the job's fresh worker loads qpdf, `fflate` and the engine with the shared chunks it imports, as built (`shrink`, likely with `resample`; `plain`, which holds `qpdf-json`; `picture`, `inspect`, `option-values`). Not pdf-lib, `pages` or `stamp`. The sets are the same on all five pages and for every file, with two differences named in the pull request (decision 11): a file at or under the target starts no job, so whether a job set is fetched depends on the file's size; and the number of qpdf instances, so of WebAssembly requests under the named no-cache exception, depends on the file, as for Compress PDF. No dependency is added.

## Open decisions and owner questions touched

- **Decided by the owner, 24 Nov 2026:** pictures only; give the smallest and say so; lossless pictures stay lossless.
- **Licence and Ghostscript:** answered (13 Nov 2026).
- **Compress PDF keeps passwords** (open): this tool keeps them too; the answer applies to both.
- **Going ahead on defaults, listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md`:**
  1. the target is fixed by each page, with no choice on the page;
  2. the floor: 72 pixels to the inch and JPG quality 40;
  3. a target counts in thousands (200 KB = 200,000 bytes);
  4. a file already at or under the target is not compressed, and the main button says why;
  5. the 1% line: a file that fits is always given, whatever it saves; a file still over the target is given only when at least 1% smaller than the original, otherwise "no new file".
- **20,000 pages and 100 MB:** the shared notices.
- **Repair PDF link:** no link until Repair PDF is published.
- **Signed files** (open): the page says a signature stops being valid.
- **Grey scans as colour JPGs** (open): the same code as Compress PDF; the answer applies to both.
- **Shared pieces in tool pull requests** (open): the picture-steps move goes first; what rides along is named.
- **Uniform requests** (open, entry 24): the two differences above are named, not claimed closed.
- **Hub words** (open): redrafted for issue #7.
- **Licence, server host, money, analytics, AI tools, character maps:** not touched.
- **The agent's own choices,** named in the pull request: one tool with five pages; the ladder; the 4 KB, 10,000 and pixel-work limits; at most three writes; `-compressed`; the words; the related links.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

- `compress-to-target`: what Compress to a target size does on its five pages: one file, the target each page sets, a file already under it, which pictures change and how far, the floor, the budget, the writes, what the file keeps, the result under and over the target, "no smaller file", every state, nothing uploaded, and the words on each page.

### Modified Capabilities

- `tool-registry`: new requirements "Compress to a target size is one tool with five pages" and "Size-target presets are checked".
- `tool-page`: new requirements "A target size a page sets" and "A result measured against the page's target".

## Impact

- **Before this change, its own pull request:** `src/engines/shrink.ts` (decision Context); `compress-pdf.ts` imports it; Compress PDF's output byte for byte the same; its tests change only in imports; no new built file and no script change.
- **New code:**
  - `src/engines/tools/compress-to-target.ts`;
  - `src/widget/target.ts`;
  - `src/content/tools/compress-pdf-to-100kb.md`, `-200kb.md`, `-500kb.md`, `-1mb.md`, `-2mb.md`;
  - `tests/unit/compress-to-target.test.ts`, `tests/unit/target.test.ts`, the shared-text test, `tests/e2e/compress-to-target.spec.ts`, `tests/e2e/target-files.ts` (files over each target, generated, not committed).
- **Changed code (none of it Compress PDF's engine):**
  - `src/tools/registry.ts`: the entry, the hub words, Compress PDF's related links, `sizeTarget` in `ToolWidgetWords`; `tests/unit/registry.test.ts`: the entry, the size-target rules, the catalogue-order regex, the `noSmaller` lists;
  - `src/widget/option-values.ts`: `sizeTargets`, `acceptedTarget`;
  - `src/hooks/useToolRun.ts`, `ToolWorkspace`, `Result`: the hold and the result words;
  - `src/tools/filter.ts` and its test: spaces ignored;
  - `scripts/check-worker.mjs`: `shrink.ts` in `lateSources` (the engine-import rule came with the move PR); `scripts/page-weight.mjs` if needed;
  - `tests/e2e/uniform-requests.spec.ts`, `tests/e2e/tool-files.ts`, `tests/e2e/host-log.ts` if it needs the generated folder, `tests/e2e/performance.spec.ts`, other tools' no-upload forbidden lists;
  - `tests/fixtures/make-large.mjs` (`--scans`, `--lossless`), `tests/fixtures/README.md`.
- **Every other tool:** no change in behaviour.
