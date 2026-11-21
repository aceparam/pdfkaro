# Design

## Context

- **`add-page-numbers` (PR #19)** built the drawing step, `src/engines/stamp.ts`: `stampPages(tools, source, { prepare, draw, onPage, onWriting })` reads every page's shown box, turn and user unit as PDF.js reads them, has the tool draw one pdf-lib layer page per page (sized as shown, upright), places each layer as a form XObject through qpdf's JSON update with `/Contents` as `[q, own streams, Q, draw]`, holds the update and the output to `2 × file + 2 KB × pages + 16 MB` (the `output-limit` failure), and writes the file with `--object-streams=generate` and `qpdf --check`. Its design records the placement experiment, the memory order, the measured times, the tags test and the risks (more `Q` than `q`; a genuine file whose pages inherit one very large `/Resources`; four qpdf instances on the largest file). Watermark reuses all of it unchanged.
- **`add-text-option` is merged first.** It gives the registry's `TextOption`, `optionTexts` with `acceptedText` and the `'standard-font'` character rule in `src/widget/option-values.ts`, the field in `ToolWorkspace` with focus moving to it once the file is read, the main button waiting while it is empty, and the text sent cleaned through `jobOptions`.
- **Checked by experiment** (Node, the same qpdf and pdf-lib, the result drawn by PDF.js's legacy build), with the drawing of section 2 run through the unchanged `stampPages`:
  - `mixed.pdf` (four pages: A4, Letter on its side, A5 turned a quarter, A4 upside down), `text.pdf`, `tagged.pdf` and `scanned.pdf` passed `qpdf --check`;
  - on every page the pixels that changed, against the same page before, formed a box whose middle was within 2.5% of the centre of the page as shown, and a 50-character text's box stayed inside the margin of a twelfth of the shorter side (0.09 to 0.91 of the width on A4);
  - PDF.js read the text's angle in each page's own space as 45, 135 and -135 degrees for turns of 0, 90 and 180, that is, 45 degrees rising as each page is shown, and the watermark's words as the page's last text item;
  - on white the drawn grey was 204 of 255, as mid-grey (128) at 40% gives; the text under it stayed readable;
  - the layer's form came out as `/Artifact << /Type /Pagination /Subtype /Watermark >> BDC … EMC`, with its opacity as a direct `/ExtGState` dictionary (`/ca 0.4`) in the form's resources and the font as one shared reference, which `fromPdfLib` already writes;
  - the files grew by about 1.5 KB at most (`mixed.pdf` 2.3 KB to 4.1 KB; `text.pdf` and `tagged.pdf` shrank, as object streams are written).
- pdf-lib's standard fonts turn characters outside their encoding into `?` without an error (`add-text-option`, Context), which is why the engine checks the text with `acceptedText` before anything else.

## Goals / Non-Goals

**Goals:**
- The visitor's text across the centre of every page as a reader shows it, readable, seen through, over pictures, whatever the page's turn, size or boxes.
- Everything Add page numbers keeps is kept, by the same step: each page's own content untouched, tags and shared streams as they were, no stored turn, box or user unit changed.
- No new dependency, no font in the file, no change to shared code.

**Non-Goals:**
- Size, colour, opacity, angle, place or font options; pictures; several lines; a watermark under the content; characters outside the standard fonts; some pages only; a preview.

## Decisions

### 1. The registry entry

```ts
{ id: 'watermark-pdf', group: 'edit', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  // Sign PDF and Protect are linked once they are published.
  related: ['add-page-numbers-to-pdf', 'sign-pdf', 'protect-pdf', 'merge-pdf', 'compress-pdf', 'rotate-pdf'],
  pages: [{ slug: 'watermark-pdf', name: 'Watermark', summary: 'Put your own text across every page of a PDF.',
            title: 'Add a watermark to a PDF in your browser - PDFkaro',
            description: 'Put a text watermark across every page of a PDF, in your browser. The file stays on your device and is not uploaded.',
            heading: 'Add a watermark to a PDF',
            sentence: 'Put your own text across every page of a PDF. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Add watermark and download', writingLabel: 'Writing the watermarked file',
            doneHeading: 'Your watermarked file is ready', failedHeading: 'The watermark was not added.',
            tooFewFiles: 'Choose a PDF file to add a watermark.', outputSuffix: 'watermarked',
            minFiles: 1, multiple: false, resultPages: 'input', items: 'files', itemControls: false, outputs: 'one',
            memoryAdvice: 'Try on a computer, or split the file first and add the watermark to each part.',
            options: [{ kind: 'text', key: 'text', label: 'Watermark text',
                        hint: 'Up to 50 characters, on one line. Use letters from English and other Western European languages, numbers and common marks.',
                        emptySentence: 'Type the watermark text first.',
                        refusedSentence: 'The watermark text could not be used. Check it and try again.' }],
            resultNotes: ['The watermark is on every page. Text, links, form fields, bookmarks and attached files are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- Placed after Add page numbers in the registry, so the catalogue-order test and the home page put it second under "Edit and sign".
- `src/widget/option-values.ts` gains `optionTexts['watermark-pdf'] = { text: { maxLength: 50, characters: 'standard-font' } }`; it is the one place the limit and the rule are written (`add-text-option`); the widget reads them from there, and the registry test from `add-text-option` checks the entry has this line and its hint's "50 characters" matches it.
- Four related links show now (Add page numbers, Merge, Compress, Rotate); Sign PDF and Protect follow once published. Add page numbers already names `watermark-pdf`, so its link to this page starts to show.
- **50 characters** keeps the text readable on small pages: on A6 a 50-character line is still about 11 points; a full sentence would shrink below what reads. **One line,** as `add-text-option` allows only one.

### 2. The engine: `src/engines/tools/watermark-pdf.ts`

```
run([file], options, onProgress, tools):
  text = acceptedText('watermark-pdf', 'text', options.text)   // undefined: throw new TextRefused() before any work; its message holds no text
  onProgress({ stage: 'reading', unit: 'file', done: 0, total: 1 })
  copy = plainCopy(tools, file, passwordFrom(options))
  out = await stampPages(tools, copy, {
    prepare: (doc, lib) => doc.embedFont(lib.StandardFonts.HelveticaBold),      // once for each run of up to 2,000 layer pages
    draw: (page, area, _index, font, lib) => drawWatermark(lib, page, area, text, font),
    onPage: (done, total) => onProgress({ stage: 'working', unit: 'page', done, total, writesAfter: true }),
    onWriting: (percent) => onProgress({ stage: 'writing', percent: Math.min(75 + percent / 5, 95) }),
  })
  onProgress({ stage: 'writing', percent: 100 })
  return [out]
inspect = inspectPdf
```

- The same shape, progress and memory order as Add page numbers' engine; the text never goes into an error or a progress message. A refused text gives `add-text-option`'s `text-refused` failure, with this tool's `refusedSentence`.
- pdf-lib is imported for types only; `stampPages` fetches it once and hands it to `prepare` and `draw`, so `check-worker.mjs` can check pdf-lib's code is not in the engine.

#### 2a. Where the text goes: `watermarkPlace` (exported, pure)

Given the layer's size `W × H` (the page as shown, upright, in points) and the text's width `k`, full height `c` and descent `d` at size 1 (Helvetica Bold: `c = 0.925`, `d = 0.207`; `k` from `widthOfTextAtSize`):
- `D = min(W, H)`, margin `m = D / 12` (about 17.5 mm on A4);
- turned 45 degrees, the text's box `k·s` by `c·s` takes a square of side `(k + c)·s / √2`, so the size that fits is `s = (D − 2m)·√2 / (k + c)`, and the size used is `min(s, D / 5)`, so a short word is not the whole page (119 points on A4, where "Draft" would otherwise be 215);
- the middle of the text's box, `(k·s / 2, (c / 2 − d)·s)` from its start on the baseline, goes on the centre of the page, `(W / 2, H / 2)`; the start is that centre less the middle turned by 45 degrees: `x = W/2 − (kx − ky)/√2`, `y = H/2 − (kx + ky)/√2`, with `kx = k·s/2`, `ky = (c/2 − d)·s`;
- the angle is 45 degrees in the layer, which `stampPages` places upright as the page is shown, so the text rises from the page's lower left to its upper right as a reader sees it.

**Why 45 degrees and not the page's diagonal:** a fixed angle looks the same on every page of a mixed file, matches what most readers and word processors call a diagonal watermark, and keeps the fit to one square. The page's own diagonal would tilt the text to 55 degrees on A4, 35 on A4 on its side, and almost upright on a long receipt, where it reads poorly.

#### 2b. Drawing it: `drawWatermark`

On the layer page: `/Artifact << /Type /Pagination /Subtype /Watermark >> BDC`, then pdf-lib's `drawText(text, { x, y, size, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.4, rotate: degrees(45) })`, then `EMC`, with numbers rounded to a thousandth of a point.
- **Artifact:** ISO 32000 (both 1.7 and 2.0, the table of artifact entries) gives `/Pagination` with the subtypes `/Header`, `/Footer` and `/Watermark`, so the watermark is outside the tag tree and a screen reader skips it, as Add page numbers' numbers are marked `/Pagination /Footer`.
- **Above the content:** `stampPages` always draws after the page's own content, so the text shows over whole-page scans and pictures. A form field or note at the centre is drawn above it, as for page numbers.
- **Mid-grey at 40%:** on white it shows as a light grey (204 of 255); over black text the text stays near black (about 51 of 255), so the page stays readable. `opacity` gives a fill opacity (`/ca`) in a graphics state inside the form; the page's own content is wrapped in `q … Q` first, so a low opacity it leaves set cannot change the watermark, and the watermark's own state ends with the form.
- **Helvetica Bold, not put inside the file:** a standard font every reader has, as Add page numbers uses Helvetica; it holds every character `'standard-font'` takes.

### 3. Shared code

None changes. Considered and dropped: writing one shared form for all pages of the same size, since Watermark's layers repeat. pdf-lib gives each layer page's graphics state a new random name, so the layers are not identical as written, and a form per page costs a few hundred bytes (measured in task 3.2); a later change can share them if a large file shows the need.

### 4. The page text

`src/content/tools/watermark-pdf.md`, 250 to 500 words, marked as a draft, covering:
- the steps (choose the file, type the text, press "Add watermark and download", then Download);
- what it looks like (grey, seen through, across the middle at a slant, sized to each page, upright as each page is shown);
- which characters work (letters from English and other Western European languages, numbers and common marks) and that other scripts cannot be used for now, said plainly without promising when;
- that anyone with a PDF editor can remove or cover a watermark, so it marks a file but does not protect it;
- that the words may be picked up when the page's text is copied or searched in some readers;
- what is kept; that earlier saved versions are not kept, a digital signature stops being valid and a PDF/A file no longer meets PDF/A; that the password and restrictions are removed; that a form field or note at the centre can cover it;
- privacy, saying only what the page controls (the privacy reviewer, stage 1): the file and the text are not uploaded or sent anywhere; the page keeps them only while the tab is open, and lets go of them when "Start again" is pressed or the tab is closed or left. It does not say the page forgets them on download (it does not), claims nothing about keyboard apps, browser extensions or spell checkers outside the page, and makes no "100%" claim.

No question restates the title, and the page's own words use no capitals for emphasis, even in examples. Checked against "Banned patterns".

## Dependencies

No new dependency, and no font. `@cantoo/pdf-lib` 2.11.1 (MIT, last release 15 Sep 2026, about 243 KB by gzip in its own chunk) and qpdf 12.2.0 (`@neslinesli93/qpdf-wasm` 0.3.1, ISC wrapper, Apache-2.0 qpdf) are already shipped. The `@cantoo/pdf-lib` line in `LICENSES.md` gains "and Watermark's text" in its reason.

## Page weight and late loading

- **Before a pick:** the same island; the entry's option words add a few hundred bytes of props. `npm run weigh` must stay under 100 KB.
- **After a pick:** what Add page numbers fetches (the worker, the workspace chunk, qpdf and its WebAssembly, `inspect`, `plain`, PDF.js and its data for the first page's thumbnail), and the engine with `stamp`. With two engines importing the drawing step, the bundler gives it a file of its own (`stamp-*.js`, which also holds `option-values`), and puts the qpdf JSON helpers in the shared `plain` file; `page-weight.mjs` names `stamp` in `loadedLater`, and Add page numbers' exact no-upload allowlist gains `stamp-*.js` (found while building; its other checks are unchanged).
- **At the main button:** pdf-lib's file, which brings `fflate`. No other WebAssembly.
- `check-worker.mjs` checks the engine stays out of the worker file, is loaded late and holds no pdf-lib code.

## Threats

- **Hostile PDFs.** As Add page numbers: qpdf parses them in the worker, which is ended after every job; only qpdf's own capped JSON is parsed; page boxes, turns and user units are read as PDF.js reads them, with the 1-point and 10^8-point limits; the update is built with `JSON.stringify`. Nothing new is parsed.
- **Huge page counts.** Layers drawn 2,000 pages at a time and let go; progress for every page; Cancel ends the worker; the notice over 20,000 pages; the memory failure with its advice on a phone.
- **A result that balloons.** The page's own content is referenced, not copied; the update and the output are held to the same budget; a test watermarks thousands of pages sharing one tiny content stream and checks the growth.
- **Content that tries to change the watermark.** Wrapped in `q … Q`; tested with a low opacity, a scaling `cm` and a fill colour left set. More `Q` than `q` remains the known limit of the drawing step.
- **Characters that mean something in PDF syntax.** Parentheses, backslashes, `%`, `<`, `>`, `[`, `]` and `/` are all in `'standard-font'`. pdf-lib writes a standard font's text as a hex string (`<…> Tj`), so none of them can close a string or start an operator; a unit test draws `a) Tj (b \ % <x> [/y]` and checks the layer stream holds it only inside one hex string, `qpdf --check` passes and PDF.js reads it back exactly.
- **The text.** Checked with `acceptedText` before the file is read: only a string, only the tool's own line, cleaned, at most 50 characters, only `'standard-font'` characters, so no control character, direction override or invisible mark reaches pdf-lib, and pdf-lib never draws `?` in place of a refused character. pdf-lib writes it as a hex string inside the layer's content stream; it never reaches qpdf's arguments or a JSON string built by hand.
- **Option abuse.** `'__proto__'`, a number, `null`, a missing key, an empty or long text, a tab, Devanagari: each refused before the file is read, with an error that does not hold the text.
- **Hostile file names.** Unchanged: `stem` cleans the output name; names never reach the engine.
- **Content Security Policy.** Unchanged. pdf-lib uses no `eval`; the standard font needs no font file.

## Tests

- **`tests/unit/watermark-pdf.test.ts`:**
  - `watermarkPlace` on A4, A4 on its side, Letter, A6, A0, a 20 by 20 point page and a 10 by 2,000 point strip, for "D", "Draft" and 50 characters: the turned box inside the margin on all four sides, its middle on the centre, the size at most a fifth of the shorter side, 119 points for "Draft" on A4;
  - `a) Tj (b \ % <x> [/y]` drawn: `qpdf --check` passes, PDF.js reads it back exactly, and the layer's content stream holds the text only inside one `<…>` hex string, with no `(` string and no stray operator;
  - the text refused when missing, empty, only spaces, 51 characters, "मसौदा", "Łódź", a tab, a number, `null` or under `'__proto__'`, with `TextRefused` before qpdf is asked for (a spy on `tools.qpdf`), with an error that does not hold the text;
  - `run` on every file in `tests/fixtures/`: `qpdf --check`; the page count; each page's text through PDF.js holding its own text, with the watermark's words last; on `mixed.pdf`, the changed pixels against the page before forming a box whose middle is within 3% of the centre of each page as shown and inside its margin, and the text's angle as shown 45 degrees; the drawn grey 204 (±3) on white; the form holding `/Artifact << /Type /Pagination /Subtype /Watermark >> BDC` and a graphics state with `/ca 0.4`; "Brouillon – à relire" drawn with its accents (PDF.js reads it back as typed); `scanned.pdf` showing the text over its pictures; `rich.pdf`'s bookmarks, link and `note.txt`; `form.pdf`'s fields and values; `tagged.pdf`'s tags, destination and thread, with every tagged MCID still in its page's own content and its streams unchanged; `password.pdf` (with its password) and `restricted.pdf` back with no password and no restrictions; `warning.pdf` watermarked; the damaged files failing with the damaged outcome;
  - a page made in the test whose content sets `/ca 0.1`, a scaling `cm` and a red fill without restoring them: the watermark's place, size, grey and opacity unchanged;
  - thousands of pages sharing one tiny content stream: finished fast, the stream still one and unchanged, growth no more than a few hundred bytes a page.
- **E2e and no-upload:** as the tasks list.

## Definition of done

- Every fixture gives a correct result or a clear message (task 3.1); the 100 MB file run by hand.
- `qpdf --check` in the unit tests; the four readers by hand (issue #7).
- Links, bookmarks, form fields, text, attachments and tags kept (unit tests).
- Nothing blocks the page over 100 ms; progress and Cancel (e2e).
- Browsers and phones by hand (issue #7), including whether the on-screen keyboard opens when focus moves to the field; keyboard and screen reader (e2e); contrast unchanged.
- No-upload test; engine unit tests; one e2e file.
- Page text drafted and marked; the owner's review is in issue #7. The tool is not called done in the pull request.

## Risks / Trade-offs

- **[Only Western European characters]** Visitors who write in Hindi, Telugu, Arabic or Chinese cannot make a watermark in their language. → Refused with a plain sentence and said in the hint and the page text; fonts for other scripts are to be taken up later (owner, 21 Nov 2026; issue #20).
- **[Readers that ignore opacity]** A reader or printer that draws no transparency would show the grey solid over the text it crosses. → Every reader `SPEC.md` names supports fill opacity; the hand checks in issue #7 include printing to PDF from one of them. A watermark under the content was considered and dropped: it would be hidden by any whole-page scan or white box, which is where people most often want one.
- **[Words in copied text]** Readers that do not skip artifacts (PDF.js among them) include the watermark's words when a page's text is copied or searched. → Marked as an artifact for the readers that do; the page text says so.
- **[Not protection]** Anyone with a PDF editor can remove the watermark's form or cover it. → The page text says a watermark marks a file and does not protect it.
- **[A watermark under a field or note]** Form fields and notes are drawn above page content. → The page text says so.
- **[Light text on dark pages]** Mid-grey at 40% barely shows on a dark page. → No colour option; plain, and a later change if asked.
- **[PDF/A]** The new file no longer meets PDF/A (transparency and an unembedded font), and any claim it makes is left as it was. → The page says so.
- **[The drawing step's known limits]** More `Q` than `q`; a genuine file whose many pages inherit one very large `/Resources` refused by the update budget with the wrong advice; four qpdf instances on the largest file. → Inherited from `add-page-numbers` and named in the pull request; task 3.2 measures this tool on the same files.

## Migration Plan

None; a new tool.
