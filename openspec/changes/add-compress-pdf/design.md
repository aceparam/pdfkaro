# Design

## Context

Seven tools are built. qpdf 12.2 (WebAssembly) reads and writes every PDF. PDF.js draws thumbnails. The worker can decode pictures with the browser's own decoder and draw on an `OffscreenCanvas`; this was built for Image to PDF. `src/engines/picture.ts` already checks a JPG's structure (`walkJpeg`), rebuilds it from the parts needed to draw it (`jpegForPdf`), and inflates with an output limit (`inflateLimited`). `src/engines/outline.ts` already reads objects through qpdf's JSON in batches and builds update JSON; `plain.ts` has the argument-file call. The owner chose our own recompression over Ghostscript (13 Nov 2026). There is no shared options control, and target sizes are phase 2.

qpdf 12 can:
- write a PDF's objects as JSON (version 2), with or without stream data, for the whole file or for chosen objects (`--json-object`);
- give a stream's raw data in a file (`--decode-level=none --json-stream-data=file`);
- apply a JSON update that replaces a stream's dictionary and data (`--update-from-json`), keeping the file's encryption when given the password.

Checked while writing this design on `password.pdf`, `restricted.pdf` and `images.pdf`: the update applied, the encryption and restrictions stayed, and `qpdf --check` passed.

## Goals and non-goals

- **Goals:**
  - a smaller file with no visible loss on screen;
  - nothing else in the file changed;
  - never a "compressed" file that is not smaller;
  - bounded memory, even for hostile files;
  - all in the worker, with no new library.
- **Non-goals:** levels or target sizes, grayscale, font subsetting, CMYK or JPEG 2000 pictures, inline pictures.

## Decisions

### 1. The registry entry

`compress-pdf`, group `smaller`, phase 1, `accepts: ['application/pdf']`, one page, as the spec gives it. Description: "Make a PDF file smaller by shrinking its pictures. The file stays on your device and is not uploaded."

The widget words:
- **Picker and list:**
  - `pickerLabel: 'Choose a PDF file'`, `addLabel: 'Choose another file'`;
  - `dropHint: 'You can also drop a file anywhere on this page, or paste it.'`;
  - `acceptsName: 'a PDF'`;
  - `items: 'files'`, `itemControls: false`, `multiple: false`, `minFiles: 1`;
  - `tooFewFiles: 'Choose a PDF file to compress.'`.
- **The job:**
  - `actionLabel: 'Compress and download'`, `writingLabel: 'Writing the compressed file'`;
  - `doneHeading: 'Your compressed file is ready'`, `failedHeading: 'The compression did not finish.'`;
  - `outputSuffix: 'compressed'`, `outputs: 'one'`, `resultPages: 'input'`;
  - `memoryAdvice: 'Try on a computer, or split the file first and compress the parts.'`.
- **Two new optional words:**
  - `resultWas: true`: the result's detail reads "4.2 MB, was 11.8 MB, 64 pages".
  - `noSmaller: { heading: 'This file could not be made smaller.', advice: 'It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more.' }`: shown when the engine gives no file.

`resultNotes`:
- "Pictures that were made smaller can look slightly less sharp up close."
- "Pages, text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid."
- "If the file had a password or restrictions, it still has them."

`related`: `merge-pdf`, `split-pdf`, `delete-pdf-pages`, `jpg-to-pdf`, `pdf-to-jpg`.

With one file listed and `multiple: false`, the summary line above the row is left out, so the file is not described twice. That holds for every one-file tool that lists its file as a row, of which this is the first.

### 2. A run that gives no file (`tool-engines`, `tool-page`)

