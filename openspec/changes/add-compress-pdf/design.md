# Design

## Context

Seven tools are built. qpdf 12.2 (WebAssembly) reads and writes every PDF; PDF.js draws thumbnails; the worker can decode pictures with the browser's own decoder and draw on an `OffscreenCanvas` (built for Image to PDF). `src/engines/picture.ts` already rebuilds a JPG from the parts needed to draw it. The owner chose our own recompression over Ghostscript (13 Nov 2026). There is no shared options control, and target sizes are phase 2.

qpdf 12 can write a whole PDF as JSON (version 2) with each stream's data in a file (`--json-stream-data=file`), decoded to the level asked (`--decode-level=generalized` undoes Flate, LZW, ASCII filters, not DCT), and can apply a JSON update to a PDF (`--update-from-json`), replacing a stream's dictionary and data. That is the base of this design.

## Goals and non-goals

- **Goals:** a smaller file with no visible loss on screen or in normal printing; nothing else in the file changed; never a "compressed" file that is not smaller; all in the worker, no new library.
- **Non-goals:** levels or target sizes, grayscale, font subsetting, CMYK or JPEG 2000 pictures, inline pictures.

## Decisions

### 1. The registry entry

`compress-pdf`, group `smaller`, phase 1, `accepts: ['application/pdf']`, one page, as the spec gives it. Description: "Make a PDF file smaller by shrinking its pictures and packing its data. The file stays on your device and is not uploaded."

Widget words: `pickerLabel: 'Choose a PDF file'`, `items: 'files'`, `itemControls: false`, `multiple: false`, `minFiles: 1`, `tooFewFiles: 'Choose a PDF file to compress.'`, `actionLabel: 'Compress and download'`, `writingLabel: 'Writing the compressed file'`, `doneHeading: 'Your compressed file is ready'`, `failedHeading: 'The compression did not finish.'`, `outputSuffix: 'compressed'`, `outputs: 'one'`, `resultPages: 'input'`, `memoryAdvice: 'Try on a computer, or split the file first and compress the parts.'`, and two new optional words:
- `resultWas: true`: the result's detail starts with the new size and then "was" and the input's size, "4.2 MB, was 11.8 MB, 64 pages".
- `noSmaller: 'This file could not be made smaller.'`: the heading shown when the engine gives no file.

`resultNotes`: "Pictures that were made smaller can look slightly less sharp up close." and "Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid." and "A password or restrictions on the file are kept." `related`: `merge-pdf`, `split-pdf`, `delete-pdf-pages`, `jpg-to-pdf`, `pdf-to-jpg`.

### 2. A run that gives no file

`Engine` may return an empty array. `worker-core` passes `outputs: []` on; `isFromWorker` accepts an empty `outputs` array; the hook finishes with `result: { kind: 'no-smaller' }`-style state (a `ResultInfo` with no name, size or href), and `ToolWorkspace` shows the `noSmaller` heading, its announcement and focus as for a result, "Start again", and no Download button. A tool without `noSmaller` that gets no file shows the engine failure, so no other tool changes. Tests cover both.

### 3. Progress in pictures

`Progress`'s `unit` gains `'picture'`; `progressLine` gives "Picture 3 of 40". The bar fills as for pages. Writing is a percentage as now.

### 4. Reading and writing through qpdf's JSON: `src/engines/qpdf-json.ts`

A shared step, used by this engine and open to later tools:

- `readObjects(qpdf, input, password)` runs `qpdf --json=2 --json-key=qpdf --json-stream-data=file --json-stream-prefix=/s/x --decode-level=generalized` and returns the objects and, for a stream, the path of its data file and whether qpdf could decode it. It also returns each page's MediaBox, found from the page tree by `--json-key=pages`.
- `writeUpdate(qpdf, input, password, update, outPath)` writes an update JSON (`{ "qpdf": [ {"jsonversion": 2}, { "obj:N G R": { "stream": { "dict": {...}, "datafile": "/u/N" } } } ] }`) and runs `qpdf --password=… --update-from-json=/update.json` with the lossless options below, into `outPath`.
- Object keys, dictionaries and file paths are made by our code; nothing from the file names a path. A password goes only inside `--password=` through the argument file, as `plain.ts` does.
- The JSON is read with `JSON.parse` after a size check; a JSON larger than 512 MB is not parsed and the pictures step is skipped (the lossless step still runs).

### 5. The engine: `src/engines/tools/compress-pdf.ts`

```
run([file], { passwords }, onProgress, tools):
  qpdf = await tools.qpdf()
  objects, pages = readObjects(qpdf, file, password)
  largest = the longest side of the largest MediaBox, in points
  limit = ceil(largest / 72 * 150)                       // pixels on any side
  candidates = image XObject streams that pass `canShrink`
  for each candidate i:
    onProgress({ stage: 'working', unit: 'picture', done: i + 1, total })
    replacement = shrinkJpeg or shrinkLossless (below), or none
    if replacement: update[obj] = replacement
  onProgress({ stage: 'writing', percent: 0 })
  out = writeUpdate(qpdf, file, password, update, '/out.pdf')
  qpdf --check out
  onProgress({ stage: 'writing', percent: 100 })
  return out.length <= file.length * 0.99 ? [out] : []
inspect = inspectPdf
```

