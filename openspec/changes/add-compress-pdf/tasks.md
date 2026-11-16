# Tasks

## 1. Registry entry and shared widget pieces

- [x] 1.1 Add the `compress-pdf` entry to `src/tools/registry.ts` with the optional words `resultWas` and `noSmaller` (heading and advice); the registry test checks catalogue order and its words
- [x] 1.2 A run that gives no file: `Engine` may return `[]`, `worker-core` and `isFromWorker` pass it, the state holds a "no smaller" result, and `ToolWorkspace` shows `noSmaller`'s heading and advice with focus and announcement, "Start again" and no Download; the page treats a result whose size reads the same as the input's as no smaller; a tool without `noSmaller` shows the engine failure; `Result` shows "was" and the input's size when `resultWas` is set; the summary line is left out for one file in a one-file tool; unit and component tests, other tools unchanged
- [x] 1.3 Progress: the `'picture'` unit ("Picture 3 of 40", filling 0.2 to 0.8) and "Reading the file" for a reading of `done: 0, total: 1`, in `format.ts`, with tests that other tools' lines are unchanged

## 2. Engine

- [x] 2.1 Move `json`, `objects`, `objectArg`, `objectsPerCall`, `updateJson` and `callWithArgumentFile` into `src/engines/qpdf-json.ts`, unchanged, with `outline.ts` and `plain.ts` importing them and their tests and `check-worker.mjs`'s sentences following; add `Qpdf.remove(path)`; add `readDictionaries` (to a file in qpdf's memory, 64 MB limit before parsing, failures skip the pictures step), `readRawStreams` (fresh qpdf per batch of at most 32 MB of raw data, files removed after use) and `writeUpdate` (fresh qpdf, `JSON.stringify`, lossless options, `qpdf --check` with the password)
- [x] 2.2 Write `src/engines/resample.ts`: undo PNG predictors 10 to 15, and scale 8-bit grey or RGB samples by area averaging; pure
- [x] 2.3 Write `src/engines/tools/compress-pdf.ts`: `canShrink` (exported; the key allow-list, size, colours, filter, not a mask, no `/Matte`), the pixel limit from CropBox or MediaBox up `/Parent` with `/UserUnit` and finite checks, `shrinkJpeg` (frame must match the dictionary), `shrinkLossless` (`inflateLimited` at the exact size), the new dictionary rules, `run` with reading, picture and writing progress, the 1% rule giving `[]`, passwords kept; `inspect` is `inspectPdf`
- [x] 2.4 `decodePicture`'s `{ colours: 'none' }` option with `resizeQuality: 'high'`, `canvas.jpeg(canvas, quality)`, and `fflate`'s `Deflate`, in `tool.worker.ts` and in the unit tests' tools

## 3. Engine unit tests

- [x] 3.1 Fixtures in `tests/fixtures/make.mjs`:
  - an A4 file of three 300 pixels-to-the-inch JPG scans (DeviceGray and RGB), one carrying `pictures/details.jpg`'s EXIF markers;
  - a file with a large lossless screenshot, one with a PNG predictor;
  - a JPG already small;
  - a CMYK JPG, a CCITT scan, an image mask, a picture with a colour-key mask, a picture with a grey ICC profile, and a picture whose soft mask has `/Matte`;
  - a picture with an RGB ICC profile and a soft mask;
  - a text-only file with uncompressed content;
  - hostile ones:
    - an attachment that inflates to about 1 GB;
    - a picture whose Flate data inflates past its dictionary's size;
    - a JPG whose header disagrees with its dictionary (size, and four components under `/DeviceRGB`);
    - a small file of very many objects that gives a JSON over the limit.
- [x] 3.2 `tests/unit/resample.test.ts`; `tests/unit/qpdf-json.test.ts` (the moved helpers keep their tests; the new steps; keys refused unless `obj:N G R`; the size limit)
- [x] 3.3 `tests/unit/compress-pdf.test.ts`: `canShrink` for every case; `run` on every file in `tests/fixtures/` and the new fixtures, checking with qpdf's JSON each picture's size, filter and colour space, untouched pictures left as they were: byte for byte for what is not stored with `/FlateDecode` (CMYK and mismatched JPGs, CCITT, JPEG 2000), the same dictionary and decoded data for what is (soft masks, masks, grey ICC), allowed keys kept, `qpdf --check`, the result smaller or `[]`, `rich.pdf`'s bookmarks, link and attachment, `form.pdf`'s fields and values, `tagged.pdf` kept, `password.pdf` written with the same password and restrictions and `restricted.pdf` keeping its restrictions, damaged files, the hostile fixtures ending skipped or with a result and never decoding past their limits; pages drawn by PDF.js before and after look alike (a mean difference under a set amount), and the DeviceGray scan still draws grey; do not assert which side of the 10% line a picture falls, as encoders differ; record each outcome and the sizes in the fixtures README, and that the multilingual file is still missing; `make-large.mjs`'s file by hand

