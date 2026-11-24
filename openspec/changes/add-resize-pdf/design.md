# Design

## Context

See `proposal.md` for why Resize pages is next and what the owner decided on 24 Nov 2026. What exists and is reused:

- **The one-file tool flow** with an option, as Add page numbers has it: the row with the first page's thumbnail, no summary line, `ChoiceGroup` after the row with focus on the chosen option once the file is read, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices, Cancel, "Go back to your file", the result block with static `resultNotes`. Choices are kept through Cancel, a failure and "Choose another file" (`add-tool-options`).
- **The "no new file" outcome** (`noSmaller` in the registry; `[]` from the engine), built for Compress PDF and reused by Remove a password and Crop PDF. No tool has yet combined it with an option; task 4.1 checks the widget does.
- **`plainCopy`** (`src/engines/plain.ts`): the input decrypted once, with no object streams, so qpdf's JSON update reaches every object; page tools drop passwords this way.
- **`readPages`** (`src/engines/stamp.ts`): each page's object id, own dictionary, content streams and where it is shown, read from capped qpdf JSON, with inherited `/Rotate`, `/MediaBox` and `/CropBox` found up the page tree (depth-limited, loop-safe) and `pageBox` applying PDF.js's rules (turn modulo 360, crop ∩ paper, user unit; a page under 1 point or over 10^8 points as shown, or a user unit over 10^6, stops the job). Internally it holds every object's dictionary (`readDictionaries`), which Resize needs too (decision 5).
- **The stamp tools' wrap** (`stampPages`): a page's `/Contents` becomes `[q, its own streams as they were, Q, draw]`, with the `q` and `Q` streams written once per job; tags, `/StructParents` and shared content stay as they were. Resize uses the same wrap with a different first stream.
- **The update written in pieces** (`opening`, `entryText`, `PlainSource`, `writeUpdate`, `sizeLimit`, `pdfNumber`, `OutputLimit`, `cappedWrite`): how the stamp tools and Crop write a capped JSON update with qpdf and check the result.
- **`acceptedValue`** and `optionValues` (`src/widget/option-values.ts`): a choice's accepted values written once, checked by the engine before it reads the file.
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`).

## Goals / Non-Goals

**Goals:**
- Every page A4 or Letter, the same way round as shown, its content scaled by one factor to fit, centred, nothing cut off (the owner's decisions of 24 Nov 2026).
- Never rewrite a page's own content; change only what places the page on its paper, and move what is stored in page coordinates (annotations, destinations, beads) with it, so links, fields, notes and bookmarks line up.
- A page already the chosen size is left byte for byte as it was; a file where every page is gives no file.
- qpdf only in the job: no PDF.js, no pdf-lib, no drawing. Memory bounded as for the stamp tools (at most two full copies alive at once besides the worker's input copy).
- No dependency, no new shared component, no change to how any other tool reads or writes.

**Non-Goals:**
- Other paper sizes, a margin, one orientation for every page, choosing pages, scaling a form field's typed-text size, a preview, next steps after the result.

## Decisions

### 1. Scale to fit, A4 or Letter, each page its own way round (decided by the owner, 24 Nov 2026)

The alternatives the owner was shown, and why they are not built:

- **Change the paper only** (content kept at its size, centred on the new paper): a Letter page on A4 loses about 8 points off each side, a small page sits in a sea of white. Rejected by the owner for "scale to fit".
- **Fill the paper and cut what overflows:** cuts content off; rejected by the owner ("nothing cut off").
- **More sizes** (A3, A5, Legal, the page's own): the owner chose A4 and Letter only, matching the catalogue row.
- **One orientation for every page:** the owner chose each page's own, so a landscape slide stays landscape.

**Square pages** (shown width equal to height within 1 point) become upright paper: the plainer choice, a default the owner may overturn.

### 2. How a page is scaled without rewriting it

For a page with shown box `B = [x0, y0, x1, y1]` (default user space, the crop box within the paper box as `pageBox` reads it), turn `t` and user unit `u`, and the chosen paper `P` (A4 `595.276 × 841.89` points, 210 × 297 mm to within 0.01 mm; Letter `612 × 792`):

1. The page's shown size in points: `w = (x1 − x0)·u`, `h = (y1 − y0)·u`, swapped when `t` is 90 or 270.
2. The paper the same way round as shown: on its side when `w > h + 1`, otherwise upright. Call it `(TW, TH)`.
3. **Already that size:** when `|w − TW| ≤ 1` and `|h − TH| ≤ 1`, the page is left exactly as it is (decision 6). This catches the many A4 files written as `595 × 842` and Chromium's `594.96` wide A4 (`multilingual.pdf`).
4. The new paper box, unturned: `(MW, MH) = (TW, TH)`, swapped when `t` is 90 or 270, so that with the same `/Rotate` the page shows `(TW, TH)`.
5. The factor: `f = min(MW / ((x1 − x0)·u), MH / ((y1 − y0)·u))`, the largest at which the whole shown page fits. The matrix scale in user units is `k = f·u`. Centred: `tx = (MW − k·(x1 − x0)) / 2 − k·x0`, `ty = (MH − k·(y1 − y0)) / 2 − k·y0`. The matrix `M = [k 0 0 k tx ty]` is a scale and a move only, never a turn, because `/Rotate` is kept.
6. **Checked before it is used (security):** `k`, `tx`, `ty` finite, `k > 0`, `|tx|`, `|ty|` under 10^9 so `pdfNumber` writes them in fixed form. `pageBox` already stops the job on a crafted page out of range (as for Crop and the stamp tools, deliberately); anything else failing the check stops the job with a fixed sentence, since every page must be resized.

Examples: a Letter page on A4: `f = 0.9727`, content 595.28 by 770.36 points, 35.77 points of white at top and bottom. An A4 page on Letter: `f = 0.9407`, 26.0 points at each side. An A5 page turned a quarter (`mixed.pdf` page 3) on A4: shown on its side, enlarged by `√2`, filling A4 on its side.

**What is written on the page:**

- `/Contents`: `[prefix, its own content streams as they were, restore]`. `prefix` holds `q k 0 0 k tx ty cm x0 y0 (x1−x0) (y1−y0) re W n` with every number through `pdfNumber`; `restore` holds `\nQ\n` and is one stream for the whole job, as the stamp tools' `Q`. Prefixes with the same text share one stream, so a file of 120,000 Letter pages gets one prefix. The clip keeps hidden what the old crop box hid (Crop PDF's cut-off margins among them); without it, content outside the old shown box would appear in the new white space.
- `/MediaBox [0 0 MW MH]` and `/CropBox [0 0 MW MH]`, direct arrays on the page. Both are inheritable, so both are written: removing `/CropBox` would let the page inherit one from the page tree.
- **Removed:** `/UserUnit` (the matrix includes it; with no user unit, readers that ignore it, which are many, show the right size); `/BleedBox`, `/TrimBox`, `/ArtBox` (not inheritable, so only a page's own; the new paper is the finished size; scaling them instead is a default the owner may overturn); `/Thumb` (a thumbnail of the old layout, which Adobe Reader would show in its page panel); `/VP` (viewports whose measuring scale would be wrong after scaling).
- **Kept as they were:** `/Rotate` (own or inherited), `/Resources`, `/Annots` (the array; its annotations change, decision 3), `/StructParents`, `/Group`, `/Tabs`, `/AA` and every other key.

**Alternatives rejected:**

- **Turn the page's content into a form XObject** and draw it scaled: copies every page's content into a new stream and moves marked content into a form, so the structure tree's marked-content references (which name the page) no longer reach their text, breaking tags, which the owner decided are kept whole (13 Nov 2026).
- **Draw each page into a new document with pdf-lib** (`embedPage`): copies content, loses annotations, tags, bookmarks and form fields, and loads pdf-lib.
- **Set `/UserUnit`** to scale: changes the paper size only in readers that honour it, and printing would disagree with the screen.
- **Write `/Rotate 0` and turn the content** (flattening the turn): changes more than needed; keeping `/Rotate` keeps the matrix a pure scale, which makes moving annotations exact.

### 3. Annotations move and scale with the page

Annotations are stored in the page's default user space, outside the content streams, so the wrap does not move them. For each annotation listed in a resized page's `/Annots` (resolved through the objects read, decision 5):

- `/Rect` → `M·Rect`, normalised. A reader draws an annotation's appearance stream by fitting its bounding box, through its `/Matrix`, into `/Rect` (ISO 32000-2, 12.5.5), so scaling `/Rect` scales the drawn look exactly, borders and text included.
- The other places an annotation stores, when present and well formed (an even number of finite numbers): `/QuadPoints` (links, highlights), `/InkList` (each list), `/Vertices`, `/L`, `/CL` go through `M`; `/RD` (four distances) is multiplied by `k`. A key that is not well formed is left as it was.
- `/Popup` annotations are annotations of the same page and are moved the same way. Annotations with the no-zoom flag keep their icon size by the reader's own rule; their place moves.
- Results are checked as in decision 2.6; a non-finite result leaves that key as it was.
- **Shared annotations:** one annotation object listed on more than one page (crafted, or a broken file) is changed once, with the matrix of the first resized page that lists it; listed only on pages left as they are, it is not changed. Direct annotation dictionaries inside `/Annots` are rewritten inside the page's array; an indirect `/Annots` array shared by pages is written once.

**What cannot follow exactly, said under Risks and in the questions:** when a reader draws a form field afresh (the file asks it to, or the visitor types into it), it uses the font size in the field's `/DA`, which is in points and not scaled, so typed text on a page made much smaller can look large for its box; border widths in `/BS` and `/Border` are used only when a reader draws an annotation with no appearance stream. These are left as they were: rewriting `/DA` text, which a field shares across pages that may have different factors, is more than this change should do.

### 4. Destinations and threads follow

A destination names a page and, for most kinds, a place on it in that page's default user space. For every object read (values only; stream dictionaries hold none of these), the engine walks its value, without recursion and at most 32 levels deep, and for every array `[page, kind, …]` whose first item is a resized page's id and whose kind and length match one of `/XYZ left top zoom`, `/FitH top`, `/FitBH top`, `/FitV left`, `/FitBV left`, `/FitR left bottom right top`, `/Fit`, `/FitB`:

- each coordinate that is a number goes through `M` (`left` and `right` by `x`, `top` and `bottom` by `y`), and `null` stays `null`;
- `zoom` is kept as it was;
- an object holding a changed destination is written in the update with the change, together with any annotation change to the same object.

This covers bookmarks (`/Dest`, or a GoTo action's `/D`), link annotations, named destinations in `/Dests` or the `/Names` tree, the catalog's `/OpenAction` and action chains (`/Next`), wherever they sit, because the walk does not depend on where an array is. Destinations into other files name a page number, not an id, and are not touched.

**Beads** (`/B` on a page, the reading threads the owner decided are kept whole, 13 Nov 2026): each bead dictionary in a resized page's `/B` has its `/R` rectangle put through `M`.

**Not followed, said under Risks:** a structure element's layout `/BBox` attribute (rare; used for reflow), positions inside JavaScript, and an XFA form's own layout.

Alternative, leaving destinations as they were: a bookmark would still open the right page but land a little off, or at the wrong zoom for `/FitR`; `SPEC.md` asks that bookmarks stay intact. Rejected.

### 5. Reading every object once (`readPages`, shared)

`readPages(tools, plain, { objects: true })` gives, besides the pages, the map of every object's dictionary it already read (`objects: ReadonlyMap<string, ObjectEntry>`), so annotations, beads and destinations are found without a second qpdf read. Without the option it gives what it gives now, so the stamp tools and Crop are unchanged. The map is let go once the update is appended (decision 7). `opening` and `entryText`, today private to `stamp.ts`, are exported so Resize appends its update in pieces in the same JSON form, with stream entries for the new prefix streams.

### 6. A page already the chosen size; a file with nothing to change

A page whose shown size is the chosen paper the same way round, within 1 point on each side (decision 2.3), gets no entry in the update: its dictionary, content, annotations and destinations stay exactly as in the plain copy. Resizing it anyway would move its content by under a point and rewrite it for nothing. When no page needs a change, the engine gives `[]` and the page shows the no-new-file words: "Every page is already that size." and "No new file was made. Every page of this file is already the paper size you chose. You can use your file as it is." The words do not name A4 or Letter, because `noSmaller` is one fixed text per tool; "the paper size you chose" covers both without a shared change.

The tolerance of 1 point cannot confuse A4 and Letter (their sides differ by 16.7 and 49.9 points).

### 7. The engine (`src/engines/tools/resize-pdf.ts`)

`loads = { read: ['qpdf'], job: ['qpdf'] }`; `inspect = inspectPdf`.

1. `acceptedValue('resize-pdf', 'paper', options.paper)`; anything else is refused before the file is read, as Add page numbers refuses an unknown place.
2. One file only; `plainCopy(tools, file, passwordFrom(options))` into a `PlainSource`; the input is not used again. Progress `{ stage: 'reading', unit: 'file', done: 0, total: 1 }` ("Reading the file").
3. `readPages(tools, plain, { objects: true })`.
4. For each page, decision 2: left as it is, or `M`. If none changes, `[]`.
5. The changes are worked out page by page (page dictionaries, prefix streams by text, annotations, beads), then the destination walk over every object, merging into one map of changed objects by id. Progress `{ stage: 'working', unit: 'page', done, total, writesAfter: true }` ("Page N of M", filling the bar to 0.8).
6. A fresh qpdf takes the plain copy from the `PlainSource`, which drops its reference. The update is appended to `/update.json` in pieces (`opening(max)`, the restore and prefix streams as stream entries with new ids above the file's highest, then each changed object), each piece counted against `sizeLimit(plain, pages)`; past it the job stops with `OutputLimit` (the existing `output-limit` failure). The objects map is let go. Then `writeUpdate` (`--update-from-json`, `--object-streams=generate`, capped by `cappedWrite`, then `qpdf --check`), with writing progress from 80 to 100.

Besides the worker's input copy, at most two full copies of the file are alive at once: the plain copy and the reading qpdf's, then the plain copy and the writing qpdf's. Errors are fixed sentences; no page text, bookmark title, field value, name or password goes into one. Only `paper` and `passwords` are read from the options.

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
            noSmaller: { heading: 'Every page is already that size.',
                         advice: 'No new file was made. Every page of this file is already the paper size you chose. You can use your file as it is.' },
            resultNotes: [
              'Each page is now the paper size you chose, the same way round as before. What is on it is made smaller or larger to fit, keeping its shape, and centred, so a page of another shape has white space at two edges. Pages that were already that size are left as they are.',
              "Text, links, form fields, notes, bookmarks, attached files and the document's details are kept, and links, fields and notes move with the page. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them." ] } }
```

