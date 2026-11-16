# Design

## Context

PDF.js already runs in the tool worker. It draws page thumbnails through `src/engines/thumbnail.ts`, which keeps one document open across pages, draws on an `OffscreenCanvas` from `tools.canvas`, and uses the owner's fixed helper data (11 Nov 2026) with safe options: no font faces installed, no fetching, and decoded pictures capped at 16 million pixels. `tools.canvas` can already encode PNG, and since Compress PDF, JPG. Several outputs are zipped in the worker by `fflate`'s `zipSync`, with names from `partName` and the limits in `zip-limits.ts` (built for Split PDF). Compress PDF added the one-file row. The registry's `ToolPage` has had a `preset` field since the skeleton, unused until now.

## Goals and non-goals

- **Goals:**
  - every page as a picture, looking as a PDF reader shows it;
  - one picture for a one-page file and a zip otherwise;
  - two pages from one entry, each setting its format;
  - bounded memory per page.
- **Non-goals:**
  - choosing pages, resolution or quality;
  - extracting embedded pictures;
  - OCR.

## Decisions

### 1. The registry entry

`pdf-to-images`, group `from-pdf`, phase 1, `accepts: ['application/pdf']`.

Two pages:
- `/pdf-to-jpg`: name "PDF to JPG", `preset: { format: 'jpg' }`;
- `/pdf-to-png`: name "PDF to PNG", `preset: { format: 'png' }`.

Each has the title, heading and sentence the spec gives. The descriptions:
- JPG: "Turn each page of a PDF into a JPG picture, in one zip. The file stays on your device and is not uploaded."
- PNG: "Turn each page of a PDF into a sharp PNG picture, in one zip. The file stays on your device and is not uploaded."

Widget words are shared, with the format-specific words given per page.

`ToolPage` gains an optional `words?: Partial<Pick<ToolWidgetWords, 'actionLabel' | 'writingLabel' | 'doneHeading' | 'resultNotes'>>`, which the page's words override. This is a small, typed extension, so one tool's two pages can name their button after their own result, as "Tool page anatomy" part 5 asks. `[slug].astro` merges them.

The shared words:
- `pickerLabel: 'Choose a PDF file'`, `addLabel: 'Choose another file'`, `dropHint: 'You can also drop a file anywhere on this page, or paste it.'`;
- `items: 'files'`, `itemControls: false`, `multiple: false`, `minFiles: 1`, `tooFewFiles: 'Choose a PDF file to convert.'`;
- `outputs: 'several'`, `partSuffix: 'page'`, `outputSuffix: ''`, `resultPages: 'none'`;
- `failedHeading: 'The conversion did not finish.'`;
- `memoryAdvice: 'Try on a computer, or split the file first and convert the parts.'`;
- `zipLimitAdvice: 'Split the file first, then convert the parts.'`.

Per page: `actionLabel` ("Convert to JPG and download" or "… PNG …"), `writingLabel: 'Writing the zip'`, `doneHeading` ("Your pictures are ready"), and `resultNotes`:
- JPG: "Each page is a JPG picture at 150 pixels to the inch. The PDF itself was not changed."
- PNG: "Each page is a PNG picture at 150 pixels to the inch, without loss. The PDF itself was not changed."

`related`: `pdf-to-jpg` and `pdf-to-png` for each other, plus `jpg-to-pdf`, `extract-pdf-pages`, `compress-pdf`, `split-pdf`.

### 2. Presets and extensions in the widget

- **Presets:** `[slug].astro` passes `page.preset` to `ToolWidget`, which hands it to `useToolRun`. Each job's options are `{ ...preset, ...options }`.
- **Extensions:** the preset may carry `extension`, here the same as `format`. `useToolRun` names a single output `outputName(input, outputSuffix, extension)`: `report.jpg`, since the suffix is empty, which `outputName` already handles. The zip is `outputName(input, '', 'zip')`: `report.zip`.
- **Zip naming:** `ZipNaming` gains `extension` (`pdf`, `jpg` or `png`, checked by `isZipNaming`). `worker-core` passes it to `partName`, giving `report-page-01.jpg`.
- **One output from a several-outputs tool:** a one-page file gives a single output, which the worker does not zip, as Split PDF does today.
- **Other tools:** they pass no preset and keep `pdf`.

### 3. Drawing pages: `src/engines/pdf-pages.ts`

`thumbnail.ts` is renamed `pdf-pages.ts`, unchanged except that its kept document gains a second method:

```
draw(page, { scale, maxPixels, format: 'jpg' | 'png', quality }): Promise<{ bytes, width, height }>
```

