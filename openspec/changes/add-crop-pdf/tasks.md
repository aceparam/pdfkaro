# Tasks

No dependency. No new shared component. One shared engine change rides along, named in the pull request: `measure` on the open document in `src/engines/thumbnail.ts`, with `pixels` on the canvas maker (design decision 2). Thumbnails, PDF to JPG and PDF to PNG must pass their tests unchanged.

## 0. The owner's answers

- [ ] 0.1 Before group 1 starts, put the owner questions of the design (and the proposal's "New owner questions") to the owner through the program manager, and record the answers here: automatic cropping only, first; the margin (a fortieth of the shorter side); each page cut to its own content; white from 240; bleed, trim and art boxes cut back; passwords and restrictions dropped. If the owner asks for typed margins in the first version, stop: `add-number-option` must be proposed and merged first, and this change updated. Verify the answers are recorded and, where they differ from a default, the specs, design and these tasks are updated before any code.

## 1. Registry entry

- [ ] 1.1 Add the `crop-pdf` entry to `src/tools/registry.ts` as design decision 7 gives it, right after `rotate-pdf`; change the "Organise pages" group's description and sentence to the drafts in decision 7. In `tests/unit/registry.test.ts`, admit `crop-pdf` to the `noSmaller` check (line 366) and add a Crop entry test (words, `items: 'files'`, no options, `outputSuffix: 'cropped'`, placement right after `rotate-pdf`, the result notes' "hidden, not removed" and "no password and no restrictions"). Verify:
  - `npm test` passes, including catalogue order, related-links rules, hub word rules and the `claimsDevice` guard;
  - the built home page and `/organise-pages` list "Crop PDF" seventh under "Organise pages";
  - `npm run check:seo` passes, with `/crop-pdf` in the sitemap and its JSON-LD matching the registry.

## 2. Engine

