# Design

## Context

Six tools are built: Merge, Split, Extract, Delete, Reorder and Rotate. All take PDFs, read them with qpdf, and draw thumbnails with PDF.js. This is the first tool that takes pictures and the first that writes a PDF from nothing. `SPEC.md` names `@cantoo/pdf-lib` for "images to PDF"; it is already a test dependency (`tests/fixtures/make.mjs` uses it). The file list, its moves and drag, the worker, the thumbnail queue and the result all exist and are reused from Merge PDF.

## Goals and non-goals

- **Goals:** pictures in, one PDF out; each page matching the picture as the visitor sees it, including a phone photo's camera turn; JPG data not compressed again; no picture details carried into the PDF; three pages from one entry.
- **Non-goals:** options (page size, margin, fit), other picture types, compression, OCR.

## Decisions

### 1. The registry entry

One entry, `images-to-pdf`, group `to-pdf`, phase 1, `accepts: ['image/jpeg', 'image/png']`, with three `pages`. The widget words are shared by the three pages: the picker ("Choose pictures"), the list note, the main button ("Convert and download") and the result notes do not depend on the search that brought the visitor. Only the heading, sentence, title, description and text below differ, which `ToolPage` already holds per page.

- `minFiles: 1`, `multiple: true`, `items: 'files'`, `itemControls: true`, `outputs: 'one'`, `resultPages: 'sum'` (one page per picture).
- `outputSuffix: ''`. `outputName(input, '')` gives `stem.pdf`; today it would give `stem-.pdf`. The change is in `src/widget/format.ts`, with a test; `partName` is unchanged.
- `acceptsName: 'a JPG or PNG picture'`, `listNote: 'Each picture becomes one page, in this order.'`, `writingLabel: 'Writing the PDF'`, `memoryAdvice: 'Try fewer pictures, or smaller ones.'`.
- `resultNotes`: "The pictures' details, such as the camera, the date and the place, are not copied into the PDF." and "A 16-bit PNG is stored at 8 bits per colour, and an animated PNG gives its first picture."
- `related`: `merge-pdf`, `compress-pdf`, `pdf-to-jpg`, `rotate-pdf`, `rearrange-pdf-pages`.
- `catalogue.ts` gains `image-to-pdf` and drops `image2pdf`. Its test names both as owner changes since the export, instead of `waitingForOwner`.

The three pages appear in the home page list and the group hub under "Convert to PDF", in registry order. The registry test of catalogue order counts a tool by the catalogue place of its first page; `/jpg-to-pdf` sits after Compress PDF there, but the owner's tool is Image to PDF, which sits right after Rotate PDF. So the test counts `images-to-pdf` at `/image2pdf`'s place, named beside the owner changes in the catalogue test, and the entry follows Rotate PDF in the registry.

### 2. Reading a picture: `src/engines/picture.ts`

A pure module with no library: `readPicture(bytes): Picture | null`, where `Picture` is `{ type: 'jpeg' | 'png', width, height, orientation: 1..8, animated: boolean }` with width and height as stored (before the camera turn). It returns `null` for anything it cannot vouch for, which the engine's `inspect` reports as `damaged`.

- **JPG:** walk the markers from `FF D8`. Each segment's length must fit in the file. Stop at the first start of frame (`C0` to `CF`, not `C4`, `C8` or `CC`) for the size and component count (1, 3 or 4), and carry on to start of scan (`DA`) to be sure the file has one. Arithmetic-coded frames (`C9` to `CB`, `CD` to `CF`) and 12-bit frames are refused as damaged, because many PDF readers cannot draw them; the page says it cannot read the file. An APP1 `Exif` segment gives the orientation (below).
- **PNG:** the signature, then `IHDR` first with a valid colour type and bit depth, then a walk over chunks: each length within the file, at most 100,000 chunks, at least one `IDAT`, ending at `IEND`. CRCs are not checked (browsers do not refuse on them). `acTL` marks an animated PNG; `eXIf` gives the orientation.
- **The camera turn:** a TIFF header (`II*\0` or `MM\0*`), IFD0 read with at most 200 entries, every offset inside the segment, tag `0x0112` of type SHORT with a value of 1 to 8; anything else is 1. No other tag is read.
- **Taking details out of a JPG:** `jpegWithoutDetails(bytes)` copies the segments before the scan, leaving out APP1 to APP13, APP15 and COM, and keeps APP0 (JFIF) and APP14 (Adobe, which says how CMYK and YCC are stored). From the start of scan on, the bytes are copied as they are. This keeps the compressed picture as it was. The colour profile (APP2) goes too; PDF readers take a picture's colours from its `/ColorSpace`, not from a profile inside the JPG data, so nothing on the page changes.

