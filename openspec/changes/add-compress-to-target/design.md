# Design

## Context

See `proposal.md` for why Compress to a target size is next and what the owner decided on 24 Nov 2026.

**Order.** Compress PDF's picture steps move first out of `src/engines/tools/compress-pdf.ts` into `src/engines/shrink.ts`, in their own pull request with no change in behaviour (as `pages.ts` came out of `stamp.ts` before Resize, entry 27): `canShrink`, `pictureContext`, `pixelLimit`, `newDictionary`, `shrinkJpeg`, `shrinkLossless`, `zlibDeflate`, `statedLength`, the `Candidate`, `PictureContext`, `PictureDecoder`, `DeflateClass` types and the limits (`pixelsPerInch`, `jpegQuality`, `jpegSaving`, `maxPixels`, the allowed keys). `compress-pdf.ts` keeps `run`, `loads`, `losslessOptions`, `keepBelow` and re-exports nothing. Called "the picture-steps move" below. It needs no OpenSpec change (no change in behaviour), goes through the review panel's stage 2, gets its own line in "Where the project stands", and its tests are Compress PDF's, unchanged, plus Compress's output on every fixture compared byte for byte before and after. Without it, this tool's engine would import another tool's engine file, which `check:worker`'s "each engine is its own file" rule is there to stop.

What exists and is reused:

