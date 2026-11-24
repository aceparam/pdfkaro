# Tasks

No dependency. No new component. **Before task 1, the picture-steps move must be merged** (design, Context): its own pull request, with no OpenSpec change, through the review panel's stage 2 and with its own line in "Where the project stands" in `CLAUDE.md`, moves Compress PDF's picture steps (`canShrink`, `pictureContext`, `pixelLimit`, `newDictionary`, `shrinkJpeg`, `shrinkLossless`, `zlibDeflate`, `statedLength`, their types and limits) from `src/engines/tools/compress-pdf.ts` into `src/engines/shrink.ts`; names the new chunk in `scripts/check-worker.mjs`, `scripts/page-weight.mjs` and Compress PDF's no-upload allowlist; and shows Compress PDF's output byte for byte the same on every fixture. Riding along with this tool, named in its pull request: `pixelLimit`'s resolution argument, the split of `shrinkJpeg` into `decodeForSteps` and `encodeAt`, and the page target size (`sizeTarget`, `src/widget/target.ts`).

## 0. The owner's answers and the order

- [ ] 0.1 Record the owner's answers. **Answered by the owner on 24 Nov 2026** (`CLAUDE.md`, "Compress to a target size works on pictures only, and gives the smallest file it can"): "Pictures only" and "Give the smallest, say so". The six defaults in design "Open Questions" go ahead and are listed in the pull request and added to "Questions waiting for the owner" in `CLAUDE.md` (task 9.4).
- [ ] 0.2 Confirm the picture-steps move is merged on the branch this tool is built from: `src/engines/shrink.ts` exists with the names above, `compress-pdf.ts` imports them and exports none of them, and Compress PDF's tests pass unchanged. Verify by reading the files and `npm test`.

## 1. Registry entry

- [ ] 1.1 Add `sizeTargets` and `acceptedTarget` to `src/widget/option-values.ts` (design decision 2). Add `sizeTarget?: { key: string; overAdvice: string }` to `ToolWidgetWords` in `src/tools/registry.ts`. Add the `compress-to-target` entry right after `compress-pdf`, with its five pages, presets, page words and tool words as design decision 9 gives them; change the "Make smaller and fix" description and sentence to the drafts in decision 9; add `compress-pdf-to-200kb` to Compress PDF's related links. In `tests/unit/registry.test.ts`: the entry test (words, the five pages in size order with their presets and buttons, `items: 'files'`, no options, `outputSuffix: 'compressed'`, `resultWas`, `sizeTarget.key: 'target'`, placement after `compress-pdf`), the size-target preset rule with failing test entries (a page with no target, `'300kb'`, a tool without `sizeTarget` whose page sets `target`), and the `noSmaller` lists. Verify:
  - `npm test` passes, including catalogue order, related-links rules, hub word rules and the `claimsDevice` guard;
  - the built home page and `/make-smaller-and-fix` list the five pages after Compress PDF;
  - `npm run check:seo` passes with five new sitemap entries, unique titles and descriptions, and JSON-LD matching the registry.

## 2. Engine