- **Engine and worker:** an engine may return an empty array, meaning "no smaller file". `worker-core` passes `outputs: []` on, and `isFromWorker` accepts it.
- **Page:** the state holds a result with no name, size or link. `ToolWorkspace` shows `noSmaller`'s heading and advice, with focus and announcement as for a result, "Start again", and no Download button.
- **Other tools:** a tool without `noSmaller` that gets no file shows the engine failure, so no other tool changes.
- **Counting as smaller:** the engine gives `[]` unless the output is at most 99% of the input. The page also treats a result as no smaller when its size and the input's would read the same (`formatSize`), so "5.0 MB, was 5.0 MB" is never shown.
- **Tests** cover all of this.

### 3. Progress

- **Pictures:** `Progress`'s `unit` gains `'picture'`; `progressLine` gives "Picture 3 of 40". `progressFraction` fills 0.2 to 0.8 for pictures, leaving the last fifth for writing.
- **Writing:** this engine reports writing from 75% to 100%, so the bar does not sit full while qpdf writes (`0.2 + 0.8 × 0.75 = 0.8`).
- **Reading:** a reading progress of `done: 0, total: 1` reads "Reading the file". The engine sends it before the first qpdf call, so the line never sits on "Starting".
- **Other tools:** they do not send `total: 1` readings with `done: 0`; tests check their lines are unchanged.

### 4. The qpdf JSON steps: `src/engines/qpdf-json.ts`

The general helpers move from `outline.ts` and `plain.ts` into this file, unchanged and with their tests:
- `json()`, `objects()`, `objectArg`, `objectsPerCall`;
- `updateJson()`;
- `callWithArgumentFile()`.

`outline.ts` and `plain.ts` import them from here. `check-worker.mjs`'s shared-step sentences follow them.

Added:
- **`readDictionaries(qpdf, passwordArgs)`:**
  - runs `--json=2 --json-key=qpdf --json-stream-data=none` with qpdf writing to a file in its own memory, not standard output;
  - reads that file's length first, and does not parse a JSON of more than 64 MB (the pictures step is then skipped; the lossless step still runs);
  - any failure to read or parse also skips the pictures step;
  - gives every object's dictionary, with no stream data.
- **`readRawStreams(fresh, passwordArgs, ids)`:**
  - for chosen candidates, in batches, runs `--json=2 --json-key=qpdf --decode-level=none --json-stream-data=file --json-object=…`;
  - uses a fresh qpdf for each batch, as `plain.ts` records that one qpdf writes JSON only once;
  - a batch holds candidates whose compressed data adds up to at most 32 MB, or one candidate;
  - each data file is read, handed over, and removed (`Qpdf` gains `remove(path)`).
- **`writeUpdate(fresh, input, passwordArgs, update)`:**
  - uses a fresh qpdf, after the reading ones are let go;
  - writes the update with `JSON.stringify`, and the data files under paths our code makes;
  - runs `--update-from-json=/update.json` with the lossless options, through the argument file;
  - then runs `qpdf --check`, with the password, through the argument file.

Object keys are accepted only in the form `^obj:\d+ \d+ R$`. A password goes only inside `--password=`, in the in-memory argument list or the argument file. The argument file holds one argument per line, and a password with a line break is passed in the argument list instead.

### 5. Which pictures are candidates

`canShrink(id, dict, all)` is exported and tested. It reads dictionaries only, and a picture is a candidate only when all of these hold:
- **Dictionary:**
  - `/Subtype /Image` and `/BitsPerComponent 8`;
  - no keys other than `Type`, `Subtype`, `Width`, `Height`, `ColorSpace`, `BitsPerComponent`, `Filter`, `DecodeParms`, `Length`, `Interpolate`, `Intent`, `Metadata`, `StructParent`, `ID`, `Name`, `OC` and `SMask`. Anything else (`/Mask`, `/Decode`, `/ImageMask`, `/Alternates`, `/OPI`, `/SMaskInData`, …) means it is left alone.