- **The one-file tool flow** with no options, as Compress PDF has it: the row with the first page's thumbnail, no summary line, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices, Cancel, "Go back to your file", the result with the "was" size (`resultWas`), and the "no new file" outcome (`noSmaller`, `[]` from the engine).
- **Page presets** (`ToolPage.preset`, documented in the registry as "Options already chosen when this URL opens, such as a target size"), sent with every job, as PDF to JPG and PNG use them; the registry test already refuses an option key a preset uses, "so a choice never replaces what the page promises".
- **Page words** (`PageWords`, merged by `pageWords` in `queries.ts`): each page may name its own main button and result notes.
- **Compress PDF's picture work** (in `shrink.ts` after the move): candidates read from dictionaries only (`readDictionaries`, capped at 64 MB of JSON), raw data in bounded batches (`rawBatches`, `readRawStreams`, 32 MB a batch, each batch a fresh qpdf), a JPG's own frame checked against its dictionary before the browser decodes it, lossless data inflated with a cap at exactly its size, the encoder's output checked before it goes in, and `writeUpdate` with `losslessOptions`, which keeps a password and restrictions and runs `qpdf --check`.
- **`acceptedValue`** and `optionValues` in `src/widget/option-values.ts`, read by engines to check what they are sent.
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`).

## Goals / Non-Goals

**Goals:**

- A file at or under the page's target, by lowering picture resolution and JPG quality step by step, keeping pictures as sharp as the target allows (the owner's "pictures only").
- When the target cannot be reached, the smallest file made, with its size and that it is over the target (the owner's "give the smallest, say so").
- Few full writes: every picture decoded at most once per pass, the step chosen from measured sizes, at most three qpdf writes.
- Memory no higher than Compress PDF's on the same file, plus a table of numbers.
- Five pages whose words are each written for their own size.
- No dependency, no new component, no new option kind.

**Non-Goals:**

- Turning pages into pictures, touching text, drawings or fonts, removing anything that is not a picture's own data.
- A target the visitor types, a target choice on the page, other targets.
- Pictures Compress PDF leaves alone.
- Telling, before the main button, whether the target can be reached.

## Decisions

### 1. One new tool with five pages, sharing Compress PDF's picture steps

Options considered:

- **Five pages of Compress PDF** (the `compress-pdf` entry gaining pages with presets): one widget's words serve all its pages, and Compress PDF's words ("could not be made smaller" below 1%, no target, its 10% rule) do not fit a target page; `SPEC.md` lists the tool as its own catalogue row, and the registry's catalogue order would put five Phase 2 pages inside a Phase 1 entry. Rejected.
- **Five tools:** five registry entries for one engine, against "one tool with preset pages". Rejected.
- **One new tool, `compress-to-target`, five pages, each preset `{ target: '<key>' }`** (chosen), as PDF to JPG and PNG are one tool with two presets (the agent's choice of 16 Nov 2026, after the owner's Image to PDF decision). Its engine is its own file, `src/engines/tools/compress-to-target.ts`, importing the shared picture steps from `shrink.ts` (after the picture-steps move).

**Target fixed by the page, no choice.** `SPEC.md` says each page "opens the compressor with that target already selected". A choice whose first value is the page's own would need a new shared piece (an option whose initial value a page sets), and the registry test refuses an option key that a preset uses so that a page always does what its address says. A visitor who needs another size follows a related link to that page. Owner question 1.

The tool sits in the registry right after `compress-pdf`, before `pdf-to-images`: its catalogue place is second under "Make smaller and fix", and the order test counts it there. Its pages are listed in size order on the home page and on `/make-smaller-and-fix`.

### 2. A target is bytes, counted in thousands, written once

`src/widget/option-values.ts` gains:

```
sizeTargets = {
  '100kb': { bytes: 100_000, label: '100 KB' },
  '200kb': { bytes: 200_000, label: '200 KB' },
  '500kb': { bytes: 500_000, label: '500 KB' },
  '1mb':   { bytes: 1_000_000, label: '1 MB' },
  '2mb':   { bytes: 2_000_000, label: '2 MB' },
}
```

and `acceptedTarget(value)`, giving the entry for an own key or `undefined` (as `acceptedValue` does, `Object.hasOwn` only). The engine refuses a missing or unknown target before it reads the file, with a fixed error (`engine` failure).

**Why thousands:** upload forms count "200 KB" as 200,000 or 204,800 bytes, and the visitor cannot know which. 200,000 bytes fits both. The site shows sizes in 1024s (`format.ts`), so a result of 199,000 bytes reads "194 KB", under the label either way. The other direction can mislead: a file of 203,000 bytes reads "198 KB" but is over 200,000 bytes. So whenever the page says a size is over a target, and the size in the shared format would read as the target's number or less, it is written in bytes with the shared thousands separator ("203,000 bytes"), the finer form Compress PDF added for sizes that would read the same. A file of 203,000 bytes is also not "already under" the 200 KB target (decision 7), and the text below the tool explains why a file the site shows as 198 KB is still compressed. Owner question 4.

### 3. Which pictures change

Exactly Compress PDF's candidates (`canShrink`, unchanged): an image XObject, 8 bits, `/DeviceGray`, `/DeviceRGB` or an RGB ICC profile, `/DCTDecode` with no `/DecodeParms`, or `/FlateDecode` with none or a matching PNG predictor, no key outside the allowed list (so no `/Decode`, `/Mask`, `/ImageMask`, `/Alternates`, `/OPI`), not itself another picture's `/SMask` or `/Mask`, a soft mask (if any) without `/Matte`, at most 50 million pixels. Two limits are added, so a hostile file cannot multiply the work by sheer count (security):

- a picture whose stated data length is under 4 KB is left alone (at the floor it could save almost nothing, and a page of thousands of tiny pictures would cost thousands of canvases per step);
- at most the 10,000 largest candidates by stated length are worked on; the rest are left alone.

**Left alone, as in Compress PDF, and said on the page:** CMYK, indexed colours, grey with a colour profile (its tone could shift), 1-bit scans (CCITT, JBIG2), JPEG 2000, 16-bit, inline pictures, pictures with unusual keys, and masks and soft masks themselves. Converting CMYK or indexed pictures would change their colours or need our own decoders; inline pictures sit inside content streams, which "pictures only" leaves alone. A soft mask is never scaled: a picture and its soft mask may have different sizes without `/Matte` (ISO 32000-2, 11.6.5.3), which `canShrink` already requires.

**Pictures stored without loss** (screenshots, drawings, some scanners): in steps 1 to 7 they are scaled down and stored without loss again (`shrinkLossless`, at the step's resolution; quality does not apply). The owner named "resolution and JPG quality"; saving a lossless picture as a JPG changes its kind and can blur sharp edges, so it is kept for when nothing else fits: steps 8 to 14 repeat steps 1 to 7 and also save lossless pictures as JPGs at the step's quality, through the same canvas encoder, never one with a soft mask (a sharp mask over a blurred JPG shows halos at its edges). A grey `/DeviceGray` picture comes back from the canvas as an RGB JPG whose pixels stay grey, and its colour space becomes `/DeviceRGB`, as Compress PDF does with grey JPGs; an RGB ICC picture keeps its profile. Owner question 2.

### 4. The ladder and the floor

The resolution is Compress PDF's: pixels to the inch across the file's largest page (`pixelLimit`, each page's crop box or media box scaled by its user unit), so the longer side of every picture is held to `ceil(longest page side / 72 × ppi)`. `pixelLimit` gains the resolution as an argument (150 when left out, so Compress PDF is unchanged).

| Step | Pixels to the inch | JPG quality | Lossless pictures |
| --- | --- | --- | --- |
| 1 | 150 | 75 | scaled, stay lossless |
| 2 | 150 | 60 | scaled, stay lossless |
| 3 | 120 | 55 | scaled, stay lossless |
| 4 | 100 | 50 | scaled, stay lossless |
| 5 | 100 | 40 | scaled, stay lossless |
| 6 | 85 | 40 | scaled, stay lossless |
| 7 | 72 | 40 | scaled, stay lossless |
| 8 to 14 | as 1 to 7 | as 1 to 7 | saved as JPGs, unless they have a soft mask |

Step 1 is Compress PDF's own setting, so a file Compress PDF already brings under the target is never made worse. At every step a JPG picture is scaled to the step's limit (if larger) and saved at the step's quality, and replaces the old one **only when smaller** (no 10% rule: here every byte counts); a lossless picture is replaced only when smaller.

**The floor is step 7's 72 pixels to the inch and quality 40** (step 14 for lossless pictures). At 72 to the inch a page's picture has one pixel per point, so a scanned page shows at its printed size on a screen with 10-point text about 10 pixels tall, still readable; below quality 40 JPG blocks start to break up small letters. Nothing goes lower: at the floor, the smallest file made is the answer, by the owner's decision. Owner question 3.

### 5. Finding the step: measure once, choose, write, check

A full qpdf write on a 100 MB file costs seconds and a copy of the file in memory, and each raw-data pass loads the file into a fresh qpdf per batch, so the search avoids trying steps by writing them.

1. **Read.** `acceptedTarget`; when the input is at or under the target bytes the engine gives `[]` (never reached from the page, which holds the button, decision 7). "Reading the file". `readDictionaries` once; candidates as decision 3. When the dictionaries cannot be read or no page has a usable box, or there is no candidate, skip to step 4 with no replacements (one write).
2. **Measure.** One raw-data pass (`readRawStreams`). For each candidate, in turn: decode it once (a JPG through the browser at the size step 1 allows, after `walkJpeg` checks its frame; a lossless one inflated with the cap and its predictor undone), then for each distinct step setting encode it and record only the byte length, `size[i][s] = min(raw length, encoded length)`. The decoded picture and every encoded copy are let go before the next picture. Encodes per JPG: seven (one per step); per lossless picture: five lossless sizes (150, 120, 100, 85, 72) and, unless it has a soft mask, seven JPGs. "Picture N of M".
3. **Estimate.** For each step `s`, `estimate(s) = F + Σ size[i][s]`, where `F` is everything but the candidates' data. Before any write, `F0 = input length − Σ raw length` (an upper bound in practice, as qpdf's lossless rewrite rarely grows the rest). The chosen step is the first, in ladder order, whose estimate is at most 99% of the target; when none is, the step with the smallest estimate (normally 14).
4. **Write 1.** A second raw-data pass encodes each candidate at the chosen step through exactly the same code as the measuring (`encodeAt` on the decoded picture, decision 5a), and `writeUpdate` writes and checks the file. Its length `L1` gives the real fixed part, `F1 = L1 − Σ (bytes written for each candidate stream)`, kept candidates counted at their raw length.
5. **Check, at most two more writes.**
   - `L1` at or under the target: if an earlier (milder) step `s'` has `F1 + Σ size[i][s'] ≤ 0.99 × target`, write the mildest such step once (write 2) and keep it if it fits; otherwise keep write 1.
   - `L1` over the target: the first later step whose estimate with `F1` fits is written (write 2); if that is also over, the step with the smallest estimate is written (write 3) when not yet written.
   - Of the files written, the result is the mildest one at or under the target; when none fits, the smallest. It is given only when it is at least 1% smaller than the input (as Compress PDF's `keepBelow`); otherwise `[]`, the "no new file" outcome.
   Only the current best file is kept between writes; a worse one is let go at once.

So a file reaches its answer with one dictionary read, one measuring pass and one to three write passes (each a raw-data pass, a qpdf write and `qpdf --check`). A file with no candidate has one write and no measuring.

**5a. Same bytes when measured and written.** Measuring and writing use one function per kind: `decodeForSteps` (the JPG decoded once at step 1's size, or the lossless samples) and `encodeAt(decoded, setting)` (drawn to a canvas at the setting's size with the same smoothing and encoded at its quality, or scaled by area averaging and deflated). Each job runs in one fresh worker in one browser, so the encoder is the same. A difference is still handled: write 1 uses real lengths for `F1`, and the check in step 5 uses the written file's real size, never the estimate. Compress PDF's `shrinkJpeg` decodes at its target size directly; it is rebuilt on `decodeForSteps` and `encodeAt` so its output is byte for byte as before (riding along, tested on every fixture before and after; if a byte differs, `shrinkJpeg` keeps its own path and only this tool uses the split, named in the pull request).

**Why not a binary search over writes:** with fourteen steps it needs four writes and four raw passes every time, each with a full copy of the file in qpdf; the measuring pass costs one pass and canvases at sizes well below the original. **Why not keep every encoded copy:** on a 100 MB scan file the copies for fourteen steps add up to several times the pictures' data; keeping only numbers holds memory to Compress PDF's.

### 6. Progress, memory and time

- **Progress:** "Reading the file"; while measuring, "Picture N of M" (`working`, unit `picture`, the shared bar from 20% to 80%); then "Writing the compressed file" as `writing` with percents from 75 up, so the bar continues from 80% and never goes back: write 1's pass from 75 to 88 (one step a picture), its qpdf write at 90, a second write's pass and write at 92 to 96, a third at 97 to 98; no 100% (as Compress PDF). Cancel ends the worker at any point (shared).
- **Memory:** at any time the input, one qpdf with the file, one raw batch (at most 32 MB, or one larger picture alone), one decoded picture (at most 50 million pixels, as Compress PDF) and one canvas at a time, the size table (14 numbers per candidate, at most 10,000 candidates) and, between writes, the best output so far. Peak no higher than Compress PDF's on the same file plus one output's size; the ceiling is Add page numbers' on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium), as for Resize.
- **Time, to be measured (task 3.3):** `compress-scans.pdf` for each target; a scans file of about 100 MB made by `make-large.mjs` with a new `--scans` mode (pages of 300-to-the-inch JPGs from the committed pictures, not committed), for 100 KB (floor, likely over) and 2 MB; `make-large.mjs`'s 100 MB file (an attachment of random bytes and no picture: one write, no smaller file); the 120,000-page file of `make-many-pages.mjs` (no picture: one write). **Budget:** the 100 MB scans file in under 5 minutes in desktop Chromium, at most three writes. If it takes longer, the change is updated before the pull request: measure only steps 1, 4, 7, 8, 11 and 14 and estimate the others between them (sizes fall smoothly with quality and pixels), with the writes still checking the real size.

### 7. The page target size (shared, riding along)

`ToolWidgetWords` gains an optional `sizeTarget: { key: string; overAdvice: string }`. The registry test fails unless every page of a tool with `sizeTarget` has a preset whose `key` value is a key of `sizeTargets`, and no tool without it has a preset with that key. The page's widget gets the target's bytes and label from `option-values.ts` (`targetOf(preset, words)` in `src/widget/target.ts`); the label is never typed in the registry. The words below are written once in `target.ts`, composed with the label and sizes, and are drafts for the owner.

- **Already at or under it.** Once the one file is read (after its password, if it has one), when its size is at or under the target's bytes, the main button is unavailable, with a sentence tied to it as Extract's is (`holdErrorId`): "report.pdf is already 200 KB or smaller, so there is nothing to do here. You can use it as it is." Focus goes where it goes for a one-file tool once read; the sentence is announced with the status line. The visitor can choose another file. A file name in the sentence is shown as text, never as markup (shared rule).
- **Under the target:** the result heading is "Your file is now 200 KB or smaller"; the line under the name is the shared one, "184 KB, was 1.4 MB, 3 pages"; the tool's result notes follow.
- **Over the target:** heading "Your file is still over 200 KB"; then "The smallest file this tool could make is 312 KB, which is over 200 KB." (the size in bytes when it would read as the target or less, decision 2); then the tool's `overAdvice`; then Download, the name and the "was" line, and the notes. Focus moves to the heading and the screen reader announces it, as for every result.
- **No smaller file:** the tool's `noSmaller` words, as Compress PDF's.

No new component: `ToolWorkspace` holds the button and `Result` takes an optional heading and over-target lines. `target.ts` is a plain module tested in Node.

### 8. What the file keeps, and passwords

As Compress PDF: pages, text, drawings, fonts, links, form fields with their values, bookmarks, attached files, tags and the document's details are kept; earlier saved versions inside the file are not, and a digital signature stops being valid. **Passwords and restrictions are kept**: the file is opened with its password and `writeUpdate` writes it with the same password and restrictions. Compress PDF does this, and the open owner question "Compress PDF keeps passwords" decides both; if the owner chooses to drop them, both tools change together. Encryption adds a few bytes per stream; the size check is on the written, encrypted file.

### 9. The registry entry and the words

```
id: 'compress-to-target', group: 'smaller', runsIn: 'browser', phase: 2,
accepts: ['application/pdf'],
related: ['compress-pdf-to-100kb', 'compress-pdf-to-200kb', 'compress-pdf-to-500kb',
          'compress-pdf-to-1mb', 'compress-pdf-to-2mb', 'compress-pdf'],