- Placed right after `crop-pdf` and before `images-to-pdf`, which sits at `/image2pdf`'s place, the last row of "Organise pages" (the registry test's catalogue-order check). Home and hub lists follow array order, so Resize is listed eighth, after Crop.
- Title 58 characters, description 121. `option-values.ts` gains `'resize-pdf': { paper: ['a4', 'letter'] }`; the registry test compares it with the choices.
- Crop's `related` already names `resize-pdf`; its comment "Resize pages is linked once it is published" is removed.
- The registry test's lists of tools allowed `noSmaller` gain `resize-pdf`.
- **Hub words** ("Organise pages"): description "Combine, split, copy out, remove, reorder, turn, crop and resize the pages of a PDF, in your browser. Files stay on your device and are not uploaded." (149 characters); sentence "Tools that combine, split, reorder, crop and resize the pages of a PDF." Both drafts; `claimsDevice` stays true.

### 9. Page text (`src/content/tools/resize-pdf.md`)

Three steps (choose the file; choose A4 or Letter; press "Resize and download" and download), then questions in plain words:

- Is my file uploaded?
- What happens to a page of another shape? (it is made to fit and centred, with white space at two edges; nothing is cut off)
- Will a small page be made larger? (yes, to fill the paper; a small scan may print less sharp)
- Which way round will my pages be? (each the same way round as before; a square page upright)
- Why did I get no new file? (every page was already that size; choose the other size or use the file as it is)
- Do links, forms and bookmarks still work? (they move with the page; text typed into a form field afterwards may look larger on a page that was made much smaller; signature no longer valid)
- What if part of a page was hidden before? (it stays hidden, and stays in the file, as Crop PDF's page says)
- What happens to a password? Is my original changed?

250 to 500 words, marked as a draft, no banned word, no question restating the title, no claim the tool does not keep (no "exactly as before" for fields).

### 10. The Privacy page draft

No change. Resize hides nothing new (what an earlier crop hid stays as it was), sends nothing, and the page's existing sentences on workers, passwords and new files cover it. The privacy reviewer confirms at stage 1.

## Effect on page weight and on when WebAssembly is fetched

- **Before a pick:** the generic widget island with this tool's words and one choice; the registry entry adds under 1 KB. Measured with `npm run weigh`; under 100 KB like every tool page (Add page numbers, with one choice of six, is the model).
- **At a pick:** the read set (qpdf, the spare qpdf making the WebAssembly request at once) and the draw set (PDF.js and its data) for the thumbnail, as for every PDF tool. WebAssembly is fetched at the pick, never at page load.
- **At the job:** a fresh worker loads qpdf, the Resize engine and the files it imports (`plain`, `inspect`, `stamp`, `qpdf-json`, `option-values`). No PDF.js, pdf-lib or `fflate`. `check:worker` keeps the engine in its own file; `page-weight.mjs` reads engines from the files, and only the `why` text of `stamp` changes.

## Threats considered

- **A hostile PDF:** qpdf reads only capped JSON (`maxPagesJson`, `maxDictionaryJson`); object ids are taken only as `N G R`; the update and the output are capped by `sizeLimit` (`OutputLimit`); the result passes `qpdf --check`. No PDF.js drawing in the job.
- **Crafted page boxes, turns and user units:** `pageBox` stops the job on a page out of range (deliberately, as Crop and the stamp tools). `M` is checked to be finite with bounded numbers (decision 2.6). The clip keeps anything the old crop box hid hidden; the new paper is drawn from the old shown box only.
- **Crafted annotations and destinations:** only arrays of finite numbers of the right length are changed; anything else is left as it was. The destination walk is iterative, bounded in depth, and linear in the JSON read; it changes only arrays whose first item is the id of a page being resized and whose kind and length match. A shared annotation is changed once.
- **Unbalanced `Q` in a page's own content:** a content stream that restores more than it saves would undo the prefix part-way, so the rest of that page draws at the old size and unclipped. Only a broken file has one; the stamp tools carry the same exposure the other way round. Under Risks; a page made in the test records what PDF.js shows.
- **Many pages:** no drawing; the work per page is a few dictionary edits. Task 3.3 measures the 120,000-page file; if it takes more than 15 minutes in Chromium, or memory grows with the page count beyond the update itself, the change is updated before the pull request.
- **An oversized file:** no fixed limit; the 100 MB notice; at most two full copies alive at once besides the worker's input copy. Task 3.3 records the 100 MB peak against Add page numbers' (1.19 GB in Node, 1.36 GB in Chromium).
- **A hostile file name:** the engine never sees it; the page builds `-resized` names as every tool does.
- **Text or values leaking:** no page text, bookmark title, field value or password goes into an error, a progress report, a message or the console; the no-upload test watches for marked strings, including a form value and a bookmark title.

No server is involved, so SSRF and macros do not apply.

## Tests

- **`tests/unit/resize-pdf.test.ts`**, with `globalThis.fetch` replaced by a function that throws and records, asserted never called:
  - `run` on every file in `tests/fixtures/` with `a4` and with `letter`, each outcome recorded (resized, with how many pages; no page changed; damaged; not a PDF; password needed without one);
  - for every result: `qpdf --check`; no password or restrictions; each page's own decoded content streams byte for byte as before (`pageStreams`) between the new first and last stream; each resized page's `/MediaBox` and `/CropBox` the paper the right way round, `/Rotate` as before, no `/UserUnit`, `/BleedBox`, `/TrimBox`, `/ArtBox`, `/Thumb` or `/VP`; each page left as it is byte for byte the same dictionary;
  - drawn by PDF.js (`tests/unit/thumbnail-helpers.ts`'s Node canvas): each resized page of `mixed.pdf` and of pages made in the test with `/Rotate 90` and `270`, an offset and reversed paper box, an inherited crop box smaller than the paper and `/UserUnit 2`, shows upright as before, the paper's size, and the original drawing scaled by `f` and centred (mean difference under a small bound), with nothing in the white bands; content the old crop box hid is not drawn;
  - `rich.pdf`, `form.pdf`, `tagged.pdf`: bookmarks, link, `note.txt`, fields and values, tags kept; each link's and widget's `/Rect` equals `M` of the old one, and PDF.js's text positions under it moved by `M` too, so a link still covers its words; `/QuadPoints`, `/InkList`, `/Vertices`, `/L`, `/CL` and `/RD` on annotations made in the test moved or scaled; a malformed `/QuadPoints` left as it was;
  - destinations: `/XYZ`, `/FitH`, `/FitV`, `/FitR`, `/FitBH`, `/FitBV`, `/Fit` in an outline, a link's `/Dest`, a GoTo action, a named destination in `/Dests` and in `/Names`, and `/OpenAction`, each moved by its page's `M` with `null` and zoom kept; a destination to a page left as it is unchanged; a look-alike array to another file's page number unchanged; beads' `/R` moved;
  - an annotation shared by two resized pages of different shapes changed once; an indirect `/Annots` array shared by two pages written once;
  - the factor, centring and orientation for Letter→A4, A4→Letter, A5 turned a quarter, a square page, a page 1 point off A4 (left), `multilingual.pdf` on A4 (left: 594.96 points wide) and on Letter (resized), with every script's text as before (`tests/unit/multilingual.test.ts`'s checks);
  - a file whose every page is A4 gives `[]` with `a4`; `chinese-unembedded.pdf` with `letter` is resized;
  - an unknown `paper`, or none, refused before the file is read;
  - a page whose content has an extra `Q`: outcome recorded (Risks);
  - progress order and `writesAfter`; the output cap through a small limit; no error holding page text, a field value or the password.
- **Engine loads:** `resize-pdf` runs in the `engine-loads` shards against every fixture, asking only for `qpdf` when reading and in the job.
- **`tests/unit/stamp.test.ts`** (or the existing stamp tests): `readPages` without `objects` gives what it gave; with it, the map holds every object; the stamp tools' and Crop's tests pass unchanged.
- **`tests/e2e/resize-pdf.spec.ts`** (importing `test` from `tests/e2e/fixtures.ts`), at 360px and 1280px: the page; the row, then "Paper size" with A4 chosen and focused; "Getting ready"; two files dropped; not a PDF; damaged; the password flow; Letter chosen by keyboard and a job on `text.pdf` with "Page N of M", the bar never going back, the two result notes, and the download `text-resized.pdf` checked with qpdf (Letter boxes) and PDF.js (same text); `text.pdf` with A4: "Every page is already that size." with its words, focus on the heading, no Download, "Start again"; the choice kept through Cancel and "Go back to your file"; failures from a stand-in engine (memory, `output-limit`, engine not fetched) under "The pages were not resized."; the 100 MB and 20,000-page notices; keyboard only.
- **No-upload test** in the same spec, as Crop's: exact allowlist read from the build; a protected file made in the test named `qz7report.pdf` with Letter pages, a link, a bookmark titled `SECRET-bookmark` and a form field filled with `SECRET-field`; secrets: the name, its stem, the password, the file's text, `SECRET-bookmark`, `SECRET-field`; nothing in requests, headers, title, storage, address or console.
- **Uniform requests:** `/resize-pdf` in `tests/e2e/uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs` (A4, so `text.pdf` and `rich.pdf` give no file and are not given an `expect`), `failingJob` (`compress-json-bomb.pdf`), `form.pdf`, `mixed.pdf` with `expect: 'done'` (its Letter and A5 pages change on A4), `multilingual.pdf` with `expect: 'no-file'` (already A4 within a point), and `text.pdf` with `expect: 'no-file'`.
- **100 ms:** "Resize pages: listing and resizing the 500-page file blocks the page for no more than 100 ms at a time" in `tests/e2e/performance.spec.ts`, with Letter chosen (the file is A4).

## Risks / Trade-offs

- **Form fields drawn afresh use their unscaled font size** (decision 3). On a page made much smaller (A3 to A4: 0.71), text typed later can look large for its box. → Said in the questions; the hand checks type into `form.pdf`'s field after an A4→Letter resize in each reader. Scaling `/DA` is left for later.
- **An unbalanced `Q` in a page's own content** can undo the scale part-way (Threats). → Only broken files; the unit test records PDF.js's drawing; the readers' hand checks use the fixtures.
- **An annotation outside the old shown box** (hidden before by the crop box) moves with `M` and may land in the new white space, where a reader shows it. → Rare: Crop PDF keeps every annotation inside its crop box; listed here.
- **Not followed:** layout `/BBox` attributes in tags, positions inside JavaScript, XFA layout, `/BS` widths for annotations with no appearance. → Listed; no fixture has them.
- **Precision on crafted pages:** `pdfNumber` writes six decimals, so on a page near 10^8 points the factor is rounded by up to about 1%; the content still sits on the paper, which readers clip to. → Crafted only.
- **Enlarged pages print less sharp** when they hold small pictures (a receipt on A4). → The owner chose shrunk or enlarged; the questions say so.
- **The no-new-file outcome is known only after the main button,** and its result offers only "Start again", so trying the other size means choosing the file again. → Left for later, as for Remove a password.
- **Signatures and earlier saved versions** are lost, as for every page tool. → Said on the page.
- **`readPages` lives in `stamp.ts`,** and Resize fetches the stamp step's file at job time, as Crop does. → Moving page reading out of `stamp.ts` "before a third caller" was left for later from Crop; Resize is that third caller, so the pull request names it and the program manager decides at stage 1 whether to move it in its own change first or carry it again. Default: carry it, with no behaviour change.
- **"Page 1 of 120000" has no thousands separator.** → Known since Crop; not fixed here.

## Migration Plan

None. A new page and registry entry; no existing page, address or stored data changes. Rolling back is removing the entry, its `option-values` line and the files.
