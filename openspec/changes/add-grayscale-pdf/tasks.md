# Tasks

No dependency. No new component. **Before task 1, the content reader must be merged** (design, Context): its own OpenSpec change and pull request, `add-content-reader`, proposed once this plan passes stage 1, adds `src/engines/content.ts` with the rules of design decision 4 (capped decoding of Flate, ASCII85 and ASCIIHex at 64 MiB a stream, the strict tokenizer with its inline-picture rule and its streams-in-sequence rule, and the byte-range editor), with its own unit tests for every hostile case, through the review panel at both stages and with its own line in "Where the project stands". Nothing shared rides along with this tool unless the build finds a need, which is then added to this change first.

## 0. The owner's answers and the order

- [ ] 0.1 Record the owner's answers. **Answered by the owner on 24 Nov 2026** (`CLAUDE.md`): "Everything, kept as text". Put owner question 1 (colours kept underneath through a grey stand-in; the file does not shrink) to the owner at stage 1 and record the answer here; if the owner wants grey values stored, stop and update the change. Questions 2 to 7 go ahead on their defaults and are listed in the pull request and added to "Questions waiting for the owner" (task 9.4).
- [ ] 0.2 Confirm `add-content-reader` is merged on the branch this tool is built from: `src/engines/content.ts` exports the decoder, tokenizer and editor with the rules of design decision 4, and its tests pass. Verify by reading the file and `npm test`.

## 1. Registry entry

- [ ] 1.1 Add the `grayscale-pdf` entry to `src/tools/registry.ts` as design decision 8 gives it, right after `compress-to-target`, with the no-new-file words and the three result notes; change the "Make smaller and fix" description and sentence to the drafts. In `tests/unit/registry.test.ts`, admit `grayscale-pdf` to the `noSmaller` checks and add an entry test (words, `items: 'files'`, no options, `outputSuffix: 'grayscale'`, placement right after `compress-to-target`, the notes naming what stays in colour, the colours kept underneath, and "no password and no restrictions"). Verify `npm test` (catalogue order, related links, hub word rules, `claimsDevice`), the built home page and `/make-smaller-and-fix` listing "Grayscale PDF" after "Compress PDF to 2 MB", and `npm run check:seo` with `/grayscale-pdf` in the sitemap.

## 2. Engine

- [ ] 2.1 Write `src/engines/tools/grayscale-pdf.ts` as design decisions 2 to 6 give it, importing from `content`, `plain`, `inspect`, `pages`, `qpdf-json`, `qpdf` and the files holding `inflateLimited` and `zlibDeflate`, never from another engine or `stamp`:
  - `loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, `inspect = inspectPdf`; one file; `plainCopy` into a `PlainSource`; "Reading the file"; `readPages(…, { objects: true })`;
  - the plan from dictionaries: colour-space use sites by the table of decision 3 (resources' `/ColorSpace` entries, pictures except JPEG 2000, shadings, indexed and pattern bases), each pointed at `GreyRGB` or `GreyCMYK` or a new indexed or pattern array (one per distinct original), never a space object changed in place; the two stand-ins and their Type 4 functions written only when used; names unused by any `/ColorSpace` dictionary; `/C`, `/IC`, `/MK` `/BG` and `/BC`, bookmark `/C` made neutral with the same count; `/DA` strings edited to `g`; `/Thumb` removed; the drawing streams in order of the first page reaching each (iterative walk, one visited set, depth 64), soft-mask-only forms and appearance streams or patterns with no own resources left out; the stand-in names added to every resources dictionary in force when any rewrite uses them; every value counted against `sizeLimit` as it is built;
  - the streams read in raw batches, decoded, tokenized and edited by the content reader (`rg`, `RG`, `k`, `K` with the stand-in inserted before the operands and `sc`/`SC` in place of the operator; `/DeviceRGB` or `/DeviceCMYK` operands of `cs`/`CS` replaced), deflated, each decoded byte counted against the content budget (`OutputLimit` past it); "Page N of M" counting every page;
  - `[]` when nothing changes; the plan let go; the update written in pieces to a qpdf that took the plain copy, each counted; `writePageUpdate`, progress 80 to 100.
  Fixed error sentences only. Verify with the tests in 3.1.

## 3. Engine unit tests

- [ ] 3.1 Write `tests/unit/grayscale-pdf.test.ts` (with `tests/unit/grayscale-helpers.ts`) as the design's Tests list it, with `globalThis.fetch` replaced by a function that throws and records, asserted never called, and expected greys computed in the test from the known colours: every fixture's outcome; `qpdf --check`, no password or restrictions, the same text from PDF.js and the same tokens outside the edits for every result; the RGB, form-inheritance, pattern, Type 3, shading and picture files drawn neutral and within 2 of the original's grey on average (6 at most per pixel); CMYK fills at their grey; everything left as it is byte for byte; every doubt case leaving its stream byte for byte; decoding chains, unsupported filters and the two bomb cases; the name clash; resources on a page with none and on a `/Pages` node; annotation, field, `/DA` and bookmark colours; `/Thumb` removed; `rich.pdf`, `form.pdf`, `tagged.pdf` kept; a grey-only file giving `[]`; progress order; the update cap; no error holding page text, a field value or the password. In `tests/unit/multilingual.test.ts`, compare Grayscale's streams token by token outside the edits instead of byte for byte, keeping the text checks. Verify they pass.
- [ ] 3.2 Confirm `grayscale-pdf` runs in one of the `engine-loads` shards against every fixture, asking for `qpdf` when reading and `qpdf` and `fflate` in the job. Verify the shard tests pass.
- [ ] 3.3 Run the tool against every file in `tests/fixtures/` and record each outcome in `tests/fixtures/README.md` under "Grayscale PDF" (converted, with what changed; nothing to change; damaged; not a PDF; password). Measure time, output size and peak memory on `make-large.mjs`'s 100 MB file and its `--scans` file, the 120,000-page file, a 20,000-page file with its own coloured content streams (a new `make-many-pages.mjs` option, written outside the repo) and a crafted file at the content budget, in Node and in Chromium, against the ceiling (1.19 GB Node, 1.36 GB Chromium) and the budgets of design decision 7. If a budget is passed, apply the lever (more ids per raw batch, a lower content budget) and update the change before the pull request. Verify the numbers are in the README.

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` gives the engine `qpdf` and `fflate` with no change, that `[]` reaches the page as `noSmaller`, and that `OutputLimit` maps to `output-limit`. Name any new chunk in `scripts/page-weight.mjs` and `scripts/check-worker.mjs` if the build needs it. Verify with `npm run build`, `npm run check:worker` (the engine its own file, loaded late; no `stamp` or pdf-lib chunk in its job) and `npm run weigh` (the page under 100 KB).