```

Each page links to the four other targets and Compress PDF (five links), never to itself (`relatedItems`).

| Page | Name | Title | Heading | Description |
| --- | --- | --- | --- | --- |
| `/compress-pdf-to-100kb` | Compress PDF to 100 KB | Compress a PDF to 100 KB in your browser - PDFkaro | Compress a PDF to 100 KB | Make a PDF 100 KB or smaller for a strict upload limit, by shrinking its pictures step by step. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-200kb` | Compress PDF to 200 KB | Compress a PDF to 200 KB in your browser - PDFkaro | Compress a PDF to 200 KB | Get a scanned PDF down to 200 KB or smaller for an online form, by shrinking its pictures. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-500kb` | Compress PDF to 500 KB | Compress a PDF to 500 KB in your browser - PDFkaro | Compress a PDF to 500 KB | Make a PDF 500 KB or smaller, shrinking only its pictures and keeping text and drawings as they are. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-1mb` | Compress PDF to 1 MB | Compress a PDF to 1 MB in your browser - PDFkaro | Compress a PDF to 1 MB | Bring a PDF of photos or scans to 1 MB or smaller by shrinking its pictures until it fits. The file stays on your device and is not uploaded. |
| `/compress-pdf-to-2mb` | Compress PDF to 2 MB | Compress a PDF to 2 MB in your browser - PDFkaro | Compress a PDF to 2 MB | Make a large PDF 2 MB or smaller, with pictures kept as sharp as the size allows. The file stays on your device and is not uploaded. |

