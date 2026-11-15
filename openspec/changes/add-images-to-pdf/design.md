# Design

## Context

Six tools are built: Merge, Split, Extract, Delete, Reorder and Rotate. All take PDFs, read them with qpdf, and draw thumbnails with PDF.js. This is the first tool that takes pictures and the first that writes a PDF from nothing. `SPEC.md` names `@cantoo/pdf-lib` for "images to PDF"; it is already a test dependency (`tests/fixtures/make.mjs` uses it). The file list, its moves and drag, the worker, the thumbnail queue and the result exist and are reused from Merge PDF.

## Goals and non-goals

- **Goals:** pictures in, one PDF out; each page matching the picture as the visitor sees it, including a phone photo's camera turn and colour profile; JPG data not compressed again; no picture details carried into the PDF; three pages from one entry.
- **Non-goals:** options (page size, margin, fit), other picture types, compression, OCR.

## Decisions

### 1. The registry entry

One entry, `images-to-pdf`, group `to-pdf`, phase 1, `accepts: ['image/jpeg', 'image/png']`, with three `pages`, named "JPG to PDF", "PNG to PDF" and "Image to PDF" (the catalogue's names). Title tags, headings and sentences are as the spec gives them; the descriptions:
- `/jpg-to-pdf`: "Turn JPG photos into one PDF, in the order you choose. The photos stay on your device and are not uploaded."
- `/png-to-pdf`: "Turn PNG pictures and screenshots into one PDF. The pictures stay on your device and are not uploaded."
- `/image-to-pdf`: "Turn JPG and PNG pictures into one PDF, in the order you choose. The pictures stay on your device and are not uploaded."

The widget words are shared by the three pages:
- `pickerLabel: 'Choose pictures'`, `addLabel: 'Add more pictures'`, `dropHint: 'You can also drop pictures anywhere on this page, or paste them.'`;
- `acceptsName: 'a JPG or PNG picture'` and a new optional word, `refusedAdvice: 'To add a picture of another kind, save it as a JPG or PNG first.'`, put once after the refused names;
- `listNote: 'Each picture becomes one page, in this order.'`, and a new optional word, `listPages: false`, which leaves the page count out of each row ("2.3 MB") and the summary ("3 files, 6.2 MB."), because every picture is one page and the list note says so;
- `actionLabel: 'Convert and download'`, `writingLabel: 'Writing the PDF'`, `doneHeading: 'Your PDF is ready'`, `failedHeading: 'The conversion did not finish.'`;
- `minFiles: 1`, `multiple: true`, `items: 'files'`, `itemControls: true`, `outputs: 'one'`, `resultPages: 'sum'`;
- `outputSuffix: ''`: `outputName(input, '')` gives `stem.pdf` (today it would give `stem-.pdf`). The change is in `src/widget/format.ts` with a test; `partName` is unchanged;
- `memoryAdvice: 'Try fewer pictures, or smaller ones.'`;
- `resultNotes`: one note, "The pictures' details, such as the camera, the date and the place, are not copied into the PDF. Their colour profiles are kept, so the colours stay the same." The 16-bit and animated PNG cases go in the page text, not in every result.
- `related`: `merge-pdf`, `compress-pdf`, `pdf-to-jpg`, `rotate-pdf`, `rearrange-pdf-pages`.

`catalogue.ts` gains `image-to-pdf` and drops `image2pdf`. The catalogue test names both as owner changes since the export, in place of `waitingForOwner`.

The three pages are listed in the home page list and the group hub under "Convert to PDF", in registry order. The registry test of catalogue order counts a tool by the catalogue place of its first page; `/jpg-to-pdf` sits after Compress PDF there, but the owner's tool is Image to PDF, which sits right after Rotate PDF. So the test counts `images-to-pdf` at `/image2pdf`'s place, named beside the owner changes, and the entry follows Rotate PDF in the registry.

### 2. Two new outcomes of reading a file

`InspectOutcome` gains two kinds, and the widget's file status two values, beside `damaged`:
- `{ kind: 'too-large'; pixels: number; limit: number }` → status `too-large`. The notice heading: "huge.png is too large to convert: it has 256 million pixels, and this tool takes pictures of up to 50 million." then "Make the picture smaller, then add it again." Pixels are shown in millions, rounded up, so a picture just over the limit reads "51 million".
- `{ kind: 'unsupported' }` → status `unsupported`. The heading: "odd.jpg is saved in a way this tool cannot read." then "Open it and save it again as a JPG, then add it again."

Both are shown exactly where `damaged` is, with the same "Leave this file out" or "Choose another file" button and the same focus and announcement, and they hold the main button back as `damaged` does. The sentences are built by a plain function in `src/widget/failures.ts`, with tests. `isFromWorker` accepts the new outcome shapes only with whole positive numbers. No PDF tool returns either, so their behaviour is unchanged.

### 3. Reading a picture: `src/engines/picture.ts`

A pure module with no library. `readPicture(bytes)` returns `{ kind: 'ok', picture }`, `{ kind: 'damaged' }`, `{ kind: 'unsupported' }` or `{ kind: 'too-large', pixels }`, where `picture` is `{ type: 'jpeg' | 'png', width, height, components, orientation: 1..8, animated }`, width and height as stored. One constant, `maxPngPixels = 50_000_000`, is exported and used by the engine and the thumbnail.

- **JPG:** walk the markers from `FF D8`. Each segment's length must fit in the file. The first start of frame gives size and component count (1, 3 or 4) and its kind: baseline and extended sequential with 8-bit samples (`C0`, `C1`) and progressive (`C2`) are taken; arithmetic coding (`C9` to `CB`), lossless (`C3`, `CB`), hierarchical (`C5` to `C7`, `CD` to `CF`) and 12-bit samples are `unsupported`. A width or height of 0 (height given later by DNL) is `damaged`. The walk carries on through every scan to the first end of image; inside scan data, `FF00` and `FFD0` to `FFD7` are data and any other marker starts a segment. No start of scan, or no end of image, is `damaged`. An APP1 `Exif` segment gives the orientation.
- **PNG:** the signature, then `IHDR` first with a valid colour type and bit depth, width and height above 0, then a walk over chunks: each length within the file, at most 100,000 chunks, at least one `IDAT`, ending at `IEND`. CRCs are not checked, as browsers do not refuse on them. Above `maxPngPixels` it is `too-large`, before anything is decoded. `acTL` marks an animated PNG; `eXIf` gives the orientation.
- **The camera turn:** a TIFF header (`II*\0` or `MM\0*`), IFD0 read with at most 200 entries, every offset inside the segment, tag `0x0112` of type SHORT with a value from 1 to 8; anything else is 1. No other tag is read.
- **The parts of a JPG that are kept:** `jpegForPdf(bytes)` rebuilds the file from a list of what to keep, in order, wherever it appears: SOI, DQT, DHT, DAC, DRI, SOF, each SOS with its scan data, APP14 `Adobe`, and one EOI. Everything else is left out: APP0 (with any JFIF or JFXX thumbnail), APP1 to APP13, APP15, COM, and any marker not on the list, including segments between progressive scans; and every byte after the first EOI (a second JPG, a video, a trailer). It returns the cleaned bytes and the colour profile, if any.
- **Colour profile:** the APP2 `ICC_PROFILE` chunks, in their sequence order, joined. Kept only when all chunks are present, the total is at most 4 MB, the profile's header gives a colour space matching the components (`GRAY` 1, `RGB ` 3, `CMYK` 4), and it says it is a display, input, output or colour space profile. Otherwise none is kept, and the picture is drawn as Device RGB, grey or CMYK, as without one.
- **PNG colour profile:** `iCCP`'s profile, inflated through `tools.fflate` with an output limit of 4 MB (a larger one is dropped, not decoded further), checked the same way against the PNG's colour (grey or RGB).

### 4. The engine: `src/engines/tools/images-to-pdf.ts`

The engine imports pdf-lib for types only (`import type`); every value (`PDFDocument`, `PDFName`, the operators) comes from `await tools.pdflib()`. So the engine file stays small, and reading a picture before the job fetches only it and `picture.ts`. `check-worker.mjs` checks that pdf-lib's code is not in the engine file.

```
run(files, {}, onProgress, tools):
  pdflib = await tools.pdflib()
  doc = pdflib.PDFDocument.create({ updateMetadata: false })   // no Info dictionary, no XMP
  for each file i:
    onProgress({ stage: 'working', unit: 'file', done: i + 1, total })
    read = readPicture(file); not ok → throw
    image = jpeg ? doc.embedJpg(jpegForPdf(file).bytes) : doc.embedPng(pngFirstFrame(file))
    check image.width/height equal read's; otherwise throw
    attach the colour profile as [/ICCBased stream] with /N, when there is one
    place(page, image, read)
    await image.embed()   // pdf-lib lets go of the decoded pixels now, not at save()
  onProgress({ stage: 'writing', percent: 0 })
  bytes = doc.save({ useObjectStreams: true })
  onProgress({ stage: 'writing', percent: 100 })
  return [bytes]
inspect(file) = readPicture(file) mapped to the outcomes above, pages 1 when ok
```

- **`pngFirstFrame`** takes `acTL`, `fcTL` and `fdAT` chunks out of an animated PNG, leaving its default picture. pdf-lib refuses animated PNGs otherwise.
- **The CMYK JPG:** pdf-lib reads the Adobe segment and writes `/Decode [1 0 1 0 1 0 1 0]` for inverted CMYK, as PDF readers expect for Adobe's CMYK. A test checks the decode array and draws the page through PDF.js against the same JPG drawn by `@napi-rs/canvas`.
- **The colour profile** is written as a Flate stream with `/N`, and the image's `/ColorSpace` is set to `[/ICCBased ref]`. For a PNG with see-through parts, the soft mask stays `/DeviceGray`.
- **`place`** (exported for its test) does the page geometry in plain numbers, then draws:
  - the shown size swaps width and height for orientations 5 to 8;
  - the natural size is the shown size times 0.75 (96 pixels to the inch);
  - the page is A4, on its side when the shown width is greater than the shown height;
  - scale = min(1, page width / natural width, page height / natural height); the drawn box is centred;
  - the picture is drawn with `q`, one `cm` for the box and the camera turn, `Do`, `Q`. The eight matrices map the unit square of the stored picture (its top-left at (0, 1)) onto a box at (x, y) of shown size w by h: orientation 1 `[w 0 0 h x y]`, 2 `[-w 0 0 h x+w y]`, 3 `[-w 0 0 -h x+w y+h]`, 4 `[w 0 0 -h x y+h]`, 5 `[0 -h -w 0 x+w y+h]`, 6 `[0 -h w 0 x y+h]`, 7 `[0 h w 0 x y]`, 8 `[0 h -w 0 x+w y]` (checked by the architect at stage 1). A test draws a picture with four coloured corners for each orientation through PDF.js and reads the corners.
- **PNG decoding:** pdf-lib decodes with its bundled UPNG into 8-bit RGBA, splits out the alpha as a soft mask when any pixel is not fully opaque, and stores both with Flate. That is lossless for 8-bit pictures; 16-bit ones lose their low byte, which the PNG page text says. Palette and greyscale PNGs are stored as RGB, which can make the PDF larger than the PNG; the PNG page text says so.
- **Memory:** a PNG of 50 million pixels needs about 600 MB while decoded (RGBA, RGB and alpha copies), one picture at a time, since `embed()` lets go of each before the next. For JPGs the peak is about three times their total: the inputs, the cleaned copies and the output.
- **No qpdf.** pdf-lib's output is checked with `qpdf --check` in the unit tests, not in the browser, so the visitor does not fetch qpdf's WebAssembly for this tool.
- **Errors:** pdf-lib's own errors are the engine's failure; a failed allocation is the memory failure, which the worker already sorts by its message.

### 5. Thumbnails of pictures

The worker picks the drawer by tool, not by the file's first bytes: `EngineModule` gains an optional `thumbnails?: 'picture'`, which this engine sets. For a thumbnail, `worker-core` loads the tool's engine (already loaded by `inspect`) and passes the kind to `deps.openDocument(file, password, tools, kind)`. For `'picture'`, `tool.worker.ts` loads `src/engines/picture-thumbnail.ts` instead of `thumbnail.ts`. So a PDF tool never hands a file to the image decoder. The thumbnail queue, the kept document and the PNG handed back stay as they are; the queue already draws one thumbnail at a time.

- `openPicture(file, tools)` gives a kept document whose `render(page, box)` ignores the page number, reads the picture with `readPicture` (no picture unless `ok`; a JPG above `maxPngPixels` gives no thumbnail either), works out the thumbnail size from the shown size, decodes through `tools.decodePicture` at that size, draws on a canvas from `tools.canvas`, encodes PNG, and closes the decoded picture in a `finally`.
- In the worker, `decodePicture` is a factory, like `canvas`, giving `decode(bytes, width, height)`: `createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image', resizeWidth, resizeHeight, resizeQuality: 'medium' })`, with `close()`. A browser that ignores the resize options decodes at full size, and drawing scales it. In the Node test it is `@napi-rs/canvas`'s `loadImage`.
- Pictures are decoded by the browser's image decoder inside the worker, never on the page's own thread. A failure gives no thumbnail, never a failure of the tool.
- Chromium applies the camera turn to both JPG and PNG `eXIf` (checked while writing this design). Firefox and Safari are checked by hand (issue #7).

### 6. Worker, engine tools and build checks

- `src/workers/pdflib.ts` re-exports `@cantoo/pdf-lib`, and `tool.worker.ts` gives engines `pdflib: () => import('./pdflib')`, so its chunk is named `pdflib-<hash>.js`. pdf-lib imports `fflate` itself, so the existing `fflate-<hash>.js` file is fetched with it; `tools.fflate` gives the engine `inflateSync` from the same file.
- `page-weight.mjs` lists `images-to-pdf`, `picture`, `picture-thumbnail` and `pdflib` in `loadedLater`, each with its reason. Its list of engines is built from `src/engines/tools/` (the left-over item from Delete pages), so a new engine cannot be forgotten.
- `check-worker.mjs` checks: pdf-lib is one file loaded by `import()` from the worker; pdf-lib's code is in neither the worker file nor the engine file (by a sentence from pdf-lib's source); `picture.ts` and `picture-thumbnail.ts` are not in the worker file; and `node-html-better-parser` is not in pdf-lib's file if the bundler can leave it out, or is noted as present.
- Lint's engine block forbids `createImageBitmap`, `OffscreenCanvas`, `Blob` and `Image`, so the picture code in `src/engines/` stays pure.

### 7. The page text

Three Markdown files, each 250 to 500 words and marked as a draft:
- **`jpg-to-pdf.md`:** phone photos and scans of documents; that the JPG is not compressed again, so the PDF is about the size of the photos; sideways photos come out upright; the camera's details are left out; printing (an A4 page with no margin, so a printer may trim the edges).
- **`png-to-pdf.md`:** screenshots and graphics; pasting a screenshot; see-through backgrounds on white; why a PDF from a PNG can be larger than the PNG; 16-bit and animated PNGs.
- **`image-to-pdf.md`:** mixing JPG and PNG in one PDF; the order; page size and fitting, and printing; HEIC photos from an iPhone; other kinds of picture not yet taken.

Each has steps and three or four questions people really ask about that kind of picture.

## Dependency

| | |
| --- | --- |
| Package | `@cantoo/pdf-lib` 2.11.1, already pinned as a test dependency, moved to `dependencies` |
| Licence | MIT. It brings `culori` 4.0.2, `node-html-better-parser` 1.5.9 and `html-entities` 2.6.0, all MIT and with no install scripts, plus `tslib` and `fflate`, already present |
| Ranges | pdf-lib asks for `culori >=4`, `node-html-better-parser >=1.5.9` and `tslib >=2`. `package.json` gains `overrides` pinning the versions checked, so a lockfile refresh cannot take a new major version into shipped code |
| Last release | 15 Sep 2026; 20 releases in 2026, six maintainers |
| Size | 248 KB by gzip as one chunk, built with this repo's Vite (measured by the architect at stage 1); with only the names this engine uses, 244 KB |
| Why | `SPEC.md` names it for this job. Writing a PDF with pictures by hand would need our own PDF writer and PNG handling; the later drawing tools (page numbers, watermark, sign) need pdf-lib's fonts and page drawing anyway |

## Page weight and late loading

No change before a file is chosen: the widget island is the same, and a picture page weighs what Merge PDF's does (about 78 KB). After a pick: the worker, the workspace chunk, the engine file and `picture.ts` for reading; `picture-thumbnail.ts` for thumbnails; at the main button, `pdflib-<hash>.js` and `fflate-<hash>.js`. No WebAssembly is fetched by this tool.

## Threats

- **Hostile picture headers.** Every read in `picture.ts` is bounds-checked; loops are capped (chunks, IFD entries, segments); a length past the end is `damaged`. Unit tests feed truncated, zero-length, looping and oversized inputs, and random bytes after a valid signature.
- **Decompression bombs.** A PNG above 50 million pixels is refused from its header by `inspect` and again by `run`, before any decoding, with the too-large sentence. The thumbnail refuses the same. An `iCCP` profile is inflated with a 4 MB output limit. The worker is ended after every job.
- **Browser decoder faults.** Only for this tool's files, and only inside the worker; a fault there gives no thumbnail.
- **Details leaking.** JPG data is rebuilt from a list of what to keep and stops at the first end of image; PNG text chunks never reach the PDF, because pdf-lib stores decoded pixels. No document information or XMP is written. Tests search the decoded PDF for marker texts placed in every segment kind the spec lists.
- **The colour profile.** A profile is colour data, but it may carry a free-text description; it is kept because the colours depend on it, and the result note says it is kept.
- **Hostile file names.** Unchanged: names are cleaned by `stem` before they name the result.
- **Request headers.** The no-upload watcher gains a check that no request carries a header the browser does not send itself, for every tool.
- **Content Security Policy.** Unchanged; pdf-lib and its packages use no `eval` or `new Function`, and thumbnails are PNG blobs, as now.

## Risks and trade-offs

- **Orientation and colour across browsers.** Every current browser applies a JPG's camera turn when drawing; PNG `eXIf` and colour profile support vary. A browser that ignores them draws a thumbnail that differs from the page for that rare file. Checked by hand in Firefox and Safari (issue #7).
- **Palette PNGs grow.** Stored as RGB, a palette screenshot can grow about three times. Said in the PNG page text; could be fixed later by passing PNG data through with PDF predictors.
- **A4 for everyone, with no margin.** No Letter option, and a printer may trim the edges; an owner question.
- **Shared picture code.** `picture.ts` and `picture-thumbnail.ts` are written so HEIC, WebP and TIFF pages (phase 2) could reuse them, but are not generalised beyond JPG and PNG now.

## Migration plan

None; a new tool. `/image2pdf` was never published.