### 3. The engine: `src/engines/tools/images-to-pdf.ts`

```
run(files, {}, onProgress, tools):
  pdflib = await tools.pdflib()
  doc = PDFDocument.create({ updateMetadata: false })   // no producer, creator or dates
  for each file i:
    onProgress({ stage: 'working', unit: 'file', done: i + 1, total })
    picture = readPicture(file) ?? throw
    image = jpeg ? doc.embedJpg(jpegWithoutDetails(file)) : doc.embedPng(firstFrame(file))
    place(doc, image, picture)
  onProgress({ stage: 'writing', percent: 0 })
  bytes = doc.save({ useObjectStreams: true })
  onProgress({ stage: 'writing', percent: 100 })
  return [bytes]
inspect(file) = readPicture(file) ? { kind: 'ready', pages: 1 } : { kind: 'damaged' }
```

- **`firstFrame`** takes `acTL`, `fcTL` and `fdAT` chunks out of an animated PNG, leaving its default picture. pdf-lib refuses animated PNGs otherwise.
- **`place`** (exported for its test) does the page geometry in plain numbers, then draws:
  - the shown size swaps width and height for orientations 5 to 8;
  - the natural size is the shown size times 0.75 (96 pixels to the inch);
  - the page is A4, on its side when the shown width is greater than the shown height;
  - scale = min(1, page width / natural width, page height / natural height); the drawn box is centred;
  - the picture is drawn with `q`, one `cm` for the box and the camera turn, `Do`, `Q`, using pdf-lib's exported operators and `page.node.newXObject`. The eight matrices map the unit square of the stored picture onto the box: for a box at (x, y) of shown size w by h, orientation 1 is `[w 0 0 h x y]`, 2 `[-w 0 0 h x+w y]`, 3 `[-w 0 0 -h x+w y+h]`, 4 `[w 0 0 -h x y+h]`, 5 `[0 -h -w 0 x+w y+h]`, 6 `[0 -h w 0 x y+h]`, 7 `[0 h w 0 x y]` and 8 `[0 h -w 0 x+w y]`. Each is checked by drawing a picture with four coloured corners through PDF.js and reading the corners, against what a browser shows for that orientation (the e2e test reads the browser's own drawing of the same files).
- **PNG decoding:** pdf-lib decodes with its bundled UPNG into 8-bit RGBA, splits out the alpha as a soft mask when any pixel is not fully opaque, and stores both with Flate. That is lossless for 8-bit pictures; 16-bit ones lose their low byte, as the result notes say. Palette and greyscale PNGs are stored as RGB, which can make the PDF larger than the PNG; that is said in the page text, not fixed here.
- **No qpdf.** pdf-lib's output is checked with `qpdf --check` in the unit tests, not in the browser, so the visitor does not fetch qpdf's 1 MB of WebAssembly for this tool.
- **Errors:** `readPicture` failing during `run` (a file that changed after inspect) throws; pdf-lib's own errors are the engine's failure; a too-large allocation is the memory failure, which the worker already sorts by its message.

### 4. Thumbnails of pictures

The worker's `openDocument` (in `tool.worker.ts`) looks at the file's first bytes with `looksAccepted` from `src/widget/accept.ts`. For a JPG or PNG it loads `src/engines/picture-thumbnail.ts` instead of `thumbnail.ts`; nothing else in the worker or the page changes, and the thumbnail queue, the kept document and the PNG handed back stay as they are.