Titles are 48 to 50 characters, descriptions 132 to 151. Each page: summary "Make a PDF <label> or smaller.", sentence "Make a PDF <label> or smaller. Your file stays on your device.", preset `{ target: '<key>' }`, page words `actionLabel: 'Compress to <label> and download'`.

Tool words: picker "Choose a PDF file", "Choose another file", the shared drop hint, `acceptsName: 'a PDF'`, `writingLabel: 'Writing the compressed file'`, `doneHeading: 'Your compressed file is ready'` (used only if no target applies, which the registry test makes impossible), `failedHeading: 'The compression did not finish.'`, `tooFewFiles: 'Choose a PDF file to compress.'`, `outputSuffix: 'compressed'` (`report-compressed.pdf`, as Compress PDF; a name with the size would be false when the result is over it), one file, `resultPages: 'input'`, `memoryAdvice: 'Try on a computer, or split the file first and compress the parts.'`, `items: 'files'`, no item controls, `outputs: 'one'`, `resultWas: true`, `sizeTarget: { key: 'target', overAdvice }`, `noSmaller`, and result notes. Drafts:

- `overAdvice`: "Pictures were made as small as they can go while staying readable. Text, drawings and fonts are not made smaller. To get under the limit, remove pages you do not need, or split the file and send it in parts."
- `noSmaller`: heading "This file could not be made smaller."; advice "Its pictures are already small, or of a kind this tool leaves alone, and text, drawings and fonts are not made smaller. The questions below say more."
- Result notes: "Pictures were made smaller until the file fitted, so they can look less sharp up close. Text, drawings and fonts are as they were." / "Pages, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid." / "If the file had a password or restrictions, it still has them."