- **Size:** `/Width` and `/Height` positive integers, with at most 50 million pixels.
- **Colours:** `/ColorSpace` is `/DeviceGray`, `/DeviceRGB`, or `[/ICCBased ref]` whose stream has `/N 3`. Grey ICC pictures are left alone, so their tone does not change.
- **Filter:** exactly `/DCTDecode` with no `/DecodeParms`, or exactly `/FlateDecode` with no `/DecodeParms` or with a PNG predictor (10 to 15) whose `/Colors`, `/BitsPerComponent` and `/Columns` match the picture.
- **Soft masks:** it is not itself named as another image's `/SMask` or `/Mask`, so soft masks are never scaled. Its own `/SMask`, if any, has no `/Matte`, which would tie the two sizes together.

### 6. The engine: `src/engines/tools/compress-pdf.ts`

```
run([file], { passwords }, onProgress, tools):
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  dicts = readDictionaries(fresh qpdf, passwordArgs)            // or none: skip pictures
  limit = pixel limit from the largest page box (below)
  candidates = ids passing canShrink
  for each batch of readRawStreams(candidates):
    for each candidate i:
      onProgress({ stage: 'working', unit: 'picture', done: i + 1, total })
      replacement = shrinkJpeg or shrinkLossless, or none
  onProgress({ stage: 'writing', percent: 75 })
  out = writeUpdate(fresh qpdf, file, passwordArgs, update)     // includes qpdf --check
  onProgress({ stage: 'writing', percent: 100 })
  return out.length <= file.length * 0.99 ? [out] : []
inspect = inspectPdf
```

- **The pixel limit:**
  - each page's box is its `/CropBox`, or else its `/MediaBox`, found up the `/Parent` chain with `outlineDepthLimit` and scaled by `/UserUnit`;
  - boxes that are not four finite numbers are ignored;
  - the limit is `ceil(longest side / 72 × 150)` pixels, at least 1;
  - with no usable box, the pictures step is skipped.
- **`shrinkJpeg`:**
  - the raw stream must pass `walkJpeg` with one 8-bit frame whose width, height and component count equal the dictionary's (1 for grey, 3 for RGB); otherwise it is left alone;
  - `jpegForPdf` rebuilds it without EXIF or colour profile segments, so nothing in the JPG can change how the browser decodes it;
  - `tools.decodePicture` decodes at the target size (the limit, or the full size when not too large) with `colorSpaceConversion: 'none'` and `resizeQuality: 'high'`;
  - `tools.canvas` draws, and encodes JPG at quality 0.75;
  - a `/DeviceGray` picture comes back as an RGB JPG from the canvas, so its `/ColorSpace` becomes `/DeviceRGB`, and the pixels stay grey;
  - the new stream replaces the old when the picture was too large, or when it is at least 10% smaller.
- **`shrinkLossless`, only when too large:**
  - the raw data is inflated by `inflateLimited`, capped at exactly the expected size (width × height × components, plus one byte per row with a predictor); data that inflates to more or less is left alone;
  - PNG predictors are undone by `src/engines/resample.ts`, which then scales by area averaging;
  - the result is deflated by `tools.fflate`'s `Deflate` at level 9, with `/Filter /FlateDecode` and no `/DecodeParms`;
  - it is used only when smaller than the original stream.
- **The new dictionary** keeps every allowed key of the old one except `/Width`, `/Height`, `/Filter`, `/DecodeParms`, `/Length` and, for a grey JPG, `/ColorSpace`.
- **The lossless options:** `--object-streams=generate --compress-streams=y --recompress-flate --compression-level=9 --remove-unreferenced-resources=yes`, with no `--decrypt`. A protected file is written with the same password and restrictions, which a test checks on both protected fixtures.
- **Memory:**
  - the file and the dictionaries' JSON (at most 64 MB);
  - one batch of raw data (32 MB) and one decoded picture (at most 50 million pixels, about 200 MB as RGBA);
  - then qpdf's write: the input, the replacement data and the output.

  About three times the file plus 250 MB at the peak. qpdf's `--recompress-flate` and `--check` inflate streams one at a time, never all at once.

### 7. Picture tools for engines