- `openPicture(file, tools)` gives a kept document whose `render(page, box)` ignores the page number, reads the header with `readPicture`, refuses more than 50 million pixels (no picture; the blank box stays), decodes through `tools.decodePicture`, fits the decoded size into the box, draws on a canvas from `tools.canvas`, and encodes PNG.
- In the worker, `decodePicture` is `createImageBitmap(new Blob([bytes]))`. Browsers apply the camera turn by default (`imageOrientation: 'from-image'`), so the thumbnail is upright, and its width and height are taken from the decoded picture, not the header. In the Node test it is `@napi-rs/canvas`'s `loadImage`.
- The pictures are decoded by the browser's image decoder inside the worker, so a hostile picture never reaches the page's own thread, and a picture that crashes or fails gives no thumbnail, never a failure of the tool.

### 5. Worker and engine tools

`tool.worker.ts` adds `pdflib: () => import('@cantoo/pdf-lib')` and `decodePicture`. pdf-lib is its own chunk, fetched only by `run`, so reading a picture before the job fetches only the small engine file and `picture.ts`. `check-worker.mjs` checks pdf-lib's chunk and `picture-thumbnail` stay out of the worker file; `page-weight.mjs` names the new engine.

### 6. The page text

Three Markdown files, each 250 to 500 words and marked as a draft:
- **`jpg-to-pdf.md`:** phone photos and scans; that the JPG is not compressed again, so quality stays and the PDF is about the size of the photos; sideways photos; camera details left out.
- **`png-to-pdf.md`:** screenshots and graphics; see-through backgrounds on white; why a PDF from a PNG can be larger than the PNG; pasting a screenshot.
- **`image-to-pdf.md`:** mixing JPG and PNG in one PDF; the order; page size and fitting; HEIC from an iPhone; what other kinds are planned.

Each has steps and three or four questions people really ask about that kind of picture, so no text is another with a word swapped.

## Dependency

| | |
| --- | --- |
| Package | `@cantoo/pdf-lib` 2.11.1 (already pinned as a test dependency, moved to `dependencies`) |
| Licence | MIT; brings `culori` 4.0.2, `node-html-better-parser` 1.5.9 and `html-entities` 2.6.0, all MIT, and `tslib` and `fflate`, already present |
| Last release | 15 Sep 2026; 20 releases in 2026, six maintainers |
| Size | about 250 KB by gzip as built with the parts this engine uses (measured with esbuild, minified; the build's figure goes in the pull request) |
| Why | `SPEC.md` names it for this job. Writing a PDF with pictures by hand would need our own PDF writer and PNG handling; the later drawing tools (page numbers, watermark, sign) need pdf-lib's fonts and page drawing anyway |

## Page weight and late loading

No change before a file is chosen: the widget island is the same, and a picture page weighs what Merge PDF's does (about 78 KB). After a pick: the engine file and `picture.ts` for reading; at the main button, pdf-lib's chunk. No WebAssembly is fetched by this tool.

## Threats

- **Hostile picture headers.** Every read in `picture.ts` is bounds-checked; loops are capped (chunks, IFD entries); a segment or chunk length past the end is `null`. Unit tests feed truncated, zero-length, looping and oversized inputs, and random bytes after a valid signature.
- **Decompression bombs.** A tiny PNG that claims huge dimensions: the thumbnail refuses above 50 million pixels before decoding; the engine's UPNG allocation fails and is reported as running out of memory, in the worker, which is ended after every job. The page never decodes it.
- **Browser decoder faults.** The browser's decoder runs inside the worker; a fault there gives no thumbnail.
- **Details leaking.** EXIF (GPS, camera, serial numbers), XMP, IPTC and comments are left out of JPG data; PNG text chunks never reach the PDF, because pdf-lib stores decoded pixels. No document information dictionary is written. A unit test searches the PDF for the fixture's camera name and GPS bytes.
- **Hostile file names.** Unchanged: names are cleaned by `stem` before they name the result.
- **Content Security Policy.** Unchanged; thumbnails are PNG blobs, as now.

## Risks and trade-offs

- **Orientation agreement across browsers.** All current browsers apply a JPG's camera turn when drawing; PNG `eXIf` support varies by browser. If a browser does not turn a PNG by its `eXIf`, its thumbnail and the page would disagree for that rare file. The e2e test records what Chromium does; the PR says so.
- **Palette PNGs grow.** Stored as RGB, a palette screenshot can grow three times. Said in the PNG page text; could be fixed later by passing PNG data through with PDF predictors.
- **A4 for everyone.** No Letter option; an owner question.

## Migration plan

None; a new tool. `/image2pdf` was never published.