**Hub words** ("Make smaller and fix", drafts): description "Make a PDF smaller, or small enough for an upload limit, by shrinking its pictures in your browser. The file stays on your device and is not uploaded." (150 characters); sentence "Tools that make a PDF file smaller, or small enough for an upload limit."; title unchanged. `claimsDevice` stays true: both tools run in the browser.

**Text below each tool (decision 9a).** `SPEC.md` forbids pages "that are the same text with one word swapped". Each of the five Markdown files is written for its own size, 250 to 500 words, marked as a draft, with its own steps and questions:

- **100 KB:** what fits in 100 KB (a page or two of scans, a short text file), why a long scan may stay over and what the smallest-file result means, the 1024 question, and removing pages first;
- **200 KB:** scanned forms and certificates, how a scan's pictures are shrunk, why the file may look softer, colour scans against grey ones;
- **500 KB:** documents with a few photos, what stays sharp (text and drawings), why the size can land well under 500 KB;
- **1 MB:** photo-heavy files and slides, why some pictures are left as they are (CMYK, scans in black and white), the order of steps;
- **2 MB:** large reports, why a file far over 2 MB may still not fit (fonts, attached files, text), Compress PDF as the other way.

Common to all, each in its own words: the file is not uploaded; passwords kept; signature. A unit test fails if any sentence of eight words or more appears in two of the five files, or a file is outside 250 to 500 words, and checks the banned words, "100%" and exclamation marks.

