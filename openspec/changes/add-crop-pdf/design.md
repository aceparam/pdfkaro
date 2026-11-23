# Design

## Context

See `proposal.md` for why Crop PDF is first and why it crops by itself. What exists and is reused:

- **The one-file tool flow** every Phase 1 one-file tool uses: the row with the first page's thumbnail, no summary line, focus on the main button, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices (`isManyPages` shows for one-file tools), Cancel, "Go back to your file", the result block with static `resultNotes`.
- **The "no new file" outcome** (`noSmaller` in the registry; `[]` from the engine), built for Compress PDF and reused by Remove a password.
- **`plainCopy`** (`src/engines/plain.ts`): the input decrypted once, with no object streams, so qpdf's JSON update reaches every object; page tools drop passwords this way.
- **`readPages`** (`src/engines/stamp.ts`): each page's object id, own dictionary and where it is shown, read from capped qpdf JSON, with inherited `/Rotate`, `/MediaBox` and `/CropBox` found up the page tree (depth-limited, loop-safe) and `pageBox` applying PDF.js's rules (turn modulo 360, crop ∩ paper, user unit). Its result matches what PDF.js shows, which is what Crop needs.
- **`updateJson`, `callWithArgumentFile`** (`src/engines/qpdf-json.ts`), **`cappedWrite`, `OutputLimit`** (`src/engines/qpdf.ts`), **`sizeLimit`** (`stamp.ts`): the capped JSON update the stamp tools write with.
- **`openDocument`** (`src/engines/thumbnail.ts`): PDF.js opened from memory with the safe options, the fixed helper data through `BinaryDataFactory` (character maps always refused), a canvas budget across every live canvas, `pdfjsGuard`, per-page cleanup, and `draw` for whole pages.
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`): a tool's read and job sets are fixed by tool, and the job runs in a fresh worker that loads the whole job set first.

**Checked by experiment** (Node, this repo's `pdfjs-dist` 6.5.438, a scratch script outside the repo):

- PDF.js's `page.view` for `mixed.pdf` is the paper box and `page.rotate` the stored turn (0, 0, 90, 180); `getViewport({ scale: 1 })` swaps width and height for a quarter turn; `convertToPdfPoint` inverts the whole viewport transform, so it gives default user space whatever the turn. `PageViewport` multiplies the scale by `userUnit` (`pdf.mjs` line 1095), so the inverse also removes the user unit.
- On `chinese-unembedded.pdf`, PDF.js asks the factory for `cMapUrl:UniGB-UCS2-H.bcmap`; refused, it draws nothing **and `getTextContent` gives no items**. So text boxes cannot stand in for undrawn text: only the refusal itself shows that something was not drawn. This is why decision 3 stops measuring after any refusal.
- `getAnnotations()` gives `form.pdf`'s two widgets and `rich.pdf`'s link, each with `rect` in user space.

## Goals / Non-Goals

**Goals:**
- Cut white margins off every page with no option to set, never cutting anything a reader would show, including fields and links with no ink.
- Change only `/CropBox` (and cut back a page's own bleed, trim and art boxes); never rewrite content, `/MediaBox`, `/Rotate` or `/UserUnit`.
- No dependency, no new shared component, no change to how any other tool draws or writes.

**Non-Goals:**
- Margins the visitor sets, one size for every page, choosing pages, a preview of the cut, scans on grey paper or with dark edges, removing what is cut away, next steps after the result.

## Decisions

### 1. Crop by itself, with no options

The visitor gets one button. The alternatives and why they wait:

- **Typed margins (top, right, bottom, left):** handles scans with dark edges and exact cuts, but needs a number option kind, which is a new shared component (`SPEC.md` "Build phases" rule 3) and so its own change, `add-number-option`, first. Put to the owner; if wanted, it comes after this tool and adds a second way to Crop (a choice "Cut white margins" / "Cut a set margin", the second showing four numbers through `when`).
- **A list of fixed margins:** fits `ChoiceOption` today, but cuts blind: the same amount from every side of every page, whatever is on it. It cuts text off some pages and leaves margins on others. Rejected.
- **Drag handles on a preview:** the owner deferred drag placement as a later shared component (21 Nov 2026), and it is the least usable by keyboard and on a phone.
- **Find the content from the content stream** (operator bounding boxes, as `pdfcrop`/Ghostscript's `bbox` device do) instead of drawing: finds invisible and white content too, so it would refuse to cut margins that only look empty, and it needs a content interpreter we do not have. PDF.js already interprets content; drawing and reading pixels is what a reader shows. Rejected.
- **Trim by the edge colour** (as ImageMagick's `-trim` does, taking the corner colour as background) instead of white: would crop scans on grey paper, but a scan's speckle, a dark scanner edge or a coloured page border stops it anyway, and it would crop a page with a coloured background to nothing useful. White only is predictable and easy to say on the page. Kept as an owner question.

### 2. How a page is measured (`measure` on the open document, `thumbnail.ts`)

`OpenDocument` gains `measure(page): Promise<Measured>`, `Measured = { kind: 'box'; box: [x0, y0, x1, y1] } | { kind: 'blank' } | { kind: 'unsafe' }`, the box in default user space (before the user unit).

- **Drawing:** the page at viewport scale `s` (which PDF.js multiplies by the user unit and turns by `/Rotate`, within `page.view`), on `#ffffff`, `AnnotationMode.ENABLE_STORAGE` (form fields with their values, as `draw` does). `s` starts at 1 (72 pixels to the inch as shown); a page whose longer side would be under 1,000 pixels is drawn larger so it is, and every page is held to `measurePixels = 4_000_000` with `pictureSize`. The canvas is counted by the document's canvas budget, released, and `forgetAll` and `page.cleanup()` run after, exactly as in `drawPage`.
- **Reading pixels:** the canvas maker gains an optional `pixels(canvas): Uint8ClampedArray` (RGBA). The worker's maker reads `getImageData` from its `OffscreenCanvas` 2D context (already made with `willReadFrequently: true`); the Node test's maker reads `@napi-rs/canvas`'s `getImageData`. `measure` throws if the maker has none (only Crop calls it). A pixel is **ink** when any of R, G, B is below 240 (`whiteFrom = 240`). Rows are scanned from the top down and the bottom up, and columns from each side inward between the rows found, so a page with wide margins reads only a fraction of its pixels. The pixel box is grown by one pixel on each side (anti-aliasing, rounding), then its two corners go through `viewport.convertToPdfPoint` to user space.
- **Annotations:** `page.getAnnotations({ intent: 'display' })`. Every annotation except `Popup`, and except those whose flags say hidden (bit 2) or no-view (bit 6), adds its normalised `rect`, clipped to `page.view`. So an empty borderless field, a link over white space and a note's icon are kept inside the cut. More than 10,000 annotations on one page makes it `unsafe`.
- **Blank:** no ink and no annotation box → `blank`.
- **Unsafe:** the factory counts every refused helper-data request (`BinaryDataFactory.fetch` with nothing to give). If the count is above 0 after drawing a page, that page and every later page are `unsafe` (decision 3). A drawing that throws (other than the guard's "PDF.js stopped", which ends the job) makes the page `unsafe`.

`render` and `draw` are not changed; the PDF.js stand-ins in the unit tests gain `getAnnotations` and the viewport's `convertToPdfPoint`.

### 3. What PDF.js could not draw is never cut

The fixed helper data ships no character maps (owner, 11 Nov 2026), and the experiment shows a refused map leaves text undrawn and out of `getTextContent`. A font PDF.js loads once serves every later page, so after the first refusal a later page may use it without asking again. The rule is therefore "from the first refusal on, leave every page as it is", not "leave this page". Pages measured before it stay cut. The result's note ("pages with no white margin are left as they are") and the text below the tool cover such pages without naming the cause; a page that is left only for this reason is listed on the fixtures README.

A picture PDF.js fails to decode outside the factory (a decoder's JavaScript fallback loaded from `wasmUrl`) or content PDF.js skips on a parse error is not seen this way; that residual risk is under Risks.

### 4. The cut box

For each page, from `readPages`' `place` (shown box `B`, turn, unit `u`) and `measure`:

1. If `measure` is `blank` or `unsafe`, or PDF.js's `page.view` differs from `B` by more than 0.01 in any coordinate, or PDF.js's turn or user unit differs from `place`, the page is left as it is.
2. `D` = the shorter side of `B` as shown, in points (`× u`); the margin `m = D / 40` points, `m / u` in user units.
3. The new box is the content box grown by `m / u` on each side, then intersected with `B`. Numbers are rounded outward to 3 decimals (`floor` for the lower left, `ceil` for the upper right) and clamped to `B` again.
4. If no edge moves inward by 1 point or more (`× u`), the page is left as it is.

The cut is in default user space, so `/Rotate` and `/UserUnit` stay as they were and the reader turns and scales the new box exactly as it did the old one. One page object listed twice in the page tree has one dictionary, so it gets the box of its first listing; both listings draw the same, so their boxes are the same.

### 5. What is written

- One JSON update (`updateJson(max, map)`): for each cut page, its own dictionary as `readPages` read it, with `/CropBox` set to the new box. `/MediaBox`, `/Rotate`, `/UserUnit`, `/Contents`, `/Resources`, `/Annots` and every other key are the dictionary's own values, untouched. A crop box inherited from the page tree is overridden on the page itself; the tree's value is not changed, so pages left as they are keep inheriting it.
- **Bleed, trim and art boxes** are not inheritable (ISO 32000-2, 14.11.2), so only a page's own are read. Each one the cut page has is replaced by its intersection with the new crop box, or removed when that has no area. The standard already reduces these boxes to the crop box when they reach past it, so the meaning is the same; writing it out keeps a reader or printer that ignores the rule from using the old margins. Alternative, leaving them untouched: rejected for that reason; the owner may overturn it.
- **The write:** `cappedWrite` on a fresh qpdf holding the plain copy: `/in.pdf --update-from-json=/u.json --object-streams=generate /out.pdf` through the argument file, the update and the output each held to `sizeLimit(plain, pages)` as for the stamp tools (an `OutputLimit` maps to the existing `output-limit` failure), then `qpdf --check`. When no page is cut, nothing is written and the engine gives `[]`.
- **Passwords:** the plain copy is decrypted, so the result has none, as for every page tool. PDF.js is given a copy of the plain copy (`plain.slice()`, as PDF.js takes over the bytes it is given), not the input, so the job's PDF.js never sees the password; the input is let go after `plainCopy`.

### 6. The engine (`src/engines/tools/crop-pdf.ts`)

`loads = { read: ['qpdf'], job: ['qpdf', 'pdfjs'] }`; `inspect = inspectPdf`.

1. One file only; `plainCopy(tools, file, passwordFrom(options))`.
2. `readPages(tools, plain)`; page count from it.
3. `openDocument(plain.slice(), undefined, tools)`; a page count different from `readPages`' fails the job ("The pages could not be read.").
4. For each page: `measure`, then decision 4; progress `{ stage: 'working', unit: 'page', done, total, writesAfter: true }`, so "Page N of M" fills the bar to 0.8 and writing takes the rest (as Add page numbers does). The document is closed in `finally`.
5. If no page is cut, `[]`. Otherwise decision 5, with writing progress from `cappedWrite`.

Errors are fixed sentences; no page text, name or password goes into one. No options are read; any option sent is ignored except `passwords`.

### 7. The registry entry (words a draft for the owner's review)

```ts
{ id: 'crop-pdf', group: 'organise', runsIn: 'browser', phase: 2, accepts: ['application/pdf'],
  related: ['rotate-pdf', 'resize-pdf', 'split-pdf', 'compress-pdf', 'pdf-to-jpg', 'merge-pdf'],
  pages: [{ slug: 'crop-pdf', name: 'Crop PDF',
            summary: 'Cut the white margins off the pages of a PDF.',
            title: 'Crop PDF margins in your browser - PDFkaro',
            description: 'Cut the white margins off the pages of a PDF. The file stays on your device and is not uploaded.',
            heading: 'Crop the margins of a PDF',
            sentence: 'Cut the white margins off the pages of a PDF. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Crop and download', writingLabel: 'Writing the cropped file',
            doneHeading: 'Your cropped file is ready', failedHeading: 'The pages were not cropped.',
            tooFewFiles: 'Choose a PDF file to crop its pages.', outputSuffix: 'cropped',
            minFiles: 1, multiple: false, resultPages: 'input',
            memoryAdvice: 'Try on a computer, or split the file first and crop the parts.',
            items: 'files', itemControls: false, outputs: 'one',
            noSmaller: { heading: 'There were no white margins to cut.',
                         advice: 'No new file was made. Pages with grey or dark edges, such as many scans, cannot be cropped by this tool yet. You can use your file as it is.' },
            resultNotes: [
              'Each page is cut to what is drawn on it, with a small margin left. Blank pages and pages with no white margin are left as they are.',
              'What was cut off is hidden, not removed. It is still in the file, and a PDF editor can show it again. Do not crop a file to hide something private.',
              "Pages, text, links, form fields, bookmarks, attached files and the document's details are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid.",
              'The new file has no password and no restrictions, even if the file you chose had them.' ] } }
```

- Placed right after `rotate-pdf` and before `images-to-pdf` in the array. The registry test's catalogue-order check sorts tools by their row in `SPEC.md`'s whole catalogue and counts Image to PDF at `/image2pdf`, the last row of "Organise pages", so `/crop-pdf` must come before it. Within the group, home and hub lists follow array order, so Crop is listed seventh, after Rotate.
- `items: 'files'`: no per-page control, so one row with the first page, as every one-file tool without page controls. The 20,000-page notice shows for one-file tools already.
- `related` names `resize-pdf`, not yet published, so it shows only once Resize is; five links show now.
- The registry test's lists of tools allowed `noSmaller` gain `crop-pdf`.
- **Hub words** ("Organise pages"): description "Combine, split, copy out, remove, reorder, turn and crop the pages of a PDF, in your browser. Files stay on your device and are not uploaded." (139 characters); sentence "Tools that combine, split, reorder and crop the pages of a PDF." Both drafts; `claimsDevice` stays true (Crop runs in the browser).

### 8. Page text (`src/content/tools/crop-pdf.md`)

Three steps (choose the file; press "Crop and download"; download), and questions: Is my file uploaded? How does it decide where to cut? Why was a page or my scan not cut? Is what I cut off gone? (hidden, not removed; not for private things) Can I choose how much to cut? (not yet; each page is cut to what is drawn on it, with a small margin) Do links, forms and bookmarks still work? (and the signature) What happens to a password? Is my original changed? 250 to 500 words, marked as a draft, no banned word. The FAQ must not say "crop to a selection" or anything the tool does not do.

### 9. The Privacy page draft

One sentence added to "What happens to your file", after the paragraph on what a new PDF can carry: "Crop PDF hides the margins it cuts off; what was in them stays in the new file." It stays a draft for the owner, under the existing `noindex`. The page's other claims cover Crop as built (the tool's worker and the PDF.js worker get the file; in the job PDF.js gets the decrypted copy, which the page's sentence "Both workers get the file's password" still covers for reading and thumbnails).

## Effect on page weight and on when WebAssembly is fetched

- **Before a pick:** the page is the generic widget island with this tool's words; the registry entry adds under 1 KB. Measured with `npm run weigh`; the page must stay under 100 KB like every tool page.
- **At a pick:** the read set (`qpdf`, with the spare qpdf making the WebAssembly request at once) and the draw set (PDF.js and its data), as for every PDF tool. WebAssembly is fetched at the pick, never at page load.
- **At the job:** a fresh worker loads `qpdf` and `pdfjs`, plus the Crop engine and the files it imports (`plain`, `inspect`, `stamp`, `qpdf-json`, `thumbnail`). No `fflate`, no pdf-lib (`stamp.ts` imports pdf-lib for its types only). `check:worker` keeps the engine in its own file, out of the worker file.

## Threats considered

- **A hostile PDF:** PDF.js runs in its own worker with the safe options (no eval, no fonts installed, no fetch, `maxImageSize`), every drawing races `pdfjsGuard`, and every canvas is held by the document's canvas budget; `measure` draws at most 4 million pixels. qpdf reads only capped JSON (`maxPagesJson`, `maxDictionaryJson`); the update and the output are capped by `sizeLimit` (`OutputLimit`). Object ids are taken only as `N G R`.
- **Crafted page boxes and user units:** `pageBox` stops the job on a page under 1 point or over 10^8 points, or a user unit over 10^6; a box PDF.js and qpdf read differently leaves that page as it is (decision 4, step 1). The new box is always inside the old shown box, so a crop never shows anything that was hidden.
- **Many pages or annotations:** each page is measured and let go before the next (per-page cleanup), so memory does not grow with pages; more than 10,000 annotations on one page leaves it as it is. A 120,000-page file is slow (measured in task 3.2), with the shared notice.
- **An oversized file:** no fixed limit; the 100 MB notice; the plain copy, its PDF.js copy and qpdf's copy are held at once, so peak memory is about three times the file (measured in task 3.2), against Compress's and Protect's similar peaks.
- **A hostile file name:** the engine never sees it; the page builds `-cropped` names as every tool does.
- **Text or values leaking:** no page text, bookmark title, field value or password goes into an error, a progress report, a message or the console; the no-upload test watches for marked strings.
- **Hiding is mistaken for removing:** the page says so twice (decision 7, section 8). This is the one privacy risk the tool itself adds.

No server is involved, so SSRF and macros do not apply.

## Tests

- **`tests/unit/content-box.test.ts`** (the `measure` step, with the Node canvas maker): `text.pdf`'s box holds every text line from `getTextContent`; `mixed.pdf`'s four pages, and pages made in the test with `/Rotate 90` and `270`, an offset and a reversed paper box, an inherited crop box and `/UserUnit 2`: drawing the original page and the same page with its crop box set to the box gives the same ink inside, and the original has no ink outside it; a blank page is `blank`; an empty borderless text field near the edge and a link over white space are inside the box, a hidden annotation and a popup are not; `#d9d6cc` and a 1-pixel hairline are ink, 240-grey paper is not; a page of grey 236 is ink edge to edge; `chinese-unembedded.pdf` is `unsafe`, and in a file made in the test of a Latin page then a page with unembedded Chinese, page 1 is `box` and page 2 and a third Latin page are `unsafe`; a poster-sized page and `/UserUnit 1000` are drawn under the pixel cap; no request is made (the stand-ins have no fetch).
- **`tests/unit/crop-pdf.test.ts`**: `run` on every file in `tests/fixtures/`, each outcome recorded (cut, nothing to cut, damaged, not a PDF, password needed without one); for every result, `qpdf --check`, no password or restrictions, each page's decoded content streams byte for byte as before (`pageStreams`), `/MediaBox`, `/Rotate` and `/UserUnit` as before; `rich.pdf`, `form.pdf`, `tagged.pdf`: bookmarks, link, `note.txt`, fields and values, tags kept, and every widget and link rectangle inside its page's new crop box; `multilingual.pdf`: text as before and ink in every script band of every page drawn after; `chinese-unembedded.pdf`: nothing to cut (`[]`); bleed, trim and art boxes cut back or removed, none added; an inherited crop box overridden only on cut pages; the margin (a fortieth of the shorter side) and the 1-point rule; `SECRET-margin` drawn in white in a margin is still in the text after (hidden, not removed); progress order and `writesAfter`; the output cap through a small limit; no error holding page text or the password; `password.pdf` with `open-sesame` and `restricted.pdf`.
- **Engine loads:** `crop-pdf` runs in the `engine-loads` shards against every fixture, asking only for `qpdf` when reading and `qpdf` and `pdfjs` in the job.
- **`tests/e2e/crop-pdf.spec.ts`** (importing `test` from `tests/e2e/fixtures.ts`), at 360px and 1280px: the page, the row, focus, "Getting ready", two files dropped, not a PDF, damaged, the password flow, a job on `text.pdf` with progress and the result notes, the download named `text-cropped.pdf` and checked with qpdf and PDF.js (new crop box, same content), a file with nothing to cut, Cancel, failures from a stand-in engine (memory, `output-limit`, engine not fetched) with "Go back to your file", the 100 MB and 20,000-page notices, keyboard only.
- **No-upload test** in the same spec, as Protect's and Rotate's: exact allowlist read from the build; secrets `qz7report.pdf`, its stem, the password and the file's text; nothing in requests, headers, title, storage, address or console.
- **Uniform requests:** `/crop-pdf` added to `tests/e2e/uniform-requests.spec.ts` with the PDF picks and its job.

## Risks / Trade-offs

- **Content PDF.js does not draw and does not report** (a picture whose decoder falls back outside the factory, content skipped after a parse error, an unsupported blend) can be cut off. → Crop only hides, so nothing is lost from the file; the text below the tool says to check the new file; the fixture runs and the hand checks in readers look for it. Not fully closed.
- **Scans on grey paper, with dark scanner edges or with speckle are not cut.** → The page says so in the "nothing to cut" words and the questions. Typed margins are the owner question that would answer it.
- **Each page cut to its own content gives pages of different sizes** (a book's pages will not line up). → Owner question; default each page on its own.
- **The job is slower than other page tools,** as every page is drawn. → Progress per page and Cancel; measured on `pages-500.pdf`, the 100 MB and the 120,000-page files in task 3.2 and recorded.
- **A reader may still show annotations outside the crop box, or a print setting may use the paper box.** → The standard says the crop box clips display and print; Chrome, Firefox, Adobe Reader and Preview are hand checks in issue #7.
- **Signatures and earlier saved versions** are lost, as for every page tool. → Said on the page; the open owner question on signed files covers it.
- **`readPages` lives in `stamp.ts`,** a file named for drawing; Crop fetches the stamp step's file at job time. → No behaviour change and no extra request on stamp pages; moving page reading to its own file can come later, beside the "read pages and dictionaries in one qpdf call" item left from Add page numbers.

## Migration Plan

None. A new page and registry entry; no existing page, address or stored data changes. Rolling back is removing the entry and the files.

## Open Questions

- The measured time for `pages-500.pdf` and the 120,000-page file decides only what the fixtures README records; it changes nothing above unless a page would block for more than 100 ms, which the worker prevents.
