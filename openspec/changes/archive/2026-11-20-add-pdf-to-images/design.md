# Design

## Context

PDF.js already runs in the tool worker. It draws page thumbnails through `src/engines/thumbnail.ts`:
- one document is kept open across pages;
- pages are drawn on an `OffscreenCanvas` from `tools.canvas`;
- the owner's fixed helper data (11 Nov 2026) is used, with safe options: no font faces installed, no fetching, no XFA, and pictures inside a page capped at 16 million pixels.

Thumbnails are wrapped in `pdfjsLoader.guard`, so a dead PDF.js worker fails them at once. Engines reach PDF.js through `tools.pdfjs`, which has no guard yet.

`tools.canvas` encodes PNG and, since Compress PDF, JPG; the JPG encoder's type is declared inside the Compress engine. Several outputs are zipped in the worker by `fflate`'s `zipSync`, which is fetched on every run of a several-outputs tool. Names come from `partName`, which pads numbers to the width of the total. The limits live in `zip-limits.ts`, and Split's engine checks them as it goes. Compress PDF added the one-file row. The registry's `ToolPage` has had a `preset` field since the skeleton, unused until now.

## Goals and non-goals

- **Goals:**
  - every page as a picture, looking as a PDF reader shows it;
  - one picture for a one-page file and a zip otherwise;
  - two pages from one entry, each setting its format;
  - memory bounded per page, and a clear failure, not a dead tab, when the pictures add up to too much.
- **Non-goals:**
  - choosing pages, resolution or quality;
  - extracting embedded pictures;
  - OCR;
  - a streaming zip (a later shared change, as Split gains too).

## Decisions

### 1. The registry entry: one tool, two pages (`tool-registry`)

`pdf-to-images`, group `from-pdf`, phase 1, `accepts: ['application/pdf']`, with two pages:
- `/pdf-to-jpg`: name "PDF to JPG", `preset: { format: 'jpg' }`;
- `/pdf-to-png`: name "PDF to PNG", `preset: { format: 'png' }`.

Folding the two catalogue rows into one entry is the agent's choice, recorded in a `tool-registry` requirement. It mirrors the owner's Image to PDF decision and `SPEC.md`'s own "one tool with preset pages" for target sizes. No URL is dropped and no group changes. The catalogue test needs nothing new, as both slugs are in the catalogue. The order test counts the entry by its first page, `/pdf-to-jpg`, which follows Compress PDF.

Each page has the title, heading and sentence the spec gives. The descriptions:
- JPG: "Turn each page of a PDF into a JPG picture. The file stays on your device and is not uploaded."
- PNG: "Turn each page of a PDF into a PNG picture. The file stays on your device and is not uploaded."

**Words:**
- `ToolWidgetWords` gains `outputExtension?: 'pdf' | 'jpg' | 'png'`, with `pdf` assumed when it is absent.
- `ToolPage` gains an optional `words?: Partial<Pick<ToolWidgetWords, 'actionLabel' | 'resultNotes' | 'outputExtension'>>`, which the page's words override.
- The merge is a plain tested function, `pageWords(tool, page)`, in `src/tools/queries.ts`; `[slug].astro` calls it.
- `preset` holds engine options only.

The shared words:
- `pickerLabel: 'Choose a PDF file'`, `addLabel: 'Choose another file'`, `dropHint: 'You can also drop a file anywhere on this page, or paste it.'`;
- `items: 'files'`, `itemControls: false`, `multiple: false`, `minFiles: 1`, `tooFewFiles: 'Choose a PDF file to convert.'`;
- `outputs: 'several'`, `partSuffix: 'page'`, `outputSuffix: ''`, `resultPages: 'none'`;
- `writingLabel: 'Writing the zip'`, `doneHeading: 'Your download is ready'`, `failedHeading: 'The conversion did not finish.'`;
- `memoryAdvice: 'Try on a computer, or split the file first and convert the parts.'`;
- `zipLimitAdvice: 'Split the file first, then convert the parts.'`.

