# Design

## Context

See `proposal.md` for why Crop PDF is first and why it crops by itself. What exists and is reused:

- **The one-file tool flow** every Phase 1 one-file tool uses: the row with the first page's thumbnail, no summary line, focus on the main button, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices (`isManyPages` shows for one-file tools), Cancel, "Go back to your file", the result block with static `resultNotes`.
- **The "no new file" outcome** (`noSmaller` in the registry; `[]` from the engine), built for Compress PDF and reused by Remove a password.
- **`plainCopy`** (`src/engines/plain.ts`): the input decrypted once, with no object streams, so qpdf's JSON update reaches every object; page tools drop passwords this way.
- **`readPages`** (`src/engines/stamp.ts`): each page's object id, own dictionary and where it is shown, read from capped qpdf JSON, with inherited `/Rotate`, `/MediaBox` and `/CropBox` found up the page tree (depth-limited, loop-safe) and `pageBox` applying PDF.js's rules (turn modulo 360, crop ∩ paper, user unit). Its result matches what PDF.js shows, which is what Crop needs.
- **`PlainSource`** (`{ plain?: Uint8Array }`, `stamp.ts`): how `stampPages` takes the plain copy and lets it go once qpdf holds it, so no more than two full copies are alive at once.
- **`updateJson`, `callWithArgumentFile`** (`src/engines/qpdf-json.ts`), **`cappedWrite`, `OutputLimit`** (`src/engines/qpdf.ts`), **`sizeLimit`, `pdfNumber`, `runPages`** (`stamp.ts`): the capped JSON update the stamp tools write with.
- **`openDocument`** (`src/engines/thumbnail.ts`): PDF.js opened from memory with the safe options, the fixed helper data through `BinaryDataFactory` (character maps always refused), a canvas budget across every live canvas, `pdfjsGuard`, per-page cleanup, and `drawPage`, used by `render` and `draw`.
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`): a tool's read and job sets are fixed by tool, and the job runs in a fresh worker that loads the whole job set first.

**Checked by experiment** (Node, this repo's `pdfjs-dist` 6.5.438, a scratch script outside the repo):

- PDF.js's `page.view` for `mixed.pdf` is the paper box and `page.rotate` the stored turn (0, 0, 90, 180); `getViewport({ scale: 1 })` swaps width and height for a quarter turn; `convertToPdfPoint` inverts the whole viewport transform, so it gives default user space whatever the turn. `PageViewport` multiplies the scale by `userUnit` (`pdf.mjs` line 1095), so the inverse also removes the user unit.
- On `chinese-unembedded.pdf`, PDF.js asks the factory for `cMapUrl:UniGB-UCS2-H.bcmap`; refused, it draws nothing **and `getTextContent` gives no items**. So text boxes cannot stand in for undrawn text: only the refusal itself shows that something was not drawn. This is why decision 3 stops measuring after any refusal.
- `getAnnotations()` gives `form.pdf`'s two widgets and `rich.pdf`'s link, each with `rect` in user space.

## Goals / Non-Goals

**Goals:**
- Cut white margins off every page with no option to set, never cutting anything a reader would show, including fields and links with no ink.
- Change only `/CropBox` (and cut back a page's own bleed, trim and art boxes); never rewrite content, `/MediaBox`, `/Rotate` or `/UserUnit`.
- Memory bounded by runs of 2,000 pages, and at most two full copies of the file alive at once besides the worker's own input copy. Measured: Chromium memory rose 0.11 GB over the 120,000-page job (peak 0.72 GB over baseline); the cause was not found (see "Found while building").
- No dependency, no new shared component, no change to how any other tool draws or writes.

**Non-Goals:**
- Margins the visitor sets, one size for every page, choosing pages, a preview of the cut, scans on grey paper or with dark edges, removing what is cut away, next steps after the result.

## Decisions

### 1. Crop by itself, with no options (decided by the owner, 23 Nov 2026)

The owner chose "Automatic only" and "Each page on its own" (`CLAUDE.md`, owner decisions). The alternatives, and why they wait:

- **Typed margins (top, right, bottom, left):** not for now, by the owner's decision. It would need a number option kind, a new shared component (`SPEC.md` "Build phases" rule 3), in its own change, `add-number-option`, first. A possible later change could add a second way to Crop (a choice "Cut white margins" / "Cut a set margin", the second showing four numbers through `when`).
- **One size for every page:** not chosen by the owner. It would also need a rule for files of mixed sizes and turns.
- **A list of fixed margins:** fits `ChoiceOption` today, but cuts blind: the same amount from every side of every page, whatever is on it. Rejected.
- **Drag handles on a preview:** deferred by the owner as a later shared component (21 Nov 2026).
- **Find the content from the content stream** (operator bounding boxes, as `pdfcrop`/Ghostscript's `bbox` device do) instead of drawing: finds invisible and white content too, so it would refuse to cut margins that only look empty, and it needs a content interpreter we do not have. PDF.js already interprets content; drawing and reading pixels is what a reader shows. Rejected.
- **Trim by the edge colour** (as ImageMagick's `-trim` does) instead of white: would crop scans on grey paper, but a scan's speckle, a dark scanner edge or a coloured page border stops it anyway, and it would crop a page with a coloured background to nothing useful. White only is predictable and easy to say on the page. A default the owner may overturn.

### 2. How a page is measured (`thumbnail.ts`)

**One paint step.** `drawPage` is split into one internal `paint(pdfPage, scale, maxPixels, annotationMode, use)`: it works out the size with `pictureSize`, the viewport at the final scale, counts the picture's canvas in the budget, makes it, renders on `#ffffff`, calls `use(canvas, size, viewport)` for the result, and in `finally` releases the canvas, `forgetAll` and `page.cleanup()`. `render` and `draw` pass a `use` that encodes PNG or JPG, so they behave exactly as before; `measure` passes one that reads pixels. The budget and cleanup rules exist once.

