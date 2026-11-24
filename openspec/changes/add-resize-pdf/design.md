# Design

## Context

See `proposal.md` for why Resize pages is next and what the owner decided on 24 Nov 2026.

**Order (decided at stage 1 by the program manager and the architect):** page reading moves out of `src/engines/stamp.ts` first, in its own pull request with no change in behaviour, into `src/engines/pages.ts`: `readPages`, `pageBox`, the place types (`RawPlace`, `PagePlace`, `PageRead`, `PagesRead`), the limits (`maxPagesJson`, `runPages`, `treeDepthLimit`, `smallestSide`, `largestSide`, `smallestScale`), `pdfNumber`, `sizeLimit`, `PlainSource`, and stamp's update writer renamed `writePageUpdate`. `opening` and `entryText` move into `src/engines/qpdf-json.ts` and are exported there. The move goes through the review panel's stage 2 like any change and gets its own line in "Where the project stands" in `CLAUDE.md`. Resize is built after that pull request is merged, imports from `pages.ts` and `qpdf-json.ts`, and exports nothing from `stamp.ts`, so its job does not fetch the stamp step's file. Its only shared change is `readPages(…, { objects: true })` (decision 5). Called "the page-reading move" below; tasks.md checks it is merged before task 2.

What exists and is reused:

- **The one-file tool flow** with an option, as Add page numbers has it: the row with the first page's thumbnail, no summary line, `ChoiceGroup` after the row with focus on the chosen option once the file is read, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices, Cancel, "Go back to your file", the result block with static `resultNotes`. Choices are kept through Cancel, a failure and "Choose another file" (`add-tool-options`).
- **The "no new file" outcome** (`noSmaller` in the registry; `[]` from the engine), built for Compress PDF and reused by Remove a password and Crop PDF. No tool has yet combined it with an option; task 4.1 checks the widget does.
- **`plainCopy`** (`src/engines/plain.ts`): the input decrypted once, with no object streams, so qpdf's JSON update reaches every object; page tools drop passwords this way.
- **`readPages`** (`pages.ts` after the move): each page's object id, own dictionary, content streams and where it is shown, read from capped qpdf JSON, with inherited `/Rotate`, `/MediaBox` and `/CropBox` found up the page tree (depth-limited, loop-safe) and `pageBox` applying PDF.js's rules (a turn that is a multiple of 90 taken modulo 360, else 0; crop ∩ paper; user unit; a page under 1 point or over 10^8 points as shown, or a user unit over 10^6, stops the job). Internally it holds every object's dictionary (`readDictionaries`), which Resize needs too (decision 5).
- **The stamp tools' wrap**: a page's `/Contents` becomes `[q, its own streams as they were, Q, draw]`; tags, `/StructParents` and shared content stay as they were. Resize uses the same idea with a scale and a clip in the first stream.
- **The update written in pieces** (`opening`, `entryText` in `qpdf-json.ts`; `PlainSource`, `writePageUpdate`, `sizeLimit`, `pdfNumber` in `pages.ts`; `OutputLimit`, `cappedWrite` in `qpdf.ts`).
- **`acceptedValue`** and `optionValues` (`src/widget/option-values.ts`).
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`).

## Goals / Non-Goals

**Goals:**
- Every page A4 or Letter, the same way round as shown, its content scaled by one factor to fit, centred, nothing cut off (the owner's decisions of 24 Nov 2026).
- Never rewrite a page's own content; change only what places the page on its paper, and move what is stored in page coordinates (annotations, destinations, beads) with it, using one rounded matrix per page.
- **Drawn content outside a page's old shown box is clipped,** and annotations wholly outside it are marked hidden. A page whose own drawing instructions are broken (an extra restore) can undo the scale and the clip in some readers; that is said plainly, not promised away (decision 3).
- A page already the chosen size is left byte for byte as it was; a file where every page is gives no file.
- qpdf only in the job: no PDF.js, no pdf-lib, no drawing. Memory bounded: the objects read are let go before the writing qpdf is made; peak no higher than Add page numbers' on the 100 MB file.
- No dependency, no new shared component.

**Non-Goals:**
- Other paper sizes, a margin, one orientation for every page, choosing pages, scaling a form field's typed-text size, a preview, next steps after the result, reading or checking a page's own content (decision 3), fixing the stamp tools' own exposure to a stray `Q` (left for later).

## Decisions

### 1. Scale to fit, A4 or Letter, each page its own way round (decided by the owner, 24 Nov 2026)

The alternatives the owner was shown, and why they are not built:

- **Change the paper only** (content kept at its size, centred): a Letter page on A4 loses about 8 points off each side, a small page sits in a sea of white. Rejected by the owner for "scale to fit".
- **Fill the paper and cut what overflows:** cuts content off; rejected ("nothing cut off").
- **More sizes** (A3, A5, Legal, the page's own): the owner chose A4 and Letter only.
- **One orientation for every page:** the owner chose each page's own.

**Square pages** (shown width within 1 point of the height, decision 2.2) become upright paper: the plainer choice, a default the owner may overturn.

### 2. The page's placement and its one rounded matrix

For a page with shown box `B = [x0, y0, x1, y1]` (default user space, crop ∩ paper as `pageBox` reads it), turn `t` (`pageBox`'s: `/Rotate -90` is 270, `/Rotate 45` is 0, as PDF.js reads them) and user unit `u`, and the chosen paper `P` (A4 `595.276 × 841.89` points, 210 × 297 mm to within 0.01 mm; Letter `612 × 792`):

1. The page's shown size in points: `w = (x1 − x0)·u`, `h = (y1 − y0)·u`, swapped when `t` is 90 or 270.
2. The paper the same way round as shown: on its side when `w > h + 1`, otherwise upright. So `w = h + 1` is upright and `w = h + 1.01` is on its side. Call it `(TW, TH)`.
3. **Already that size:** when `u` is exactly 1, `|w − TW| ≤ 1` and `|h − TH| ≤ 1`, the page is left exactly as it is (decision 6). So 1.0 point off is left and 1.01 points off is resized; an A4 page stored on its side with `/Rotate 90` is shown upright A4 and is left with A4 chosen. A page with any other user unit is always resized, since readers that ignore the unit show it at another size.
4. The new paper box, unturned: `(MW, MH) = (TW, TH)`, swapped when `t` is 90 or 270, so that with the same `/Rotate` the page shows `(TW, TH)`.
5. **The factor, rounded first.** The exact scale in user units is `k* = min(MW / (x1 − x0), MH / (y1 − y0))` (the shown fit factor times `u`). It is written as `k = fixed(k*)`: fixed form, never an exponent, at most 10 significant digits and at most 20 decimals. `k` is the number used everywhere after this.
6. **Centring from the rounded `k`:** `tx = fixed((MW − k·(x1 − x0)) / 2 − k·x0)`, `ty = fixed((MH − k·(y1 − y0)) / 2 − k·y0)`, by the rule of step 8. The page's one matrix is `M = [k 0 0 k tx ty]`, exactly the numbers written. It is a scale and a move only, never a turn, because `/Rotate` is kept. The same `M` moves content, annotations, destinations and beads, so they cannot disagree by rounding.
7. **Checked before it is used (security):** the job stops with the fixed sentence "A page of this file could not be resized safely, so no new file was made." and the shared advice "The file may be damaged. Try another copy of it.", with "Go back to your file", when the written `k` is 0, or differs from `k*` by more than 1e-4 of `k*`, or `|tx|` or `|ty|` is 10^9 or more, or a clip number is 10^9 or more in size (only crafted pages: a `/UserUnit 0.001` page with a box of 10^10 units reaches it), or the written clip differs from `B` by more than 0.01 point once multiplied by `k` (step 8). `pageBox` already stops the job on a page out of its range. Every page must be resized, so a failed check never leaves one page as it was. The engine throws a fixed error that the worker maps to its own failure kind, as `OutputLimit` maps to `output-limit`; task 4.1 adds the kind (`unsafe-page`) to the messages and the widget if no existing kind carries these words, named in the pull request.
8. **Numbers written:** one rule, `fixed(v)`: fixed form, never an exponent, at most 10 significant digits and at most 20 decimals. `k` is `fixed(k*)`; `tx`, `ty` are computed from the written `k` and written with `fixed`. The clip is written in the page's own units: `x0' = fixed` rounded down from `x0`, `y0'` likewise, `x1'` and `y1'` rounded up, and the size `x1' − x0'`, `y1' − y0'` written with `fixed`; the job stops when `|x0' − x0|·k`, `|y0' − y0|·k`, `|x1' − x1|·k` or `|y1' − y1|·k` is over 0.01 point. Moved annotation, destination and bead numbers are in new-page points and written with `fixed` too, rounded to at most 6 decimals, so any value under 10^6 points is within 0.000001 point whatever `k` is; a value of 10^9 or more leaves that key as it was.

Examples: a Letter page on A4: `k = 0.9726732026`, content 595.28 by 770.36 points, 35.77 points of white at top and bottom. An A4 page on Letter: `k = 0.9407404768`, 26.0 points at each side. An A5 page turned a quarter (`mixed.pdf` page 3) on A4: shown on its side, enlarged by `√2`.

**What is written on the page** (one wrap per page object, decision 4):

- `/Contents`: `[prefix, its own content streams as they were, restore]`. `prefix` is `q\nk 0 0 k tx ty cm\nx0' y0' w' h' re W n\n` (step 8) and `restore` is `\nQ\n`, one stream for the whole job. The prefix ends with a newline, so an own stream starting with no whitespace still begins a new token. Prefixes with the same text share one stream, so a file of 120,000 Letter pages gets one prefix. The clip is rounded outward, so nothing shown before is clipped.
- `/MediaBox [0 0 MW MH]` and `/CropBox [0 0 MW MH]`, direct arrays on the page. Both are inheritable, so both are written; the page tree's values are not changed, so a page left as it is still inherits them.
- **Removed:** `/UserUnit` (the matrix includes it; readers that ignore it, which are many, show the right size); `/BleedBox`, `/TrimBox`, `/ArtBox` (not inheritable, so only a page's own; the new paper is the finished size; Crop cuts these back, Resize removes them, a default the owner may overturn); `/Thumb` (a thumbnail of the old layout); `/VP` (viewports whose measuring scale would be wrong).
- **Kept as they were:** `/Rotate` (own or inherited, as stored, `-90` and `45` included), `/Resources`, `/StructParents`, `/Group`, `/Tabs`, `/AA` and every other key. `/Annots` is kept, its annotations changed (decision 4).

**Alternatives rejected:**

- **Turn the page's content into a form XObject:** it would put the page's content in a stream of its own, but it copies every page's content and moves marked content into a form, so the structure tree's marked-content references no longer reach their text, breaking the tags the owner decided are kept whole (13 Nov 2026).
- **Draw each page into a new document with pdf-lib** (`embedPage`): copies content, loses annotations, tags, bookmarks and fields, and loads pdf-lib.
- **Set `/UserUnit`** to scale: changes the size only in readers that honour it.
- **Write `/Rotate 0` and turn the content:** changes more than needed and would turn the matrix.
- **Round with `pdfNumber`'s 6 decimals only:** on a crafted page with a tiny `k` it loses most of the factor; computing `tx, ty` before rounding lets the content and the annotations disagree.

### 3. A stray `Q`: said plainly, not checked

The clip in the prefix keeps drawn content outside the old shown box from showing. A page's own content that restores more than it saves (`Q` with no matching `q`) pops the prefix's `q` in readers that let it, so the rest of that page draws at its old size and **without the clip**, and may show what an earlier crop hid. Only a broken or deliberately crafted page has one. Nothing was ever removed: what a crop box hides stays in the file before and after, as Crop PDF's page already says ("Cropping is not a way to hide something private").

**What is built:** the plain `q cm clip` / `Q` wrap, with no reading of the page's content. The questions and Risks say it plainly: hidden parts stay in the file, a deliberately broken page can show them after resizing, and cropping or resizing is not a way to hide something private. Owner question 8 (default: accept for now).

**The test records, not promises:** a page whose content draws text, then has an extra `Q`, then draws `SECRET-hidden` outside the old crop box, resized Letter to A4. What PDF.js draws is recorded in the fixtures README as a known outcome; the test fails only if that recorded outcome changes, so a later change in PDF.js or in the wrap is seen.

**Rejected: counting saves and restores in each page's content** and saving that many more in the prefix (planned at stage 1, dropped at stage 2 after the security re-check). It cannot be made to match readers:
- PDF.js gives forms and Type 3 glyphs the page's one save stack, so a `Q` inside a form escapes a count made over the page's own streams;
- PDF.js finds the end of an inline image differently from the plan, in both directions, and pdfium and Acrobat differ again;
- tokens glued together (`0Q`, `ETQ`, `\x01Q`) hide a `Q` from a plain tokenizer, and readers split them differently;
- qpdf decodes a whole stream into memory before any output cap applies: a 600 KB file reached `bad_alloc`;
- it added a third batch reader, and the measurement files never exercised the decode.
A sound version would need our own Flate decoding with limits, a walk over forms, patterns and Type 3 glyphs, and reader-by-reader inline-image rules: out of proportion for a crafted-file risk where nothing leaves the device and nothing hidden was ever removed. Owner question 8 asks whether to build a content check later.

**Left for later:** the stamp tools (Add page numbers, Watermark, Sign PDF) wrap with one `q … Q`, so a stray `Q` in a page's own content pops theirs and their drawing is placed in whatever state the page left; it shows nothing hidden, as they set no clip, but it can move or style their layer. Not fixed here; named in the pull request and the change's follow-up.

### 4. One working copy per object; what moves with the page

Annotations, beads and destinations live outside the content streams, so the wrap does not move them. All changes go into **one map of working copies by object id**. Each object is copied from the objects read the first time any step changes it; every later step reads and changes that copy; each object is written once.

**Order:**

1. **Pages**, in page-tree order. A page object listed twice in the page tree has one dictionary: the first listing decides its placement and gets the one wrap; later listings change nothing (as Crop). The page's working copy gets decision 2's keys.
2. **Annotations** of each resized page, in `/Annots` order, then each one's `/Popup` (moved with `M` only, never given the Hidden bit), all through one visited set for the job: an annotation reached a second time, from another page, from its parent's `/Popup` or from `/Annots` again, is not changed again (the first page that reaches it gives the matrix). An annotation reached only from pages left as they are is not changed. A direct annotation dictionary inside `/Annots` is changed inside the page's working copy. An indirect `/Annots` array is resolved and its direct items changed in that array's working copy, once.
3. **Beads:** each bead dictionary in a resized page's own `/B` array has its `/R` moved, through the same visited set.
4. **Destinations**, last: the walk (below) runs over the working copy of every object that has one, and over the read value of every other object, so a link whose `/Rect` was moved by its own page's `M` in step 2 has its `/Dest` moved by its **target** page's `M` in the same copy.

**Annotation keys, well formed by exact counts** (finite numbers only; a key not well formed is left as it was, the rest of the annotation still moved):

- `/Rect`: 4 numbers → its two corners through `M`, normalised.
- `/QuadPoints`: a multiple of 8 numbers → each point through `M`.
- `/InkList`: an array of arrays, each of an even count → each point through `M`.
- `/Vertices`: an even count → each point through `M`.
- `/L`: 4 numbers → both points through `M`.
- `/CL`: 4 or 6 numbers → each point through `M`.
- `/Path` (PDF 2.0): an array of arrays of 2 or 6 numbers → each point through `M`.
- `/RD`: 4 numbers, none below 0 → each times `k`.
- `/LL`, `/LLE`, `/LLO` (lines' leader lines): a number → times `k` (`/LLO` kept not below 0).
- `/Measure`: removed, as `/VP` on the page.

An indirect value for any of these keys is resolved through the objects read; the moved value is written as a direct value on the annotation, and the indirect object is left unchanged, so an array shared with anything else is never moved twice. Every moved number is written by decision 2.8's rule (fixed form, at most 10 significant digits and 6 decimals); a result of 10^9 or more in size leaves that key as it was.

A reader draws an annotation's appearance stream by fitting its bounding box, through its `/Matrix`, into `/Rect` (ISO 32000-2, 12.5.5), so scaling `/Rect` scales the look exactly. No-zoom notes keep their icon size by the reader's own rule; their place moves.

**Annotations out of view stay out of view:** after moving, an annotation other than a popup (`/Subtype /Popup`) whose old `/Rect` and the page's old shown box `B` have no area in common (apart, or meeting only at an edge) gets the Hidden bit (2) set in `/F`, its other bits kept (an absent or non-integer `/F` is read as 0). Before resizing a reader showed it nowhere, as the crop box clips annotations; after resizing it would land in the new white space. An annotation that **partly** overlaps `B` is moved and stays visible, the part that lay outside `B` now showing in the white space: said plainly in the spec, the questions and Risks. Popups are left out of the rule: a popup's rectangle often lies off the page's shown area (beside it, from the right edge of the paper), and it is opened from its note, so it is moved with `M` and its `/F` is left as it was. Owner question 7, default keep.

**Destinations:** for every object, the walk visits its value iteratively with an explicit stack, at most 32 levels deep (deeper parts are not visited, never a stack overflow), and for every array `[page, kind, …]` whose first item is a resized page's id and whose kind and length match one of `/XYZ left top zoom`, `/FitH top`, `/FitBH top`, `/FitV left`, `/FitBV left`, `/FitR left bottom right top`, `/Fit`, `/FitB`: each coordinate that is a number goes through that page's `M` (`left`, `right` by `x`; `top`, `bottom` by `y`), written by decision 2.8's rule; `null` stays `null`; `zoom` is kept. This covers bookmarks, link annotations, GoTo actions, named destinations in `/Dests` and the `/Names` tree, the catalog's `/OpenAction` and action chains, wherever they sit. Destinations into other files name a page number, not an id, and are not touched. Stream dictionaries are not walked.

**What cannot follow exactly, said under Risks and in the questions:** when a reader draws a form field afresh (the file asks it to, or the visitor types into it), it uses the font size in `/DA`, which is not scaled, so typed text on a page made much smaller can look large for its box (owner question 6); `/BS` and `/Border` widths, used only for annotations with no appearance stream.

**Not followed** (listed in Risks): a structure element's layout `/BBox` attribute, positions inside JavaScript, an XFA form's own layout, and an indirect `/Annots` array shared by two pages of different shapes beyond the first page that reaches each annotation.

Alternative, leaving destinations as they were: a bookmark would open the right page but land a little off, or at the wrong zoom for `/FitR`; `SPEC.md` asks that bookmarks stay intact. Rejected.

### 5. Reading every object once (`readPages`, shared)

`readPages(tools, plain, { objects: true })` (in `pages.ts`) gives, besides the pages, the map of every object's dictionary it already read (`objects: ReadonlyMap<string, ObjectEntry>`), so annotations, beads and destinations are found without a second qpdf read. Without the option it gives what it gives now, so the stamp tools and Crop are unchanged. This is the one shared piece riding along with Resize (owner question "Shared pieces in tool pull requests").

**Memory:** the engine keeps only the change map, the prefix and restore texts and the stream depth results. The `readPages` result and the objects map are let go (no reference held) before the writing qpdf is made. Task 3.3 records the peak in Node and Chromium during the destination walk and overall, against a ceiling of Add page numbers' peak on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium), and also on a file made in the test whose dictionary JSON is near `maxDictionaryJson` (64 MB).

### 6. A page already the chosen size; a file with nothing to change

A page that is already the chosen paper (decision 2.3) gets no entry in the update: its dictionary, content, annotations and destinations stay exactly as in the plain copy. When no page needs a change, the engine gives `[]` and the page shows: heading "Every page is already the paper size you chose." and advice "No new file was made. You can use your file as it is. To make the pages the other size, press Start again, choose the file and pick the other size." The words name no paper, because `noSmaller` is one fixed text per tool.

The 1-point tolerance cannot confuse A4 and Letter (their sides differ by 16.7 and 49.9 points).

### 7. The engine (`src/engines/tools/resize-pdf.ts`)

`loads = { read: ['qpdf'], job: ['qpdf'] }`; `inspect = inspectPdf`. Imports from `plain`, `inspect`, `pages`, `qpdf-json`, `qpdf` and `option-values`; none from `stamp`.

1. `acceptedValue('resize-pdf', 'paper', options.paper)`; anything else is refused before the file is read.
2. One file only; `plainCopy` into a `PlainSource`; the input is not used again. "Reading the file".
3. `readPages(tools, plain, { objects: true })`.
4. Placement per page (decision 2), first listing of each page object only. If none changes, `[]`.
5. Working copies (decision 4): pages, annotations and popups, beads, then destinations, "Page N of M" (`writesAfter`).
6. The `readPages` result and the objects map are let go. A fresh qpdf takes the plain copy from the `PlainSource`, which drops its reference. The update is appended to `/update.json` in pieces (`opening(max)`, the restore and prefix streams as stream entries with new ids above the file's highest, then each working copy), each piece counted against `sizeLimit(plain, pages)`; past it, `OutputLimit`. Then `writePageUpdate` (`--update-from-json`, `--object-streams=generate`, capped by `cappedWrite`, `qpdf --check`), writing progress from 80 to 100.

Errors are fixed sentences; no page text, bookmark title, field value, name or password goes into one. Only `paper` and `passwords` are read from the options.

### 8. The registry entry (words a draft for the owner's review)

```ts
{ id: 'resize-pdf', group: 'organise', runsIn: 'browser', phase: 2, accepts: ['application/pdf'],
  related: ['crop-pdf', 'rotate-pdf', 'merge-pdf', 'compress-pdf', 'add-page-numbers'],
  pages: [{ slug: 'resize-pdf', name: 'Resize pages to A4 or Letter',
            summary: 'Make every page A4 or Letter size, scaled to fit.',
            title: 'Resize PDF pages to A4 or Letter in your browser - PDFkaro',
            description: 'Make every page of a PDF A4 or Letter size, its content scaled to fit. The file stays on your device and is not uploaded.',
            heading: 'Resize PDF pages to A4 or Letter',
            sentence: 'Make every page of a PDF A4 or Letter size, scaled to fit. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Resize and download', writingLabel: 'Writing the resized file',
            doneHeading: 'Your resized file is ready', failedHeading: 'The pages were not resized.',
            tooFewFiles: 'Choose a PDF file to resize its pages.', outputSuffix: 'resized',
            minFiles: 1, multiple: false, resultPages: 'input',
            memoryAdvice: 'Try on a computer, or split the file first and resize the parts.',
            items: 'files', itemControls: false, outputs: 'one',
            options: [{ kind: 'choice', key: 'paper', legend: 'Paper size', initial: 'a4',
                        choices: [{ value: 'a4', label: 'A4, 210 by 297 mm' },
                                  { value: 'letter', label: 'Letter, 8.5 by 11 inches' }] }],
            noSmaller: { heading: 'Every page is already the paper size you chose.',
                         advice: 'No new file was made. You can use your file as it is. To make the pages the other size, press Start again, choose the file and pick the other size.' },
            resultNotes: [
              'Each page is now the paper size you chose, the same way round as before. What is on it is made smaller or larger to fit, keeping its shape, and centred, so a page of another shape has white space at two edges. Pages that were already that size are left as they are.',
              "Text, links, form fields, notes, bookmarks, attached files and the document's details are kept, and links, fields and notes move with the page. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them." ] } }
```

- Placed right after `crop-pdf` and before `images-to-pdf` (`/image2pdf`'s place, the last row of "Organise pages"). Home and hub lists follow array order, so Resize is listed eighth.
- Title 58 characters, description 121. `option-values.ts` gains `'resize-pdf': { paper: ['a4', 'letter'] }`.
- Crop's `related` already names `resize-pdf`; its comment "Resize pages is linked once it is published" is removed.
- The registry test's lists of tools allowed `noSmaller` gain `resize-pdf`.
- **Hub words** ("Organise pages"): description "Combine, split, copy out, remove, reorder, turn, crop and resize the pages of a PDF, in your browser. Files stay on your device and are not uploaded." (149 characters); sentence "Tools that combine, split, reorder, crop and resize the pages of a PDF." Both drafts; `claimsDevice` stays true.

### 9. Page text (`src/content/tools/resize-pdf.md`)

Three steps (choose the file; choose A4 or Letter; press "Resize and download" and download), then questions in plain words:

- Is my file uploaded?
- What happens to a page of another shape? (made to fit and centred, with white space at two edges; nothing is cut off)
- Was part of my page hidden before? (a part hidden by cropping stays hidden and stays in the file; a deliberately broken page can show it after resizing; cropping or resizing is not a way to hide something private)
- Will a small page be made larger? (yes, to fill the paper; a small scan may print less sharp)
- Which way round will my pages be? (each the same way round as before; a square page upright)
- Why did I get no new file? (every page was already that size; start again and pick the other size, or use the file as it is)
- Do links, forms and bookmarks still work? (they move with the page; a note or link wholly out of view before is hidden and stays in the file, one partly out of view now shows whole; text typed into a field afterwards may look larger on a page made much smaller, and a signature is no longer valid)
- What is removed? (each resized page's bleed, trim and art boxes, used by print shops; its stored thumbnail; and measuring scales used by some drawing programs)
- Will this make my file smaller? (no; Compress PDF does that)
- What happens to a password? Is my original changed?

Each answer two or three short sentences. 250 to 500 words, marked as a draft, no banned word, no question restating the title, no claim the tool does not keep (no "exactly as before" for fields).

### 10. The Privacy page draft

No change. Resize hides annotations wholly out of view and removes nothing; drawn content outside the old shown box is clipped, and a broken page that undoes the clip is said on the tool page (decision 3). It sends nothing, and the Privacy page's existing sentences on workers, passwords and new files cover it.

## Effect on page weight and on when WebAssembly is fetched

- **Before a pick:** the generic widget island with this tool's words and one choice; the registry entry adds under 1 KB. Measured with `npm run weigh`; under 100 KB like every tool page.
- **At a pick:** the read set (qpdf, the spare qpdf making the WebAssembly request at once) and the draw set (PDF.js and its data) for the thumbnail, as for every PDF tool. WebAssembly is fetched at the pick, never at page load.
- **At the job:** a fresh worker loads qpdf, the Resize engine and the files it imports (`plain`, `inspect`, `pages`, `qpdf-json`, `option-values`). Not the stamp step's file, PDF.js, pdf-lib or `fflate`. `check:worker` keeps the engine in its own file. `scripts/page-weight.mjs` names Resize in the `why` text of `pages` (the chunk the page-reading move creates), not of `stamp`; `scripts/check-worker.mjs`'s note on the users of page reading names Resize beside the stamp tools and Crop.

## Threats considered

- **A hostile PDF:** qpdf reads only capped JSON (`maxPagesJson`, `maxDictionaryJson`); no stream data is read; object ids are taken only as `N G R`; the update and the output are capped by `sizeLimit` (`OutputLimit`); the result passes `qpdf --check`. No PDF.js drawing in the job.
- **Showing what was hidden:** the clip to the old shown box, and the Hidden bit for annotations wholly outside it (decision 4). A page with an extra restore can undo the clip in some readers (decision 3): nothing leaves the device and nothing hidden was removed before; said on the page; owner question 8. Partly visible annotations show whole: said on the page.
- **Crafted numbers:** `pageBox` stops the job on a page out of range; `k`, `tx`, `ty` and the clip are checked as written (decisions 2.7 and 2.8); moved annotation, bead and destination numbers are finite, under 10^9 in size and written in fixed form, else left.
- **Crafted annotations and destinations:** exact counts only; one working copy per object, each written once with one matrix; the walk is iterative, bounded in depth and linear in the JSON read.
- **Many pages:** the work per page is dictionary edits only. Task 3.3 measures the 120,000-page file; if it takes more than 15 minutes in Chromium, or memory grows with the page count beyond the change map, the change is updated before the pull request.
- **An oversized file:** no fixed limit; the 100 MB notice; the objects read let go before writing; the peak held to Add page numbers'.
- **A hostile file name:** the engine never sees it; the page builds `-resized` names as every tool does.
- **Text or values leaking:** no page text, bookmark title, destination name, link address, field value or password goes into an error, a progress report, a message or the console; the no-upload tests watch for marked strings.

No server is involved, so SSRF and macros do not apply.

## Tests

Expected numbers in the unit tests are hand-computed literals, or derived through PDF.js viewports of the original and the result (a point's place in shown space after resizing equals `f ×` its place before plus the centring offset), never from the engine's own exports. `globalThis.fetch` is replaced by a function that throws and records, asserted never called.

- **`tests/unit/resize-pdf.test.ts`:**
  - `run` on every file in `tests/fixtures/` with `a4` and with `letter`, each outcome recorded (resized, with how many pages; no page changed; damaged; not a PDF; password needed; stopped as unsafe);
  - for every result: `qpdf --check`; no password or restrictions; each page's own decoded content streams byte for byte as before between the new first and last stream (`pageStreams`); boxes, turn and removed keys; pages left as they are byte for byte the same dictionary;
  - **pages made in the test** with `/Rotate 90`, with `270`, with a paper box offset from `0,0`, and with `/UserUnit 2`, each holding a link with `/QuadPoints`, an ink note and a widget, and destinations to it (`/XYZ`, `/FitH`, `/FitV`, `/FitR`, `/FitBV`): every stored number checked against hand-computed literals or PDF.js viewports; each page drawn by PDF.js (Node canvas) matches the original scaled and centred, with nothing in the white bands;
  - **out of view:** an inherited crop box smaller than the paper, content outside it not drawn after; an annotation wholly outside the crop box moved with its Hidden bit set and other bits kept, nothing drawn in the band; one partly outside moved and still visible; a note whose popup's rectangle starts at the old paper's right edge: the popup moves, its `/F` is unchanged, and PDF.js still opens it from the note;
  - **the broken page, recorded:** a page with an extra `Q`, then `SECRET-hidden` outside the old crop box, Letter to A4; what PDF.js draws recorded in the fixtures README as a known outcome, and the test fails only if it changes;
  - **rounding:** `/UserUnit 0.001` with a huge box (stops); a `/UserUnit 1e6` page with a crop box of 1e-6 units and content outside it (nothing outside drawn, or the job stops); coordinates near 10^9 (stops at 10^9, written in fixed form below it); a written `k` with 10 significant digits; content, annotation and destination positions agreeing to 0.001 point at a large `k`;
  - **one working copy:** a direct annotation in `/Annots` whose `/Dest` points to another resized page; an indirect link on a Letter page whose `/Rect` moves by its page's `M` and whose `/Dest` moves by an A5 target page's `M`; a popup in `/Annots` also named by its parent's `/Popup`, moved once; a page object listed twice in the page tree, wrapped once; an annotation shared by two pages of different shapes, changed once;
  - **edges:** exactly 1.0 point off A4 (left) and 1.01 off (resized); `w = h + 1` (upright) and `w = h + 1.01` (on its side); an A4 page stored on its side with `/Rotate 90` and A4 chosen (left); `/UserUnit` other than 1 on a page that would otherwise match (resized); an inherited `/MediaBox` shared with a page left as it is (that page still inherits it); an inherited `/Rotate` kept; `/Rotate -90` and `/Rotate 45` kept as stored and placed as PDF.js shows them; a destination nested deeper than 32 levels (left, no stack overflow); an own content stream starting with no whitespace;
  - annotation keys: each kind moved or scaled; wrong counts left; an indirect `/QuadPoints` resolved, written direct, the shared object unchanged; `/Measure` removed;
  - destinations: every kind in an outline, a link, a GoTo action, `/Dests`, `/Names` and `/OpenAction`; a destination to a page left as it is unchanged; another file's page number unchanged; beads moved;
  - `rich.pdf`, `form.pdf`, `tagged.pdf` kept; `multilingual.pdf` on A4 (left) and on Letter (resized, every script kept, `multilingual.test.ts`'s checks); an all-A4 file giving `[]` with `a4`; an unknown or missing `paper` refused before reading;
  - progress order and `writesAfter`; the output cap through a small limit; no error holding page text, a field value or the password.
- **Engine loads:** `resize-pdf` in the `engine-loads` shards, asking only for `qpdf` when reading and in the job.
- **`tests/unit/pages.test.ts`** (made by the page-reading move): `readPages` with and without `objects`.
- **`tests/e2e/resize-pdf.spec.ts`** (importing `test` from `tests/e2e/fixtures.ts`), at 360px and 1280px: the page; the row, then "Paper size" with A4 chosen and focused; "Getting ready"; two files dropped; not a PDF; damaged; the password flow; Letter chosen by keyboard and a job on `text.pdf` with progress, the bar never going back, the two result notes, and the download `text-resized.pdf` checked with qpdf and PDF.js; `text.pdf` with A4: "Every page is already the paper size you chose." with its words, focus on the heading, no Download, "Start again"; the choice kept through Cancel and "Go back to your file"; failures from a stand-in engine (memory, `output-limit`, engine not fetched, and "A page of this file could not be resized safely, so no new file was made." with "The file may be damaged. Try another copy of it.") under "The pages were not resized.", each with "Go back to your file"; the 100 MB and 20,000-page notices; keyboard only.
- **No-upload tests** in the same spec, as Crop's two:
  - a protected file made in the test named `qz7report.pdf` with Letter pages, a crop box hiding `SECRET-hidden`, a link to `https://example.invalid/SECRET-uri`, a named destination `SECRET-dest`, a bookmark `SECRET-bookmark` and a field filled with `SECRET-field`; secrets: the name, its stem, the password and its fragments (plain and URL-encoded, as Crop's `withEncoded`), the file's text and every `SECRET-` string;
  - `rich.pdf`, `tagged.pdf` and `form.pdf` with their `SECRET-` strings, run with Resize and Letter chosen;
  - nothing in requests, headers, title, storage, address or console; the allowlist exact, read from the build, with no `stamp`, `fflate`, pdf-lib or other engine in the job.
- **Uniform requests:** `/resize-pdf` in `tests/e2e/uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs` (A4), `failingJob` (`compress-json-bomb.pdf`), `form.pdf`, `mixed.pdf` with `expect: 'done'`, `multilingual.pdf` and `text.pdf` with `expect: 'no-file'`, and one row with Letter chosen (`text.pdf`, `expect: 'done'`), adding a per-row choice to the spec's input type if it has none.
- **100 ms:** "Resize pages: listing and resizing the 500-page file blocks the page for no more than 100 ms at a time" in `tests/e2e/performance.spec.ts`, with Letter chosen.

## Risks / Trade-offs

- **Form fields drawn afresh use their unscaled font size.** On a page made much smaller (A3 to A4: 0.71), text typed later can look large for its box. → In the questions; owner question 6; hand checks type into `form.pdf` after resizing.
- **An annotation partly outside the old shown box shows whole** after resizing, the outside part in the new white space. → Said on the page; wholly outside ones are hidden (owner question 7).
- **A page with broken drawing instructions** (an extra restore) can undo the scale and the clip in some readers and show, at its old size, what an earlier crop hid. → Hidden parts were in the file before too; the questions say so; the outcome in PDF.js is recorded; owner question 8 (accept for now, or a content check later).
- **No content is read,** so the job's cost is the dictionaries only; the 120,000-page time is measured in task 3.3.
- **Not followed:** layout `/BBox` attributes in tags, positions inside JavaScript, XFA layout, `/BS` and `/Border` widths. → Listed; no fixture has them.
- **Precision:** every number is written by one rule (decision 2.8): `k` with up to 10 significant digits, its relative error under 10^-9 except on crafted pages, which the 1e-4 check stops; the clip within 0.01 point once scaled, or the job stops; moved numbers within 0.000001 point under 10^6 points.
- **Enlarged pages print less sharp** when they hold small pictures. → The owner chose shrunk or enlarged; the questions say so.
- **The no-new-file outcome is known only after the main button,** and its result offers only "Start again". → Its words say how to pick the other size; "Go back to your file" there is left for later.
- **The stamp tools' exposure to a stray `Q`** (decision 3). → Left for later, named.
- **Signatures and earlier saved versions** are lost, as for every page tool. → Said on the page.
- **"Page 1 of 120000" has no thousands separator.** → Known since Crop; not fixed here.

## Migration Plan

None. A new page and registry entry; no existing page, address or stored data changes. Rolling back is removing the entry, its `option-values` line and the files. The page-reading move is its own pull request and is not rolled back with this one.