## 5. Page and page text

- [ ] 5.1 Check the built `/grayscale-pdf` page: title, description, heading, sentence, the row once a file is read, the main button, the status line. Verify with the e2e test in 6.1.
- [ ] 5.2 Write `src/content/tools/grayscale-pdf.md` as design section 9 gives it, 250 to 500 words, marked as a draft. Add the Privacy draft sentence of design section 10 to `src/pages/privacy.astro` with its comment tying it to this change, and its check to `tests/unit/privacy-page.test.ts`. Verify the built pages hold the text with scripts off, the word count is in range, and no banned word, "100%" or exclamation mark appears.

## 6. End-to-end test

- [ ] 6.1 Write `tests/e2e/grayscale-pdf.spec.ts`, importing `test` from `tests/e2e/fixtures.ts`, at 360px and 1280px, as the design's Tests list it, with coloured files made in the test into a temporary folder: the page; the row and main button; "Getting ready"; two files dropped; not a PDF; damaged; the password flow; a coloured job with progress and the bar never going back, the three notes, and the download `<name>-grayscale.pdf` checked with qpdf and PDF.js (text kept, pixels neutral); a grey-only file with the no-new-file words; Cancel; failures from a stand-in engine under "The file was not converted." with "Go back to your file"; the notices; keyboard only. Verify it passes, with every other e2e test unchanged.
- [ ] 6.2 Add "Grayscale PDF: listing and converting the 500-page file blocks the page for no more than 100 ms at a time" to `tests/e2e/performance.spec.ts`. Verify by running it five times in a row in Chromium.

## 7. No-upload test

- [ ] 7.1 Write the tool's no-upload tests in the same spec: a protected coloured file `qz7report.pdf` made in the test with `SECRET-` strings in its text, a link, a destination, a bookmark and a field, and `rich.pdf`, `tagged.pdf` and `form.pdf`; secrets plain and URL-encoded (`withEncoded`); an exact allowlist read from the build (no PDF.js in the job, no pdf-lib, `stamp` or other engine); nothing in any request, header, title, storage, address or console of the page or any worker. Add `/grayscale-/` to the other tools' no-upload forbidden lists. Add `/grayscale-pdf` to `tests/e2e/uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs`, `failingJob`, `images.pdf` (`expect: 'done'`), a grey-only fixture (`expect: 'no-file'`) and the outcomes recorded in task 3.3, and to `tests/e2e/tool-files.ts` if its lists need it. Name in the pull request that the number of qpdf instances, so WebAssembly requests under the no-cache exception, depends on the file. Verify all pass.

## 8. Screenshots

- [ ] 8.1 Take screenshots of `/grayscale-pdf` at 360px and 1280px, light, of: empty; file read; password field; working; result with its notes; nothing to change; failed. Dark, at 360px and 1280px: empty, file read, result. At 360px, 200% text: the result, with nothing overflowing sideways. Put them in `.github/pr-screenshots/grayscale/`. Verify by looking at each, and against "Banned patterns".

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: confirm no change is needed, as no dependency is added.
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, `check:csp`, `check:seo`, end-to-end tests, `npm audit` and `npm run spec`. Verify each passes.
- [ ] 9.3 Write this tool's hand checks for issue #7 (`issue-7-hand-checks.md` in this change): results opened in Chrome, Firefox, Adobe Reader and macOS Preview and printed on a black-and-white and a colour printer (grey everywhere, text selectable, fields typed in grey); a 300-pixel-to-the-inch scan's drawing time in Chrome's viewer (the Type 4 risk); the multilingual file read by a reader of each script; browsers and phones; a screen reader; the owner's review of the page text, notes and hub words.
- [ ] 9.4 When the pull request opens, name in it: the content reader as its own change first; the owner's decision of 24 Nov 2026 and the answer to question 1; questions 2 to 7 with their defaults, also added to "Questions waiting for the owner"; the approaches weighed and rejected (design decision 1); what is left in colour; the limits (64 MiB, the content budget); the request difference; the agent's choices (stand-ins, names, words, `-grayscale`, related links).
- [ ] 9.5 Run the review panel (see the review-panel skill), stage 2, and resolve its findings. The pull request does not call the tool done while hand checks and the owner's text review are open.

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`.
- Add an entry for Grayscale PDF under Phase 2 in "Where the project stands" in `CLAUDE.md`, with what is not yet done (hand checks, page text review, next steps after the result).
