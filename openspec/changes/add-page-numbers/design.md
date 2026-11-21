# Design

## Context

- Nine tools are built. qpdf 12.2.0 (WebAssembly, `src/engines/qpdf.ts`) reads and writes every PDF; `plainCopy` in `src/engines/plain.ts` gives a decrypted copy without object streams, for JSON updates; `src/engines/qpdf-json.ts` reads every object's dictionary through a capped file (`readDictionaries`) and builds updates (`updateJson`, `callWithArgumentFile`). `@cantoo/pdf-lib` 2.11.1 is shipped since Image to PDF, loaded at the main button through `src/workers/pdflib.ts` as `tools.pdflib`; engines import it for types only. Compress PDF lists its one file as a row with a first-page thumbnail and no summary line.
- **`add-tool-options` is merged first.** It gives the registry's `options` (one kind, a choice), `src/widget/option-values.ts` with `acceptedValue`, the state's `choices`, the radio group in `ToolWorkspace` with focus moving to it once the file is read, and `useToolRun` sending the choice.
- **Why not `qpdf --overlay`** (the first draft's plan, dropped at stage 1): in this build it moves each page's own content into a new form XObject, so marked content tied to tags no longer sits in the page's content, and pages that shared one content stream each get a copy (the 120,000-page test file grew from 16.6 MB to 72.9 MB). It also misplaced the layer for a `/Rotate` of -90 or 450 and a `/UserUnit` of -2, which needed stored values rewritten.
- **The placement in this design was checked by experiment** in Node, with the result drawn by PDF.js (the legacy build, as the unit tests use) and its pixels read. A mark drawn by pdf-lib at the bottom centre of a layer page landed at the bottom centre as PDF.js shows the page for every one of: turns of 0, 90, 180, 270, -90, 450 and 45, a turn inherited from the page tree; a paper box offset, reversed, or with a crop box smaller, of no area or off the paper; a trim box smaller than the crop box; user units of 2, 0 and -2; a quarter and three-quarter turn with an offset crop box and a user unit of 2; and a page whose content leaves an unbalanced `q`, a scaling `cm` and a green fill. No stored turn, box or user unit was changed. On a page with marked content tied to a tag, PDF.js's structure tree still found the text, and the number came out as an artifact. `rich.pdf`, `form.pdf`, `tagged.pdf`, `mixed.pdf` and `password.pdf` (opened) passed `qpdf --check`, each page's last text being its number.
- **Measured** (Node, the experiment, before the memory order of section 6):

  | File | In | Out | Read | Draw | Write | Check | Peak memory |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `pages-500.pdf` | 0.20 MB | 0.26 MB | 0.14 s | 0.08 s | 0.09 s | 0.09 s | 0.12 GB |
  | 120,000 pages sharing one content stream | 16.6 MB | 39.4 MB | 7.9 s | 8.5 s | 17.1 s | 12.0 s | 1.46 GB |
  | `make-large.mjs`'s file | 110.1 MB | 110.1 MB | 0.8 s | 0.0 s | 0.4 s | 0.2 s | 0.94 GB |

  The 120,000-page update was 68 MB of JSON, and the pages and dictionaries JSON read first was 58 MB. Drawing all 120,000 layer pages in one pdf-lib document took 351 s, as pdf-lib slows as a document grows; in documents of 2,000 pages it took 8.5 s.

## Goals / Non-Goals

**Goals:**
- Numbers upright at the chosen edge of every page as a reader shows it, whatever the page's turn, size or boxes.
- Each page's own content left in place, unchanged, so tags, `/StructParents` and shared content streams are untouched, and nothing the page's content does able to move a number.
- No stored turn, box or user unit rewritten; per page, only `/Resources` and `/Contents` change.
- A drawing step Watermark and Sign PDF can reuse; no new dependency; bounded work and memory on hostile files.

**Non-Goals:**
- A first number, words around the number, other fonts, colours, sizes or margins; skipping a cover; facing pages; a preview on the thumbnail.

## Decisions

### 1. The registry entry

```ts
{ id: 'add-page-numbers', group: 'edit', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['merge-pdf', 'rearrange-pdf-pages', 'delete-pdf-pages', 'watermark-pdf', 'sign-pdf', 'compress-pdf'],
  pages: [{ slug: 'add-page-numbers-to-pdf', name: 'Add page numbers', summary: 'Number the pages of a PDF.',
            title: 'Add page numbers to a PDF in your browser - PDFkaro',
            description: 'Put a page number on every page of a PDF, at the top or bottom. The file stays on your device and is not uploaded.',
            heading: 'Add page numbers to a PDF',
            sentence: 'Put a number on every page of a PDF. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Add numbers and download', writingLabel: 'Writing the numbered file',
            doneHeading: 'Your numbered file is ready', failedHeading: 'The numbers were not added.',
            tooFewFiles: 'Choose a PDF file to number its pages.', outputSuffix: 'numbered',
            minFiles: 1, multiple: false, resultPages: 'input', items: 'files', itemControls: false, outputs: 'one',
            memoryAdvice: 'Try on a computer, or split the file first and number the parts.',
            options: [{ kind: 'choice', key: 'position', legend: 'Where the numbers go', initial: 'bottom-centre',
              choices: [{ value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-centre', label: 'Bottom centre' },
                        { value: 'bottom-right', label: 'Bottom right' }, { value: 'top-left', label: 'Top left' },
                        { value: 'top-centre', label: 'Top centre' }, { value: 'top-right', label: 'Top right' }] }],
            resultNotes: ['Each page has its number. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- `src/widget/option-values.ts` gains `'add-page-numbers': { position: ['bottom-left', 'bottom-centre', 'bottom-right', 'top-left', 'top-centre', 'top-right'] }`; the registry test from `add-tool-options` checks the entry against it, and that the page has no preset.
- `related` names Watermark and Sign PDF, linked once published; four links show now.

### 2. The engine: `src/engines/tools/add-page-numbers.ts`

```
run([file], options, onProgress, tools):
  position = acceptedValue('add-page-numbers', 'position', options.position)   // refused before any work if undefined
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  { plain, pages } = plainCopy(tools, file, passwordFrom(options))
  out = await stampPages(tools, plain, pages, {
    draw: (page, area, index, font) => drawNumber(page, area, String(index + 1), position, font),
    onPage: (done) => onProgress({ stage: 'working', unit: 'page', done, total: pages }),
    onWriting: (percent) => onProgress({ stage: 'writing', percent: Math.min(percent, 95) }),
  })
  onProgress({ stage: 'writing', percent: 100 })
  return [out]
inspect = inspectPdf
```

- **`numberPlace(area, digits, position, widthOf)`** (exported, pure):
  - size `s = min(max(shorter side of the area / 60, 8), 72)` points: 9.9 on A4, 10.2 on Letter, 8 on A6, 39.7 on A0;
  - margin `m = 3s` (about 10.5 mm on A4); width `w = widthOf(text, s)` (Helvetica digits are 0.556 of the size); digit height is Helvetica's cap height, `0.718s` (about 7 points at 9.9);
  - x: left `m`, centre `(W − w) / 2`, right `W − m − w`; baseline y: bottom `m`, top `H − m − 0.718s`;
  - a page too small for the number and its margin: the margin shrinks first, down to 0, then the size, until the number fits whole in the area.
- **`drawNumber`** draws, on the layer page, `/Artifact << /Type /Pagination /Subtype /Footer >> BDC` (`/Header` at the top), the number with pdf-lib's `drawText` in black `StandardFonts.Helvetica`, then `EMC`. Digits only, at most 7 for any file under 9 million pages.
- pdf-lib is imported for types only; its values come from `tools.pdflib()`, so the engine and `stamp` stay small and `check-worker.mjs` can check pdf-lib's code is in neither.

### 3. The shared step: `src/engines/stamp.ts`

`stampPages(tools, plain, pages, { draw, onPage, onWriting })` is the step Watermark and Sign PDF reuse: they give their own `draw`. It returns the checked result's bytes. Its parts, each exported for its test:

#### 3a. Reading each page: `readPages`

From a fresh qpdf holding the plain copy (made and let go inside this function):
- the pages in order, from `--json=2 --json-key=pages`, written to a file in qpdf's memory capped with `capFile` at 64 MB and parsed only if under it;
- every object's dictionary, from `readDictionaries` (already capped at 64 MB).

Over a cap, or unreadable, is the engine failure. Object ids are taken only as `N G R`; inherited values are found up `/Parent` with a depth limit of 64 and a set of visited nodes, so a loop in the page tree ends. What is kept for each page, after the full JSON is let go: its id, its dictionary, its effective `/Resources` and that dictionary's `/XObject` (both resolved), and the numbers below.

#### 3b. Where a page is shown: `pageBox` (pure)

As PDF.js reads a page, so the result matches the thumbnail and Firefox:
- **turn:** the page's or an ancestor's `/Rotate`; a number that is a multiple of 90 is taken modulo 360 into 0, 90, 180 or 270, anything else is 0;
- **paper box:** the inherited `/MediaBox` when it is four finite numbers whose normalised width and height are above 0, else Letter (`[0 0 612 792]`);
- **shown box** `[x0 y0 x1 y1]`: the inherited `/CropBox`, by the same test, intersected with the paper box when that leaves an area, else the paper box;
- **user unit** `u`: the page's own `/UserUnit` when it is a number above 0, else 1;
- **layer size:** `W = (x1 − x0)u`, `H = (y1 − y0)u` in points, swapped for a turn of 90 or 270;
- **limits:** a side of the layer under 1 point or over 10^8 points (35 km) stops the job with the engine failure (the security reviewer, stage 1), so pdf-lib and qpdf are never handed a page of no size or numbers that large.

The trim box is not used: a reader shows the crop box, and numbers sit near its edge. Nothing stored is changed for any page.

#### 3c. The matrix: `layerMatrix` (pure)

The `cm` matrix `[a b c d e f]` that takes the layer page, upright as shown, onto the page's user space:

| Turn | Matrix |
| --- | --- |
| 0 | `[1/u 0 0 1/u x0 y0]` |
| 90 | `[0 1/u −1/u 0 x1 y0]` |
| 180 | `[−1/u 0 0 −1/u x1 y1]` |
| 270 | `[0 −1/u 1/u 0 x0 y1]` |

Each number is written with at most 6 decimals. This is the table the experiment checked.

#### 3d. Drawing the layers

- Layer pages are drawn in pdf-lib documents of at most 2,000 pages (pdf-lib slows as a document grows: 351 s for 120,000 pages in one, 8.5 s in runs of 2,000). For each page: `addPage([W, H])`, `draw(page, { width: W, height: H }, index, font)`, `onPage`. A document is made with `updateMetadata: false`; nothing of the visitor's file goes into it but sizes and numbers.
- After each run, its pages are turned into update entries (3e), written into the stamping qpdf (section 6), and the pdf-lib document and the entries are let go.

#### 3e. The update for each page

For each page, built in plain objects and written with `JSON.stringify`:
- **the layer as a form XObject:** a new stream object with `/Type /XObject /Subtype /Form /BBox [0 0 W H]`, the layer page's `/Resources`, and its content stream's data (pdf-lib's `getUnencodedContents`, joined if it has several), carried as base64 `data`. qpdf compresses it on write.
- **pdf-lib objects into qpdf JSON:** `fromPdfLib(object, ids)` turns names, numbers, booleans, strings, arrays, dictionaries, references and streams into qpdf's JSON forms, giving each referenced pdf-lib object a new id above the file's highest and writing it once; an object whose JSON text is the same as one already written (Helvetica's font dictionary in each run) reuses its id. A stream's raw data goes as base64 with its own `/Filter`. Watermark's extra graphics states and Sign PDF's pictures go through the same function.
- **the page's resources:** a direct copy of the page's effective `/Resources` (its own, else inherited), whose `/XObject` is a direct copy of the old one, resolved, with the layer added under a free name: `/PDFkaro`, or `/PDFkaro1`, `/PDFkaro2` and on, if taken. Every other entry is copied as it was, so references stay references and other pages are untouched. Adding the name to a shared resources dictionary instead was considered and dropped: every page needs a different form under its name, so a shared dictionary would gain one entry per page that shares it (120,000 on the test file), and every page would carry them all.
- **the page's content:** `/Contents` becomes `[q, …the page's own content streams, as they were…, Q, draw]`: `q` and `Q` are one shared stream each (`q\n` and `\nQ\n`) for the whole file, and `draw` is `q <matrix> cm /PDFkaro Do Q`, one stream for each different text, so pages of the same size and name share it. A page with no `/Contents` gets `[q, Q, draw]`.
- **the page's dictionary:** a copy of it with only `/Resources` and `/Contents` replaced. Its turn, boxes, user unit, `/StructParents`, annotations and every other key stay.

The original content streams are referenced, not copied or changed, so marked content and `/StructParents` still match the tag tree, and a stream shared by many pages stays one stream.

#### 3f. Writing: `writeUpdate`

1. The update's opening, each run's entries and its closing are appended to `/update.json` in the stamping qpdf as they are made (`Qpdf.append`, new: `FS.open` with append and `FS.write`).
2. `/out.pdf` is capped with `capFile` at `2 × plain + 2 KB × pages + 16 MB` (the security reviewer, stage 1). Numbers add about 120 bytes a page on `pages-500.pdf` and 190 on the 120,000-page file.
   The update has the same budget (the security reviewer, stage 1 round 2). Each page carries a direct copy of its resources, so a small file whose pages all inherit one large `/Resources` would build gigabytes of update. Before a run's entries are turned into text, `writeUpdate` estimates them (the full size of the copied resources, counting the `/XObject` dictionary copied after its reference is followed and not only the top level, × the run's pages, plus the layer) and adds them to a running count of the bytes passed to `Qpdf.append`; once the total would pass the budget, it throws the output-limit error before building the run. Only a broken or crafted file reaches either limit.
3. One call through `callWithArgumentFile`: `--progress`, `/in.pdf`, `--update-from-json=/update.json`, `--object-streams=generate`, `/out.pdf`. qpdf's write progress lines go to `onWriting`.
4. A write refused at the cap throws the output-limit error; any other failure is the engine failure. Document text never goes into an error. Found while building: writing object streams, qpdf can finish with exit 0 and leave `/out.pdf` cut off at the cap, without saying so, so the capped file records its own refusal and `Qpdf.refused(path)` (new, beside `append`) is asked first.
5. `/in.pdf` and `/update.json` are removed, then `qpdf --check` runs on `/out.pdf`, then its bytes are read and returned.

The plain copy is decrypted, so the result has no password and no restrictions; `--object-streams=generate` puts object streams back.

### 4. The output-limit failure

- `FailureKind` gains `output-limit`; `failures.ts` says "The new file would be far larger than expected, so it was not made." followed by its own advice, "The file may be damaged. Try another copy of it." The limits are a fixed formula only a broken or crafted file reaches, so it fails the same way on a computer and `memoryAdvice` would send the visitor somewhere that does not help.
- The engine throws an error whose message `worker-core` recognises, as it recognises running out of memory; a test covers the worker's mapping and the sentence. Other tools never throw it.

### 5. Progress

"Reading the file" before the plain copy; "Page n of m" as each layer page is drawn; "Writing the numbered file" from qpdf's progress lines, held at 95 until the check is done.

### 6. Memory

Copies of the file at each stage, for a file of size F:
- **Reading:** the input from the page (F), the plain copy in JavaScript (F), the reading qpdf's copy (F) and its JSON (up to 64 MB each for pages and dictionaries, and their parsed form). The reading qpdf and the full JSON are let go before drawing.
- **Order:** the reading qpdf is let go first; then the stamping qpdf is made from the plain copy, and the JavaScript plain copy is let go straight after, so reading holds three copies at most, not four (the architect, stage 1 round 2).
- **Drawing:** one run of 2,000 pdf-lib pages and its entries at a time, each appended to the stamping qpdf and let go.
- **Writing:** inside the stamping qpdf, the plain copy, the update JSON and what qpdf parses from it, and the output (capped). `/in.pdf` and `/update.json` are removed before the check, so the check works with the output alone.

Task 3.2 measures the peak again with this order on the 120,000-page file and `make-large.mjs`'s file and records it in the fixtures README.

### 7. The page text

`src/content/tools/add-page-numbers-to-pdf.md`, 250 to 500 words, marked as a draft, covering: the steps; where the numbers can go and how large they are; that every page is numbered from 1, a cover too, and how to leave a cover out (take the cover off with Split PDF or Extract pages, number the rest, then join the two with Merge PDF); what is kept; that earlier saved versions are not kept, a digital signature stops being valid, and a PDF/A file no longer meets PDF/A; that the password and restrictions are removed; that a number can sit under a form field or note placed at the same spot; that nothing is uploaded and the page forgets the file. No question restates the title. Checked against "Banned patterns".

## Dependencies

No new dependency. `@cantoo/pdf-lib` 2.11.1 (MIT, last release 15 Sep 2026, about 243 KB by gzip in its own chunk) and qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1, ISC wrapper, Apache-2.0 qpdf) are already shipped. The `@cantoo/pdf-lib` line in `LICENSES.md` gains "and draws Add page numbers' numbers" in its reason; no line is added.