Per page: `actionLabel` ("Convert to JPG and download" or "… PNG …"), `outputExtension` (`jpg` or `png`), and `resultNotes`:
- JPG: "Each page is a JPG picture at 150 pixels to the inch. The PDF itself was not changed."
- PNG: "Each page is a PNG picture at 150 pixels to the inch, without loss. The PDF itself was not changed."

**The result line** uses the existing words: a zip reads "12 files, 3.4 MB" (`fileCount`), and a single picture its size only (`resultPages: 'none'`).

`related`: each page links to the other, plus `jpg-to-pdf`, `extract-pdf-pages`, `compress-pdf` and `split-pdf`. The entry names all six; `relatedItems` takes the page being built, which it now requires, and leaves that page out, so a tool with several pages links each page to the others and never to itself. Each page shows four to six links, checked on `relatedItems`' output.

### 2. Presets, extensions and types in the widget

- **Options:** `[slug].astro` passes `page.preset` to `ToolWidget`, which hands it to `useToolRun`; each job's options are `{ ...preset, ...options }`. The engine checks `format` itself.
- **Names:** `useToolRun` names a single output `outputName(input, outputSuffix, outputExtension)`, giving `report.jpg`, and a zip `report.zip`.
- **Types:** the Blob type follows the extension: `image/jpeg`, `image/png`, `application/pdf` or `application/zip`. Today it is always PDF or zip.
- **Inside a zip:** `ZipNaming` gains `extension`, checked by `isZipNaming` against the closed set `pdf`, `jpg`, `png`. `worker-core` passes it to `partName`, giving `report-page-01.jpg`. The padding follows the total, so 500 pages give `report-page-001.jpg`.
- **One output** from a several-outputs tool is not zipped, as for Split today.
- **Other tools** set no extension and keep `pdf`.

### 3. Drawing whole pages, in `src/engines/thumbnail.ts`

The file keeps its name. Its kept document gains `draw`:

```
draw(page, { scale, maxPixels, format: 'jpg' | 'png', quality }): Promise<{ bytes, width, height }>
```

`render(page, box)` (thumbnails) becomes "work out the scale for the box, then draw as PNG". So the white background, the bounds checks and the canvas release exist once.

