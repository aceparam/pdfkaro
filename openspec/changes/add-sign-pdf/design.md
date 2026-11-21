# Design

## Context

- **The drawing step** (`src/engines/stamp.ts`, from `add-page-numbers`, reused unchanged by `add-watermark`, merged and archived in PR #22): `stampPages(tools, source, { prepare, draw, onPage, onWriting })` reads every page's shown box, turn and user unit as PDF.js reads them, has the tool draw one pdf-lib layer page per page (sized as shown, upright), places each layer as a form XObject through qpdf's JSON update with `/Contents` as `[q, own streams, Q, draw]`, holds the update and the output to `2 × file + 2 KB × pages + 16 MB` (`output-limit`), and writes with `--object-streams=generate` and `qpdf --check`. `prepare(doc, lib)` runs once per pdf-lib document of up to 2,000 layer pages. `fromPdfLib` writes an object whose JSON text it has already written under the same id, across runs. It draws on every page; there is no way to skip one.
- **The shared changes, merged first:** `add-option-conditions` (`when`, `shownOptions`), `add-drawing-option` (`DrawingOption`, `pad`, `optionDrawings`, `acceptedDrawing`, `DrawingRefused`, `DrawingPad`), `add-picture-option` (`PictureOption`, `optionPictures`, `pictureOutcome`, `acceptedPicture`, `PictureRefused`, `inspectPicture`, `PictureField`). With `add-text-option` (`TextOption`, `optionTexts`, `acceptedText`, `TextRefused`, `'standard-font'`) and `add-tool-options` (`ChoiceOption`, `optionValues`, `acceptedValue`).
- **Pictures:** `src/engines/picture.ts` reads a JPG or PNG without decoding a pixel and gives the parts that may go into a PDF with no details (`jpegForPdf`, `pngForPdf`, `pngDataFits`). Image to PDF's engine turns a picture by its camera turn with a table of eight matrices in its own `place`, and drops `/Decode` for a CMYK JPG with no Adobe segment.
- **Checked by experiment** (Node, the same qpdf and pdf-lib, through the unchanged `stampPages`):
  - a 2,100-page file in two runs: a PNG with a see-through background (`pictures/alpha.png`) decoded once with pdf-lib's `PngEmbedder.for` and put into each run's document with `embedIntoContext`, plus a Times Italic name and lines drawn with `moveTo`/`lineTo`/`stroke` and round caps and joins: `qpdf --check` passed, and the new file held **two** image objects (the picture and its soft mask), not four, as the identical objects of the second run were written once;
  - a 16-million-pixel PNG (4,000 by 4,000, a paper-coloured gradient with a pen stroke, 3.2 MB, as a photo of a signature on paper) on a 2,100-page file: pdf-lib 2.11.1's `flateStream` gives an already compressed raw stream with `/Filter /FlateDecode`, and `entryOf` writes those encoded bytes, so the update carried the picture compressed (the new file was 3.19 MB on the last page only, 3.37 MB on every page, from 0.83 MB) and not decoded. But `embedIntoContext` compressed the decoded pixels afresh in each run, about 1.5 s a run (3.1 s of a 4.7 s job), and the peak memory of the Node process was 0.47 GB. So the picture is compressed once per job (2b), and a run with no chosen page is skipped (2c);
  - a 4,100-page file in three runs, with the signature (2,000 points of lines and a Times Italic name) built as **one form XObject** in each run's `prepare` and placed by each layer: `qpdf --check` passed, the file held **one** signature form, and it grew by about 40 bytes a page (1.63 MB to 1.80 MB).
- pdf-lib's standard fonts draw characters outside their encoding as `?` without a word (`add-text-option`), which is why the engine checks the name with `acceptedText` first.

## Goals / Non-Goals

**Goals:**
- The signature, made one of three ways, upright at the chosen place of the chosen pages as a reader shows them, in its own shape, readable over pictures.
- Pages not chosen exactly as they were; everything Watermark keeps, kept by the same step.
- The signature written into the file once, whatever the number of pages it is on.
- No new dependency and no font in the file.

**Non-Goals:**
- Dragging the signature into place; any page but the first, the last or all; sizes, colours or fonts to choose; dates or initials; form signature fields; certificate signatures; background removal; other scripts in a typed name.

## Decisions

### 1. The registry entry

```ts
{ id: 'sign-pdf', group: 'edit', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  // Protect is linked once it is published.
  related: ['watermark-pdf', 'add-page-numbers-to-pdf', 'protect-pdf', 'merge-pdf', 'compress-pdf', 'jpg-to-pdf'],
  pages: [{ slug: 'sign-pdf', name: 'Sign PDF', summary: 'Put your signature on a PDF.',
            title: 'Sign a PDF in your browser - PDFkaro',
            description: 'Add your signature to a PDF: type your name, draw it or use a picture. The file stays on your device and is not uploaded.',
            heading: 'Sign a PDF',
            sentence: 'Put your signature on a PDF: type your name, draw it, or use a picture of it. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Sign and download', writingLabel: 'Writing the signed file',
            doneHeading: 'Your signed file is ready', failedHeading: 'The signature was not added.',
            tooFewFiles: 'Choose a PDF file to sign.', outputSuffix: 'signed',
            minFiles: 1, multiple: false, resultPages: 'input', items: 'files', itemControls: false, outputs: 'one',
            memoryAdvice: 'Try on a computer, or sign the last page only.',
            options: [
              { kind: 'choice', key: 'source', legend: 'How to add your signature', initial: 'type',
                choices: [{ value: 'type', label: 'Type your name' }, { value: 'draw', label: 'Draw it' }, { value: 'picture', label: 'Use a picture of it' }] },
              { kind: 'text', key: 'name', when: { key: 'source', value: 'type' }, label: 'Your name',
                hint: 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.',
                charactersAdvice: 'To use other letters, choose “Draw it” or “Use a picture of it” above.',
                emptySentence: 'Type your name first.', refusedSentence: 'Your name could not be used. Check it and try again.' },
              { kind: 'drawing', key: 'drawing', when: { key: 'source', value: 'draw' }, label: 'Draw your signature',
                hint: 'Use a finger, a mouse or a pen in the box. To use a keyboard, choose “Type your name” above.',
                clearLabel: 'Clear the drawing', emptySentence: 'Draw your signature first.' },
              { kind: 'picture', key: 'picture', when: { key: 'source', value: 'picture' }, label: 'Picture of your signature',
                pickLabel: 'Choose a picture', againLabel: 'Choose another picture', acceptsName: 'a JPG or PNG picture',
                hint: 'A JPG or PNG picture. One over 8 MB or 16 million pixels still works but makes the signed file large. A picture with a see-through background works best.',
                largeAdvice: 'A picture this large makes the signed file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.',
                tooLargeAdvice: 'Crop it to the signature, or save a smaller copy.',
                emptySentence: 'Choose a picture of your signature first.' },
              { kind: 'choice', key: 'page', legend: 'Which pages to sign', initial: 'last',
                choices: [{ value: 'last', label: 'Last page' }, { value: 'first', label: 'First page' }, { value: 'every', label: 'Every page' }] },
              { kind: 'choice', key: 'position', legend: 'Where on the page', initial: 'bottom-right',
                choices: [{ value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-centre', label: 'Bottom centre' },
                          { value: 'bottom-right', label: 'Bottom right' }, { value: 'top-left', label: 'Top left' },
                          { value: 'top-centre', label: 'Top centre' }, { value: 'top-right', label: 'Top right' }] }],
            resultNotes: ['Your signature is drawn on the page. It is not a digital signature.',
                          'Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature already in the file will no longer be valid.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- `src/widget/option-values.ts` gains, for `'sign-pdf'`: `optionValues` `{ source: ['type', 'draw', 'picture'], page: ['last', 'first', 'every'], position: [the six] }`; `optionTexts` `{ name: { maxLength: 50, characters: 'standard-font' } }`; `optionDrawings` `{ drawing: { maxLines: 200, maxPoints: 20000 } }`; `optionPictures` `{ picture: { types: ['image/jpeg', 'image/png'], noticeBytes: 8 * 1024 * 1024, noticePixels: 16_000_000 } }`. The registry tests of the four kinds check the entry against them.
- **"Type your name" first:** it is the way that works with a keyboard and a screen reader, so the first option, where focus goes after reading, leads straight to a way everyone can use. **Last page first:** where a letter or a contract is signed. **Bottom right first:** where a signature most often sits on a letter or form in left-to-right writing.
- **Limits:** 50 characters, as Watermark; 200 lines and 20,000 points, far past a signature (a slow signature at 120 points a second for ten seconds is 1,200) and small enough that the form is a few hundred kilobytes at most; a notice, not a limit, over 8 MB or 16 million pixels: a 12-million-pixel phone photo passes without one, 16 million is the pixel cap PDF to JPG sets on each picture it makes, and 8 MB is half the drawing step's fixed 16 MB of room.
- Placed after Watermark in the registry, so the catalogue-order test and the home page put it third under "Edit and sign". Add page numbers and Watermark already name `sign-pdf`, so their links to it start to show.

### 2. The engine: `src/engines/tools/sign-pdf.ts`

```
run([file], options, onProgress, tools):
  source = acceptedValue('sign-pdf', 'source', options.source); page = …'page'; position = …'position'   // undefined: refuse before any work
  signature =                                                     // each checked before the PDF is read
    source 'type'    → { kind: 'text', text: acceptedText('sign-pdf', 'name', options.name) }            // else TextRefused
    source 'draw'    → { kind: 'lines', drawing: acceptedDrawing('sign-pdf', 'drawing', options.drawing) } // else DrawingRefused
    source 'picture' → { kind: 'picture', ...pictureParts(acceptedPicture('sign-pdf', 'picture', options.picture, fflate), lib) } // else PictureRefused
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  copy = plainCopy(tools, file, passwordFrom(options))
  out = await stampPages(tools, copy, {
    only: (index, total) => page === 'every' || index === (page === 'first' ? 0 : total - 1),
    prepare: (doc, lib) => signatureForm(doc, lib, signature),        // { ref, width, height, text: boolean }
    draw: (layer, area, _index, form, lib) => placeForm(lib, layer, form, signaturePlace(area, form, position)),
    onPage: page === 'every' ? (done, total) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true }) : undefined,
    onWriting: (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }),
  })
  onProgress({ stage: 'writing', percent: 100 })
  return [out]