## Page weight and late loading

- **Before a pick:** the same island; the entry's option words add a few hundred bytes of props. `npm run weigh` must stay under 100 KB.
- **After a pick:** what Compress PDF fetches (the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, PDF.js and its data for the first page's thumbnail), and the engine with `stamp` and `qpdf-json`.
- **At the main button:** pdf-lib's file, which brings `fflate`. No other WebAssembly.
- `check-worker.mjs` checks the engine and `stamp` stay out of the worker file and hold no pdf-lib code; `page-weight.mjs` builds its engine list from the files and gets a `loadedLater` line only for a new chunk.

## Threats

- **Hostile PDFs.** qpdf parses them in the worker, which is ended after every job. Only qpdf's own JSON is parsed, from files capped at 64 MB while written and checked before reading. Object keys must match `obj:N G R`; numbers must be finite; the page tree is walked with a depth limit and a visited set. The update is built from plain objects with `JSON.stringify`, never by joining strings.
- **Huge page counts.** Layers are drawn 2,000 pages at a time and let go; progress for every page, and Cancel ends the worker. qpdf's arguments go through the argument file. Over 20,000 pages, the shared notice. Measured: 120,000 pages in about 46 s and 1.46 GB in Node; a phone may run out of memory, which gives the memory failure and its advice. The pages and dictionaries JSON was 58 MB there, near its caps; a file well past that fails with the engine failure.
- **A result that balloons.** Nothing is copied per page, and a test numbers thousands of pages that share one tiny content stream, checking it finishes fast and grows by no more than a few hundred bytes a page; the output cap is the backstop (section 3f). Pages that inherit one large `/Resources` grow by its size each, so the update is held to the same budget, and a test with thousands of pages sharing a large inherited resources dictionary fails fast with the output-limit failure.
- **Odd page boxes and turns.** Zero, negative, reversed, inherited, missing or non-finite boxes, a crop box off the paper, `/Rotate` of -90, 450, 45 or a reference, `/UserUnit` of 0 or negative, read as PDF.js reads them; the 1-point and 10^8-point limits stop the rest. Each has a unit test drawing the result through PDF.js.
- **Content that tries to move the number.** The page's own content is wrapped in `q … Q` before the number is drawn; tested with an unbalanced `q`, a scaling `cm` and a fill colour. Content with more `Q` than `q` is not valid PDF and can still move it (see risks).
- **Option abuse.** `acceptedValue` takes only a listed string from the tool's own line; anything else is refused before the file is read (`'__proto__'`, a number, a missing key, `'Bottom centre'` as a label).
- **Hostile file names.** Unchanged: `stem` cleans the output name; names never reach the engine.
- **Content Security Policy.** Unchanged. pdf-lib uses no `eval`; the standard font needs no font file.

## Tests

- **`tests/unit/stamp.test.ts`:** `pageBox` for every rule in 3b, including both limits; `layerMatrix` for each turn and user unit; `fromPdfLib` for each kind of object and the reuse of an identical font; real runs on pages made with pdf-lib, for each case listed in the context above, that stamp a mark at the bottom centre, draw the result with PDF.js and find the mark within 2% of the bottom centre as shown, and check that no page's `/Rotate`, boxes or `/UserUnit` changed; the output cap stopping a write; thousands of pages sharing one tiny content stream, fast and small; for `tagged.pdf` and a page made in the test with marked content, every MCID the structure tree gives for a page still in that page's own content streams, those streams unchanged, and PDF.js's structure tree still resolving them.
- **`tests/unit/add-page-numbers.test.ts`:** `numberPlace` (A4, Letter, A6, A0, a 20 by 20 point page, 1 to 7 digits, every place); `run` on every file in `tests/fixtures/` as task 3.1 lists.
- **Worker and failures:** the output-limit error mapped to its kind, and its sentence.
- **E2e and no-upload:** as the tasks list.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1); the 100 MB file run by hand.
- `qpdf --check` in the unit tests; the four readers by hand (issue #7).
- Links, bookmarks, form fields, text, attachments and tags kept (unit tests).
- Nothing blocks the page over 100 ms; progress and Cancel (e2e).
- Browsers and phones by hand (issue #7); keyboard and screen reader (e2e); contrast unchanged.
- No-upload test; engine unit tests; one e2e file.
- Page text drafted and marked; the owner's review is in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[More `Q` than `q`]** A page whose content restores more drawing states than it saves is not valid PDF; its extra `Q` would undo our `q`, and the number could be drawn moved or scaled. Readers vary in what they do with such content too. → A known limit, in the design and the pull request; the fixtures hold no such page.
- **[A number under a field or note]** Form fields and notes are drawn above page content, so one at the number's spot hides it. → The page text says so; the visitor can choose another place.
- **[Dark pages]** A black number does not show on a black page. → No colour option; plain, and a later change if asked.
- **[PDF/A]** The new file no longer meets PDF/A, and any claim it makes to is left as it was. → The page says so.
- **[Very long files on phones]** Memory as measured. → The notice above 20,000 pages, the memory failure's advice.
- **[Caps on reading]** A file whose pages and dictionaries JSON passes 64 MB (well past 120,000 pages) cannot be numbered. → The engine failure; a later change could read pages in batches.
- **[The drawing step rides along]** `stamp.ts` and the output-limit failure come with this tool. → Named in the pull request; the owner question on shared pieces stays open.

## Migration Plan

None; a new tool.
