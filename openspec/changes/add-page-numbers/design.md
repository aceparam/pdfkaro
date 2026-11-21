# Design

## Context

- Nine tools are built. qpdf 12.2.0 (WebAssembly, `src/engines/qpdf.ts`) reads and writes every PDF; `plainCopy` in `src/engines/plain.ts` gives a decrypted copy without object streams; `src/engines/qpdf-json.ts` reads every object's dictionary through a capped file (`readDictionaries`) and writes JSON updates. `@cantoo/pdf-lib` 2.11.1 is shipped since Image to PDF, loaded at the main button through `src/workers/pdflib.ts` as `tools.pdflib`; engines import it for types only. Compress PDF lists its one file as a row with a first-page thumbnail and no summary line.
- **No tool shows an option yet.** The widget sends the page's preset and, for page tools, the marks, order or turns. There is no option in the registry, the state or `ToolWorkspace`.
- **What qpdf's `--overlay` does in this build** was checked by experiment for this design, with layer pages made by pdf-lib and the result drawn by PDF.js (the legacy build, as the unit tests use) and its pixels read:
  - `qpdf in.pdf --overlay layer.pdf -- out.pdf` puts layer page N on page N. It turns each layer page into a form XObject and places it centred in the page's **trim box** (its `/TrimBox`, else its `/CropBox`, inherited, else its `/MediaBox`), shrunk to fit if larger, never enlarged.
  - It undoes the page's `/Rotate` and `/UserUnit` while placing, so a layer page sized to the trim box as the page is shown (width and height swapped for a quarter turn, both times the user unit) lands on it exactly and upright as shown. Checked: A4 at 0, 90, 180 and 270; an inherited 90; a paper box not at the origin; a reversed paper box; a crop box smaller than the paper; a trim box smaller than the crop box; a user unit of 2; a quarter turn with an offset crop box. In each, a mark drawn at the bottom centre of the layer page was at the bottom centre of the page as PDF.js shows it.
  - It does **not** handle every stored value: a `/Rotate` of -90 or 450 put the mark on the wrong edge (PDF.js shows them as 270 and 90), a `/UserUnit` of -2 put it a quarter of the way down the page (PDF.js reads it as 1; a `/UserUnit` of 0 was placed right), and a crop box of no area put it nowhere (PDF.js then shows the paper box). Writing such a page's turn and trim box the way PDF.js shows them, in the same qpdf call (`--update-from-json` then `--overlay`), put the mark right.
  - It moves each page's own content into a form XObject of its own and draws it, then the layer, each inside `q … Q`. So a page whose content leaves its drawing state changed (an unbalanced `q`, a scaling `cm`, a fill colour) still gets the mark at its place, size and colour (checked).
  - Several layer files can be given in one call, each with `--to=<pages>` (checked: two files for pages 1 to 200 and 201 to 500 of `pages-500.pdf`). Bookmarks, form fields and attached files were the same before and after on every fixture (qpdf's JSON); `warning.pdf` finished with warnings (exit 3), as qpdf does on it.
  - Speed and size in Node: `pages-500.pdf` took 0.3 s and grew from 198,025 to 412,600 bytes (about 430 bytes a page). The 120,000-page file of `make-many-pages.mjs`, whose pages share one content stream: drawing the layers in pdf-lib took 26 s, the overlay 40 s and `qpdf --check` 18 s; it grew from 16.6 MB to 72.9 MB, because each page now has its own copy of the shared content; Node's memory peaked at 1.7 GB.

## Goals / Non-Goals

**Goals:**
- Numbers that sit upright at the chosen edge of every page as a reader shows it, whatever the page's turn, size or boxes.
- Nothing else in the file changed, and nothing the page's content does able to move a number.
- The first options in the widget, built so Watermark and Sign PDF can reuse them, and a drawing step they can reuse.
- No new dependency; bounded work and memory on hostile files.

**Non-Goals:**
- Words around the number, other fonts, colours, sizes or margins; skipping a cover; facing pages; a preview on the thumbnail.

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
            options: [
              { kind: 'choice', key: 'position', legend: 'Where the numbers go', initial: 'bottom-centre',
                choices: [{ value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-centre', label: 'Bottom centre' },
                          { value: 'bottom-right', label: 'Bottom right' }, { value: 'top-left', label: 'Top left' },
                          { value: 'top-centre', label: 'Top centre' }, { value: 'top-right', label: 'Top right' }] },
              { kind: 'whole', key: 'first', label: 'First number', initial: 1, min: 1, max: 999_999,
                hint: 'The number on page 1. Change it if this file carries on from another one.' } ],
            resultNotes: ['Each page has its number. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- `related` names Watermark and Sign PDF, which are linked once published; four links show now.
- "Add page numbers" is the catalogue's name and the search phrase; "numbered" is the plain word for the file.
- The registry test checks catalogue order (`edit` after `from-pdf`), and for every option: keys unique, a choice's `initial` among its values, a whole number's `initial` within `min` and `max`, and `min` and `max` safe whole numbers.

### 2. Options in the widget

- **Registry type.** `ToolWidgetWords` gains `options?: ToolOption[]`, `ToolOption` being `{ kind: 'choice'; key; legend; initial; choices: { value; label }[] }` or `{ kind: 'whole'; key; label; hint; initial; min; max }`. Plain text and numbers only, as every widget word, since they pass from the page to the island.
- **State.** `State.choices: Record<string, string>` holds what each option shows: the chosen value, or the field's text as typed. `{}` means every option at its start, so no tool needs a setting in the reducer, as `turns: null` does. `option-set { key, value }` acts only while listing. `reset` clears it; `added`, `removed`, `started`, `cancelled` and `failed` leave it, so choices outlive a replaced file, Cancel and failure, and "Start again" brings back the starting values. State keeps what the screen shows and never the file; the chosen options are not written anywhere else.
- **Rules, `src/widget/options.ts`, tested in Node:**
  - `shownValue(option, choices)`: the text or value shown, or the option's start;
  - `wholeFrom(text, min, max)`: the number when `text`, trimmed of spaces, is 1 to 15 of the digits 0 to 9 and the number is within the limits, else `null`. So "1e309", "-5", "2.5", "١٢", "1000000" and a 16-digit number are all `null`, and `Number` is never given anything but plain digits;
  - `optionProblem(options, choices)`: "Type a whole number from 1 to 999,999." (the limits written with `number` from `format.ts`) for the first whole-number option that is not valid, else `null`;
  - `optionsToSend(options, choices)`: `{ position: 'bottom-centre', first: 1 }`, sent only when there is no problem.
- **Drawing them, in `ToolWorkspace`.** Below the file's row, once it has been read and while listing, above the main button:
  - a choice is a `fieldset` with a visible `legend` and native radio inputs, one per line, each label and input together a target at least 2.75rem tall, styled with the existing control colours (`--control`, focus ring as elsewhere); no new colours and no custom radio drawing beyond size;
  - a whole number is the shared `.field` with a visible label, the hint as a paragraph tied by `aria-describedby`, and `<input type="text" inputmode="numeric" autocomplete="off" spellcheck="false">`, short width (`field-short`). `type="number"` is not used: browsers differ on what it accepts and it changes with the scroll wheel;
  - when `optionProblem` gives a sentence, the field gets `aria-invalid="true"` and the sentence under it in the field's description, and the main button is unavailable but focusable with the same sentence tied to it, through the path `tooFew` and a toggle's blocked sentence already use. The sentence is not announced by itself while typing; it is read with the field and with the button.
  - Tab order: Remove, the group (one stop), the field, the main button. Focus after a pick goes to the main button, as for every one-file tool listed as a row; the options sit just before it.
- **Sending them, in `useToolRun`:** `{ ...preset, ...jobOption(), ...optionsToSend(words.options, state.choices) }`. What the visitor chose wins over a preset, as now.
- **Not a new component.** The two controls are native inputs drawn inside `ToolWorkspace`, as its "Turn every page" buttons and the file's line are; the rules are plain functions. If the review panel reads this as a new shared component, the options move into their own change first (see the proposal's scope).

### 3. How numbers reach the page: a drawn layer placed by qpdf

Numbers are drawn by pdf-lib on layer pages, one per page of the file, and placed by `qpdf --overlay`, through a shared step in `src/engines/stamp.ts` that Watermark and Sign PDF reuse.

Why this way:
- **pdf-lib draws, as `SPEC.md` names it for numbers,** with its standard fonts and text measures; Watermark will need its fonts and opacity, and Sign PDF its picture embedding.
- **qpdf places and writes,** so the file is written by the same library as every page tool, with everything else in the file kept (checked above), and qpdf carries the layer's fonts and pictures into the file. qpdf undoes each page's turn and user unit, and the page's own content is drawn inside its own `q … Q`, so nothing it does can move a number.

Alternatives considered:
- **Our own content stream and font, written into each page with a JSON update** (as `writeTurned` and Compress PDF write through qpdf). It leaves the page's own content stream where it is, which keeps marked content tied to its tags in the strictest sense, and adds less to each page. But our code would do the geometry qpdf already does, a page whose content ends with more `Q` than `q` would pop our saved state and could move the number, and Sign PDF would need picture streams and soft masks written by hand. Kept as the fallback if the hand check of tags in Adobe Reader fails (see risks).
- **pdf-lib opening the visitor's file and drawing on it.** It parses and rewrites the whole file in JavaScript, copes worse with damaged and protected files than qpdf, does not undo a page's turn, and wraps content the same way. Not used.

### 4. Reading each page's turn and boxes: `readPageBoxes`

`readPageBoxes(tools, plain)` in `stamp.ts` reads, from the plain copy:
- the pages in order, from `qpdf --json=2 --json-key=pages`, written to a file in qpdf's memory capped with `capFile` at 64 MB and parsed only if under it;
- every object's dictionary, from `readDictionaries` (already capped at 64 MB).

If either is over its cap or cannot be read, the job fails with the engine failure (a file of several hundred thousand pages; no fixture comes near). Object ids are taken only as `N G R`; values are checked to be finite numbers before use; inherited values are found up `/Parent` with a depth limit and a set of visited nodes, so a loop in the page tree ends.

For each page, as PDF.js reads it (so the result matches what the thumbnail and Firefox show):
- **Turn:** the page's or an ancestor's `/Rotate`; a number that is a multiple of 90 is taken modulo 360, anything else is 0.
- **Paper box:** the inherited `/MediaBox` when it is four finite numbers whose normalised width and height are above 0, else Letter (`[0 0 612 792]`), as PDF.js does.
- **Shown box:** the inherited `/CropBox`, by the same test, intersected with the paper box when that leaves an area, else the paper box.
- **User unit:** the page's own `/UserUnit` when it is a number above 0, else 1.
- **qpdf's box:** the page's own `/TrimBox` if it is an array, else the inherited `/CropBox`, else the `/MediaBox`, normalised.

Then:
- **A fix is written** for a page whose stored turn is not exactly 0, 90, 180 or 270 (own or inherited), whose own `/UserUnit` is there but not a number above 0, or whose qpdf box shares less than one point each way with the shown box, or is not four finite numbers. The fix sets the page's own `/Rotate` to the turn above, removes such a `/UserUnit`, and, for a box, sets its own `/TrimBox` to the shown box. Readers already show the page this way, so it looks as it did; a trim box that lies inside the shown box (a print file with bleed) is never changed, and the number then sits inside the trim, so trimming the paper does not cut it off. The fixes go into one JSON update (`updateJson`), with copies of only those pages' dictionaries.
- **The layer page** for each page is the size of qpdf's box (or the shown box, when fixed) times the user unit, width and height swapped for a turn of 90 or 270. Its **drawing area** is the part of that box inside the shown box, carried into the layer page's coordinates, upright as shown: for a box `[x0 y0 x1 y1]` and a point `(x, y)`, turn 0 gives `((x − x0)u, (y − y0)u)`, 90 gives `((y − y0)u, (x1 − x)u)`, 180 gives `((x1 − x)u, (y1 − y)u)` and 270 gives `((y1 − y)u, (x − x0)u)`.
- **One limit of our own:** a layer page more than 10^8 points on a side (35 km), which no real page is, stops the job with the engine failure, so pdf-lib and qpdf are never handed such numbers.

`readPageBoxes` returns, per page, the layer size and drawing area, and the fix update or none. Its per-page arithmetic is a pure function, `pageBox(values)`, exported for its test.

### 5. Drawing the numbers: the layer pages

- **Size:** `s = min(max(shorter side of the drawing area / 60, 8), 72)` points: 9.9 on A4, 10.2 on Letter, 8 on A6, 39.7 on A0.
- **Margin:** `m = 3s` from the two nearest edges of the drawing area (about 10.5 mm on A4). The number's width is pdf-lib's `widthOfTextAtSize` in Helvetica (every digit is 0.556 of the size), its height Helvetica's cap height, 0.718 of the size.
- **Place:** left `x = m`, centre `x = (W − width) / 2`, right `x = W − m − width`; bottom baseline `y = m`, top `y = H − m − 0.718s`, all from the drawing area's corner.
- **A page too small** for the number and its margin: the margin shrinks first, down to 0, then the size, down to what fits, so the number is always whole inside the drawing area (the overlay clips anything outside the layer page).
- **The text:** digits only, `String(first + index)`: 7 digits at most for any file under 9 million pages, and always a safe whole number, in black, in pdf-lib's standard Helvetica (`StandardFonts.Helvetica`, WinAnsi, not embedded: the digits are in every reader's built-in Helvetica or its stand-in).
- **Marked as a page number:** each number is drawn between `/Artifact << /Type /Pagination /Subtype /Footer >> BDC` (`/Header` at the top) and `EMC`, so in a tagged file it is not text of the page and is not added to any tag.
- **In files of 2,000 pages:** layer pages are drawn into pdf-lib documents of at most 2,000 pages, each saved with object streams and let go before the next, so memory holds the saved bytes, not 120,000 pages of pdf-lib objects. Progress is sent for each page drawn. The pdf-lib document is made with `updateMetadata: false`; nothing of the visitor's file goes into it but sizes and numbers.

### 6. Placing them: `stampLayers`

`stampLayers(tools, plain, layers, fix, onWriting)` in `stamp.ts`, beside `readPageBoxes`:
1. a fresh qpdf holding the plain copy as `/in.pdf`, each layer file at `/layer-<k>.pdf`, and the fix at `/fix.json` when there is one;
2. one call through `callWithArgumentFile`: `--progress`, `/in.pdf`, `--update-from-json=/fix.json` when needed, then for each layer `--overlay`, `/layer-<k>.pdf`, `--to=<first>-<last>`, `--`, then `--object-streams=generate` and `/out.pdf`. Every argument is a made-up path, an option or a range built from checked page numbers;
3. qpdf's write progress lines go to `onWriting`, as Merge PDF reads them;
4. `qpdf --check` on the result; a failed write or check is the engine failure; document text never goes into an error;
5. the result's bytes.

The plain copy is decrypted, so the result has no password and no restrictions. `--object-streams=generate` puts object streams back after the plain copy took them out.

### 7. The engine: `src/engines/tools/add-page-numbers.ts`

```
run([file], options, onProgress, tools):
  { position, first } = numberOptions(options)               // refused before any work if not valid
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  { plain, pages } = plainCopy(tools, file, passwordFrom(options))
  boxes = readPageBoxes(tools, plain)                         // layer sizes, drawing areas, fix
  pdflib = await tools.pdflib()
  layers = []
  for each run of up to 2,000 pages:
    doc = PDFDocument.create({ updateMetadata: false }); font = doc.embedFont(Helvetica)
    for each page i in the run:
      onProgress({ stage: 'working', unit: 'page', done: i, total: pages })
      layer page of boxes[i].size; at numberPlace(boxes[i].area, digits, position): BDC, drawText, EMC
    layers.push({ bytes: doc.save({ useObjectStreams: true }), from, to })
  onProgress({ stage: 'writing', percent: 0 })
  out = stampLayers(tools, plain, layers, boxes.fix, percent => onProgress({ stage: 'writing', percent: min(percent, 95) }))
  onProgress({ stage: 'writing', percent: 100 })
  return [out]
inspect = inspectPdf
```

- `numberOptions(options)` (exported): `position` must be one of the six strings; `first` must be a number with `Number.isSafeInteger`, from 1 to 999,999. Anything else, a missing key, or an object that is not plain, is refused with "The numbering options are not valid." Only own keys are read.
- `numberPlace(area, digits, position)` (exported) does section 5's arithmetic in plain numbers, for its test.
- pdf-lib is imported for types only; its values come from `tools.pdflib()`, so the engine file stays small and `check-worker.mjs` can check pdf-lib's code is in neither the engine nor `stamp`.

### 8. The page text

`src/content/tools/add-page-numbers-to-pdf.md`, 250 to 500 words, marked as a draft, covering: the steps; where the numbers can go and how large they are; the first number for a file that carries on from another; that every page is numbered, a cover too, and how to leave a cover out (number the rest with Extract pages or Split PDF first, then join with Merge PDF); what is kept; that earlier saved versions are not kept, a digital signature stops being valid, and a PDF/A file no longer meets PDF/A; that the password and restrictions are removed; that a number can sit under a form field or note placed at the same spot; that nothing is uploaded and the page forgets the file. Checked against "Banned patterns".

## Dependencies

No new dependency. `@cantoo/pdf-lib` 2.11.1 (MIT, last release 15 Sep 2026, about 243 KB by gzip in its own chunk) and qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1, ISC wrapper, Apache-2.0 qpdf) are already shipped. The `@cantoo/pdf-lib` line in `LICENSES.md` gains "and draws Add page numbers' numbers" in its reason; no line is added.