- **`canShrink(dict)`** (exported, tested): `/Subtype /Image`; not `/ImageMask true`; `/BitsPerComponent 8`; `/ColorSpace` is `/DeviceGray`, `/DeviceRGB`, or `[/ICCBased ref]` whose stream has `/N` 1 or 3; no `/Decode`; no `/Alternates`, `/OPI` or `/Intent`-changing entries that matter; filter exactly `/DCTDecode` (with no `/DecodeParms` `/ColorTransform`) or a filter qpdf decoded at the generalized level; width × height at most 50 million. Soft masks are left as they are; an image keeps its `/SMask` reference (a soft mask may differ in size from its image).
- **`shrinkJpeg`**: the JPG bytes go through `jpegForPdf` (so EXIF and its camera turn, and the colour profile, cannot change how the browser decodes it); `tools.decodePicture` decodes them with `imageOrientation: 'none'`, `colorSpaceConversion: 'none'`, at the target size (the limit, or the full size when not too large); `tools.canvas` draws and encodes JPG at quality 0.75. A grey picture comes back as an RGB JPG from the canvas, so its `/ColorSpace` becomes `/DeviceRGB` (a grey ICC profile is dropped, as an RGB stream cannot use it); an RGB ICC profile is kept. The new stream replaces the old only when the picture was too large, or when it is at least 10% smaller.
- **`shrinkLossless`**: only when too large. The decoded samples (grey or RGB, 8 bits, exactly width × height × components bytes, checked) are scaled by `src/engines/resample.ts` (area averaging, pure, tested) and deflated through `tools.fflate` at level 9; `/Filter /FlateDecode`, no `/DecodeParms`. Used only when smaller than the original stream.
- **The new dictionary** keeps every entry of the old one except `/Width`, `/Height`, `/Filter`, `/DecodeParms`, `/Length` and, for a grey JPG, `/ColorSpace`. So `/SMask`, `/Interpolate`, `/Metadata`, `/StructParent` and the rest stay.
- **The lossless options**: `--object-streams=generate --compress-streams=y --recompress-flate --compression-level=9 --remove-unreferenced-resources=yes`. qpdf keeps encryption by default when given the password, so a protected file is written with the same password and restrictions; a test checks both protected fixtures. No `--decrypt`.
- **Memory:** qpdf holds the file, the stream files in its memory, and the output; one picture is decoded at a time. About three times the file plus the largest decoded picture.

### 6. Picture tools for engines

- `decodePicture` gains options `{ orientation: 'none', colours: 'none' }`; in the worker these become `imageOrientation: 'none'` (or `'flipY'`-free default where unsupported, with the camera turn already removed by `jpegForPdf`) and `colorSpaceConversion: 'none'`. Image to PDF's thumbnail keeps its current options.
- `canvas` gains `jpeg(canvas, quality)`, `OffscreenCanvas.convertToBlob({ type: 'image/jpeg', quality })` in the worker, `@napi-rs/canvas`'s `encode('jpeg', quality)` in tests.
- Both stay out of `src/engines/`'s own code: lint already forbids the browser's picture APIs there.

### 7. The page text

`src/content/tools/compress-pdf.md`, 250 to 500 words, draft: how to; what is made smaller and what is not; "Why is my file still large after compressing?" (text-only files, CMYK or 1-bit scans, fonts, already compressed files); whether quality drops; passwords kept; that nothing is uploaded and the page forgets the file.

## Page weight and late loading

No change before a pick. After a pick: as for the page tools (worker, qpdf, inspect, plain, PDF.js and its data for the first page's thumbnail), plus the engine, `qpdf-json`, `resample` and, at the main button, `picture` (for `jpegForPdf`) and `fflate`. No new library; pdf-lib is not fetched. `check-worker.mjs` checks `qpdf-json` and `resample` load late.

## Threats

- **Hostile PDFs.** qpdf parses them, as for every tool, in the worker, which is ended after every job.
- **Hostile picture data.** JPG data is decoded by the browser's decoder in the worker after `jpegForPdf` checks its structure; a picture whose header says more than 50 million pixels is skipped, so a small stream claiming a huge picture is never decoded. Lossless samples are used only when their length is exactly width × height × components, so a stream that inflates to more is skipped (qpdf has already inflated it into its own memory; its own limits apply).
- **The JSON.** Only qpdf's own output is parsed, after a size check; object keys and paths are made by our code.
- **Passwords.** Passed only in `--password=` through the argument file; never logged; the output keeps qpdf's encryption.
- **Hostile file names.** Unchanged: `stem` cleans the output name.

## Risks and trade-offs

- **150 pixels to the inch across the largest page** is measured from page size, not from where each picture is drawn. A picture drawn small on a page keeps more pixels than it needs, and a picture cropped to a small part of itself can lose sharpness in that part. Working out each picture's drawn size needs the page content parsed; left for later.
- **Grey JPGs become RGB JPGs,** which the canvas encoder always writes. Their chroma compresses to almost nothing, and the 10% rule keeps the old one when it is not smaller.
- **Files that do not shrink**, such as text-only files already packed, get "could not be made smaller", which the FAQ explains.
- **qpdf's JSON on very large files** is memory-heavy; above 512 MB of JSON the pictures step is skipped.

## Migration plan

None; a new tool.