`OpenDocument` gains `measure(page): Promise<Measured>`, `Measured = { kind: 'box'; box: [x0, y0, x1, y1] } | { kind: 'blank' } | { kind: 'unsafe' }`, the box in default user space (before the user unit), normalised (`x0 < x1`, `y0 < y1`).

- **Drawing:** `AnnotationMode.ENABLE_STORAGE` (form fields with their values, as `draw` does), scale 1 (72 pixels to the inch as shown, which PDF.js multiplies by the user unit and turns by `/Rotate`, within `page.view`), at most `measurePixels = 4_000_000` through `pictureSize`. Only a small page is drawn larger: when the page's longer shown side is under 288 points (4 inches, a label or a receipt), the scale is raised so that side is 288 pixels, keeping a pixel under 1/72 of that side. A4 and Letter are drawn at scale 1 (842 by 595 and 792 by 612 pixels). No floor applies above 288 points: one pixel is a point, about 0.35 mm, against a margin of about 15 points on A4, so more pixels would buy nothing visible. Task 3.4 records the time per page.
- **The whole page must be on the canvas (security):** if the canvas's width or height differs from the viewport's by more than 1 pixel (`pictureSize` gave way on a page too thin for the cap, such as 1 by 10^8 points), the page is `unsafe`.
- **Reading pixels:** the canvas maker gains an optional `pixels(canvas, x, y, width, height): Uint8ClampedArray` (RGBA of that rectangle). The worker's maker reads `getImageData` from its `OffscreenCanvas` 2D context (already made with `willReadFrequently: true`); the Node test's maker reads `@napi-rs/canvas`'s `getImageData`. `measure` throws if the maker has none (only Crop calls it). A pixel is **ink** when any of R, G, B is below 240 (`whiteFrom = 240`). The scan reads strips of 16 rows from the top down until a row holds ink, then from the bottom up, then strips of 16 columns from each side inward between those rows, so a page with wide margins reads only its margins and a strip of content. The pixel box is grown by one pixel on each side (anti-aliasing, rounding), clamped to the canvas, then its four corners go through `viewport.convertToPdfPoint` and are normalised to a box in user space.
- **Annotations:** `page.getAnnotations({ intent: 'display' })`. Every annotation except `Popup`, and except those whose flags say hidden (bit 2) or no-view (bit 6), adds its normalised `rect` after clipping to `page.view`; a rect that is not four finite numbers, or has no area after clipping, is dropped. So an empty borderless field, a link over white space and a note's icon are kept inside the cut. More than 10,000 annotations on one page makes it `unsafe`.
- **Blank:** no ink and no annotation box → `blank`.
- **Per-page errors, as built:** reading the page (`getPage`) is inside the same try as the drawing, so an ordinary error on one page leaves that page as it is. More than 10,000 annotations is checked straight after they are read, before drawing. A drawn box whose corners are not finite numbers is `unsafe`.
- **Unsafe, as built:** a drawing that throws gives `unsafe` with the error attached; the engine, not the shared step, ends the job when that error is the browser running out of memory or PDF.js's own worker stopping (`outOfMemory` lives in `src/widget/memory.ts`, which the shared drawing file does not import, so no new shared chunk is made).
- **Unsafe:** the factory counts every refused helper-data request (`BinaryDataFactory.fetch` with nothing to give). If the count is above 0 after a page is drawn, that page and every later page are `unsafe` (decision 3). A drawing that throws (other than the guard's "PDF.js stopped", which ends the job) makes the page `unsafe`.

The unit tests' PDF.js stand-ins gain `getAnnotations`, `view`, `rotate`, `userUnit` and the viewport's `convertToPdfPoint`. The file's header comment says it also measures pages, for Crop PDF.

### 3. What PDF.js could not draw is never cut

The fixed helper data ships no character maps (owner, 11 Nov 2026), and the experiment shows a refused map leaves text undrawn and out of `getTextContent`. A font PDF.js loads once serves every later page, so after the first refusal a later page may use it without asking again. The rule is therefore "from the first refusal on, leave every page as it is", not "leave this page". Pages measured before it stay cut. The flag is the engine's, carried across the document's runs (decision 6), so reopening the document never forgets it.

The result's note ("pages the tool cannot measure safely are left as they are") and the no-new-file words cover such pages without naming the cause; a page left only for this reason is listed on the fixtures README.

A picture PDF.js fails to decode outside the factory (a decoder's JavaScript fallback loaded from `wasmUrl`) or content PDF.js skips on a parse error is not seen this way; that residual risk is under Risks.

### 4. The cut box (`cutBox`, pure)

For each page, from its `place` (shown box `B`, turn, unit `u`) and `measure`:

1. If `measure` is `blank` or `unsafe`, or PDF.js's `page.view` differs from `B` by more than 0.01 in any coordinate, or PDF.js's turn or user unit differs from `place`, the page is left as it is.
2. `D` = the shorter side of `B` as shown, in points (`× u`); the margin `m = D / 40` points, `m / u` in user units.
3. The new box is the content box grown by `m / u` on each side, then intersected with `B`. Numbers are rounded outward to 3 decimals (`floor` for the lower left, `ceil` for the upper right) and clamped to `B` again.
4. **Checked before it is used (security):** four finite numbers, `x0 < x1`, `y0 < y1`, inside `B`, each of magnitude under 10^9 (well below 10^15, so `pdfNumber` writes it in fixed form). Anything else leaves the page as it is.
5. If no edge moves inward by 1 point or more (`× u`), the page is left as it is.

The cut is in default user space, so `/Rotate` and `/UserUnit` stay as they were and the reader turns and scales the new box exactly as it did the old one. One page object listed twice in the page tree has one dictionary, so it gets the box of its first listing; both listings draw the same, so their boxes are the same.

**A page out of range ends the job, deliberately.** `readPages` stops the job when a page is under 1 point or over 10^8 points as shown, or its user unit is over 10^6 (`pageBox`, shared with the stamp tools). Only a crafted file has such a page. Leaving that page alone instead would need `readPages` to report rather than throw, a change to the stamp tools' shared step for a case no genuine file reaches; the job fails with the shared "could not be read" failure, as Add page numbers does. It can be revisited with the "read pages and dictionaries in one qpdf call" item left from Add page numbers.

### 5. What is written

- One JSON update (`updateJson(max, map)`): for each cut page, its own dictionary as read, with `/CropBox` set to the new box as a direct array of `pdfNumber` values. `/MediaBox`, `/Rotate`, `/UserUnit`, `/Contents`, `/Resources`, `/Annots` and every other key keep the dictionary's own values, untouched. A crop box inherited from the page tree is overridden on the page itself; the tree's value is not changed, so pages left as they are keep inheriting it.
- **Bleed, trim and art boxes** are not inheritable (ISO 32000-2, 14.11.2), so only a page's own are read. Each is resolved when it is an indirect object, then read with `pageBox`'s box rules (`boxOf`): one it cannot read is removed from the cut page; one it can is replaced by its intersection with the new crop box, written as a **direct array** on the page, so a box object shared with other pages is never changed; one with no area left is removed. The standard already reduces these boxes to the crop box when they reach past it, so the meaning is the same; writing it out keeps a reader or printer that ignores the rule from using the old margins. Alternative, leaving them untouched: rejected for that reason; a default the owner may overturn.
- **The write:** before it, the PDF.js document is closed (`await close()`), so its copy is let go. Then a fresh qpdf takes the plain copy from the engine's `PlainSource`, which drops its reference (`source.plain = undefined`), as `stampPages` does. `cappedWrite`: `/in.pdf --update-from-json=/u.json --object-streams=generate /out.pdf` through the argument file, the update and the output each held to `sizeLimit(plain, pages)` as for the stamp tools (an `OutputLimit` maps to the existing `output-limit` failure), then `qpdf --check`. When no page is cut, nothing is written and the engine gives `[]`.
- **Passwords:** the plain copy is decrypted, so the result has none, as for every page tool. PDF.js is given copies of the plain copy (`plain.slice()`, as PDF.js takes over the bytes it is given), not the input, so the job's PDF.js never sees the password; the input is let go after `plainCopy`.

### 6. The engine (`src/engines/tools/crop-pdf.ts`)

`loads = { read: ['qpdf'], job: ['qpdf', 'pdfjs'] }`; `inspect = inspectPdf`.

1. One file only; `plainCopy(tools, file, passwordFrom(options))` into a `PlainSource`; the input is not used again.
2. `readPages(tools, plain)`, mapped at once to `{ id, dict, place }` per page, so the resources and XObjects it also reads are let go.
3. **Measured in runs of `runPages` (2,000) pages.** PDF.js keeps every page it has opened in its page cache and its worker's page promises until the document is destroyed; `page.cleanup()` does not free them. So for each run the engine opens `openDocument(plain.slice(), undefined, tools)`, checks its page count equals `readPages`' (else the job fails: "The pages could not be read."), measures the run's pages, and awaits `close()` before the next run. The refusal flag (decision 3) is the engine's and carries across runs. A run's open document is closed in `finally`.
4. For each page: `measure`, then `cutBox`; progress `{ stage: 'working', unit: 'page', done, total, writesAfter: true }`, so "Page N of M" fills the bar to 0.8 and writing takes the rest, as Add page numbers does.
5. If no page is cut, `[]`. Otherwise decision 5, with writing progress from `cappedWrite`.

Besides the worker's own copy of the input, at most two full copies of the file are alive at once: the plain copy and one PDF.js copy while measuring; the plain copy, then qpdf's, while writing. Errors are fixed sentences; no page text, name or password goes into one. No option other than `passwords` is read.

### 7. The registry entry (words a draft for the owner's review)

```ts
{ id: 'crop-pdf', group: 'organise', runsIn: 'browser', phase: 2, accepts: ['application/pdf'],
  related: ['rotate-pdf', 'resize-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-jpg', 'merge-pdf'],
  pages: [{ slug: 'crop-pdf', name: 'Crop PDF',
            summary: 'Cut the white margins off the pages of a PDF.',
            title: 'Crop PDF margins in your browser - PDFkaro',
            description: 'Cut the white margins off the pages of a PDF. The file stays on your device and is not uploaded.',
            heading: 'Crop PDF margins',
            sentence: 'Cut the white margins off the pages of a PDF. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Crop and download', writingLabel: 'Writing the cropped file',
            doneHeading: 'Your cropped file is ready', failedHeading: 'The pages were not cropped.',
            tooFewFiles: 'Choose a PDF file to crop its pages.', outputSuffix: 'cropped',
            minFiles: 1, multiple: false, resultPages: 'input',
            memoryAdvice: 'Try on a computer, or split the file first and crop the parts.',
            items: 'files', itemControls: false, outputs: 'one',
            noSmaller: { heading: 'No pages were cropped.',
                         advice: 'No new file was made. This tool cuts only white margins, and leaves a page as it is when it cannot be sure where everything on it is. Pages with grey or dark edges, such as many scans, are left too. You can use your file as it is.' },
            resultNotes: [
              'Each page is cut to what is drawn on it, with a small margin left. Blank pages, pages with no white margin, and pages the tool cannot measure safely are left as they are.',
              'What was cut off is still in the file. Anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it. Cropping is not a way to hide something private.',
              "Pages, text, links, form fields, notes, bookmarks, attached files and the document's details are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them." ] } }
```

- Placed right after `rotate-pdf` and before `images-to-pdf` in the array. The registry test's catalogue-order check sorts tools by their row in `SPEC.md`'s whole catalogue and counts Image to PDF at `/image2pdf`, the last row of "Organise pages", so `/crop-pdf` must come before it. Home and hub lists follow array order, so Crop is listed seventh, after Rotate.
- `items: 'files'`: no per-page control, so one row with the first page, as every one-file tool without page controls. The 20,000-page notice shows for one-file tools already.
- `related` names `resize-pdf`, not yet published, so it shows only once Resize is; five links show now.
- The registry test's lists of tools allowed `noSmaller` gain `crop-pdf`.
- **Hub words** ("Organise pages"): description "Combine, split, copy out, remove, reorder, turn and crop the pages of a PDF, in your browser. Files stay on your device and are not uploaded." (139 characters); sentence "Tools that combine, split, reorder and crop the pages of a PDF." Both drafts; `claimsDevice` stays true (Crop runs in the browser).

### 8. Page text (`src/content/tools/crop-pdf.md`)

Three steps (choose the file; press "Crop and download"; download), then questions in plain words, with no colour values or fractions:

- Is my file uploaded?
- How does it decide where to cut? ("Anything on the page that is not white counts, even a light grey line or an empty form box. About 5 mm is left around it on an A4 page.")
- Why was a page, or my scan, not cut? (blank pages, pages with no white margin, pages the tool cannot be sure about, grey or dark edges)
- Why are my pages different sizes now? (each page is cut to what is on it)
- Is what I cut off gone? (No: it is still in the file; anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it; cropping is not a way to hide something private, and this site has no tool yet that removes it for good)
- Can I choose how much to cut? (not yet)
- Do links, forms and bookmarks still work? (and the signature)
- What happens to a password? Is my original changed?

250 to 500 words, marked as a draft, no banned word. The text must not say "crop to a selection" or anything the tool does not do.

### 9. The Privacy page draft

One sentence added to "What happens to your file", after the paragraph on what a new PDF can carry: "Crop PDF does not remove what it cuts off. It stays in the new file, where anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it." It stays a draft for the owner, under the existing `noindex`. The page's other claims cover Crop as built (the tool's worker and the PDF.js worker get the file; in the job PDF.js gets the decrypted copy, which the page's sentence "Both workers get the file's password" still covers for reading and thumbnails).

## Effect on page weight and on when WebAssembly is fetched

- **Before a pick:** the page is the generic widget island with this tool's words; the registry entry adds under 1 KB. Measured with `npm run weigh`; the page must stay under 100 KB like every tool page.
- **At a pick:** the read set (`qpdf`, with the spare qpdf making the WebAssembly request at once) and the draw set (PDF.js and its data), as for every PDF tool. WebAssembly is fetched at the pick, never at page load.
- **At the job:** a fresh worker loads `qpdf` and `pdfjs`, plus the Crop engine and the files it imports (`plain`, `inspect`, `stamp`, `qpdf-json`, `thumbnail`). No `fflate`, no pdf-lib (`stamp.ts` imports pdf-lib for its types only). `check:worker` keeps the engine in its own file, out of the worker file; `page-weight.mjs` already reads engines from the files, and only the `why` text of `stamp` and `thumbnail` changes.

## Threats considered

- **A hostile PDF:** PDF.js runs in its own worker with the safe options (no eval, no fonts installed, no fetch, `maxImageSize`), every drawing races `pdfjsGuard`, and every canvas is held by the document's canvas budget; `measure` draws at most 4 million pixels and calls a page whose drawing does not cover the whole viewport `unsafe`. qpdf reads only capped JSON (`maxPagesJson`, `maxDictionaryJson`); the update and the output are capped by `sizeLimit` (`OutputLimit`). Object ids are taken only as `N G R`.
- **Crafted page boxes and user units:** `pageBox` stops the job on a page under 1 point or over 10^8 points, or a user unit over 10^6 (decision 4, deliberate). A box PDF.js and qpdf read differently, a cut box that is not four finite, ordered numbers inside the old box, or annotation rects that are not finite leave the page as it is or are dropped. The new box is always inside the old shown box, so a crop never shows anything that was hidden. A shared bleed, trim or art box object is never written; the page gets its own direct array.
- **Many pages or annotations:** measured in runs of 2,000 pages, each run's document closed before the next, so PDF.js's page caches do not grow with the page count; more than 10,000 annotations on one page leaves it as it is. Task 3.4 measures time and checks that peak memory on the 120,000-page file does not grow with the page count. If cropping the 120,000-page file in Chromium takes more than 15 minutes on the test machine, the change is updated before the pull request: either measuring at a lower scale (36 pixels to the inch) for files over 20,000 pages, or a sentence beside the 20,000-page notice saying Crop draws every page and takes longest, as the reviewers prefer. **Measured at build (task 3.4):** 1,495 s (12.5 ms a page) in Chromium, over the 15 minutes. A lower scale does not help: 1,000 of its pages drawn at half the scale took 15.2 s against 16.1 s, as the time is PDF.js's work for each page, not its pixels. **Decided at stage 2 (program manager, architect, code reviewer):** the existing shared 20,000-page notice ("The job may take a long time. You can still go ahead.") and the sentence under the tool ("every page is looked at, so a long file takes a while") are the response for now. A Crop-specific sentence would need its own shared change first and is an owner question.
- **An oversized file:** no fixed limit; the 100 MB notice; at most two full copies alive at once besides the worker's input copy (decision 6). Task 3.4 records the 100 MB peak against Add page numbers' (1.19 GB in Node, 1.36 GB in Chromium).
- **A hostile file name:** the engine never sees it; the page builds `-cropped` names as every tool does.
- **Text or values leaking:** no page text, bookmark title, field value or password goes into an error, a progress report, a message or the console; the no-upload test watches for marked strings, including text in the cut-off margin and a form value.
- **Hiding is mistaken for removing:** the result, the questions and the Privacy draft say the cut-off part stays in the file, can be got back by anyone who has it, and some programs can still find, copy or read aloud the text in it. This is the one privacy risk the tool itself adds.

No server is involved, so SSRF and macros do not apply.

## Tests

- **`tests/unit/content-box.test.ts`** (the `measure` step, with the Node canvas maker), with `globalThis.fetch` replaced by a function that throws and records, asserted never called: `text.pdf`'s box holds every text line from `getTextContent`; `mixed.pdf`'s four pages, and pages made in the test with `/Rotate 90` and `270`, an offset and a reversed paper box, an inherited crop box and `/UserUnit 2`: drawing the original page and the same page with its crop box set to the box gives the same ink inside, and the original has no ink outside it; a blank page is `blank`; an empty borderless text field near the edge and a link over white space are inside the box, a hidden annotation, a popup, a zero-area rect and a rect outside the page are not; `#d9d6cc` and a 1-pixel hairline are ink, 240-grey paper is not; a page of grey 236 is ink edge to edge; `chinese-unembedded.pdf` is `unsafe`, and in a file made in the test of a Latin page then a page with unembedded Chinese, page 1 is `box` and page 2 and a third Latin page are `unsafe`; a poster-sized page and `/UserUnit 1000` are drawn under the pixel cap; a page of 1 by 10^8 points is `unsafe` (the drawing does not cover the viewport); a page of 200 by 100 points is drawn 288 pixels wide; the strip scan reads fewer pixels than the canvas holds on a page with wide margins.
- **`tests/unit/thumbnail.test.ts` and the PDF to JPG and PNG tests** pass unchanged after `paint` is shared.
- **`tests/unit/crop-pdf.test.ts`**: `run` on every file in `tests/fixtures/`, each outcome recorded (cut, no page cut, damaged, not a PDF, password needed without one); for every result, `qpdf --check`, no password or restrictions, each page's decoded content streams byte for byte as before (`pageStreams`), `/MediaBox`, `/Rotate` and `/UserUnit` as before; `rich.pdf`, `form.pdf`, `tagged.pdf`: bookmarks, link, `note.txt`, fields and values, tags kept, and every widget and link rectangle inside its page's new crop box; `multilingual.pdf`: text as before and ink in every script band of every page drawn after; `chinese-unembedded.pdf`: no page cut (`[]`); bleed, trim and art boxes cut back or removed, an indirect box shared by two pages left unchanged with each cut page given its own direct array, an unreadable box removed, none added; an inherited crop box overridden only on cut pages; `cutBox` refusing non-finite, reversed, outside and huge boxes; the margin (a fortieth of the shorter side) and the 1-point rule; `SECRET-margin` drawn in white in a margin is still in the text after (the cut-off part stays in the file); a file of more than 2,000 pages measured across runs, with a refusal in the first run leaving every page of the second run as it is; progress order and `writesAfter`; the output cap through a small limit; no error holding page text or the password.
- **Engine loads:** `crop-pdf` runs in the `engine-loads` shards against every fixture, asking only for `qpdf` when reading and `qpdf` and `pdfjs` in the job.
- **`tests/e2e/crop-pdf.spec.ts`** (importing `test` from `tests/e2e/fixtures.ts`), at 360px and 1280px: the page, the row, focus, "Getting ready", two files dropped, not a PDF, damaged, the password flow, a job on `text.pdf` with progress and the result notes, the download named `text-cropped.pdf` and checked with qpdf and PDF.js (new crop box, same content), a file where no page is cut ("No pages were cropped." and its words), Cancel, failures from a stand-in engine (memory, `output-limit`, engine not fetched) with "Go back to your file", the 100 MB and 20,000-page notices, keyboard only.
- **No-upload test** in the same spec, as Protect's and Rotate's: exact allowlist read from the build; secrets: `qz7report.pdf`, its stem, the password, the file's text, a `SECRET-margin` marker drawn in white in a margin that the crop cuts off, and a form field value `SECRET-field`; nothing in requests, headers, title, storage, address or console.
- **Uniform requests:** `/crop-pdf` added to `tests/e2e/uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs`, `failingJob` (`compress-json-bomb.pdf`, whose job fails at `readPages`' JSON cap, as on the stamp pages), `form.pdf`, `multilingual.pdf` with `expect: 'done'`, and `chinese-unembedded.pdf` with `expect: 'done'`, which is also the file where no page is cut.

## Risks / Trade-offs

- **A picture over PDF.js's size limit** (`maxImageSize`, 16,777,216 pixels: a 600 dpi scan, a 48-megapixel photo) is left out of PDF.js's drawing with only a warning, so a page holding one and a page number would be cut to the page number (found at stage 2 by the code reviewer, reproduced as `bigPicturePage` in `tests/unit/crop-helpers.ts`). → `readPages(…, { pictures: true })` gives each page's largest picture, through its resources' XObjects and forms to a depth limit, read from the same capped dictionary JSON; a page whose largest picture is over the limit is left as it is, before it is drawn. Opening PDF.js with `stopAtErrors` was tried first and does not work: PDF.js resolves the drawing once it has started, leaving the rest out, so the page read as blank or partial. Resources dictionaries joined by forms can share and loop (one dictionary used by a page and its forms, or by every page and form), and a cycle there is not a drawing loop, so the value is exact: the largest picture over each strongly connected component and everything it reaches, found by an iterative Tarjan walk memoised per component, linear over the whole file (coordinator, after stage 2). A large picture anywhere in a loop of forms leaves every page that reaches the loop as it is, whichever page is read first; pages that share one resources dictionary with their forms, or with every page and form, are still cropped. A form that draws itself and holds no large picture is croppable: PDF.js skips the form's second drawing of itself ("ignoring circular reference", then "ignoring XObject") and draws everything else, so nothing it would show is missing from the measure. A walk deeper than the tree depth limit (64 dictionaries on one path) gives Infinity and leaves the page as it is; no recursion is used, so a chain of 20,000 forms is read without running out of stack (tested). Not covered: an inline picture over the limit, pictures reached only through ExtGState soft masks, and pictures drawn only by annotations, patterns or Type 3 glyphs.
- **Content PDF.js does not draw and does not report** (a picture whose decoder falls back outside the factory or whose data is broken, content skipped after a parse error, an unsupported blend) can be cut off. → Crop only hides it, so nothing is lost from the file; the questions say to check the new file; the fixture runs and the hand checks in readers look for it. Not fully closed.
- **Scans on grey paper, with dark scanner edges or with speckle are not cut.** → The page says so in the no-new-file words and the questions. Typed margins, a possible later change (not for now, by the owner's decision of 23 Nov 2026), would answer it.
- **Each page cut to its own content gives pages of different sizes** (a book's pages will not line up). → Decided by the owner, 23 Nov 2026 ("Each page on its own"); the questions explain it.
- **The job is slower than other page tools,** as every page is drawn. → Progress per page and Cancel; measured on `pages-500.pdf`, the 100 MB and the 120,000-page files in task 3.4, with the response above if the largest is too slow.
- **A reader may still show annotations outside the crop box, or a print setting may use the paper box.** → The standard says the crop box clips display and print; Chrome, Firefox, Adobe Reader and Preview are hand checks in issue #7.
- **Signatures and earlier saved versions** are lost, as for every page tool. → Said on the page; the open owner question on signed files covers it.
- **`readPages` lives in `stamp.ts`,** a file named for drawing; Crop fetches the stamp step's file at job time. → No behaviour change and no extra request on stamp pages; moving page reading to its own file can come later, beside the "read pages and dictionaries in one qpdf call" item left from Add page numbers.
- **"Page 1 of 120000" has no thousands separator** (`src/widget/format.ts`), on every page tool. → Recorded as known in the fixtures README; not fixed here.

## Found while building

- **PDF.js leaves text outside the shown box out of the text it reads,** so the words first approved ("its text can still be found by searching, copied or read aloud") were true only for some programs. The result note, the questions, the Privacy draft and the specs now say "some programs can still find, copy or read aloud the text in it". The unit test checks that cut-off words stay in the page's content stream instead of in PDF.js's text.
- **`@napi-rs/canvas` 1.1.0 keeps the memory of every `getImageData` call** (about 2.3 MB for each A4 page read in full), in Node only. Node's memory figures for Crop are therefore not the browser's, and the unit tests' files of 2,003 pages use small, nearly full pages. The worker's `OffscreenCanvas` does not do this (Chromium figures in the fixtures README).
- **The uniform-requests test** gained `expect: 'no-file'`, for a job that must end with the tool's no-new-file words (Crop PDF on `chinese-unembedded.pdf`).
- **Memory rose 0.11 GB over the 120,000-page job in Chromium** (0.29 GB in the second tenth, 0.40 GB in the ninth, peak 0.72 GB), though PDF.js's caches are let go every 2,000 pages. The cause was not found; left for later.
- **The page boxes held in other objects are read by fresh qpdf instances** (`readValues`); reusing `readPages`' resolver instead is left for later, with the carried "read pages and dictionaries in one qpdf call" item.
- **Three result notes, not four:** the password sentence joined the note on what is kept, which now names notes too, as the questions do (UX, stage 2).
- **`makeRun({ sizeLimit })`** lets the unit test reach the output cap with a small budget, as PDF to JPG's `makeRun` does.

## Migration Plan

None. A new page and registry entry; no existing page, address or stored data changes. Rolling back is removing the entry and the files.