## Page weight and late loading

- **Before a pick:** the same island as every tool; the registry words grow by the options' few hundred bytes of props. The options' code is in the workspace chunk, which loads after a pick. `npm run weigh` must stay under 100 KB.
- **After a pick:** what Compress PDF fetches (the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, PDF.js and its data for the first page's thumbnail) and the engine with `stamp` and `qpdf-json`.
- **At the main button:** pdf-lib's file, which brings `fflate`. No other WebAssembly.
- `check-worker.mjs` checks the engine and `stamp` stay out of the worker file and hold no pdf-lib code. `page-weight.mjs` builds its engine list from the files already; it gets a `loadedLater` line only for a new chunk the build makes.

## Threats

- **Hostile PDFs.** qpdf parses them in the worker, which is ended after every job. Only qpdf's own JSON is parsed, from files capped at 64 MB while written and checked again before reading. Object keys must match `obj:N G R`; numbers must be finite; the page tree is walked with a depth limit and a visited set.
- **Huge page counts.** Layers are drawn in files of 2,000 pages, each let go once saved; progress is sent for every page and Cancel ends the worker. qpdf's arguments go through the argument file, so 60 or more `--overlay` options never reach its stack. A file over 20,000 pages shows the shared notice. Measured above: 120,000 shared-content pages took about 85 s in Node and 1.7 GB of memory; a phone may run out, which gives the memory failure and its advice.
- **Odd page boxes and turns.** Zero, negative, reversed, inherited, missing or non-finite boxes, a crop box off the paper, a trim box off the shown part, `/Rotate` of -90, 450, 45 or a reference, and `/UserUnit` of 0, negative or huge, are each read by the rules in section 4; the fixes write only a turn, a trim box and the removal of a user unit, all as readers already show the page; the 10^8-point limit stops the rest. A unit test makes a page of each kind and draws the result through PDF.js to find the number.
- **Content that tries to move the number.** A page's content is drawn inside its own form XObject and `q … Q` by qpdf; tested with an unbalanced `q`, a scaling `cm` and a fill colour.
- **Option abuse.** The page sends only `optionsToSend`'s values; the engine checks again: `first` a safe whole number from 1 to 999,999 (so `1e309`, which is `Infinity`, `-5`, `2.5`, `10^15`, `NaN`, a string and a missing key are refused), `position` one of six strings. Refused before the file is read. No option can make the number longer than the page count allows, or change anything but where it goes and where it starts.
- **Hostile file names.** Unchanged: `stem` cleans the output name; names never reach the engine.
- **Content Security Policy.** Unchanged. pdf-lib uses no `eval`; the standard font needs no font file.

## Tests

- **Unit, `tests/unit/options.test.ts`:** `wholeFrom` on "1", " 007 ", "", "0", "-5", "2.5", "1e309", "1000000", "999999", a 16-digit number, "١٢", "12a"; `optionProblem`, `optionsToSend`, `shownValue`; the reducer's `option-set` and `reset`.
- **Unit, `tests/unit/stamp.test.ts`:** `pageBox` for every rule in section 4; and real runs that make pages with pdf-lib (each turn, inherited and odd turns, offset, reversed and missing paper boxes, crop and trim boxes smaller, larger, of no area and off the page, user units, an unbalanced content stream), stamp a mark at the bottom centre, draw the result with PDF.js and find the mark's centre.
- **Unit, `tests/unit/add-page-numbers.test.ts`:** `numberOptions` and `numberPlace`; `run` on every file in `tests/fixtures/`, checking `qpdf --check`, the page count, each page's text through PDF.js ending with its number, the number's place for each of the six positions on `mixed.pdf`, `rich.pdf`'s bookmarks, link and `note.txt`, `form.pdf`'s fields and values, `tagged.pdf` keeping everything, `password.pdf` and `restricted.pdf` coming back unprotected, damaged files failing, bad options refused before qpdf runs; a page made in the test whose text is tied to a tag by marked content, whose structure tree PDF.js still resolves to that text after numbering, with the number outside it; the outcomes recorded in the fixtures README.
- **Component:** the options render as a fieldset with a legend and as a labelled field with its hint; the invalid state ties the sentence to the field and the main button; tools without options render as before.
- **E2e, `tests/e2e/add-page-numbers.spec.ts`,** at 360px and 1280px: choose, options by keyboard, invalid first number holding the button, number and check the download (text and place), password, damaged, not a PDF, two files, Cancel keeping the options, engine-load failure, the 20,000-page notice with changing an option blocking nothing for more than 100 ms, and the other tools' tests unchanged.
- **No-upload:** as the spec says, with `top-left` and `4321` among the secrets.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1); the 100 MB file is run by hand.
- `qpdf --check` in the unit tests; the four readers by hand (issue #7).
- Links, bookmarks, form fields, text, attachments and tags kept (unit tests); tags in Adobe Reader by hand (issue #7).
- Nothing blocks the page over 100 ms; progress and Cancel (e2e).
- Browsers and phones by hand (issue #7); keyboard and screen reader (e2e and component tests); contrast unchanged.
- No-upload test; engine unit tests; one e2e file.
- Page text drafted and marked; the owner's review is in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[Page content moved into a form XObject]** qpdf's overlay puts each page's own content in a form XObject on that page. Marked content inside it keeps its numbers, and PDF.js still ties every tag to its text (tested), but the PDF standard expects marked content in a form XObject to be pointed at through that form, so a strict accessibility checker may report it. → A hand check in issue #7 opens a tagged file from a word processor, numbered, in Adobe Reader's accessibility check and with a screen reader. If tags are lost there, the fallback in section 3 replaces `stampLayers` with our own content streams, with no change to the page or the specs.
- **[Pages that share content grow]** Each page gets its own copy of content it shared with other pages: the 120,000-page test file grew from 16.6 MB to 72.9 MB. Ordinary files, whose pages have their own content, grow by about 430 bytes a page. → Said in the design; the fallback would also remove it.
- **[A number under a field or note]** Form fields and notes are drawn above page content, so one placed at the number's spot hides it. → The page text says so; the visitor can choose another place.
- **[Dark pages]** A black number does not show on a black page. → No option for colour; plain, and a later change if asked.
- **[PDF/A]** The number's font is not inside the file, so a file that met PDF/A no longer does, and its claim to is left as it was. → The page says so.
- **[Very long files on phones]** Memory as measured above. → The notice above 20,000 pages, the memory failure's advice.
- **[Shared pieces ride along]** The options and the drawing step come with this tool, as earlier tools' shared pieces did, while `SPEC.md` "Build phases" 3 prefers a pull request of their own. → Named in the pull request; the owner question stays open.

## Migration Plan

None; a new tool.