- **Size:**
  - the viewport at `scale` (150 / 72), including the page's `/Rotate`;
  - if width × height passes `maxPixels` (16 × 1024 × 1024, the same as `maxImagePixels` and Safari's canvas limit), the scale is reduced to fit;
  - sides are rounded and at least 1.
- **Annotations:** drawn on white, with `annotationMode` set to the loaded PDF.js module's `AnnotationMode.ENABLE_STORAGE`, read from `PdfjsModule`, never imported. Form fields are drawn with their values, and other annotations as their appearance streams show them. Thumbnails keep their current mode.
- **Encoding:** through `tools.canvas`. `CanvasMaker` here gains `jpeg(canvas, quality)`, and Compress PDF imports that type from here.
- **Freeing each page:** the canvas is released, then `pdfPage.cleanup()` is called, both in a `finally`, so a page's decoded pictures and operator list are let go before the next page.
- **A canvas budget:** the `CanvasFactory` given to PDF.js, and `draw`'s own output canvas, count the pixels of every live canvas, PDF.js's temporary ones for transparency and soft masks included, across `create`, `reset` and `destroy`. Asked to go past four times the largest picture, 4 × `maxPixels` (about 256 MB as RGBA), whatever the page's own size, it throws, the page fails to draw, and the job fails with the engine sentence. Once each drawing has settled, drawn or failed, every canvas counted for it is forgotten: PDF.js empties its cache of image masks at the end of a drawing without calling `destroy`, and leaves a failed drawing's temporary canvases behind, so counting them on would refuse later pages and later thumbnails of a document kept open. A `reset` whose resize fails keeps the canvas's old count.
- **The guard:** `tools.pdfjsGuard`, filled in by the worker from `pdfjsLoader.guard`, wraps `openDocument`, `render` and `draw`. A dead PDF.js worker then fails the job at once instead of leaving it on "Page n of m". The worker's thumbnail wrapper uses the same guard through `tools`.
- **Unchanged:** `safeOptions` stay as they are, with `verbosity: 0`, so PDF.js writes nothing to the console. Errors leave the worker only as a failure kind, never as a message.
- **Lint:** a rule for `src/engines/**` refuses value imports of `pdfjs-dist`, allowing type imports, so PDF.js can never be bundled into an engine.

### 4. The engine: `src/engines/tools/pdf-to-images.ts`

```
run([file], { format, passwords }, onProgress, tools):
  format must be 'jpg' or 'png'
  doc = openDocument(file, password, tools)
  try:
    pages = doc.pages
    if pages > zipMaxFiles: throw TooBigForZip('files')
    outputs = [], total = 0
    for page 1..pages:
      onProgress({ stage: 'working', unit: 'page', done: page, total: pages })
      bytes = (await doc.draw(page, { scale: 150/72, maxPixels, format, quality: 0.85 })).bytes
      total += bytes.length
      if total > zipMaxBytes(pages): throw TooBigForZip('bytes')
      if total > maxOutputBytes: throw TooManyPictures
      outputs.push(bytes)
  finally:
    doc.close()
  return outputs
inspect = inspectPdf
```

- **Reading the file:** `inspectPdf` (qpdf) reads the page count and asks for a password. PDF.js then opens the file with the same password.
- **The running checks:**
  - Split's pattern of checking the zip limits as outputs arrive moves into `src/widget/zip-limits.ts` as a small helper both engines use.
  - `maxOutputBytes` is 1 GB, so the outputs and the copy `zipSync` makes stay well under what a computer's tab can hold. Past it the engine throws `TooManyPictures` (in `zip-limits.ts`, recognised by its name, as `TooBigForZip` is), which the worker sorts as a new failure kind, `too-many-pictures`. The page then says, in its own sentence: "The pictures would add up to more than 1 GB, the most this tool makes at once. Use Extract pages or Split PDF first, then convert the parts. The sentence is built from `maxOutputBytes`, so "1 GB" is written once, as the zip-limit sentence is built from its limits." It is a size limit on what a job makes, so it is named among the agent's decisions and put to the owner (CLAUDE.md), as the zip limit was. The input notices are unchanged.
  - This is a guard on what the job makes, not a limit on what a visitor may choose: the input notices are unchanged.
- **Failures:** a page PDF.js cannot draw, or a file PDF.js cannot open after qpdf could, fails the job with the engine sentence.
- **Closing:** the engine's `finally` swallows an error from `doc.close()`. Closing fails only when PDF.js's worker has stopped, and then the drawing that failed has already given the job its failure; a close error must not replace it, nor fail a job whose pictures were all drawn.
- **Zipping:** the worker zips several outputs as for Split, storing them (level 0). It writes no zip comment or extra field: only the cleaned names and `fflate`'s entry times.

### 5. Memory

- **Per page:** one output canvas of at most 16 million pixels (64 MB as RGBA). PDF.js's temporary canvases fit inside the 256 MB budget, and the page is freed after drawing.
- **Outputs:** they are held until zipped, and `zipSync` copies them once more, so the peak is about twice the outputs. The 1 GB guard keeps that under about 2 GB.
- **Sizes:** an A4 page at 150 pixels to the inch is about 150 to 400 KB as JPG and 100 KB to 1 MB as PNG. A 500-page PNG job is about 0.5 GB of outputs and 1 GB at its peak.
- **Advice:** the memory advice says to split first. A streaming zip would halve the peak; it is a later shared change.

### 6. What "Definition of done" means for pictures

- **`qpdf --check` and the four PDF readers** do not apply to pictures. In their place, the pictures are checked by their first bytes and decoded in tests, and opened on Windows, macOS, Android and iOS by hand (issue #7).
- **"Leaves alone what it was not asked to change":** the PDF is only read. The pictures hold only the drawn page, with no text chunks, EXIF, XMP or comments, which an e2e test checks on the browser's own output. Links and text in a picture cannot be clicked or selected, which the page text says.
- **"Correct result for every file in the test set":** every fixture is run. The multilingual file is still missing, so CJK text cannot be checked against the test set.

### 7. Text PDF.js cannot draw

PDF.js refuses a composite font whose named character map it cannot load, and draws none of its text. This happens whether or not the font is embedded. With the owner's fixed helper data, which holds no character maps, that is true of many Chinese, Japanese and Korean PDFs. The page text says so in plain words, and the result gives no warning. The question goes to the owner now (CLAUDE.md), with these facts, which are wider than what the owner was told on 11 Nov 2026.

### 8. The page text

Two Markdown files, 250 to 500 words each, marked as drafts.

`pdf-to-jpg.md`:
- sharing a page as a photo;
- file size;
- plain words on JPG blurring text edges a little, with PNG for sharp text;
- every page in a zip, and how to open a zip on a phone;
- one page by using Extract pages first;
- poster-sized pages drawn smaller.

`pdf-to-png.md`:
- text and drawings without loss;
- screenshots for slides;
- why PNGs are larger;
- every page in a zip, and opening it on a phone;
- posters.

Both say:
- the PDF is not changed;
- pictures cannot be searched or clicked;
- Chinese, Japanese or Korean text may be missing;
- nothing is uploaded, and the page forgets the file.

## Page weight and late loading

No change before a pick beyond a few island props. After a pick, the page tools' files load as now: qpdf and `inspect`, PDF.js with its worker and data, the engine, and `fflate`, which is fetched on every run of this tool, one-page files included. pdf-lib is not fetched.

## Threats

- **Hostile PDFs.** qpdf reads them for the page count. PDF.js draws them with the safe options every thumbnail uses (no font faces, no fetching, no XFA, pictures inside a page capped), in the worker, which is ended after every job.
- **Output bombs.** A tiny file can declare tens of thousands of poster-sized pages. Each picture is capped at 16 million pixels, and the running total of output bytes fails the job at 1 GB, or at the zip limits if those come first. So memory stays bounded and the page shows a sentence, not a dead tab.
- **PDF.js's own canvases.** Nested transparency groups ask for canvases the size of the page. The canvas budget refuses once one drawing's canvases pass four times the largest picture (about 256 MB), so one page cannot take gigabytes.
- **Per-page memory.** `pdfPage.cleanup()` after every page stops decoded pictures from building up across a long file.
- **A dead PDF.js worker.** The guard fails the job at once.
- **Form appearances.** `ENABLE_STORAGE` makes PDF.js build appearance streams for fields that have none, using fonts from the file. That is more parsing than thumbnails do, with no scripting; hidden fields stay hidden.
- **Passwords.** In memory only, as for thumbnails and qpdf.
- **Hostile file names.** Cleaned by `stem`, inside the zip as well; `isZipNaming` checks the stem and the closed extension set.

## Risks and trade-offs

- **Missing CJK text,** as §7 says; an owner question.
- **Every page is converted.** Extract pages gives a subset first.
- **One resolution** (150 pixels to the inch). Very large pages, such as posters, are drawn smaller, to at most 16 million pixels (4096 by 4096 for a square page; a tall poster at 1:2 is about 2896 by 5793). The page text says they are drawn smaller, with no number.
- **The progress bar is full during "Writing the zip",** as for Split today.
- **A single-picture result has no next steps.** The owner's 12 Nov exemption covers zips only, so the pull request names it.

## Migration plan

None; a new tool.