inspect = inspectPdf
inspectPicture = (key, bytes, tools) => key === 'picture' ? pictureOutcome(bytes, rule, await fflate(tools)) : { kind: 'damaged' }
```

- pdf-lib is imported for types only; `stampPages` hands it to `prepare` and `draw`. For a picture, the engine asks `tools.pdflib()` itself once, before the PDF is read, to make the embedder (2c), which is the same file `stampPages` asks for after.
- Nothing typed, drawn or chosen goes into an error or a progress message. A refused input gives the shared failure of its kind, with this tool's sentence where it has one.

#### 2a. The size and place: `signaturePlace` (exported, pure)

Given the layer `W × H` (the page as shown, upright, in points), the signature's own `w × h` (its form's box) and the place:
- `D = min(W, H)`, margin `m = D / 20` (about 10.5 mm on A4);
- the box it may fill: at most `0.3·D` wide and `D / 10` tall, or `D / 20` tall for a typed name (so a name reads as a signature, about 27 points of Times on A4, not a heading; the box is Times Italic's full reach, 5.1);
- scale `s = min(0.3·D / w, maxHeight / h)`, so it keeps its shape; drawn size `s·w × s·h` (on A4 a wide drawing is 178.6 by up to 59.5 points, 63 by 21 mm);
- x: left `m`, centre `(W − s·w) / 2`, right `W − m − s·w`; y: bottom `m`, top `H − m − s·h`.
- On A4 the box is 63 mm by 21 mm, where a signature line usually is; on a tiny page every number shrinks with `D`, so the signature always fits whole inside the margin.

#### 2b. The signature, made once per run: `signatureForm`

One form XObject, registered in the run's pdf-lib document, black where it is drawn, whose box is the signature's own size; the layer places it with `q s 0 0 s x y cm /Sig Do Q`. Identical in every run, so `fromPdfLib` writes it once (the experiment's one form for 4,100 pages).

- **Typed:** `doc.embedFont(StandardFonts.TimesRomanItalic)`; the box is the name's width at size 100 widened by Times Italic's largest overhangs (16.9 left, 17 right) by the font's full glyph box from −21.7 to 88.3 (changed while building, 5); content `BT /F1 100 Tf 16.9 21.7 Td <hex> Tj ET`, the name written by pdf-lib's own `encodeText`, a hex string, so no character can close a string or start an operator (Watermark's check, repeated here).
- **Drawn:** the box is the drawing's bounds in pad units, widened by half a line on every side and at least one line in each direction; content `q 0 G 0 g 6 w 1 J 1 j` then, per line, `x y m x y l … S` with y turned to count up (`bounds.top − y`), and for a line of one point a filled circle of the line's width made of four Bézier curves; `Q`. So the empty part of the pad is left out and the drawn shape keeps its proportions. The line is as thick on the page as a full-pad drawing's at the same signature box (about 0.9 points on A4), so a small drawing scaled up does not get thick lines (changed while building, 5).
- **Picture, made once per job** (the architect and security, stage 1): `pictureParts` reads the picture once, before the PDF: `jpegForPdf` (the parts needed to draw it, no details) with pdf-lib's `JpegEmbedder.for`, or `pngForPdf` (picture chunks only) with `PngEmbedder.for`, which decodes the PNG once. It embeds it once into a scratch pdf-lib document and keeps the resulting streams' **encoded** bytes and dictionaries (the picture, and a PNG's soft mask), then lets go of the decoded pixels and the scratch document. Each run's `prepare` registers those streams over the same bytes with `PDFRawStream.of(dict, bytes)` (`registerPart`), which compresses nothing, so the per-run cost is a reference, and `fromPdfLib`, finding the same JSON text, writes them once (as the experiment showed). The data reaches the update compressed, as its `/Filter` says; a test checks the image object in the update is no larger than the encoded bytes. The box is the picture's size as shown (`shownSize`), and the content draws it with the matrix for its camera turn (2d). A CMYK JPG with no Adobe segment has its `/Decode` dropped, as Image to PDF does. No colour profile is kept: a signature does not need one, and leaving it out keeps the form small.

#### 2c. Drawing on some pages: `only` in `stampPages`

`StampSteps` gains `only?(index: number, total: number): boolean`. When given, `stampPages`:
- draws, converts and appends layers only for the pages it chooses, still in runs of up to 2,000 of those pages;
- writes no entry at all for a page not chosen, so its dictionary, resources and content are the plain copy's;
- estimates and counts only the chosen pages against the budget, and calls `onPage` with the count of chosen pages.

- skips a run with no chosen page whole: no pdf-lib document, no `prepare`;
- refuses, before anything is written, an `only` that chooses no page at all (security, stage 1): it throws the engine failure, so it can never write the plain copy as if it were drawn on; Sign PDF always chooses at least one, and a test covers the guard.

Left out, every page is chosen, so Add page numbers and Watermark are unchanged.

**Shared objects in the budget:** `StampSteps` also gains `sharedBytes?: number`, the encoded size of what every run's `prepare` makes and the file is to hold once (Sign PDF: the picture's streams and the signature form). `stampPages` adds it once to the estimate before the first run. When the chosen pages' estimate alone fits `sizeLimit` and adding it would pass it, it throws `OutputLimit` with `reason: 'shared'` before drawing anything; when the pages alone pass it, a plain `OutputLimit` (changed at the stage 2 review), so the picture is never blamed for pages that are too large on their own; Sign PDF turns that into `PictureTooLarge` (from `add-picture-option`) when its signature is a picture, so the page says "photo.jpg (24.6 MB) is too large to place on these pages. Crop it to the signature, or save a smaller copy." and not that the PDF may be damaged. Any other `OutputLimit` is as before. `readPages` still reads every page, as the shown box of the last page is needed and the page count comes from it.

#### 2d. The camera turn: one table in `picture.ts`

`orientedMatrix(orientation, box)` moves from Image to PDF's `place` into `src/engines/picture.ts`: the `cm` matrix that maps the stored picture's unit square onto a box, turned and mirrored by the camera turn. Image to PDF's `place` calls it; its tests pass unchanged. Sign PDF's picture form calls it with the box `[0, 0, shown width, shown height]`.

### 3. Shared code

- `stampPages`' `only` and `sharedBytes` (2c) and the moved turn table (2d) ride along, named in the pull request with the owner question on shared pieces. Neither changes another tool's output; their tests cover both.
- **A text's advice for refused characters** (UX, stage 1): `TextOption` gains an optional `charactersAdvice`, which `textSentence` says after every refused-characters sentence, whether letters are named or not (UX, stage 1 round 2: a Polish or Turkish name with Ł or ğ needs the same way forward). Sign PDF's: "Some characters cannot be used. To use other letters, choose “Draw it” or “Use a picture of it” above." and "Ł cannot be used. To use other letters, choose “Draw it” or “Use a picture of it” above." The registry test checks it is plain and not empty when given. Watermark gives none and is unchanged.
- Nothing else shared changes. The three options and the picture reader are used as their changes built them.

### 4. The page text

`src/content/tools/sign-pdf.md`, 250 to 500 words, marked as a draft, covering:
- the steps (choose the file; type your name, draw it or choose a picture; choose the pages and the place; press "Sign and download", then Download);
- where it goes: the first, the last or every page, at one of six places at the edge of the page; it cannot yet be placed on a signature line in the middle of a page (the program manager, stage 1); a form field or note at the same place can cover it;
- what this signature is: your name, drawing or picture placed on the page, which most people and offices accept for everyday forms; it is not a digital (certificate) signature and does not prove who signed, and this page does not make one;
- that a digital signature already in the file stops being valid, earlier saved versions are not kept, a PDF/A file no longer meets PDF/A, and the password and restrictions are removed; what is kept;
- which characters a typed name takes, and that a name in another script can be drawn or used as a picture instead, without promising when other scripts can be typed;
- that a picture with a see-through background works best, a photo of paper brings the paper with it, and a very large picture makes the file large, so crop it to the signature first; and that a picture's camera, date and place details are not copied into the PDF (privacy, stage 2);
- privacy, saying only what the page controls: the file, the name, the drawing and the picture are not uploaded or sent anywhere; the page keeps them only while the tab is open and lets go of them on "Start again" or when the tab is closed or left. No claim about downloads, keyboard apps, extensions or spell checkers, and no "100%".

No question restates the title, nothing is in capitals for emphasis, and it is checked against "Banned patterns".

### 5. Changed while building

- **The update may carry the shared streams as base64** (2c): the new file holds a picture at its encoded size, but qpdf's JSON update holds it as base64, a third larger. Counting the base64 against the budget would refuse a 12.4 MB JPG on a small PDF, which the spec's "very large picture" scenario says works, and counting the raw size alone would let the update pass the budget and fail with the damaged-file sentence. So `sharedBytes` is counted once at its encoded size against `sizeLimit`, as the file will hold it (the check before the first run, giving `reason: 'shared'`), and the update alone is allowed that base64 overhead above the budget (`sharedText(bytes)`: the base64 length and 4 KB for the dictionaries). The new file's cap is unchanged.
- **A large raw stream is known by its bytes, not its text** (2b; reworked at the stage 2 review, architect): each run registers the picture over the same bytes. `fromPdfLib` keys a raw stream of more than 64 KB in `byText` by the identity of its bytes and its dictionary's text, so when a run finds the key it is written by id and its base64 is made only once per job, when first written, then let go with the run's entries. An 8 MB picture's 11 MB of base64 is no longer turned into JSON in each run nor kept as a key all job. Smaller objects, such as a typed name's form, are still known by their JSON text, so the identical form is written once. A drawing's and a picture's form are made once per job with their bytes (`planned`), and every run registers its form over those same bytes with `PDFRawStream.of`, as it does the picture, so a drawing at its 20,000-point limit (about 190 KB of content, past the 64 KB line) is still written once: before the round 2 fix it was made afresh with `context.stream` in each run and written once per run of 2,000 pages, about 17 MB of extra JSON over a 120,000-page job. A unit test signs every page of 2,100 (two runs) with the largest drawing, a typed name and `alpha.png`, and finds the form, and the picture and its mask, once. Measured again with the 8 MB picture on every page (Node, beside the code before the change on the same machine): `pages-500.pdf` 2.2 s and 0.35 GB peak (before, 2.3 s and 0.33 GB); the 120,000-page file 51.8 and 57.7 s, 1.10 and 1.04 GB (before, 56.6 and 59.4 s, 1.11 and 1.07 GB); in Chromium 2.3 s and 0.13 GB, and 34.6 s and 0.83 GB over the baseline. Output and update sizes are unchanged to the byte; the figures are in `tests/fixtures/README.md`.
- **A typed name's box is Times Italic's full reach** (2b; stage 2 review, the code reviewer): the box was the name's advance by the ascender and descender (683 and −217), which cut what reaches past them: the accents on Á, É, Ú and Å's ring reach 876 to 883, f starts at −147 and ends 146 past its advance, j starts at −124. The box now runs from the font's glyph box bottom to top (−217 to 883, its FontBBox) and is widened by the font's largest overhangs, 169 on the left (its FontBBox) and 170 on the right (the most any glyph in its metrics file reaches past its advance), all in thousandths of the size; the name is set in from the left and bottom by those amounts. The size rule takes this whole box, so on A4 the name is set at about 27 points, and the ink sits a little inside the margin. A pixel test checks Ú and Å draw clearly taller than U and A, and that `fj` and `jaf` reach no edge of the form.
- **A drawing's line is as thick as a full drawing's** (2b; stage 2 review): the line was 6 pad units inside the form, so a small scribble scaled up to fill the signature box got lines about 12 points thick and a tap became a 59.5-point dot. The line's width inside the form is now 6 units times the share by which the drawing is scaled more than a drawing filling the pad would be (`drawingLine`), so on every page it is the full drawing's width, about 0.88 points on A4, and a dot is that wide. The scale is the page's shorter side times a factor of the box alone, so the share is the same on every page and the form is still made once per job. The box is still widened by half the pad's line, so the round ends stay inside it.
- **A picture pdf-lib cannot read is refused as a picture** (2b; stage 2 review): a throw from pdf-lib's embedders on a picture that passed every check becomes `PictureRefused`, so the page names the picture, not the PDF. Only an error the worker would call running out of memory goes through unchanged, by the same test (`outOfMemory` in `src/widget/memory.ts`, read by `failureKind` and by the engine, so engines import no worker code); every other error, a `RangeError` such as "Offset is outside the bounds of the DataView" included, is refused as the picture (round 2 review).
- **`fflate` is its own file** in the built site, not inside pdf-lib's (page weight, below): reading a picture fetches `fflate`'s file, and the main button fetches pdf-lib's, whichever way the signature was made, so the files fetched by the end of a job are the same for the three ways.
- **The drawing pad's height on a short, wide screen** (UX, left for this change by `add-drawing-option`): on a phone turned sideways the pad at the column's width filled most of the screen's height, leaving little room to scroll past it. Its width is now `min(100%, 150svh)` (the small viewport height, which leaves out the browser's bars; a `150vh` line first was dropped at the stage 2 review, as the minifier removed it), so at 5 to 2 it is never more than 60% of the screen's height; nothing changes at 360px or 1280px upright. A browser without `svh` drops that width, so `@supports not (width: 1svh)` gives the box `width: 100%` (round 2 review): without a width the canvas takes its drawing buffer's width, which the pad sets from the box, and on a sharp screen could keep growing. A plain `width: 100%` line before the other is not used, as the minifier keeps only the last of two widths; the built CSS keeps the `@supports` rule, after the box's own. A shared CSS change, named in the pull request. Repainting sharp after a change of pixel density goes to the hand checks in issue #7.
- **The 16-million-pixel gradient** made in the unit test packs to about 0.4 MB, not the experiment's 3.2 MB, as its rows are filtered; so task 3.2 also measures a noisy, photo-like PNG of the same size, which is the figure that matters.
- **Which Blobs may be images** (task 7.1): page thumbnails are `image/png` Blobs given to `URL.createObjectURL`, so "no Blob is `image/*`" cannot hold as written. The no-upload test checks instead that every Blob is the result (`application/pdf`) or an `image/png` thumbnail whose address an `<img>` in the row shows, that none has the picture's size, that none holds the marker written into the picture's bytes, and that every `blob:` address fetched was made so.
- **The slowed-CPU drawing check** (task 6.1) is in `tests/e2e/performance.spec.ts`, beside the other timing checks, which run in a project of their own after the rest so no other browser competes for the machine; the 120,000-page typing and drawing check stays in `sign-pdf.spec.ts`, unslowed, as Watermark's does.

## Dependencies

No new dependency, and no font. `@cantoo/pdf-lib` 2.11.1 (MIT, last release 15 Sep 2026, about 243 KB by gzip in its own chunk, with `fflate`) and qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1, ISC wrapper, Apache-2.0 qpdf) are already shipped. Times Italic is one of the 14 standard PDF fonts, which readers supply; nothing is put inside the file. The `@cantoo/pdf-lib` line in `LICENSES.md` gains "and Sign PDF's signature" in its reason.

## Page weight and late loading

- **Before a pick:** the same island; the entry's option words add about 1.5 KB of props before compression. `npm run weigh` must stay under 100 KB.
- **After a pick:** what Watermark fetches (the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, PDF.js and its data for the first page's thumbnail), and the engine with `stamp` and `picture`.
- **When a picture is chosen,** `inspectPicture` asks for `fflate` whatever the picture's type, which fetches `fflate`'s own file (changed while building: it is not in pdf-lib's chunk); **at the main button** pdf-lib's chunk in any case, which imports `fflate`. So the files fetched by the end of a job are the same whichever way the signature was made. No other WebAssembly.
- `check-worker.mjs` checks the engine stays out of the worker file, is loaded late and holds no pdf-lib code.

## Threats

- **Hostile PDFs.** As Add page numbers and Watermark: qpdf parses them in the worker, which is ended after every job; only qpdf's own capped JSON is parsed; boxes, turns and user units are read as PDF.js reads them, with the 1-point and 10^8-point limits; the update is built with `JSON.stringify`. Nothing new is parsed in the PDF.
- **Hostile and huge pictures.** Read with the bounds-checked, capped `readPicture`; a PNG's data must inflate to no more than its header says (`pngDataFits`) before pdf-lib decodes it, so the decode is no larger than the picture's own stated size; a JPG is rebuilt from the parts needed to draw it, so no details, thumbnails or trailing data go in. All before the PDF is read. No pixel cap refuses a picture (no fixed size limit): a PNG is decoded once per job, compressed once, and its pixels let go before the PDF is read; a phone that runs out of memory gets the memory failure, and the notice warned first. Measured: 16 million pixels peaked at 0.47 GB in Node (task 3.2 measures it in Chromium).
- **A crafted drawing.** `acceptedDrawing` takes only whole numbers inside the pad, at most 200 lines and 20,000 points, so the form's content is bounded (a few hundred kilobytes) and written once.
- **The name.** Checked with `acceptedText`: a string, cleaned, at most 50 characters of `'standard-font'`, so no control character, direction mark or invisible mark reaches pdf-lib, and no `?` is drawn for a character it cannot draw. Written as a hex string in the form.
- **A result that balloons.** The signature is one form for the whole file; each chosen page adds a layer of a few bytes and a reference; pages not chosen add nothing. The picture goes in compressed, once; its encoded size is counted once in the budget before anything is drawn, and a picture that alone passes it stops the job with its own sentence. The output cap is the backstop.
- **Content that tries to move the signature.** Wrapped in `q … Q` by the drawing step; tested with a low opacity, a scaling `cm` and a fill colour left set. More `Q` than `q` remains the step's known limit.
- **Option abuse.** `'__proto__'`, numbers, `null`, missing keys, a value for another way than the one chosen, a label in place of a value: each refused before the file is read, with errors that hold nothing typed, drawn or chosen.
- **Hostile file names.** Unchanged: `stem` cleans the output name; names never reach the engine; the picture's name is shown as text and never sent.
- **Content Security Policy.** Unchanged. pdf-lib uses no `eval`; the standard font needs no font file; no `blob:` address is made for the picture.

## Tests

- **`tests/unit/sign-pdf.test.ts`:**
  - `signaturePlace` on A4, A4 on its side, Letter, A6, A0, a 20 by 20 point page and a 10 by 2,000 point strip, for a wide box, a tall box and a typed name, at every place: inside the margin on all four sides, the chosen edges a twentieth of the shorter side away, at most `0.3·D` wide and `D/10` (or `D/20`) tall, its proportions kept; 178.6 points wide for a wide drawing on A4;
  - the options refused in each listed way (each value, each way's input missing, empty, too long, out of the pad, too many points, not a picture, a damaged picture), each before qpdf is asked for (a spy on `tools.qpdf`), with errors of the right kind holding nothing of the input;
  - a typed name: `a) Tj (b \ % <x>` drawn, `qpdf --check` passing, PDF.js reading it back exactly, the form holding it only inside one hex string; "Zoë Ångström-Núñez" read back as typed; the font Times Italic, not embedded;
  - a drawing: drawn lines at the expected place as PDF.js draws the page (the changed pixels' box at the bottom right inside the margin), the pad's empty part left out, a one-point line as a dot;
  - a picture: `alpha.png` drawn with the page showing through its see-through part; `turn-6.jpg` upright; `cmyk.jpg` with its colours as Image to PDF draws them; `details.jpg` and `details.png` with no `SECRET-` marker anywhere in the result; the 500-page file signed on every page holding one picture (and one soft mask) and one signature form;
  - `run` on every file in `tests/fixtures/` with a typed name on the last page: `qpdf --check`; the page count; the last page's text ends with the name; every other page's objects unchanged from the plain copy; on `mixed.pdf` signed on every page, the changed pixels on each page as shown at its bottom right inside its margin; `scanned.pdf` showing the signature over its picture; `rich.pdf`'s bookmarks, link and `note.txt`; `form.pdf`'s fields and values; `tagged.pdf`'s tags, destination and thread, with every tagged MCID still in its page's own content; `password.pdf` (with its password) and `restricted.pdf` back with no password and no restrictions; `warning.pdf` signed; the damaged files failing as damaged;
  - a page whose content leaves `/ca 0.1`, a scaling `cm` and a red fill set: the signature's place, size and colour unchanged;
  - thousands of pages sharing one tiny content stream, signed on every page: fast, the stream still shared, growth no more than a few hundred bytes a page;
  - `inspectPicture` for each picture in `tests/fixtures/pictures/`, as `add-picture-option` records them under this tool's rule;
  - a 16-million-pixel, well-filtered gradient PNG made in the test (a photo of paper), on a small PDF, on the last page and on every page of 2,100: one decode and one compression per job (a spy on the embedder), the image object in the update no larger than its encoded bytes and written once, `qpdf --check`, and the update's size and the peak memory recorded in the fixtures README;
  - a picture whose encoded size passes the budget of a tiny PDF failing with `PictureTooLarge` before any layer is drawn.
- **`tests/unit/stamp.test.ts`:** `only` choosing the last page of three (the first two pages' objects unchanged, `qpdf --check`), the first page of 120,000 (one layer, small growth, `prepare` called for one run only), no page (refused before anything is written), every page when left out (the existing tests unchanged), and `onPage` counting chosen pages; `sharedBytes` counted once, and over the budget throwing `OutputLimit` with `reason: 'shared'` before any run is drawn.
- **`tests/unit/images-to-pdf.test.ts`:** unchanged, passing with the turn table moved.
- **E2e and no-upload:** as the tasks list.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1); the 100 MB file run by hand.
- `qpdf --check` in the unit tests; the four readers by hand (issue #7).
- Links, bookmarks, form fields, text, attachments and tags kept, and pages not chosen unchanged (unit tests).
- Nothing blocks the page over 100 ms, typing and drawing included; progress and Cancel (e2e).
- Browsers and phones by hand (issue #7), including drawing with a finger on Android Chrome and iOS Safari and a pen on a tablet; keyboard and screen reader by typing and by a picture (e2e); contrast unchanged.
- No-upload test for all three ways; engine unit tests; one e2e file.
- Page text drafted and marked; the owner's review is in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[Placement is coarse]** Six places on the first, last or every page cannot reach a signature line in the middle of a page or on page 2 of 3. → The plainest design that places a signature as `SPEC.md` asks; a known limit in the page text, and a question for the owner on placing by drag on a page preview later, as its own shared component.
- **[Not a digital signature]** A visitor may think the file is now "signed" in a legal sense. → The result's first note and the page text say plainly what it is and is not.
- **[A photo of paper]** A JPG of a signature on paper brings a grey or white box over the page's lines. → The hint and the page text say a see-through background works best; cleaning a background is out of scope.
- **[Typed names look typed]** Times Italic does not look handwritten. → Plain and readable, with no font put inside the file; a question for the owner.
- **[Signatures in tagged files]** The signature is page content outside the tag tree, so a screen reader may skip it or read a typed name without context. → Not marked as an artifact, since it is real content; the page says so; a question for the owner on tagging it.
- **[A signature under a field or note]** Form fields and notes are drawn above page content. → The page text says so; the visitor can choose another place.
- **[PDF/A]** The new file no longer meets PDF/A (an unembedded font, and a picture's transparency). → The page says so.
- **[The drawing step's known limits]** More `Q` than `q`; a genuine file whose many pages inherit one very large `/Resources` refused by the update budget with the wrong advice (now only for the pages chosen); four qpdf instances on the largest file. → Inherited from `add-page-numbers`, named in the pull request; task 3.2 measures this tool.

## Migration Plan

None; a new tool.