**SEO.** Each page has its own canonical (shared), Open Graph tags, a `WebApplication` and a `BreadcrumbList` (Home, Make smaller and fix, the page), and a sitemap entry; `check:seo` already fails on a duplicated title or description. Compress PDF's related links gain `compress-pdf-to-200kb` (six links).

### 10. Requests, page weight and WebAssembly

`loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }`, as Compress PDF. qpdf's WebAssembly is fetched after a pick, never on page load (shared). The page ships the same widget island as every tool; `target.ts` adds well under 1 KB gzip to the widget, and the page stays under 100 KB (`npm run weigh`). The engine chunk is loaded only by the job's worker. `uniform-requests.spec.ts` covers all five pages with the same sets.

## Threats considered

- **A malicious PDF:** everything Compress PDF already does: the dictionary JSON capped at 64 MB while qpdf writes it, raw data in batches of 32 MB, a JPG's frame checked against its dictionary before decoding, lossless data inflated with a cap at its exact size, the encoder's output walked before use, at most 50 million pixels a picture, `qpdf --check` on the output. New here: the count of candidates (10,000) and the 4 KB floor bound the measuring work, which is fourteen encodes a picture at most; the writes are capped at three; a picture that throws while measured is left alone at every step (size = raw length).
- **A crafted file that makes the estimate wrong** (streams that qpdf's rewrite grows, encoders that disagree): costs at most two extra writes; the answer is always checked by the written file's real size.
- **An oversized file:** the shared 100 MB notice; memory as decision 6; Cancel ends the worker.
- **A hostile file name:** never reaches the engine; the hold sentence shows it as text (React escapes it); the output name is built by the shared code.
- **A password:** only through `passwordArgsFor`, never in an error or a log; kept as Compress PDF keeps it.
- **The page's target from the address:** a fixed preset in the built page, checked by `acceptedTarget`; nothing from the address bar is read.

No server, so no SSRF or macro threat.

## Tests

- **Unit, engine** (`tests/unit/compress-to-target.test.ts`; the engine's own step `shrinkToBytes(file, targetBytes, …)`, which `run` calls with the page's target, is also called with targets of a half and a tenth of each fixture's size, as most fixtures are under 100 KB; Node, the browser's qpdf, `@napi-rs/canvas` for decoding and encoding as Compress PDF's tests do, `globalThis.fetch` replaced by a function that throws and records, asserted never called): every fixture with each target; the ladder in order (a file made in the test whose answer is step 1, step 4, step 7, a lossless picture that needs step 8 or later, and one with a soft mask that is never made a JPG); the floor reached, the smallest file given and over the target; an input under the target giving `[]`; a file with no candidate written once; no smaller file giving `[]`; the number of qpdf writes counted (one for a first-guess hit, at most three); measured and written sizes equal for every picture; the 4 KB and 10,000 limits; Compress PDF's left-alone kinds byte for byte (`compress-kinds.pdf`); `compress-password.pdf` keeping its password and restrictions; a missing or unknown target refused before reading; text and content streams kept (`multilingual.pdf`, `pageStreams`); progress never going back; no error holding a password or document text; the bombs (`compress-flate-bomb.pdf`, `compress-json-bomb.pdf`, `compress-bomb-attachment.pdf`) as Compress PDF.
- **Unit, shared:** `tests/unit/target.test.ts` (the hold, both result headings, the bytes rule); `pixelLimit` with a resolution; Compress PDF's output on every fixture byte for byte before and after the `shrinkJpeg` split; the registry entry, the five pages and the `sizeTarget` preset rule; the five texts.
- **End to end** (`tests/e2e/compress-to-target.spec.ts`, at 360px and 1280px): each page's heading, sentence, title and button; on `/compress-pdf-to-200kb`, `compress-scans.pdf` from pick to Download with "Picture N of M" and the bar never going back, the result under 200 KB checked with qpdf and PDF.js; on `/compress-pdf-to-100kb` a result over the target with its sentence and Download; `text.pdf` held as already under the target; damaged, not a PDF, password, Cancel, failures from a stand-in engine, the 100 MB and 20,000-page notices, keyboard only.
- **No upload:** the exact allowlist and secrets in a protected file made in the test (`qz7report.pdf`, over 200 KB, a `SECRET-` string in its text, a field, a link and a picture's details), as Compress PDF's; `/compress-pdf-to-*` in `uniform-requests.spec.ts` with the full PDF picks and jobs, `expect: 'done'`, `'no-file'` and the held case.
- **Performance:** listing and compressing `compress-scans.pdf` on the 200 KB page blocks the page for no more than 100 ms at a time.

## Risks / Trade-offs

- **Time on large scan files** (fourteen encodes a picture, two raw passes): measured in task 3.3, with the fallback in decision 6.
- **Encoders differ between browsers,** so the same file may land on a different step in Firefox and Chrome; the size check uses the real file, so the answer is always right for that browser.
- **The floor may leave long scans over 100 KB.** That is the owner's "give the smallest, say so"; the page says what to try.
- **Grey lossless pictures saved as JPGs become RGB JPGs,** like Compress PDF's grey JPGs (open owner question).
- **The result can be smaller than needed** when a milder step would have fitted but the estimate said no and the check in step 5 did not try it (at most one milder write is tried).

## Open Questions

For the owner, each going ahead on its default (listed in the pull request and added to "Questions waiting for the owner"):

1. Target fixed by each page, with no choice of target on the page. Default: fixed.
2. Lossless pictures may become JPGs, only after the seven lossless steps, never with a soft mask. Default: allowed.
3. The floor of 72 pixels to the inch and quality 40. Default: keep.
4. A target counts in thousands (200 KB = 200,000 bytes). Default: keep.
5. A file already under the target is not compressed. Default: keep.
6. The over-target result offered even when only a little smaller. Default: keep.

Also touched: "Compress PDF keeps passwords", "Grey scans as colour JPGs", "Signed files", "Shared pieces in tool pull requests", the hub drafts.