- [ ] 2.1 Shared: add `measure(page)` to `OpenDocument` in `src/engines/thumbnail.ts` as design decision 2 gives it (draw on white with form values at scale 1, at least 1,000 pixels on the longer side, at most `measurePixels = 4_000_000`; ink below 240 on any channel; scan inward from each edge; grow by one pixel; corners through `convertToPdfPoint`; annotation rects except popups, hidden and no-view, at most 10,000; `blank`; `unsafe` from the first refused helper-data request on, or when a drawing throws). Add `pixels?(canvas)` to `CanvasMaker`, in the worker's maker (`getImageData` on its `OffscreenCanvas`) and in `tests/unit/thumbnail-helpers.ts` (`@napi-rs/canvas`). Extend the `PdfjsModule` type with `getAnnotations`, `view`, `rotate`, `userUnit` and the viewport's `convertToPdfPoint`, and the unit tests' PDF.js stand-ins to match. Leave `render` and `draw` unchanged. Verify `npm run lint`, `npm run check`, and every existing thumbnail, PDF to JPG and PDF to PNG unit test unchanged.
- [ ] 2.2 Write `src/engines/tools/crop-pdf.ts` as design decisions 4 to 6 give it: `loads = { read: ['qpdf'], job: ['qpdf', 'pdfjs'] }`, `inspect = inspectPdf`; `plainCopy`, `readPages`, `openDocument(plain.slice())` with the page counts checked; per page `measure` and the cut box (PDF.js's view, turn and unit checked against `place`; margin `D / 40`; outward rounding to 3 decimals; inside the old shown box; the 1-point rule); progress with `writesAfter`; `[]` when no page is cut; otherwise one JSON update of each cut page's own dictionary with the new `/CropBox` and its own bleed, trim and art boxes cut back or removed, written by `cappedWrite` with `sizeLimit` and `--object-streams=generate`, then `qpdf --check`. Fixed error sentences only; the document closed in `finally`. Export `cutBox` (pure, for the tests) and `marginFraction = 1 / 40`. Verify with the tests in 3.1 and 3.2.

## 3. Engine unit tests

- [ ] 3.1 Write `tests/unit/content-box.test.ts` as the design's Tests list it for `measure`, including the files made in the test (turned and offset pages, inherited crop box, `/UserUnit 2` and `1000`, a borderless empty field and a link over white space, hidden and popup annotations, `#d9d6cc` and hairline ink, 236-grey paper, a Latin page then unembedded Chinese then Latin). Verify they pass and make no request.
- [ ] 3.2 Write `tests/unit/crop-pdf.test.ts` as the design's Tests list it: `run` on every file in `tests/fixtures/` including `multilingual.pdf` and `chinese-unembedded.pdf`; content streams byte for byte (`pageStreams`); `/MediaBox`, `/Rotate` and `/UserUnit` unchanged; bookmarks, link, attachment, fields and values, tags kept, and every widget and link inside its page's new crop box; bleed, trim and art boxes; an inherited crop box; the margin and the 1-point rule; `SECRET-margin` in white still in the text; no password or restrictions after `password.pdf` and `restricted.pdf`; progress order; the output cap; no error holding page text or the password. Verify they pass.
- [ ] 3.3 Confirm `crop-pdf` runs in one of the `engine-loads` shards against every fixture, asking only for `qpdf` when reading and `qpdf` and `pdfjs` in the job (add it to a shard if the shards do not pick it up by themselves). Verify the four shard tests pass.
- [ ] 3.4 Run the tool against every file in `tests/fixtures/` and record each outcome in `tests/fixtures/README.md` under a new "Crop PDF" table (cut, with how many pages; nothing to cut; damaged; not a PDF; password), naming any page left as it is only because a helper-data request was refused. Measure time, output size and peak memory on `pages-500.pdf`, `make-large.mjs`'s 100 MB file and the 120,000-page file of `make-many-pages.mjs`, in Node and in Chromium, and record them. Verify the numbers are in the README.

## 4. Worker wiring

- [ ] 4.1 Confirm `tool.worker.ts` gives the engine `qpdf`, `pdfjs`, `pdfjsData`, `pdfjsGuard` and `canvas` (with `pixels`) with no other change, that `[]` reaches the page as the `noSmaller` outcome, and that `OutputLimit` maps to `output-limit`. Add the engine to `scripts/page-weight.mjs` and to `scripts/check-worker.mjs`'s engine list. Verify with `npm run build`, `npm run check:worker` (the engine its own file, loaded late, out of the worker file) and `npm run weigh` (the page under 100 KB).

## 5. Page and page text

- [ ] 5.1 Check the built `/crop-pdf` page: heading, sentence, title, description, the row once a file is read, focus on "Crop and download" and the status line naming the file, no options shown. Verify with the built page and a component test with this entry.
- [ ] 5.2 Write `src/content/tools/crop-pdf.md` as design section 8 gives it, 250 to 500 words, marked as a draft: steps, and questions on uploading, how the cut is found, why a page or scan was not cut, hidden not removed, choosing margins (not yet), what is kept and not, passwords, the original file. No "100%", no capitals for emphasis, no exclamation mark, no banned word, no question restating the title. Verify the built page holds the heading, sentence, steps and questions with scripts off, and the word count is in range.
- [ ] 5.3 Add the Privacy page draft sentence of design section 9 to `src/pages/privacy.astro`. Verify `tests/unit/privacy-page.test.ts` and `npm run check:seo` pass and the page still carries the draft line and `noindex`.

## 6. End-to-end test

- [ ] 6.1 Write `tests/e2e/crop-pdf.spec.ts`, importing `test` from `tests/e2e/fixtures.ts`, at 360px and 1280px, as the design's Tests list it: the page; the row and focus; "Getting ready" with the engine's route held; two files dropped; not a PDF; damaged; the password flow; a job on `text.pdf` with "Page N of M" and the bar never going back, the result notes, and the download `text-cropped.pdf` checked with qpdf (new crop box, same paper box) and PDF.js (same text); a file with nothing to cut (heading, words, focus, no Download, "Start again"); Cancel back to the file without the password asked again; failures from a stand-in engine (memory, `output-limit`, engine not fetched) under "The pages were not cropped." with "Go back to your file"; the 100 MB and 20,000-page notices; keyboard only. Verify it passes, with every other e2e test unchanged.

## 7. No-upload test

- [ ] 7.1 Write the tool's no-upload test in the same spec, as Rotate's and Protect's: an exact allowlist read from the build (the engine, `plain`, `inspect`, `stamp`, `qpdf-json`, `thumbnail` chunks as built, qpdf and its WebAssembly, the worker and workspace, PDF.js, its worker and data; no `fflate`, pdf-lib, `option-values` or other engine); a protected copy named `qz7report.pdf` with its stem, password and first-page text as secrets, plain and URL-encoded; nothing in any request, header, title, storage, address or console (the page's and each worker's, attached before the page opens); a download made. Add `/crop-pdf` to `tests/e2e/uniform-requests.spec.ts` with the PDF picks and its job (and to `tests/e2e/tool-files.ts` if its lists need it). Verify both pass.

## 8. Screenshots

- [ ] 8.1 Take screenshots of `/crop-pdf` at 360px and 1280px, light, of: empty; file read with the main button; password field; working; result with its notes; nothing to cut; failed. At 360px, dark: result and nothing to cut; at 360px, 200% text: the result, with nothing overflowing sideways. Put them in `.github/pr-screenshots/crop/`. Verify by looking at each, and against "Banned patterns".

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: confirm no change is needed, as no dependency is added.
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, `check:csp`, `check:seo`, end-to-end tests, `npm audit` and `npm run spec`. Verify each passes.
- [ ] 9.3 Write Crop's hand checks for issue #7 (in `issue-7-hand-checks.md` in this change, for the program manager to post): the result opened in Chrome, Firefox, Adobe Reader and macOS Preview, checking the cut, that nothing drawn was cut off, that links and fields work, and how printing treats the crop box; the multilingual file's cropped pages read by a reader of each script; browsers and phones; a screen reader on the result notes; the owner's review of the page text and the hub words.
- [ ] 9.4 When the pull request opens, name in it: the shared `measure` step and `pixels`; Crop reading pages through `stamp.ts`; the agent's choices (no options, `-cropped`, the words, the hub words); the residual risk of content PDF.js does not draw and does not report; that cropping hides and does not remove; and the owner questions with their answers or defaults. Add the new owner questions to "Questions waiting for the owner" in `CLAUDE.md` only if task 0.1 left any open.
- [ ] 9.5 Run the review panel (see the review-panel skill), stage 2, and resolve its findings. The pull request does not call the tool done while hand checks and the owner's text review are open.

## Workflow follow-up

- Stage 1 of the review panel reads this change before group 1 starts.
- After merge, archive the change with `/opsx:archive`.
- Add Crop PDF to "Where the project stands" in `CLAUDE.md` as the first Phase 2 tool, with what is not yet done (hand checks, page text review, next steps after the result).