- [ ] 2.1 Shared, in `src/engines/shrink.ts`: `pixelLimit(objects, ppi = 150)`; `decodeForSteps` and `encodeAt` (design decision 5a), with `shrinkJpeg` rebuilt on them. Verify `npm run lint`, `npm run check`, Compress PDF's unit tests unchanged, and Compress PDF's output on every fixture byte for byte the same as before (if any byte differs, keep `shrinkJpeg`'s own path and name it in the pull request).
- [ ] 2.2 Write `src/engines/tools/compress-to-target.ts` as design decisions 3 to 6 give it, importing from `shrink`, `qpdf-json`, `picture`, `resample`, `plain`, `inspect`, `qpdf` and `option-values`, never from another engine or `pages`/`stamp`:
  - `loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, `inspect = inspectPdf`; the target checked with `acceptedTarget` before the file is read; `[]` for an input at or under the target;
  - candidates by `canShrink`, with the 4 KB floor and the 10,000 largest;
  - the ladder table as constants, the measuring pass keeping only sizes, a picture that throws left alone at every step;
  - the estimate with `F0`, the chosen step, write 1, `F1`, at most two more writes as decision 5 step 5, only the best file kept, `[]` unless at least 1% smaller;
  - progress as decision 6, never going back; fixed error sentences only; the password only through `passwordArgsFor`.
  Verify with the tests in 3.1.

## 3. Engine unit tests

- [ ] 3.1 Write `tests/unit/compress-to-target.test.ts` as the design's Tests list it. Most fixtures are under 100 KB, which the page holds and the engine answers with `[]`, so the engine's own step (`shrinkToBytes(file, targetBytes, …)`, which `run` calls with the target's bytes) is also called directly with targets below each fixture's size (half and a tenth of it). Tests run with `globalThis.fetch` replaced by a function that throws and records, asserted never called, and qpdf writes counted: every fixture with each of the five targets; files made in the test answered at step 1, step 4, step 7 and after step 7; a lossless picture with a soft mask never a JPG and its mask unchanged; the floor giving the smallest file over the target; an input under the target giving `[]`; a file with no candidate written once; a text-only file over 100 KB already packed by qpdf giving `[]`; at most three writes, one when the first guess fits; measured and written sizes equal; the 4 KB and 10,000 limits; `compress-kinds.pdf`'s left-alone pictures; `compress-password.pdf` keeping password and restrictions; an unknown or missing target refused before reading; `multilingual.pdf`, `rich.pdf`, `form.pdf`, `tagged.pdf` with content streams (`pageStreams`) and text kept; progress order; the three bombs as Compress PDF; no error holding the password or document text. Write `tests/unit/target.test.ts` for `target.ts` (held, under, over, the bytes rule at 199,999, 200,000, 200,001 and 203,000 bytes). Verify they pass.
- [ ] 3.2 Confirm `compress-to-target` runs in one of the `engine-loads` shards against every fixture, asking only for `qpdf` when reading and `qpdf` and `fflate` in the job. Verify the shard tests pass.
- [ ] 3.3 Run the tool against every file in `tests/fixtures/` with each target and record each outcome (under, over with its size and step, no smaller file, held as already under, damaged, not a PDF, password) in `tests/fixtures/README.md` under a new "Compress to a target size" table. Add a `--scans` mode to `tests/fixtures/make-large.mjs` (about 100 MB of 300-to-the-inch JPG scans from the committed pictures, written outside the repo). Measure time, writes, output size and peak memory on `compress-scans.pdf`, the 100 MB scans file (100 KB and 2 MB), `make-large.mjs`'s 100 MB file and the 120,000-page file, in Node and in Chromium, against the ceiling of Add page numbers' on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium) and the 5-minute budget. If a budget is passed, update the change (design decision 6 fallback) before the pull request. Verify the numbers are in the README.

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` gives the engine `qpdf`, `fflate`, `decodePicture` and `canvas` with no change; that the page's preset reaches the engine as `options.target`; that `[]` reaches the page as the `noSmaller` outcome; and that an over-target file reaches `Result` with its size. Add the page target size to `useToolRun`, `src/widget/options.ts` (the hold, with `holdErrorId`), `ToolWorkspace` and `Result` (headings and the over-target sentence from `target.ts`). Verify with `npm run build`, `npm run check:worker` (the engine its own file, loaded late; importing the `shrink` chunk and no other engine's) and `npm run weigh` (each page under 100 KB).

## 5. Page and page text

- [ ] 5.1 Check each built page: title, description, heading, sentence, the row once a file is read, the main button with its own size, and the status line. Verify with the e2e test in 6.1.
- [ ] 5.2 Write the five texts, `src/content/tools/compress-pdf-to-100kb.md`, `-200kb.md`, `-500kb.md`, `-1mb.md` and `-2mb.md`, as design decision 9 gives them, each 250 to 500 words, each marked as a draft, each with its own steps and questions; add the test that no sentence of eight words or more appears in two of them, with the banned-pattern checks. Verify the built pages hold the heading, sentence, steps and questions with scripts off, and the test passes.

## 6. End-to-end test

