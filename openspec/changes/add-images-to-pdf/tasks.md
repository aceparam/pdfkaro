# Tasks

## 1. Registry entry

- [x] 1.1 Add the `images-to-pdf` entry with its three pages to `src/tools/registry.ts`, with the new optional widget words `refusedAdvice` and `listPages`; add `image-to-pdf` to `catalogue.ts` and drop `image2pdf`, with the catalogue test naming both as owner changes since the export and the order test counting the entry at `/image2pdf`'s place; the registry test checks the entry's words, sentences and descriptions
- [x] 1.2 `outputName(input, '')` gives `stem.pdf`; a test in `format.test.ts`
- [x] 1.3 The `unsupported` outcome (`InspectOutcome`, `isFromWorker`, the file status in `state.ts`, its sentence in `failures.ts`, shown and announced in `ToolWorkspace` where `damaged` is, holding the main button back) and `pixels` on `ready` with its notice, shown as soon as the file is read and tied to the main button by `aria-describedby`; `refusedAdvice` after the refused names and `listPages: false` in the rows and summary; unit and component tests, and PDF tools unchanged

## 2. Engine

- [x] 2.1 Write `src/engines/picture.ts`: `readPicture` (JPG markers through every scan to the first end of image, frame kinds, PNG chunks to `IEND`, size, components, animated, camera turn, `maxPngPixels`), `jpegForPdf` (kept-segment list, colour profile joined and checked), the PNG profile read with input and output limits, `profileColourOnly`, and `pngFirstFrame`, all bounds-checked with capped loops
- [x] 2.2 Write `src/engines/tools/images-to-pdf.ts` with pdf-lib imported for types only: `place` (exported; shown size, A4 upright or on its side, never above 96 pixels to the inch, centred, the eight matrices), `run` (no metadata, sizes checked against `readPicture`, `embed()` after each picture and then the colour profile set as `/ICCBased` on the written image, progress per picture and for writing), `inspect`, and `thumbnails: 'picture'`
- [x] 2.3 Move `@cantoo/pdf-lib` to `dependencies` with `overrides` pinning `culori`, `node-html-better-parser`, `html-entities` and `tslib`; add `src/workers/pdflib.ts`, and give engines `pdflib` and `fflate` in `tool.worker.ts` and in the unit tests' tools

## 3. Engine unit tests

- [ ] 3.1 Picture fixtures in `tests/fixtures/make.mjs`: a tall photo JPG and a wide one; JPGs with each orientation 1 to 8 and four coloured corners; JPGs with a marker text in each place the spec lists (EXIF with camera and GPS, XMP and extended XMP, IPTC, COM, APP0 with JFIF and JFXX thumbnails, APP15 and another APPn, an APPn between progressive scans, a second JPG with GPS after the end marker, plain trailing bytes); a JPG with a Display P3 profile split over two APP2 chunks; an 8-bit RGBA PNG with see-through parts; palette, 16-bit greyscale and animated PNGs; PNGs with marker texts in `tEXt`, `iTXt`, `zTXt` and `eXIf`, and one with `iCCP`; a profile with marker texts in its description, copyright and device name tags and a header date; a profile whose header size disagrees with its data, an `iCCP` that inflates past 4 MB, and a greyscale PNG with a grey `iCCP`; a 300 by 200 PNG; a PNG claiming 16,000 by 16,000 pixels; an arithmetic-coded JPG header; broken ones of each kind; and `cmyk.jpg` and the progressive JPG, made once with Pillow and committed, with how in the README
- [x] 3.2 `tests/unit/picture.test.ts`: sizes, components, frame kinds, orientations, animated, the pixel notice, kept segments with the frame and scan bytes unchanged and everything after the first end of image gone, colour profiles kept, refused and stripped to colour data, and `damaged` for truncated, zero-length, zero-size, looping, oversized and random inputs
- [ ] 3.3 `tests/unit/images-to-pdf.test.ts`: `place` for every case; `run` on every picture fixture, checking with qpdf's JSON each page's size, the image's filter, size, colour space and decode array, `qpdf --check`, no `/Info`, no `/Metadata`, and no marker text or GPS value in `qpdf --qdf --object-streams=disable --decode-level=generalized` output; the corners of every orientation and the CMYK colours drawn by PDF.js; `inspect` on every PDF in `tests/fixtures/` (each is refused by the page's type check, recorded); record each outcome in the fixtures README, and that the multilingual file does not apply to pictures

## 4. Worker wiring and thumbnails

