# Tasks

## 1. Registry entry

- [ ] 1.1 Add the `images-to-pdf` entry with its three pages to `src/tools/registry.ts`; add `image-to-pdf` to `catalogue.ts` and drop `image2pdf`, with the catalogue test naming both as owner changes since the export; the registry test checks the entry's catalogue order and its words
- [ ] 1.2 `outputName(input, '')` gives `stem.pdf`; a test in `format.test.ts`

## 2. Engine

- [ ] 2.1 Write `src/engines/picture.ts`: `readPicture` (JPG markers to start of scan, PNG chunks to `IEND`, size, components, animated, camera turn from EXIF or `eXIf`), `jpegWithoutDetails` and `pngFirstFrame`, all bounds-checked with capped loops
- [ ] 2.2 Write `src/engines/tools/images-to-pdf.ts`: `place` (exported; shown size, A4 upright or on its side, never above 96 pixels to the inch, centred, the eight matrices) and `run` through pdf-lib with no metadata, progress per picture and for writing; `inspect` from `readPicture`
- [ ] 2.3 Move `@cantoo/pdf-lib` to `dependencies`; give engines `pdflib` in `tool.worker.ts`, and in the unit tests' tools

## 3. Engine unit tests

- [ ] 3.1 Picture fixtures in `tests/fixtures/make.mjs`: a tall photo JPG and a wide one, JPGs with each orientation 1 to 8 and four coloured corners, one with a camera name and GPS in its EXIF, an 8-bit RGBA PNG with see-through parts, a palette PNG, a 16-bit greyscale PNG, an animated PNG, a PNG with `eXIf`, a small 300 by 200 PNG, broken ones of each kind; and `cmyk.jpg`, made once and committed, with how it was made in the README
- [ ] 3.2 `tests/unit/picture.test.ts`: sizes, orientations, animated, details taken out with the scan data unchanged, and `null` for truncated, zero-length, looping, oversized and random inputs
- [ ] 3.3 `tests/unit/images-to-pdf.test.ts`: `place` for every case; `run` on every picture fixture, checking with qpdf's JSON each page's size, the image's filter and size, the JPG stream against `jpegWithoutDetails`, `qpdf --check`, no `/Info`, no camera name or GPS bytes; the corners of every orientation drawn by PDF.js; the CMYK colours; every PDF in `tests/fixtures/` refused by `inspect` as not a picture or by the page's type check; record each outcome in the fixtures README, and that the multilingual file does not apply to pictures

## 4. Worker wiring and thumbnails

- [ ] 4.1 Write `src/engines/picture-thumbnail.ts` (`openPicture` through `tools.decodePicture` and `tools.canvas`, refusing above 50 million pixels); in `tool.worker.ts`, `openDocument` uses it for a file whose first bytes are a JPG or PNG, and `decodePicture` is `createImageBitmap`; unit test with `@napi-rs/canvas`
- [ ] 4.2 Name `images-to-pdf` in `page-weight.mjs`; `check-worker.mjs` checks pdf-lib and `picture-thumbnail` stay out of the worker file and that the engine is loaded late

## 5. Page and page text

- [ ] 5.1 Check the three pages render with their own heading, sentence, title and description, the widget's words, and the home page and hub listing them under "Convert to PDF"
- [ ] 5.2 Write `src/content/tools/jpg-to-pdf.md`, `png-to-pdf.md` and `image-to-pdf.md`, 250 to 500 words each, marked as drafts, each with its own questions as the design lists; that nothing is uploaded and the page forgets the pictures; check against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/images-to-pdf.spec.ts` at 360px and 1280px: choosing two pictures, a PNG on the JPG page, paste, not-a-picture refused (a PDF and a renamed text file), thumbnails drawn and the sideways photo shown upright, reorder by keyboard with announcement, remove, convert and check the download (pages, sizes, order, name), one picture alone, damaged picture with others and alone, Cancel keeps the order, engine-load failure, the 100 MB notice; the three pages' headings and titles; the other tools' e2e tests still pass

## 7. No-upload test

- [ ] 7.1 The tool's no-upload test: its exact allowlist (engine, `picture`, `picture-thumbnail`, pdf-lib's chunk; no qpdf, PDF.js or `fflate`), positive checks that the engine and pdf-lib were fetched and that qpdf, PDF.js and the other engines were not; the file names, stems, camera name and GPS text as secrets for requests, the console and the page title; storage and traces; the address with no query and no hash

## 8. Screenshots

- [ ] 8.1 Screenshots of `/jpg-to-pdf` at 360px and 1280px, light and dark: empty, pictures listed with thumbnails (one sideways photo shown upright), working, result, damaged; `/png-to-pdf` and `/image-to-pdf` empty at 360px; check nothing overflows at 200% text size

## 9. Checks and review

- [ ] 9.1 Add `@cantoo/pdf-lib` and its three new packages to `LICENSES.md` as shipped
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add the tool's hand checks to issue #7 (a real phone photo from Android and iPhone, including a HEIC photo picked on an iPhone)
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap and the agent's choices (A4 with no margin and no options, 96 pixels to the inch, the name with no word added, both types on every page, "Convert to PDF"), and asks the owner about a page size and margin choice and about picture details; it does not call the tool done