- **`decodePicture`** accepts `{ colours: 'none' }`, which becomes `colorSpaceConversion: 'none'` in the worker. Image to PDF's thumbnail keeps its current options.
  - Since `jpegForPdf` has removed any colour profile, a browser that ignores the option decodes the same values.
  - The camera turn is already removed, so `imageOrientation` is left at `'from-image'` (`'none'` is deprecated).
- **`canvas`** gains `jpeg(canvas, quality)`: `convertToBlob({ type: 'image/jpeg', quality })` in the worker, and `encode('jpeg', quality)` from `@napi-rs/canvas` in tests.
- **`fflate`** gains streaming `Deflate` beside `Inflate`, in the worker and in the unit tests' tools.

### 8. The page text

`src/content/tools/compress-pdf.md`, 250 to 500 words, marked as a draft, covering:
- how to use it;
- what is made smaller and what is not;
- "Why is my file still large after compressing?" (text-only files, CMYK or 1-bit scans, fonts, files already compressed);
- whether quality drops: pictures can be slightly less sharp up close, with no claim about print;
- that passwords are kept;
- that changes saved on top of the file are dropped, and anything the file still uses stays;
- that nothing is uploaded and the page forgets the file.

## Page weight and late loading

No change before a pick. At the pick, these are fetched:
- what every page tool fetches: the worker, qpdf and its WebAssembly, `inspect`, `plain` and PDF.js with its data for the first page's thumbnail;
- the engine;
- its static imports `qpdf-json`, `picture` and `resample`, in whatever chunks the bundler gives them;
- `fflate` when the engine starts.

pdf-lib is not fetched. `check-worker.mjs` checks the engine and the new shared code stay out of the worker file. `page-weight.mjs`, which already builds its engine list from the files, gets a `loadedLater` line only for any new chunk the build makes.

## Threats

- **Hostile PDFs.** qpdf parses them in the worker, which is ended after every job.
- **Compression bombs.**
  - No stream is decoded in bulk: dictionaries are read without data, and only candidates' raw data is fetched, in bounded batches.
  - Candidate data is inflated by our own code with an output cap equal to the expected size.
  - Attached files, fonts and content streams are never decoded by the pictures step.
  - qpdf's `--recompress-flate` and `--check` do inflate every Flate stream, one at a time. A bomb there costs time, not memory; the page stays responsive, and Cancel ends the worker. A test with a bomb attachment checks this.
- **Hostile picture data.**
  - A JPG's own frame must match its dictionary in size, components and precision, and stay under 50 million pixels, before the browser decodes it.
  - A CMYK JPG labelled RGB, or a small dictionary over a huge JPG, is left alone.
- **The JSON.**
  - Only qpdf's own output is parsed, from a file whose size is checked first (64 MB).
  - Object keys must match `obj:N G R`, and the update is built with `JSON.stringify`.
  - Numbers from the file are checked to be finite and in range before use.
- **Passwords.** Passed only inside `--password=`, never logged. The output keeps qpdf's encryption, at the input's own strength.
- **Hostile file names.** Unchanged: `stem` cleans the output name.

## Risks and trade-offs

- **The limit is measured from the largest page, not from where each picture is drawn.** A picture drawn small keeps more pixels than it needs. A picture cropped to a small part of itself can lose sharpness in that part, so the page text claims nothing about print. Working out each picture's drawn size needs the page content parsed; left for later.
- **Grey DeviceGray JPGs become RGB JPGs,** which the canvas encoder always writes. The pixels stay grey, but some office printers may print such greys in composite colour. Named among the agent's choices.
- **Files that do not shrink,** such as text-only files already packed, get "could not be made smaller" with its advice.
- **This pull request carries shared widget pieces** (no-file result, "was" size, progress units, the one-file summary), as Reorder's and Rotate's did. The pull request names this; `SPEC.md` "Build phases" 3 prefers them in their own pull request.

## Migration plan

None; a new tool.