## 4. Worker wiring

- [x] 4.1 `check-worker.mjs`: the engine and the new shared code stay out of the worker file; `page-weight.mjs` gets a `loadedLater` line only for any new chunk the build makes

## 5. Page and page text

- [x] 5.1 Check the page renders with its heading, sentence, title and description, and the home page lists it under "Make smaller and fix"
- [x] 5.2 Write `src/content/tools/compress-pdf.md` as the design lists, 250 to 500 words, a draft, with no claim about print quality; check against "Banned patterns"

## 6. End-to-end test

- [x] 6.1 `tests/e2e/compress-pdf.spec.ts` at 360px and 1280px:
  - choosing a file, with one row and no summary line; two files dropped; not a PDF;
  - compressing the scan fixture and checking the download (smaller, `qpdf --check`, page count) and "was" in the result;
  - the text-only packed file giving "This file could not be made smaller." and its advice, with no Download;
  - password right and wrong; damaged; Cancel, including during the bomb attachment's write; engine-load failure; the 100 MB notice;
  - progress "Reading the file" and "Picture n of m", with the bar not full while writing;
  - the job blocking nothing for more than 100 ms on the scan fixture;
  - the JPG that is already small left alone in Chromium (the 10% rule);
  - the other tools' e2e tests still pass.

## 7. No-upload test

- [x] 7.1 The tool's no-upload test:
  - its exact allowlist from the build, including the engine, `qpdf-json`, `picture`, `resample` and `fflate`, with no pdf-lib;
  - a watched run on the scan fixture under a telling name where a JPG and a lossless picture are made smaller and the result is downloaded, with positive checks that the engine and `fflate` were fetched, that the picture code ran (found by its own sentences if the bundler puts it in the engine's chunk), and that the downloaded file's pictures have their new sizes and filters;
  - runs on `rich.pdf`, `password.pdf`, `tagged.pdf` and `form.pdf`, each downloaded, and `compress-packed.pdf`, ending in "could not be made smaller";
  - secrets for requests, headers, the console and the page title: the file name, its stem, the password, `rich.pdf`'s bookmark titles, attachment name and document title, `tagged.pdf`'s `SECRET-` markers, `form.pdf`'s field values, and the EXIF markers;
  - storage and traces; the address with no query and no hash.

## 8. Screenshots

- [x] 8.1 Screenshots of `/compress-pdf` at 360px and 1280px, light and dark: empty, getting ready, listed, working, result with "was", "could not be made smaller", password, damaged, failed (out of memory), the 100 MB notice; check 200% text
- [x] 8.2 Stage 2 fix round: a too-large JPG replaced only when smaller, with a test; one rule for "smaller" (the engine's 99%), with sizes that would read the same said one unit finer; left-alone Flate pictures described as the same dictionary and decoded data; focus after a pick and the status line in the tool-page delta; the dictionaries' JSON capped while qpdf writes it; hostile tests assert their outcomes; a guarded lookup; a protected fixture with a large JPG; batches and replacements let go early; "Go back to your file" for one-file tools (with the split-pdf delta); the 10% sentence in the page text; screenshots of "Getting ready" retaken

## 9. Checks and review

- [x] 9.1 No `LICENSES.md` line: no dependency added
- [x] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [x] 9.3 Add Compress PDF's hand checks to issue #7 (the four PDF readers, browsers and phones, a real scanned PDF from a phone app)
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names:
  - the agent's choices: no options; 150 pixels to the inch across the largest page; quality 75; the 10% rule; never JPG for lossless pictures; the 1% rule; DeviceGray JPGs becoming RGB; grey ICC pictures left alone; passwords kept;
  - that the shared widget pieces ride along in this pull request.

  It asks the owner whether passwords should be kept or dropped as for page tools. It does not call the tool done. After merge, add Compress PDF to CLAUDE.md and the question to "Questions waiting for the owner".
