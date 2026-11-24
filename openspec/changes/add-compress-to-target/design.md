# Design

## Context

See `proposal.md` for why Compress to a target size is next and what the owner decided on 24 Nov 2026 (three decisions: "Pictures only", "Give the smallest, say so", and, after stage 1, "No, keep them lossless").

**Order: the picture-steps move first** (stage 1, program manager and architect). In its own pull request, with no change in behaviour and no OpenSpec change (as `pages.ts` came out of `stamp.ts` before Resize, entry 27), Compress PDF's picture work moves out of `src/engines/tools/compress-pdf.ts` into `src/engines/shrink.ts`:

- `canShrink`, `pictureContext`, `pixelLimit`, `newDictionary`, `shrinkJpeg`, `shrinkLossless`, `zlibDeflate`, `statedLength`, `streamDict`, `need`, the `Candidate`, `PictureContext`, `PictureDecoder`, `DeflateClass` types, and the limits `pixelsPerInch`, `jpegQuality`, `jpegSaving`, `maxPixels` and the allowed keys;
- `losslessOptions` and `keepBelow`;
- `listCandidates(objects, context)`, the loop now inside Compress PDF's `run` that walks the dictionaries and keeps each `canShrink` candidate, taken out unchanged;
- `pixelLimit(objects, ppi = pixelsPerInch)`: the resolution as an argument, 150 when left out;
- `shrinkJpeg` rebuilt on two steps both tools use: `decodeJpeg(raw, candidate, size, decoder)` (frame checked with `walkJpeg`, rebuilt by `jpegForPdf`, decoded at `size`) and `encodeJpeg(decoded, size, quality, canvases)` (drawn and encoded, the output walked and checked, as now). `imageSmoothingQuality` is set to `'high'` only when the canvas size differs from the decoded size, so Compress PDF's draws are as before.

Compress PDF's output on every fixture is compared byte for byte before and after; its tests change only in their import lines (`compress-pdf.test.ts`, and `multilingual.test.ts`, which imports `run` from `compress-pdf.ts` and keeps doing so). With one importer the bundler inlines `shrink.ts` into Compress PDF's engine chunk, so the move PR makes no new built file and leaves `page-weight.mjs` unchanged; it adds to `check-worker.mjs` only the general rule that no file under `src/engines/tools/` imports another (as built, PR for the move). `shrink.ts` carries a fixed sentence (in a thrown error: "A picture step was given a picture it cannot redo.") so that, once this tool's pull request makes `shrink.ts` a chunk of its own, `check-worker.mjs` names it in `lateSources` and looks for that sentence in the worker file. The move PR goes through the review panel's stage 2 and gets its own line in "Where the project stands". **This tool's pull request then changes no Compress PDF code.**

What exists and is reused:

- **The one-file tool flow** with no options, as Compress PDF has it: the row with the first page's thumbnail and no summary line, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices, Cancel, "Go back to your file", the result with the "was" size (`resultWas`), and the "no new file" outcome (`noSmaller`, `[]` from the engine).
- **Page presets** (`ToolPage.preset`, documented in the registry as "Options already chosen when this URL opens, such as a target size"), sent with every job, as PDF to JPG and PNG use them; the registry test refuses an option key a preset uses, "so a choice never replaces what the page promises".
- **Page words** (`PageWords`, merged by `pageWords`): each page names its own main button.
- **Compress PDF's picture work** (in `shrink.ts`): dictionaries read without data (`readDictionaries`, capped at 64 MB of JSON), raw data in bounded batches (`rawBatches`, `readRawStreams`, 32 MB, a fresh qpdf each), a JPG's frame checked against its dictionary before the browser decodes it, lossless data inflated with a cap at exactly its size, the encoder's output walked before it goes in, and `writeUpdate` with `losslessOptions`, which keeps a password and restrictions and runs `qpdf --check`.
- **`cappedWrite` and `OutputLimit`** in `src/engines/qpdf.ts`.
- **`acceptedValue`**, `optionValues` (`src/widget/option-values.ts`) and `holdErrorId` (the main button's description).
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`).

## Goals / Non-Goals

**Goals:**

- A file at or under the page's target, by lowering picture resolution and JPG quality step by step, keeping pictures as sharp as the target allows ("Pictures only").
- When the target cannot be reached, the smallest file made, with its size and that it is over the target ("Give the smallest, say so").
- Pictures stored without loss stay lossless ("No, keep them lossless").
- Few full writes: each picture decoded once per pass, the step chosen from measured sizes, at most three capped writes.
- A fixed budget of pixel work, planned before any raw data is read.
- Memory no higher than Compress PDF's on the same file, plus a table of numbers and one output.
- Five pages whose words are each written for their own size.
- No dependency, no new component, no new option kind, no change to Compress PDF's code in this pull request.

**Non-Goals:**

- Turning pages into pictures, saving any lossless picture as a JPG, touching text, drawings or fonts beyond qpdf's lossless rewrite.
- A target the visitor types, a target choice on the page, other targets.
- Pictures Compress PDF leaves alone.
- Telling, before the main button, whether the target can be reached.

## Decisions

### 1. One new tool with five pages

Options considered:

- **Five pages of Compress PDF:** one widget's words serve all its pages, and Compress PDF's words (no target, "could not be made smaller" below 1%, its 10% rule) do not fit; `SPEC.md` lists a catalogue row of its own; five Phase 2 pages inside a Phase 1 entry would break catalogue order. Rejected.
- **Five tools:** five entries for one engine, against "one tool with preset pages". Rejected.
- **One new tool, `compress-to-target`, five pages, each preset `{ target: '<key>' }`** (chosen), as PDF to JPG and PNG are one tool with two presets. Its engine, `src/engines/tools/compress-to-target.ts`, imports `shrink.ts` and never another engine's file. A new general `check:worker` rule (source level) fails when any file under `src/engines/tools/` imports another file there.

**Target fixed by the page, no choice.** `SPEC.md` says each page "opens the compressor with that target already selected". A choice whose first value the page sets would be a new shared piece, and the registry refuses an option key a preset uses. A visitor who needs another size follows a related link. Owner question 1.

**Catalogue order.** The order test (`tests/unit/registry.test.ts`, "catalogue order") reads addresses with `/\| (\/[a-z0-9-]+) \|/`, which misses the row `| /compress-pdf-to-100kb, -200kb, -500kb, -1mb, -2mb |`. Task 1.1 changes it to take the first address of each row (`/\| (\/[a-z0-9-]+)[,| ]/`), keeps `placeOf` for Image to PDF, and checks that `compress-to-target` lands after `compress-pdf` and before `pdf-to-jpg`. The entry sits in the registry right after `compress-pdf`.

### 2. A target is bytes, counted in thousands, and one byte rule

`src/widget/option-values.ts` gains `sizeTargets` (`'100kb'` 100,000 bytes, label "100 KB"; `'200kb'` 200,000; `'500kb'` 500,000; `'1mb'` 1,000,000, "1 MB"; `'2mb'` 2,000,000) and `acceptedTarget(value)` (own keys only, as `acceptedValue`). The engine refuses a missing or unknown target before reading the file (`engine` failure, fixed sentence).

**Why thousands:** forms count "200 KB" as 200,000 or 204,800 bytes and the visitor cannot know which; 200,000 fits both. Owner question 4.

**The byte rule** (`sizeAgainstTarget(bytes, target)` in `src/widget/target.ts`, the only place it is decided). The site's `formatSize` counts in 1024s and rounds. Each label also has a size in 1024s: 100 KB = 102,400, 200 KB = 204,800, 500 KB = 512,000, 1 MB = 1,048,576, 2 MB = 2,097,152 bytes. A size over the target's bytes is written **in bytes, with the shared thousands separator**, whenever the value `formatSize` would show, taken back to bytes in 1024s, is at most the label's size in 1024s; otherwise it is written by `formatSize`. So the page can never say "over 1 MB" beside "1.0 MB" or "1016 KB". The same form is used for the new size in the over-target "was" line, so the sentence and that line always show the same text. Cases tested in `target.test.ts` (1 MB unless named):

| Bytes | Shown |
| --- | --- |
| 1,000,001 | 1,000,001 bytes (`formatSize` 977 KB) |
| 1,040,000 | 1,040,000 bytes (1016 KB) |
| 1,048,576 | 1,048,576 bytes (1.0 MB) |
| 1,101,000 | 1,101,000 bytes (1.0 MB: 1,101,000 / 1,048,576 = 1.04999) |
| 1,101,004 | 1,101,004 bytes (1.0 MB) |
| 1,101,005 | 1.1 MB |
| 1,110,000 | 1.1 MB |
| 2,050,000, 2 MB | 2,050,000 bytes (2.0 MB) |
| 2,150,000, 2 MB | 2.1 MB |
| 102,400, 100 KB | 102,400 bytes (100 KB) |
| 102,911, 100 KB | 102,911 bytes (100 KB) |
| 102,912, 100 KB | 101 KB |

The row on target pages keeps `formatSize`; the text below each page explains, each in its own words, that 200 KB here means 200,000 bytes, so a file the row shows as "198 KB" may still be compressed.

### 3. Which pictures change

Compress PDF's candidates (`listCandidates`, `canShrink`, unchanged): an image XObject, 8 bits, `/DeviceGray`, `/DeviceRGB` or an RGB ICC profile, `/DCTDecode` with no `/DecodeParms`, or `/FlateDecode` with none or a matching PNG predictor, no key outside the allowed list, not itself another picture's mask, a soft mask (if any) without `/Matte`, at most 50 million pixels. Added here:

- a picture with **no stated length** is left alone (Compress PDF reads such a picture in a batch of its own; here its size cannot be planned);
- a picture whose stated length is under **4 KB** is left alone, and once read, a picture whose **real raw length** is under 4 KB is left alone too;
- at most the **10,000 largest** by stated length;
- then the **pixel-work budget** (decision 5), which can leave more alone.

**Lossless pictures stay lossless** (owner, 24 Nov 2026, "No, keep them lossless"): they are scaled down to the step's resolution by area averaging and deflated again (`shrinkLossless`), and replaced only when smaller. They are never saved as JPGs; quality does not apply to them. Grey JPGs come back from the canvas as RGB JPGs whose pixels stay grey, as in Compress PDF (open owner question).

**Left alone, and said on the page:** CMYK, indexed colours, grey with a colour profile, 1-bit scans, JPEG 2000, 16-bit, inline pictures, unusual keys, masks and soft masks themselves.

### 4. The ladder and the floor

The resolution is pixels to the inch across the file's largest page (`pixelLimit`): each picture's longer side is held to `ceil(longest page side / 72 × ppi)`.

| Step | Pixels to the inch | JPG quality |
| --- | --- | --- |
| 1 | 150 (`pixelsPerInch`) | 75 (`jpegQuality`) |
| 2 | 150 | 60 |
| 3 | 120 | 55 |
| 4 | 100 | 50 |
| 5 | 100 | 40 |
| 6 | 85 | 40 |
| 7 | 72 | 40 |

Step 1 reads `pixelsPerInch` and `jpegQuality` from `shrink.ts`, so it is always Compress PDF's own setting. At every step a JPG picture is scaled to the step's limit (if larger) and saved at the step's quality, and a lossless picture is scaled (if larger) and stays lossless; each replaces the old data only when smaller (no 10% rule). Lossless pictures have five distinct settings (150, 120, 100, 85, 72).

**The floor is step 7: 72 pixels to the inch, quality 40.** At 72 to the inch a page's picture has one pixel per point, so a scan shows at its printed size on a screen with 10-point text about 10 pixels tall; below quality 40 JPG blocks break up small letters. Nothing goes lower: at the floor, the smallest file made is the answer. Owner question 2.

### 5. The plan and the pixel-work budget, before any raw data is read

From the dictionaries alone, each candidate's pixel work is planned: for a JPG, its frame's pixels once per pass (decoded; `walkJpeg` later checks the frame equals the dictionary, so the plan is exact) plus the encoded pixels of each step measured; for a lossless picture, its pixels once per pass (inflated and scaled) plus each distinct setting's output pixels. The plan counts the measuring pass and three write passes at the step-1 sizes (the largest), so the plan bounds the whole job.

Lossless work costs more per pixel than the browser's JPG decoder and encoder (inflating, area averaging and deflating at level 9 run in our own JavaScript and fflate), so **lossless pixels are weighted by `losslessPixelCost`, starting at 10** JPG pixels each; both are planned in JPG-pixel units.

Two constants sit beside the ladder: **`pixelWorkBudget` = 12,000,000,000 JPG-pixel units** a job (decoded plus encoded, summed over every step and candidate) and **`losslessPixelCost` = 10**. Task 3.3 calibrates both against worst cases at the budget, not only realistic files: a hostile JPG file (JPGs of about 49 million pixels that pass `walkJpeg`, on a page no step scales them on) and a lossless worst case, each built in task 3.3 to plan exactly at the budget and run with the real decoder and encoders, must each finish within 5 minutes in desktop Chromium; if either misses, the budget is lowered (and the weight raised if the lossless case is the slow one). The phone factor measured (the same files on a mid-range Android phone, or Chromium with the CPU slowed four times) is recorded in the pull request. The page promises no time. When the plan is over it:

1. first, only steps 1, 4 and 7 are measured, and only measured steps can be chosen;
2. then, while still over, the lowest-priority candidates are left alone: the smallest stated length first, ties by object number.

The plan always fits after step 2 (in the end, no candidate). **The planner is a plain function,** `plan(candidates, page, budget)`, giving the steps to measure, the candidates kept and the planned work, so its cuts are unit tested directly with numbers. `shrinkToBytes` also takes a test-only `budget` option (the constant when left out). **The budget tests do no real pixel work:** they run the job with a small budget and a decoder and canvas stand-in that count calls and the pixels asked for, and draw or encode nothing. The JPG test file is small: a few hundred real flat JPGs that each pass `walkJpeg` and qpdf's check, padded to at least 4 KB (as built, see Found while building), on a page large enough that no step scales them, so every step would encode at full size; with the small budget its plan is over. The lossless test file is about 50 grey lossless pictures, a few MB in all, whose data inflates exactly, on a page small enough that every step scales them (as built: a lossless picture no step scales is never worked on, see Found while building); its pixels count with `losslessPixelCost`, and the lossless scale-and-deflate step is reached through a test-only hook that counts the pixels asked for and does no work. Each test asserts the plan was cut first to steps 1, 4 and 7 and then by dropping the smallest candidates, that the counted decodes plus encodes stay within the small budget, and that the job ends (with a file, `[]` or the shared failure). The full 12,000,000,000 calibration with the real decoder and encoders is task 3.3. Named in Threats and the pull request.

### 6. Finding the step: measure once, choose, write capped, check

`shrinkToBytes(file, targetBytes, passwordArgs, tools, onProgress)` does the work and returns `{ output, step, estimates, writes }` for tests; `run` checks the target and calls it with the target's bytes.

1. **Read.** "Reading the file". An input at or under the target gives `[]` (the page holds the button first, decision 8). `readDictionaries` once; candidates (decision 3); the plan (decision 5). With no dictionaries, no usable page box or no candidate, go to step 4 with no replacements: one write.
2. **Measure.** One raw-data pass. Each candidate is decoded once (a JPG at the step-1 size through `decodeJpeg`; a lossless one inflated with the cap), then encoded at each measured step's setting with `encodeJpeg` or `shrinkLossless`, keeping only `size[i][s] = min(raw length, encoded length)`. The decoded picture and every encoded copy are let go before the next. A picture that throws while measured is marked skipped and is left alone in every later pass. "Picture N of M".
3. **Choose.** `estimate(s) = F + Σ size[i][s]`, with `F0 = input length − Σ raw length` before any write. The chosen step is **the mildest step whose estimate fits within 99% of the target**; when none does, the step with the smallest estimate (normally 7).
4. **Write 1.** A raw-data pass encodes each candidate at the chosen step with the same functions; the length handed to `writeUpdate` for each replaced stream is recorded **before `writeUpdate` empties the replacements map**. `writeUpdate`, through `cappedWrite` with a fresh qpdf and qpdf's `--progress` added to its arguments, writes and checks the file, capped at `2 × input + 16 MB` (as Protect's and Unlock's). `callWithPassword`'s result type is widened from `{ code: number }` to qpdf's full call result, so `cappedWrite` can read what qpdf printed for its "no space left" check (never passed on). `F1 = L1 − Σ` (the recorded handed-over lengths, kept candidates counted at their raw length). qpdf's `--recompress-flate` re-deflates lossless streams, and whatever that adds or saves folds into `F1`.
5. **Check, at most two more writes, each capped:**
   - **Write 1 fits** (`L1 ≤ target`): if a milder step has `F1 + Σ size[i][s'] ≤ 0.99 × target`, the mildest such step is written once, capped at the target; it is kept if it fits. Otherwise write 1 is the answer.
   - **Write 1 is over:** the mildest later step whose estimate with `F1` fits within 99% is written, capped at `L1`; if none fits, the step with the smallest estimate is written, capped at `L1`, unless the chosen step already had the smallest estimate, when nothing more is written. If write 2 is over too and a stronger step with a smaller estimate remains, write 3 does the same, capped at the best so far.
   - An `OutputLimit` from a capped write means that attempt lost: the best file so far is kept and the search ends.
   - Each write uses its own fresh qpdf (and its raw-data pass its own batches), released before the next pass; only the best file is kept between writes.
6. **Answer.** Any written file at or under the target is given (the mildest that fits), **whatever it saves**. When none fits, the smallest written is given only when at most `keepBelow` (99%) of the input; otherwise `[]`, the "no new file" outcome.

A file with no candidate has one write and no measuring. The answer is always judged by the written file's real size, never the estimate.

**Same bytes when measured and written.** Measuring and writing call the same `decodeJpeg`, `encodeJpeg` and `shrinkLossless` in one fresh worker, so the encoder is the same. A difference is still harmless: `F1` uses real lengths, and every decision after write 1 uses the written size.

**Why not a binary search over writes:** with seven steps it needs three writes and three raw passes every time; the measuring pass costs one pass and encodes at sizes well below the original. **Why not keep encoded copies:** on a 100 MB scan file they add up to several times the pictures' data.

### 7. Progress, memory and time

- **Progress:** "Reading the file"; while measuring, "Picture N of M" (`working`, unit `picture`, the shared bar from 20% to 80%); then "Writing the compressed file" (`writing`) with percents from 75 up, so the bar continues from 80% and never goes back: write 1's pass 75 to 86, its qpdf write 86 to 90 (qpdf's `--progress` lines through `cappedWrite`, scaled), a second write 91 to 95, a third 96 to 98; no 100%. Cancel ends the worker at any point.
- **Memory:** the input, one qpdf with the file, one raw batch (at most 32 MB, or one larger picture alone), one decoded picture (at most 50 million pixels) and one canvas at a time, the size table (seven numbers per candidate, at most 10,000), and between writes the best output (capped). With lossless pictures kept lossless there is no lossless picture on a canvas and no extra copy of its pixels. Ceiling: Add page numbers' on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium), as for Resize.
- **Time, measured in task 3.3:** `compress-scans.pdf` for each target; `make-large.mjs --scans` (about 100 MB of 300-to-the-inch JPG scans, written outside the repo) for 100 KB and 2 MB; `make-large.mjs --lossless` (about 100 MB of lossless scans with a PNG predictor) for 2 MB; the existing 100 MB file (a random-bytes attachment, no picture: one write); the 120,000-page file (no picture: one write). **Budget:** each 100 MB file under 5 minutes in desktop Chromium, at most three writes, peak under the ceiling. If over, the change is updated before the pull request (first lever: measure only steps 1, 4 and 7 always; second: a lower `pixelWorkBudget`).

### 8. The page target size (shared, riding along)

`ToolWidgetWords` gains an optional `sizeTarget: { overAdvice: string }`. Its preset key is always `target`. The registry test fails unless every page of a tool with `sizeTarget` has `preset.target` naming a key of `sizeTargets`, no other tool's page sets `target`, and each page's heading, sentence, title and `actionLabel` contain its target's label. `src/widget/target.ts` (plain functions, tested in Node) holds the rules and fixed words, composed with the label; `useToolRun` and `ToolWorkspace` join its hold through `holdErrorId`, and `Result` takes its heading and over-target lines. No new component; `options.ts` is not changed.

- **Already at or under it** (`heldByTarget(size, target)`): decided from the picked file's size at the pick, before any password is asked. The file is still sent to the worker and read as every pick is, so the requests after a pick stay the same for every file, but for a held file a "password needed" answer shows no password field, so a protected file under the target is never asked for its password. The row shows the file; the main button is unavailable with the sentence tied to it: "report.pdf is already 200 KB or smaller, so there is nothing to do here. You can use it as it is." The name is shown as text. The visitor can choose another file. A damaged file under the target shows the shared damaged notice alone, not the hold sentence: the file cannot be used either way, and the damaged words say why.
- **Under the target:** heading "Your file is now 200 KB or smaller"; the shared "was" line.
- **Over the target:** heading "Your file is still over 200 KB"; "The smallest file this tool could make is 312 KB, which is over 200 KB." (the byte rule, decision 2); the tool's `overAdvice`; Download, the name and the "was" line, whose new size uses the same form as the sentence. Focus moves to the heading, which is announced with the sentence.
- **No smaller file:** the tool's `noSmaller` words.

**The home filter** (a shared change, its own task line): `matchesPhrase` in `src/tools/filter.ts` also compares the phrase and the words with spaces removed, so "200kb" finds "Compress PDF to 200 KB". It changes no other match a visitor would miss; `filter.test.ts` gains cases.

### 9. What the file keeps, and passwords

As Compress PDF: pages, text, drawings, fonts, links, form fields with their values, bookmarks, attached files, tags and the document's details are kept, and decoded content streams are not changed; qpdf packs the file tighter without loss. Earlier saved versions inside the file are not kept and a digital signature stops being valid. **Passwords and restrictions are kept** (`writeUpdate` with the password), as Compress PDF; the open owner question "Compress PDF keeps passwords" decides both. The size check is on the written, encrypted file.

### 10. The registry entry and the words

```
id: 'compress-to-target', group: 'smaller', runsIn: 'browser', phase: 2,
accepts: ['application/pdf'],
related: ['compress-pdf-to-200kb', 'compress-pdf-to-500kb', 'compress-pdf-to-1mb',
          'compress-pdf', 'delete-pdf-pages', 'split-pdf'],
```

Each page shows the related links but itself: the 200 KB, 500 KB and 1 MB pages show five, the 100 KB and 2 MB pages six. Delete pages and Split PDF are what the over-target advice suggests.

| Page | Name | Title | Heading | Description |
| --- | --- | --- | --- | --- |
| `/compress-pdf-to-100kb` | Compress PDF to 100 KB | Compress a PDF to 100 KB in your browser - PDFkaro | Compress a PDF to 100 KB | Make a PDF 100 KB or smaller for a strict upload limit, by shrinking its pictures step by step. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-200kb` | Compress PDF to 200 KB | Compress a PDF to 200 KB in your browser - PDFkaro | Compress a PDF to 200 KB | Get a scanned PDF down to 200 KB or smaller for an online form, by shrinking its pictures. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-500kb` | Compress PDF to 500 KB | Compress a PDF to 500 KB in your browser - PDFkaro | Compress a PDF to 500 KB | Make a PDF 500 KB or smaller, shrinking only its pictures and keeping text and drawings as they are. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-1mb` | Compress PDF to 1 MB | Compress a PDF to 1 MB in your browser - PDFkaro | Compress a PDF to 1 MB | Bring a PDF of photos or scans to 1 MB or smaller by shrinking its pictures until it fits. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-2mb` | Compress PDF to 2 MB | Compress a PDF to 2 MB in your browser - PDFkaro | Compress a PDF to 2 MB | Make a large PDF 2 MB or smaller, with pictures kept as sharp as the size allows. The file stays on your device and is not uploaded. |

Titles 48 to 50 characters, descriptions 132 to 151. Each page: summary "Make a PDF <label> or smaller.", sentence "Make a PDF <label> or smaller. Your file stays on your device.", preset `{ target: '<key>' }`, `actionLabel: 'Compress to <label> and download'`.

Tool words: picker "Choose a PDF file", "Choose another file", the shared drop hint, `acceptsName: 'a PDF'`, `writingLabel: 'Writing the compressed file'`, `doneHeading: 'Your compressed file is ready'` (never shown: every page has a target), `failedHeading: 'The compression did not finish.'`, `tooFewFiles: 'Choose a PDF file to compress.'`, `outputSuffix: 'compressed'` (a name with the size would be false over the target), one file, `resultPages: 'input'`, `memoryAdvice: 'Try on a computer, or split the file first and compress the parts.'`, `items: 'files'`, no item controls, `outputs: 'one'`, `resultWas: true`, `sizeTarget`, `noSmaller`, result notes. Drafts:

- `overAdvice`: "To get under {target}, remove pages you do not need, or split the file and send it in parts."
- `noSmaller`: heading "This file could not be made smaller."; advice "Its pictures are already small, or of a kind this tool leaves alone, and text, drawings and fonts keep their quality, so they cannot be made much smaller. To get under the limit, remove pages you do not need, or split the file and send it in parts."
- Result notes: "Pictures that were made smaller can look less sharp up close. Text, drawings and fonts keep their quality." / "Pages, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid." / "If the file had a password or restrictions, it still has them."

**Hub words** ("Make smaller and fix", drafts): description "Make a PDF smaller, or small enough for an upload limit, by shrinking its pictures in your browser. The file stays on your device and is not uploaded." (150 characters); sentence "Tools that make a PDF file smaller, or small enough for an upload limit."; title unchanged; `claimsDevice` stays true.

**Text below each page.** `SPEC.md` forbids pages "that are the same text with one word swapped". Each Markdown file is written for its own size, 250 to 500 words, marked as a draft:

- **100 KB:** what fits in 100 KB, why a long scan may stay over and what the smallest-file result means, removing pages first;
- **200 KB:** scanned forms and certificates, how a scan's pictures are shrunk, colour against grey scans;
- **500 KB:** documents with a few photos, what keeps its quality, why the size can land well under 500 KB;
- **1 MB:** photo-heavy files and slides, the pictures left as they are, the order of steps;
- **2 MB:** large reports, why a file far over 2 MB may not fit (fonts, attachments), Compress PDF as the other way.

Each also says, in its own words, how the thousands are counted, that the file is not uploaded, that a password is kept, and the signature. **The shared-text test:** in each file every target label and number ("100 KB", "100,000", "1 MB", "1,000,000" and the like) is replaced by one token; the text is split into words, and any run of eight words found in two files fails the test, steps and questions included. It also checks 250 to 500 words, the banned words, "100%" and exclamation marks.

**SEO.** Each page has its own canonical, Open Graph tags, `WebApplication` and `BreadcrumbList` (Home, Make smaller and fix, the page) and a sitemap entry; `check:seo` already fails on a duplicated title or description. Compress PDF's related links gain `compress-pdf-to-200kb` (six links); that is a registry line, not Compress PDF's code.

### 11. Requests, page weight and WebAssembly

`loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, as Compress PDF. qpdf's WebAssembly is fetched after a pick, never on page load. The job fetches the engine and the shared chunks it imports, as built: the `shrink` chunk (a file of its own once two engines import it; `resample` likely joins it), the `plain` chunk (which holds `qpdf-json`), `picture`, `inspect` and `option-values`, plus qpdf, `fflate`, the worker and the workspace. The no-upload allowlist is read from the build, never typed. `target.ts` adds well under 1 KB gzip to the widget; each page stays under 100 KB (`npm run weigh`).

Named in the pull request, as the uniform-requests rules require:

- **Whether a job starts depends on the file's size:** a file at or under the target is held, so no job set is fetched for it. The pick set is fetched as for every file. The size is not file content sent anywhere, but the requests differ by it.
- **The number of qpdf instances** (one dictionary read, a batch reader per 32 MB in each raw pass, one per write) depends on the file; under the named no-cache exception (one WebAssembly request per qpdf instance, entry 24) the number of WebAssembly requests does too, as for Compress PDF.

`uniform-requests.spec.ts` covers each page with inputs over that page's target, generated by `tests/e2e/target-files.ts` into a temporary folder and served by the host-log harness from there (none committed; files over 2 MB reach it this way), and listed in `tool-files.ts`:

- under the target after compressing (`expect: 'done'`): a scans file a little over the target;
- over at the floor (new `expect: 'over'`): a JPG page plus a random-bytes attachment larger than the target;
- a packed text-only file over the target (`expect: 'no-file'`);
- a protected scans file with its password (`expect: 'done'`);
- a failing job (the shared `failingJob`, padded over the target where it is under);
- a held row (`text.pdf`, pick only, the main button unavailable).

Other tools' no-upload forbidden lists add `/compress-to-target-/` and the `shrink` chunk.

## Threats considered

- **A malicious PDF:** Compress PDF's protections (capped dictionary JSON, 32 MB batches, frame checked before decoding, capped inflate, encoder output walked, 50 million pixels a picture, `qpdf --check`). New here: the **pixel-work budget** (12,000,000,000 JPG-pixel units a job, lossless pixels weighted by 10, both calibrated; decision 5), planned from dictionaries before any raw data is read; the 4 KB floor on stated and real lengths; no picture without a stated length; at most 10,000 candidates; at most three writes; a picture that throws is skipped in every pass.
- **A crafted file that makes the estimate wrong:** at most two extra writes, each capped at the target or the best so far; `OutputLimit` ends the search with the best file.
- **An oversized output:** every write goes through `cappedWrite` (write 1 at `2 × input + 16 MB`).
- **An oversized file:** the shared 100 MB notice; memory as decision 7; Cancel ends the worker.
- **A hostile file name:** never reaches the engine; the hold sentence shows it as text; the output name is built by shared code.
- **A password:** only through `passwordArgsFor`, never in an error or log; a file under the target is held before its password is asked.
- **The page's target:** a fixed preset in the built page, checked by `acceptedTarget`.

No server, so no SSRF or macro threat.

## Tests

- **Unit, engine** (`tests/unit/compress-to-target.test.ts`, Node, the browser's qpdf, `@napi-rs/canvas`; `globalThis.fetch` replaced by a function that throws and records, asserted never called; qpdf writes counted). Most fixtures are under 100 KB, so `shrinkToBytes` is also called with targets of a half and a tenth of each fixture's size:
  - **the invariant**, over every fixture and every target and both fractions: the output is at or under the target, or else the smallest written and at most 0.99 × input, or `[]`; `qpdf --check` passes (with the password where needed); two exact checks of the estimate: each picture's measured size equals the length handed to `writeUpdate` for it in the write pass, and `estimate(chosen step, F1) === L1`;
  - a 2% check of `F0`, only on JPG-only files made in the test and already written by qpdf with `losslessOptions`: `estimate(chosen step, F0)` within 2% of `L1`;
  - steps: JPG-only files made in the test answered at step 1, 4 and 7 with exactly one write (`writes === 1`, `step` as expected); a file whose estimate is off, written two and three times, never more; the chosen step already the smallest estimate, with no further write; `OutputLimit` on write 2 keeping write 1;
  - **fitting files kept:** an input just over the target whose rewrite fits but saves under 1% is given;
  - lossless pictures scaled and still lossless at every step, never a JPG, soft masks byte for byte;
  - the floor giving the smallest file over the target; an input under the target giving `[]`; no candidate, one write; a packed text-only file over the target giving `[]`;
  - **the pixel budget:** `plan` with numbers (no cut under the budget; steps 1, 4 and 7 only; then the smallest dropped, ties by object number; lossless weighted); then the small JPG file and the grey lossless file (decision 5), run with a small `budget` and counting stand-ins for the decoder and canvas, each asserting the plan cut to steps 1, 4 and 7 and then by dropping the smallest, the counted decodes plus encodes within the budget, and the job ending;
  - the 4 KB floor on real length; no stated length left alone; the 10,000 limit; a picture that throws skipped in every pass;
  - `compress-kinds.pdf`'s left-alone pictures; `compress-password.pdf` keeping password and restrictions; an unknown or missing target refused before reading; `multilingual.pdf`, `rich.pdf`, `form.pdf`, `tagged.pdf` with decoded content streams (`pageStreams`) and text kept; progress never going back; the three bombs; no error holding the password or document text.
- **Unit, shared:** `target.test.ts` (the hold, both headings, the byte rule's cases in decision 2); `filter.test.ts` ("200kb" finds the 200 KB page); the registry (entry, five pages, labels in the words, the `sizeTarget` preset rule, catalogue order); the shared-text test; the `check:worker` rule against engine-to-engine imports.
- **End to end** (`tests/e2e/compress-to-target.spec.ts`, 360px and 1280px): each page's words; on the 200 KB page a scans file from pick to Download, "Picture N of M", the bar never going back, the download checked with qpdf and PDF.js and at most 200,000 bytes; on the 100 KB page an over-target result, asserting the sentence's size and the "was" line's new size are the same text; `text.pdf` held, with no password asked for a small protected file; a packed file with "This file could not be made smaller."; damaged, not a PDF, password, Cancel, failures from a stand-in engine, the notices, keyboard only.
- **No upload:** on the 200 KB page a protected file made in the test (`qz7report.pdf`, over 200 KB through a large photo, `SECRET-` strings in its text, a link, a field and a picture's details); and an unprotected run on the 100 KB page through the floor path (over-target result, download made); both with the allowlist read from the build.
- **Performance:** listing and compressing a scans file on the 200 KB page blocks the page for no more than 100 ms at a time.

## Risks / Trade-offs

- **Time on large scans:** measured in task 3.3, with the levers in decision 7.
- **Encoders differ between browsers,** so a file may land on a different step in Firefox and Chrome; the answer is always judged by the real file.
- **The floor may leave long scans, or lossless-heavy files, over 100 KB** ("give the smallest, say so"; lossless pictures stay lossless by the owner's word).
- **The pixel budget can leave some pictures alone** on very large files; the result is still checked against the target and worded truthfully.
- **A milder step may not be tried** when write 1 fits and no milder estimate fits within 99%.

## Found while building

- **`shrinkLossless` split into a decode and an encode step** (stage 1 note, task 2.0 added at the build): `decodeLossless(raw, candidate, Inflate)` checks the zlib header, inflates with the cap at exactly its size and undoes any predictor; `encodeLossless(decoded, size, Deflate)` scales down and deflates, and refuses a size larger than the picture. `shrinkLossless` is the two composed, with the same checks in the same order. Compress PDF's code is unchanged, and its output was compared on every fixture before and after: byte for byte the same apart from the trailer `/ID` qpdf writes afresh, the three encrypted outputs compared after decrypting with qpdf `--static-id`; the files that give no file or fail give the same outcome.
- **`plan` takes each step's pixel limit,** `plan(candidates, limits, budget)`, not the page: the seven limits come from `pixelLimit(objects, ppi)` with each resolution of the ladder (never a number from the file), so the plan, the measuring and the writing read the same limits.
- **A lossless picture no measured step scales costs nothing and is never inflated:** scaling is the only thing done to it (quality does not apply, and qpdf's `--recompress-flate` already deflates every stream again), so its size at every step is its raw length. So the lossless budget test (decision 5) uses a page of 72 points on which every step scales its 300 by 300 pictures, not a page large enough that no step scales them: on such a page the plan would be zero and nothing would be cut.
- **The JPGs in the budget tests are real flat JPGs**, as a real encoder writes them, padded with a comment segment to vary their lengths, in place of frames with no tables: `qpdf --check` decodes JPGs, and refused a JPG with no quantization table, so the job ended at the check before the replace-and-write path. The canvas stand-in's tiny JPG of the size asked for is a real flat JPG for the same reason (cached by size). The decoder stand-in still decodes nothing and the canvas still draws nothing; both count calls and pixels.
- **A real length under the stated one, and no stated length, are tested through qpdf's dictionary JSON:** qpdf refuses to read a stream whose `/Length` disagrees with its data (and one with no `/Length`), so a file cannot carry either. The tests change the dictionaries' JSON as qpdf hands it over, as a crafted file could state it, and show the picture left alone, never decoded.
- **The 10,000-candidate test is slow:** 32,000 pictures (about 50 MB) are read in 160 batches of 200, each by a fresh qpdf, in the measuring pass and the write. It takes about 2 to 2.5 minutes alone; its timeout is 10 minutes.
- **`shrink.ts` is a built file of its own,** `shrink-*.js`, now that two engines import it, with `resample.ts` inside it. Compress PDF's job fetches it too: one more file in Compress PDF's job set, the same on every Compress PDF job. `page-weight.mjs` names it; `check:worker` looks for its sentence in the worker file. After a pick, at most 2,026.5 KB is fetched (was 2,014.5).
- **`check:worker` also refuses a shared file under `src/engines/` that imports from `tools/`** (the stage 1 note asked for it if small): eleven lines beside the engine-to-engine rule.
- **The engine imports `qpdf.ts`** (for `OutputLimit`), besides the modules task 2.2 lists; `qpdf.ts`'s chunk is already loaded with qpdf.
- **A write stopped by its cap counts as a write** in `writes` (it ran), and ends the search with the best file so far.
- **The shared failing-job file does not fail here:** `compress-json-bomb.pdf` passes the dictionary cap, so no picture is measured, and it is written once and gives no new file, as on Compress PDF. It is still run on every target page, padded over the target with a random-bytes attachment (qpdf `--add-attachment`) where it is under. A job that fails in the browser is covered by the end-to-end tests with a stand-in engine.
- **The files over each target** are made by `tests/e2e/target-files.ts` once into one temporary folder (`pdfkaro-target-files-v1`), each written under a process's own name and then moved into place, and picked from disk; `host-log.ts` needed no change.
- **A held file shows nothing while it is read,** as every file's main button waits then; the sentence appears once the file is read, or once it is known to need a password (then no field). The status line says the row and the sentence together.
- **The over-target "was" line, when the old size would read the same as the new one,** says both in bytes, so the difference shows and the sentence and the line still name the same size (`overResult` in `target.ts`).
- **`Result` gains a `sentence`,** shown under the heading and tied to it, and shows `advice` beside a file when there is a sentence; no new component.
- **Measuring and writing decode a JPG at the step-1 size,** and every step's encode draws from that, in both passes, so each picture's measured size is the length handed over for it (the exact check holds on every fixture in Node).
- **Calibration (task 3.3): the budget and the weight are kept,** `pixelWorkBudget` 12,000,000,000 and `losslessPixelCost` 10. The hostile JPG file (17 JPGs of 49 million pixels, planned at 11,662,000,000) took 90 s in desktop Chromium with one write, about 160 s with the three writes the plan allows; the lossless worst case (6 pictures of 49 million pixels, every step scaling them, planned at 11,881,736,640) took 56 s. Every 100 MB file finished under 5 minutes (the slowest, the lossless scans, 110 s) and every peak under the ceiling. Figures in tests/fixtures/README.md.
- **The phone figure comes from imitating a slow CPU, not from real throttling:** Chromium's `Emulation.setCPUThrottlingRate` reaches the page, not its workers ("Operation is only supported for pages, not workers"). The slowed runs instead pause every renderer process and let it run again in turn, one part in four of each 20 ms; jobs took 3.2 to 3.5 times as long as unslowed (measured, not assumed). A real phone is still to be timed (issue #7). **Over a limit, recorded, not changed:** at that factor the hostile JPG file takes 303 s, just over 5 minutes with one write, about 9 minutes with three. The 5-minute budget is for desktop Chromium, which it meets, and the page promises no time; a lower budget is the lever if the owner or the panel wants phones held to it too.
- **The hold lives in `ToolWorkspace` only** (decision 8 and task 4.1 named `useToolRun` too): it is decided in the render from the listed file's size and the page's target (`heldFile` in `target.ts`), and its sentence is tied to the main button as the shared "why not" sentence; `useToolRun` is unchanged.
- **The target pages' uniform-requests inputs are built in `uniform-requests.spec.ts`** from `target-files.ts` (`targetInputs`); `tool-files.ts` is unchanged.
- **Words changed at stage 2 (design, privacy):** result note 1 is "Pictures that were made smaller can look less sharp up close. Text, drawings and fonts keep their quality."; the over-target advice keeps only the one thing to try, "To get under {target}, remove pages you do not need, or split the file and send it in parts.", with `{target}` replaced by the page's label (`overAdviceFor` in `target.ts`); the 100 KB text says that at the floor small print in a scan can become hard to read; the texts say "The file, its name and any password are not sent anywhere." or the like. The Privacy page draft gains two sentences (decision 11): a held file starts no job, and when a job's programs are fetched GitHub can tell the file was larger than the page's size, but not its contents, name or exact size.
- **A picture that cannot be redone in a write leaves the measured set** (stage 2, code review): when the write pass throws for it, or gives it back at its raw length though it was measured smaller, it is written at its raw length and taken out of the sizes, so its raw data counts in F and later estimates stay honest. Write 1's result is held only as the best file (stage 2, architecture).
- **Left for later, not fixed here:**
  - a cap on the number of scans in a progressive JPG before the browser decodes it (security; it affects Compress PDF too);
  - one shared output-limit helper for the one-file writers (Protect, Remove a password and this tool);
  - `shownBytes` in `target.ts` reusing `format.ts`'s rounding rather than repeating it;
  - the main button's padding at 200% text on a 360-pixel screen (shared by every tool);
  - full stops in headings (the no-smaller-file heading has one, the result headings have none; shared).

## Open Questions

For the owner, each going ahead on its default (listed in the pull request and added to "Questions waiting for the owner"):

1. The target is fixed by each page, with no choice of target on the page. Default: fixed.
2. The floor of 72 pixels to the inch and quality 40. Default: keep.
3. A target counts in thousands (200 KB = 200,000 bytes). Default: keep.
4. A file already under the target is not compressed, and the button says why. Default: keep.
5. The 1% line: a file that fits the target is always given, whatever it saves; a file still over the target is given only when at least 1% smaller than the original, else "no new file". Default: keep.

Answered at stage 1: lossless pictures are never saved as JPGs (owner, 24 Nov 2026).

Also touched: "Compress PDF keeps passwords", "Grey scans as colour JPGs", "Signed files", "Shared pieces in tool pull requests", the hub drafts.