- [x] 4.1 Write `src/engines/picture-thumbnail.ts` (`openPicture` through `tools.decodePicture` and `tools.canvas`, sized from the shown size, refusing what `readPicture` does not pass, closing the decoded picture); `worker-core` passes the engine's `thumbnails` kind to `openDocument`, and `tool.worker.ts` uses the picture drawer only for it, with `decodePicture` from `createImageBitmap` with `imageOrientation: 'from-image'` and resize options; unit tests with `@napi-rs/canvas`, including that `decodePicture` is never called for a PNG over 50 million pixels, and a worker-core test that a PDF tool never uses the picture drawer; a worker-core test that a typed-array length `RangeError` is sorted as running out of memory, and the worker is still ended after a failure and on Cancel
- [ ] 4.2 `page-weight.mjs`: build the engine list from `src/engines/tools/` and list `picture`, `picture-thumbnail` and `pdflib`; `check-worker.mjs`: pdf-lib is one file loaded late, its code in neither the worker nor the engine file, the picture code not in the worker file, and whether `node-html-better-parser` is in pdf-lib's file; lint forbids `createImageBitmap`, `OffscreenCanvas`, `Blob` and `Image` in `src/engines/`

## 5. Page and page text

- [ ] 5.1 Check the three pages render with their own heading, sentence, title and description, the widget's words, the picker's `accept` attribute, and the home page and hub listing them under "Convert to PDF"
- [ ] 5.2 Write `src/content/tools/jpg-to-pdf.md`, `png-to-pdf.md` and `image-to-pdf.md`, 250 to 500 words each, marked as drafts, each with its own questions as the design lists; that nothing is uploaded and the page forgets the pictures; check against "Banned patterns"

## 6. End-to-end test

- [ ] 6.1 `tests/e2e/images-to-pdf.spec.ts` at 360px and 1280px: choosing two pictures, the `accept` attribute, a PNG on the JPG page, paste, not-a-picture refused with its advice (a PDF and a renamed text file), rows with no page count, thumbnails drawn and the sideways photo shown upright, reorder by keyboard with announcement, remove, convert and check the download (pages, sizes, order, name, `qpdf --check`), one picture alone, damaged and unsupported pictures with others and alone, the very large PNG with its notice and the main button working, Cancel keeps the order, engine-load failure, the 100 MB notice; the three pages' headings, sentences and titles; the other tools' e2e tests still pass

## 7. No-upload test

- [ ] 7.1 The watcher in `tests/e2e/no-upload.ts` fails on any request header the browser does not send itself, with its self-test; the tool's no-upload test: its exact allowlist from the build (engine, `picture`, `picture-thumbnail`, `pdflib`, `fflate`; no qpdf or PDF.js), positive checks that the engine and pdf-lib were fetched and that qpdf, PDF.js and the other engines were not; the file names, stems, camera name and GPS text as secrets for requests, the console and the page title, and searched for in the downloaded PDF; storage and traces; the address with no query and no hash

## 8. Screenshots

- [ ] 8.1 Screenshots of `/jpg-to-pdf` at 360px and 1280px, light and dark: empty, pictures listed with thumbnails (one sideways photo shown upright), working, result, damaged, the very large picture notice; `/png-to-pdf` and `/image-to-pdf` empty at 360px; check nothing overflows at 200% text size

## 9. Checks and review

- [ ] 9.1 `LICENSES.md`: `@cantoo/pdf-lib` and its three new packages as shipped
- [ ] 9.2 Run lint, the type check, unit tests, the build, `weigh`, `check:worker`, `check:base`, end-to-end tests, `npm audit` and `openspec validate --all --strict`
- [ ] 9.3 Add the tool's hand checks to issue #7: the PDF opened in Chrome, Firefox, Adobe Reader and macOS Preview, including a JPG with a colour profile opening without warnings; the pages tried in Firefox, Safari and Edge and on Android Chrome and iOS Safari at phone size, including thumbnails of a sideways photo, a PNG with `eXIf` and a Display P3 photo in Firefox and Safari; a real phone photo from Android and from an iPhone, including a HEIC photo picked on an iPhone
- [ ] 9.4 Run the review panel (see the review-panel skill) and resolve its findings; the pull request names next steps as a site-wide gap and the agent's choices (A4 with no margin and no options, 96 pixels to the inch, the name with no word added, both types on every page, all three under "Convert to PDF", the colour data of profiles kept, the 50 million pixel notice), and asks the owner about a page size and margin choice, about picture details, about the group, and whether very large PNGs should be refused; it does not call the tool done; after merge, these questions go in CLAUDE.md