- **Size:** the viewport at `scale` (150 / 72), including the page's `/Rotate`. If width × height passes `maxPixels` (25 million), the scale is reduced to fit; width and height are rounded and at least 1.
- **Rendering:** on white, with `annotationMode: AnnotationMode.ENABLE_STORAGE`, so form fields are drawn with their values and other annotations as their appearance streams show them. The thumbnail keeps its current mode.
- **Encoding:** through `tools.canvas` (`png` or `jpeg` at 0.85). The canvas is released in a `finally`.
- **Safety:** `safeOptions` are unchanged, so the helper data, the no-fetch rules and the 16 million pixel cap on pictures inside the page all apply. `maxImageSize` caps a hostile picture inside the PDF; `maxPixels` caps the output canvas.

The worker's thumbnail step imports the renamed file. `check-worker.mjs` and `page-weight.mjs` follow the name.

### 4. The engine: `src/engines/tools/pdf-to-images.ts`

```
run([file], { format, passwords }, onProgress, tools):
  format must be 'jpg' or 'png'
  doc = openDocument(file, password, tools)        // PDF.js, the kept-document code
  try:
    pages = doc.pages
    check fitsInOneZip early for the names, when pages > 1
    outputs = []
    for page 1..pages:
      onProgress({ stage: 'working', unit: 'page', done: page, total: pages })
      outputs.push((await doc.draw(page, { scale: 150/72, maxPixels: 25e6, format, quality: 0.85 })).bytes)
  finally:
    doc.close()
  return outputs
inspect = inspectPdf
```

- **Reading the file:** `inspectPdf` (qpdf) reads the page count and asks for a password, as every PDF tool does. PDF.js then opens the file with the same password.
- **PDF.js failures:** a page PDF.js cannot draw fails the job with the engine sentence. A file PDF.js cannot open, after qpdf could, does the same.
- **Zipping:** the worker zips several outputs as it does for Split PDF, storing the pictures (level 0), since JPG and PNG are already compressed. It checks the exact size against the zip limits before zipping.
- **The worker ends** after every job, as now.

### 5. Memory

- **Per page:** one canvas of at most 25 million pixels (100 MB as RGBA) at a time, released after each page.
- **Outputs:** all are held until zipped, as for Split PDF. An A4 page at 150 pixels to the inch is about 150 to 400 KB as JPG and 100 KB to 1 MB as PNG, depending on content, so a 500-page file is up to about 500 MB as PNG.
- **Large files:** the 100 MB notice applies, and the memory advice says to split first. A streaming zip could lower the peak later.

### 6. The page text

Two Markdown files, 250 to 500 words each, marked as drafts:
- **`pdf-to-jpg.md`:** sharing a page as a photo; file size; quality 85 and why text edges can look soft; every page in a zip; one page by using Extract pages first.
- **`pdf-to-png.md`:** sharp text and drawings; screenshots for slides; why PNGs are larger; every page in a zip.

Both say that the PDF is not changed, that Chinese, Japanese and Korean text in fonts the PDF does not embed may be missing, and that nothing is uploaded.

## Page weight and late loading

No change before a pick. After a pick, the page tools' files load as now:
- qpdf and `inspect`;
- PDF.js, its worker and data;
- the engine (small: it uses `pdf-pages`);
- `fflate`, at the main button for a file of more than one page.

pdf-lib is not fetched.

## Threats

- **Hostile PDFs.** qpdf reads them for the page count. PDF.js draws them with the safe options every thumbnail uses:
  - no font faces installed;
  - no fetching;
  - no XFA;
  - pictures inside the page capped at 16 million pixels;
  - output canvases capped at 25 million pixels.

  All of this runs in the worker, which is ended after every job.
- **Very many pages.** The zip limits refuse more than 65,535 files or 4 GB early, with a sentence saying to split first. Progress and Cancel keep the page responsive.
- **Passwords.** A password is passed to PDF.js in memory only, as for thumbnails, and to qpdf inside `--password=`.
- **Hostile file names.** Names are cleaned by `stem`, inside the zip as well; `isZipNaming` checks the stem and the extension.

## Risks and trade-offs

- **Missing CJK text** in fonts a PDF does not embed, by the owner's fixed helper data; said on the page, and an owner question.
- **Every page is converted.** A visitor who wants one page converts all of them, or uses Extract pages first. Choosing pages could come with a page grid later.
- **One resolution.** 150 pixels to the inch suits screens and ordinary printing; posters and fine print may want more. An owner question.
- **Two catalogue rows as one tool,** like Image to PDF. Named in the pull request.

## Migration plan

None; a new tool. Renaming `thumbnail.ts` changes only imports.