- [ ] 6.1 Write `tests/e2e/compress-to-target.spec.ts`, importing `test` from `tests/e2e/fixtures.ts`, at 360px and 1280px, as the design's Tests list it: each page's words; "Getting ready" with the engine's route held; two files dropped; not a PDF; damaged; the password flow; `compress-scans.pdf` on the 200 KB page from pick to Download with "Picture N of M" and the bar never going back, the download checked with qpdf and PDF.js and at most 200,000 bytes; a result over the target on the 100 KB page with its heading, sentence and Download (a file made in the test if `compress-scans.pdf` fits there); `text.pdf` held as already under the target, its sentence tied to the button; a packed text-only file over 100 KB made in the test with "This file could not be made smaller."; Cancel back to the file with no password asked again; failures from a stand-in engine (memory, engine not fetched) under "The compression did not finish." with "Go back to your file"; the 100 MB and 20,000-page notices; keyboard only. Verify it passes, with every other e2e test unchanged.
- [ ] 6.2 Add "Compress to a target size: listing and compressing `compress-scans.pdf` on the 200 KB page blocks the page for no more than 100 ms at a time" to `tests/e2e/performance.spec.ts`. Verify by running it five times in a row in Chromium.

## 7. No-upload test

- [ ] 7.1 Write the tool's no-upload test in the same spec, as Compress PDF's: an exact allowlist read from the build (after the pick: the read and draw sets; in the job: the engine, `shrink`, `qpdf-json`, `picture`, `resample`, `plain`, `inspect` and `option-values` chunks as built, qpdf and its WebAssembly, `fflate`, the worker and workspace; no pdf-lib, `pages`, `stamp` or other engine); a protected file made in the test, named `qz7report.pdf`, over 200 KB through a large photo, with a `SECRET-` string in its text, a link, a field and a picture's camera details; secrets: the name, its stem, the password and its fragments, the text and every `SECRET-` string, plain and URL-encoded (`withEncoded`); on the 200 KB page, with a download made; nothing in any request, header, title, storage, address or console (the page's and each worker's). Add the five pages to `tests/e2e/uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs`, `failingJob`, and `expect: 'done'`, `'no-file'` and the held case, and to `tests/e2e/tool-files.ts` if its lists need it. Verify all pass.

## 8. Screenshots

- [ ] 8.1 Take screenshots of `/compress-pdf-to-200kb` at 360px and 1280px, light, of: empty; file read; file held as already under the target; password field; working; result under the target; result over the target (on `/compress-pdf-to-100kb`); no smaller file; failed. Dark, at 360px and 1280px: empty, file read, both results. At 360px, 200% text: the held file and the over-target result, with nothing overflowing sideways. The empty state of the other four pages at 360px. Put them in `.github/pr-screenshots/compress-to-target/`. Verify by looking at each, and against "Banned patterns".

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: confirm no change is needed, as no dependency is added.
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, `check:csp`, `check:seo`, end-to-end tests, `npm audit` and `npm run spec`. Verify each passes.
- [ ] 9.3 Write this tool's hand checks for issue #7 (`issue-7-hand-checks.md` in this change, for the program manager to post): results opened in Chrome, Firefox, Adobe Reader and macOS Preview; pictures at the floor read by eye on a phone; the five pages and their texts read by the owner; browsers and phones; a screen reader on the held button and the over-target result; the multilingual test file.
- [ ] 9.4 When the pull request opens, name in it: the picture-steps move as its own pull request first, and what rides along (`pixelLimit`'s resolution, the `shrinkJpeg` split, the page target size), citing the open owner question "Shared pieces in tool pull requests"; the owner's two decisions of 24 Nov 2026; the six owner questions with their defaults, also added to "Questions waiting for the owner" in `CLAUDE.md`; the touched open questions (passwords kept, grey scans as colour JPGs, signed files, hub drafts); the agent's choices (one tool with five pages, the ladder, the 4 KB and 10,000 limits, at most three writes, `-compressed`, the words, the related links).
- [ ] 9.5 Run the review panel (see the review-panel skill), stage 2, and resolve its findings. The pull request does not call the tool done while hand checks and the owner's text review are open.

## Workflow follow-up

- After merge, archive the change with `/opsx:archive`.
- Add an entry for Compress to a target size under Phase 2 in "Where the project stands" in `CLAUDE.md`, with what is not yet done (hand checks, page text review, next steps after the result).
