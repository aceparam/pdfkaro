# Tasks

## 1. Registry entry and shared widget pieces

- [ ] 1.1 Add the `compress-pdf` entry to `src/tools/registry.ts` with the optional words `resultWas` and `noSmaller`; the registry test checks catalogue order and its words
- [ ] 1.2 A run that gives no file: `Engine` may return `[]`, `worker-core` and `isFromWorker` pass it, the state holds a "no smaller" result, and `ToolWorkspace` shows `noSmaller` with focus and announcement, "Start again" and no Download; a tool without `noSmaller` shows the engine failure; `Result` shows "was" and the input's size when `resultWas` is set; unit and component tests, other tools unchanged
- [ ] 1.3 The `'picture'` progress unit and "Picture 3 of 40" in `format.ts`, with tests

## 2. Engine

- [ ] 2.1 Write `src/engines/qpdf-json.ts` (`readObjects` with stream data files and page boxes, `writeUpdate` through the argument file with the lossless options, the 512 MB JSON check)
- [ ] 2.2 Write `src/engines/resample.ts` (area averaging of 8-bit grey or RGB samples, pure)
- [ ] 2.3 Write `src/engines/tools/compress-pdf.ts`: `canShrink` (exported), `shrinkJpeg`, `shrinkLossless`, the new dictionary rules, `run` with progress, the 1% rule giving `[]`, `qpdf --check`, passwords kept; `inspect` is `inspectPdf`
- [ ] 2.4 `decodePicture`'s `{ orientation: 'none', colours: 'none' }` options and `canvas.jpeg(canvas, quality)` in `tool.worker.ts` and in the unit tests' tools

## 3. Engine unit tests

- [ ] 3.1 Fixtures in `tests/fixtures/make.mjs`: an A4 file of three 300 pixels-to-the-inch JPG scans (grey and RGB); a file with a large lossless screenshot; a JPG already small; a CMYK JPG picture, a CCITT scan and an image mask; a picture with an RGB ICC profile and a soft mask; a text-only file with uncompressed content
- [ ] 3.2 `tests/unit/resample.test.ts` and `tests/unit/qpdf-json.test.ts`
- [ ] 3.3 `tests/unit/compress-pdf.test.ts`: `canShrink` for every case; `run` on every file in `tests/fixtures/` and the new fixtures, checking with qpdf's JSON each picture's size, filter and colour space, untouched streams byte for byte, `/SMask` and other entries kept, `qpdf --check`, the result smaller or `[]`, `rich.pdf`'s bookmarks, link and attachment, `form.pdf`'s fields and values, `tagged.pdf` kept, `password.pdf` written with the same password and restrictions and `restricted.pdf` keeping its restrictions, damaged files; pages drawn by PDF.js before and after look alike (a mean difference under a set amount); record each outcome and the sizes in the fixtures README, and that the multilingual file is still missing; `make-large.mjs`'s file by hand

## 4. Worker wiring

- [ ] 4.1 `page-weight.mjs` and `check-worker.mjs`: the engine, `qpdf-json` and `resample` load late and stay out of the worker file

## 5. Page and page text

- [ ] 5.1 Check the page renders with its heading, sentence, title and description, and the home page lists it under "Make smaller and fix"
- [ ] 5.2 Write `src/content/tools/compress-pdf.md` as the design lists, 250 to 500 words, a draft; check against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/compress-pdf.spec.ts` at 360px and 1280px: choosing a file, two files dropped, not a PDF, compress the scan fixture and check the download (smaller, `qpdf --check`, page count) and "was" in the result, the text-only packed file giving "This file could not be made smaller." with no Download, password right and wrong, damaged, Cancel, engine-load failure, the 100 MB notice, progress "Picture n of m", and the job blocking nothing for more than 100 ms on the scan fixture; the other tools' e2e tests still pass

## 7. No-upload test

- [ ] 7.1 The tool's no-upload test: its exact allowlist from the build, positive checks that the engine was fetched and pdf-lib was not; the file name, stem, password, `rich.pdf`'s bookmark titles, attachment name and document title as secrets for requests, headers, the console and the page title; storage and traces; the address with no query and no hash

## 8. Screenshots

- [ ] 8.1 Screenshots of `/compress-pdf` at 360px and 1280px, light and dark: empty, listed, working, result with "was", "could not be made smaller", password, damaged; check 200% text

## 9. Checks and review

- [ ] 9.1 No `LICENSES.md` line: no dependency added
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add Compress PDF's hand checks to issue #7 (the four PDF readers, browsers and phones, a real scanned PDF from a phone app)
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names the agent's choices (no options, 150 pixels to the inch across the largest page, quality 75, the 10% rule, never JPG for lossless pictures, the 1% rule, passwords kept) and asks the owner whether passwords should be kept or dropped as for page tools; it does not call the tool done
