# Design

## Context

See `proposal.md` for why. Flatten PDF is the fifth browser row of "Make smaller and fix". `SPEC.md` says nothing about it beyond its catalogue row, so this design rests on the recommended answers to owner questions 1 and 2, and must be revisited if the owner answers otherwise.

What is already in the repo and is reused:

- `plainCopy` (`plain.ts`): the input decrypted, with no object streams, so a qpdf JSON update reaches every object; page tools drop passwords (owner, 13 Nov 2026).
- `readPages(tools, plain, { objects: true })` (`pages.ts`): every page in order with its dictionary, and every object's dictionary without stream data, within the shared 64 MB JSON caps (Resize pages reads annotations this way).
- `opening`, `entryText`, `passwordArgsFor`, `callWithArgumentFile` (`qpdf-json.ts`); `cappedWrite`, `oneFileLimit`, `OutputLimit`, `finished`, `qpdfFrom` (`qpdf.ts`); `readPdf` (`inspect.ts`).
- `characterRules['standard-font']` (`src/widget/option-values.ts`): the 217 Western European characters the standard fonts draw, already shared by Watermark and Sign PDF's engines (its own built file, `option-values-*.js`).
- The widget's `unsupported` outcome with a tool's `unsupportedAdvice` (Image to PDF, Remove a password) and its `noSmaller` words (Grayscale, Repair).

Not used: `content.ts` (no drawing instructions are read or edited; qpdf adds the drawing), `rewrite` (two JSON updates around qpdf's flattening, not one plain rewrite), `stamp.ts`, pdf-lib, PDF.js in the job.

## Goals / Non-Goals

**Goals:**

- Draw form fields and comments into the page exactly as a reader prints them, and remove them, with no new dependency.
- Never give a file that looks different from what the visitor's reader showed in a way the visitor did not ask for: no `?` for letters, no visible password, no hidden layer shown, no dead link, no lost attached file.
- Leave nothing behind that points to what was removed: no stray widgets, popups or tag pointers, so removed field values, names and comments' text do not stay in the file.
- Bounded time and memory on hostile files, with every walk linear.

**Non-Goals:**

- Drawing fields qpdf cannot draw (owner question 2, options (b) and (c)).
- Layers, transparency, tagging drawn values, filling forms.

## Measurements

Made on 28 Nov 2026 in a separate worktree with its own `npm ci`, in Node 22.23.4, with our qpdf build through `createQpdf`, rendering with poppler's `pdftoppm` and reading text with `pdftotext`. The crafted inputs were made with `@cantoo/pdf-lib` by scripts kept out of the repo; tasks 3.1 and 3.2 rebuild them as fixtures and unit tests. "print+gen" is `--flatten-annotations=print --generate-appearances`.

### qpdf on the shared fixtures

| Fixture | Before | qpdf print+gen | This plan |
| --- | --- | --- | --- |
| `form.pdf` | 2 fields with drawing | both drawn, form removed, "Sample text" searchable, check passes | new file |
| `tagged.pdf` | 2 fields with drawing, a note and a link with none, tags | fields drawn; note and link kept; the tag `/Form` still points (OBJR) to the removed widget, which keeps its field and the value `SECRET-TAGGED-VALUE` in the file; drawn values not tagged | new file; the pointer taken out, so the field leaves the file (decision 6) |
| `rich.pdf` | a link with no drawing | unchanged | no new file |
| `text.pdf`, `pages-500.pdf`, `scanned.pdf`, `mixed.pdf`, `images.pdf`, `grey-only.pdf`, `multilingual.pdf`, `chinese-unembedded.pdf`, every `compress-*.pdf` | no annotation or field | unchanged, check passes | no new file |
| `password.pdf` (with password), `restricted.pdf` | none | unchanged | no new file |
| `warning.pdf` | none | exit 3 (its known warnings) | no new file |
| `damaged-xref.pdf`, `damaged-cut.pdf` | | exit 2 | damaged notice with the Repair link |
| `not-a-pdf.pdf` | | exit 2 | refused as not a PDF |

### qpdf on crafted files

| File | What qpdf did | Problem | This plan |
| --- | --- | --- | --- |
| 11 annotations: highlight, square, stamp (drawn, print); square hidden; square invisible; square print-only (NoView); square with no print flag; note and free text with no drawing; link with no drawing; link with drawing | `all`: draws every one with a drawing except hidden and invisible, including the NoView one; `print`: also drops the one with no print flag; `screen`: draws the no-print one, drops NoView. Every annotation with a drawing is removed, drawn or not. Note, free text and link with no drawing kept | **link with a drawing flattened, so it no longer works** | set links aside (decision 4); `print` (decision 2) |
| fields with drawing (pdf-lib: text, accented text, several lines, drop-down, list, check box, radio) | all drawn exactly, form removed | none | drawn |
| the same with drawing removed, `/NeedAppearances` true, Helvetica in `/DR` | without `--generate-appearances`: **no field flattened** (exit 3, "document does not have updated appearance streams"); with it: drawn, list box drawn with its selection, drop-down drawn | none for these | drawn |
| `/NeedAppearances` true, values "Zażółć Ğ ő", Hindi, Telugu, Arabic, Chinese | exit 0, drawn as `Za?ó?? ? ?` and `??????` | **letters lost silently** | turned away (decision 3) |
| a field whose own drawing shows "APTEXT" and whose value is "VALTEXT" | `/NeedAppearances` true: redrawn from the value; absent: its own drawing kept | with `/NeedAppearances` true a good drawing (Hindi in an embedded font) is **replaced and lost** | decision 3 applies to every field qpdf would redraw |
| `/NeedAppearances` true: several lines, centred, right-aligned, comb, password, auto size, red, a long value | lines joined; centred and right-aligned drawn left; comb drawn plain; **password drawn in clear**; auto size and colour right; long value cut at the box (its whole text still in the drawing) | layout lost; **password shown** | turned away (decision 3); a long one-line value is drawn as readers draw it, cut at the box |
| `/NeedAppearances` true, `/DA` font missing from `/DR` (pdf-lib with drawing removed) | text drawn with no font, so **nothing shows**; check box and radio with no drawing: "unable to set the value", **left on the page as widgets after the form is removed** | values lost; stray widgets | turned away when on (decision 3); stray widgets removed (decision 6) |
| signature field with a drawing; empty one with none; `/SigFlags 3` | the drawn one drawn and removed; **the empty one left as a stray widget**; `/SigFlags` gone with the form | stray widget | removed (decision 6) |
| a note with an icon and a popup, a file-attachment annotation, a square in a layer that is off | note icon drawn and removed, **its popup left pointing to it, so its comment text stays in the file**; attachment icon drawn and **its attached file dropped**; **the square drawn with no layer, so it shows** | comment text kept; file lost; hidden shown | popups removed with their note, attachments set aside (decision 4); the layer carried onto the drawing, which then stays hidden in poppler (decision 5) |
| a JSON update and `--flatten-annotations` in one call | the update is applied before flattening (a highlight hidden by the update was not drawn) | | one call for both (decision 7) |
| a page with optional content (`/OCProperties`) and no annotations | unchanged | | layers kept |

### Time and memory (Node, one qpdf call, `--object-streams=generate`)

| File | Plain rewrite | print+gen |
| --- | --- | --- |
| `pages-500.pdf` | 58 ms | 50 ms |
| `compress-json-bomb.pdf` (5,000 strings of 14,000 characters) | 4.9 s | 3.9 s |
| 120,000 pages (`make-many-pages.mjs`, 16.6 MB) | 3.1 s, 266 MB | 3.0 s, 272 MB |
| 110 MB attachment file (`make-large.mjs`) | 0.29 s, 655 MB | 0.29 s, 986 MB |
| 2,000 pages × 100 annotations sharing one drawing (5.8 MB) | 3.5 s | 7.3 s |
| one page of N annotations with a drawing | | N = 5,000: 4.2 s; 10,000: 17.5 s |
| one page of N fields, `/NeedAppearances` | | N = 2,500: 1.2 s; 5,000: 5.1 s; 10,000: 22.6 s; 20,000: 99 s |
| one page of N fields with drawing | | N = 10,000: 21.7 s; 20,000: 95 s |
| 20,000 fields, 100 a page | | 2.6 s |
| 100,000 fields, 1,000 a page (`/NeedAppearances`) | gen only 11.4 s | 25.8 s, 618 MB, 26.5 MB out |
| one page of 10,000 fields, gen only | | 1.1 s |

Flattening costs about what a rewrite costs, except that time grows with the square of the annotations on one page (about 1.9 × 10⁻⁷ s × N² a page), whatever their kind; drawing fields is linear (about 0.11 ms a field). Generated drawings make the output larger (100,000 fields: 26.5 MB from a file of about 8.6 MB).

## Decisions

### 1. The approach: qpdf's flattening, with our steps before and after

**Chosen (A):** one qpdf call does the flattening and field drawing (`--flatten-annotations=print --generate-appearances`), after a JSON update in the same call that sets aside what must be kept and carries layers onto drawings, then a second update cleans up, and the final write and check follow. Every problem in "Measurements" is answered by a step of ours or by turning the file away.

**Alternatives:**

- **(B) Our own flattening** through `readPages` and a page update appended to `/Contents` (as `stamp.ts` places its layers): linear time, could tag drawn values (owner question 7), and needs no set-aside. But it must reproduce the appearance-placing algorithm (`/Rect`, `/BBox`, `/Matrix`, `/AS` states, NoRotate and NoZoom), which qpdf already does, tested; and field drawing would still be qpdf's or pdf-lib's. Kept as the way to answer question 7 later, in its own change.
- **(C) pdf-lib's `form.flatten()`**: pdf-lib would have to read visitors' files outside Repair's guards; it flattens fields only (not comments), draws fields with the same Western European limit, and its `updateFieldAppearances` throws on letters it cannot encode. No gain over qpdf.
- **qpdf alone**, as it is: rejected by every "Problem" in the crafted-files table.

### 2. As printed

`--flatten-annotations=print`: what prints is drawn, what does not print is removed. It matches what most people flatten for (sending or printing a form), removes on-screen-only controls such as "Reset" and "Print" buttons, and keeps print-only marks. Owner question 1f; `screen` is a one-word change.

### 3. The plan, and fields that cannot be drawn (`plan` in the engine, a pure function over dictionaries)

From `readPages(…, { objects: true })` the engine builds one plan, used both at read time (`inspect`) and in the job:

- **Annotations per page,** each page's `/Annots` resolved (array or reference), each entry resolved, counted on every page where it appears (an array shared by pages is counted for each), with no annotation looked at twice per page.
- **Kinds:** flattened (`Widget`, `Highlight`, `Underline`, `Squiggly`, `StrikeOut`, `Caret`, `Text`, `FreeText`, `Line`, `Square`, `Circle`, `Polygon`, `PolyLine`, `Ink`, `Stamp`, `Watermark`) or set aside (everything else, including `Link`, `FileAttachment`, `Redact`, `Sound`, `Movie`, `Screen`, `RichMedia`, `3D` and unknown names). `Popup` follows its parent. Owner question 1g.
- **Something to flatten** when any flattened-kind annotation is present (with or without a drawing: one with none and not a widget is kept, as qpdf keeps it; a widget with none is removed in decision 6), or the catalog has `/AcroForm`. Otherwise the job gives no file.
- **Fields qpdf will draw itself:** every text (`/FT /Tx`) and choice (`/FT /Ch`) field when `/AcroForm /NeedAppearances` is true; and when it is not, if any such field with a value has no `/AP /N`, the engine sets `/NeedAppearances` true in its update (so qpdf draws the field rather than leaving it as a stray widget) and every text and choice field counts as drawn by qpdf. Fields are found by an iterative walk of `/AcroForm /Fields` and `/Kids` (each node once, depth 32; a deeper or looping tree is turned away), with inherited `/FT`, `/Ff`, `/V`, `/DA`, `/Q` taken down the walk.
- **Doubt,** for each field qpdf will draw with a non-empty value (shown value: `/V` for text; `/V` or the display string of `/Opt` for choice):
  - a character outside `characterRules['standard-font']`;
  - its font (the `/DA` name, inherited, else `/AcroForm /DA`) missing from `/AcroForm /DR /Font`, or not `/Type1` or `/TrueType`, or with an `/Encoding` other than absent, `/WinAnsiEncoding`, `/MacRomanEncoding` or `/StandardEncoding`, or with `/Differences`; and for any font but `/WinAnsiEncoding`, a character outside printable ASCII (qpdf's table for the others is checked in task 2.2; until then they take ASCII only);
  - a `/Symbol` or `/ZapfDingbats` base font;
  - several lines (`/Ff` bit 13), comb (bit 25), password (bit 14), `/Q` 1 or 2 (inherited, else `/AcroForm /Q`), `/RV`, or a format action (`/AA /F`);
  - a value or display string longer than 32,767 characters (the shared text limits are far below; this bounds the check).
- **Buttons:** a check box or radio widget (`/FT /Btn`, not a push button) whose state (`/AS`, else its field's `/V`) is not `/Off` and is not a key of `/AP /N` is doubt; one that is off with no drawing is removed with nothing lost.
- **XFA:** `/AcroForm /XFA` present with no field in `/Fields` (a dynamic XFA form; its pages hold only a "please wait" text) is doubt. A form with both is flattened from its fields, and `/XFA` goes with the form.
- **Bounds** (decision 8).

Any doubt or bound turns the file away (`unsupported`) at read time, and the job runs the same plan again on the plain copy and throws before writing. The rule is conservative: any field it cannot be sure of turns the whole file away. Owner question 2.

### 4. Setting aside what is kept

qpdf flattens every annotation with a drawing on `/Annots`, and has no switch to spare a kind. In the same call's JSON update, each page with set-aside annotations gets a private key, `/PDFkaroKept`, holding them in order, and its `/Annots` holds only the rest; qpdf never looks at the private key, so it writes those objects unchanged. In the clean-up update (decision 6) they go back to the end of `/Annots`, in their order, and the key is deleted. A page that already has a key of that name has it deleted in the first update. Kept annotations' popups go aside with them; a link's or attachment's own look is kept.

### 5. Layers

An annotation with `/OC` has that `/OC` written onto its normal drawing stream's dictionary in the first update, which qpdf keeps on the form XObject it draws, so the drawing stays in the layer (measured: hidden in poppler; hand checks in Acrobat, Chrome and Firefox, issue #7). When the drawing stream already has an `/OC` of its own, or is shared by annotations whose `/OC` differ (or by one with `/OC` and one without), the engine does not touch that stream: it writes a small new form XObject for that annotation, with identity `/Matrix`, a `/BBox` equal to the original `/BBox` taken through the original `/Matrix` (so qpdf places it exactly as it would have placed the original), content `/Fx Do` naming the original in its `/Resources`, and `/OC` set to the annotation's (or to an optional-content membership dictionary `/AllOn` of both when the original has its own), and points the annotation's `/AP /N` (or the chosen state's entry) at it. No stream data is read or copied; each wrapper is a few hundred bytes, counted against the size budget and the bound of decision 8. Task 2.2 checks the wrapper draws pixel for pixel like the original.

### 6. Clean-up after flattening

qpdf renumbers objects, so the flattened file is read again (`readPages(…, { objects: true })`). Then one update:

- set-aside annotations go back (decision 4);
- any `Widget` left on a page (a check box or radio that was off with no drawing, an empty signature field, a field qpdf could not draw) is removed from `/Annots`;
- any `Popup` whose `/Parent` is not on a page's `/Annots` is removed from `/Annots`;
- in the structure tree (`/StructTreeRoot /K` down), every `/OBJR` kid whose `/Obj` is an annotation no longer on any page is removed, by an iterative walk with a visited set and a depth limit of 64 (past it the subtree is left as it is, named in Risks); an element left with no kids is kept (removing elements would change the reading order the owner chose to keep whole, 13 Nov 2026);
- `/ParentTree` entries are left; they only point to elements.

Removed objects are then not referenced, so the final write drops them, with the field names, values and comments' text they held. Tests search the new file's decoded objects for each marked string.

### 7. The engine (`src/engines/tools/flatten-pdf.ts`), progress and qpdf instances

1. `plainCopy(tools, file, password)` (two instances).
2. `readPages(tools, plain, { objects: true })` (one instance); `plan`; doubt or bound → throw; nothing to flatten → `[]`.
3. One fresh qpdf: the first update (set-aside, `/OC`, `/NeedAppearances` when decision 3 sets it, the private key removed) and `--flatten-annotations=print --generate-appearances --object-streams=disable` in one call, through `callWithArgumentFile` and `cappedWrite` at the budget of decision 9.
4. `readPages` again on the flattened file (one instance).
5. One fresh qpdf: the clean-up update and the final write with `--object-streams=generate`, through `cappedWrite`, then `--check` on the same instance, as every writing tool does.

Five to six instances for a file with something to flatten, three for one with nothing (named under uniform requests). Progress: "Reading the file" through steps 1, 2 and 4 (`reading`, file 0 of 1); step 3's write fills 0 to 45%, step 5's 50 to 90%, the check moves it to 100%. `loads: { read: ['qpdf'], job: ['qpdf'] }`. Imports: `plain`, `pages`, `qpdf`, `qpdf-json`, `inspect`, `src/widget/option-values` (types and `characterRules`).

`inspect`: `readPdf`; if ready, `plainCopy` and `readPages` on a fresh pair, `plan`; doubt or bound → `{ kind: 'unsupported' }`; else ready with the page count. A file qpdf calls damaged stays damaged.

### 8. Bounds

- At most **1,000 flattened-kind annotations on one page** (measured about 0.2 s for qpdf's square-time part at 1,000) and **100,000 in all**, counted on each page where one appears. Worst case inside the bounds: 100 pages of 1,000, measured 25.8 s in Node. Owner question 5.
- The dictionaries are read within `readPages`' caps (64 MB of JSON); over them, the read throws and the file is turned away at read time as `unsupported` (it holds nothing a page tool could judge), the job fails as `engine`.
- Field tree: each node once, depth 32. Structure tree: each node once, depth 64. Annotation lists: each page's list once.
- Popups, `/OC` and kept annotations are each handled once per page.

### 9. Size budget

`oneFileLimit(plain) + 2 KiB × (fields qpdf draws) + 1 KiB × (flattened annotations)` for each write (measured about 265 bytes a generated field and a few dozen a flattened annotation; the factor covers fonts in each drawing's resources). Past it, `OutputLimit` (`output-limit`, the shared sentence).

### 10. The registry entry (words drafts for the owner's review)

After `repair-pdf`, group `smaller`, `runsIn: 'browser'`, phase 2, `accepts: ['application/pdf']`, related `compress-pdf`, `merge-pdf`, `sign-pdf`, `protect-pdf`, `repair-pdf`. Page: slug `flatten-pdf`, name "Flatten PDF", summary "Turn form fields and comments into part of the page.", title "Flatten a PDF in your browser - PDFkaro", description "Turn a PDF's form fields and comments into part of the page, so they can no longer be changed. The file stays on your device and is not uploaded.", heading "Flatten a PDF", sentence "Turn form fields and comments into part of the page. Your file stays on your device."

Widget: the shared picker words; `actionLabel` "Flatten and download"; `writingLabel` "Writing the flattened file"; `doneHeading` "Your flattened file is ready"; `failedHeading` "The file was not flattened."; `tooFewFiles` "Choose a PDF file to flatten."; `outputSuffix` `flattened`; one file; `resultPages: 'input'`; `memoryAdvice` "Try on a computer."; `items: 'files'`, no item controls, one output;

- `unsupportedHeading` (decision 11): "has form fields or notes this tool cannot flatten.";
- `unsupportedAdvice`: "Some of its fields cannot be drawn the way your PDF reader shows them yet, such as letters outside Western European ones, several lines, centred text or a password, or it has a very large number of notes on one page. Your PDF reader's own print to PDF may flatten it.";
- `noSmaller`: heading "There is nothing to flatten in this file.", advice "No new file was made. It has no form fields or comments this tool flattens. Links, bookmarks and attached files are left as they are.";
- `resultNotes`: "Form fields and comments are now part of the page, drawn as they would print. The words written in comments are not kept. Links, attached files and layers are left as they are, and the text can still be searched." and "Bookmarks and the document's details are kept. In a file with accessibility tags, a screen reader may not read the drawn field values. A digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them."

Hub (`smaller`): description "Make a PDF smaller, small enough for an upload limit or grey, repair a damaged one, or flatten its forms and comments, in your browser. The file stays on your device and is not uploaded."; sentence "Tools that make a PDF file smaller, small enough for an upload limit or grey, repair a damaged one, or flatten its forms and comments." (`claimsDevice` stays true.)

### 11. Riding along: `unsupportedHeading`

The shared notice heading for `unsupported` is "<name> is saved in a way this tool cannot read." That is not true of a file this tool can read but will not flatten. An optional widget word `unsupportedHeading` (the words after the name) in `catalogue.ts`, used by `unreadableNotice` in `failures.ts` when set; every other tool unchanged, tested. Named in the pull request; it can go first in its own pull request if the panel prefers.

### 12. Page text (`src/content/tools/flatten-pdf.md`)

250 to 500 words, marked as a draft: three how-to steps; questions "What does flattening do?" (drawn as printed, removed, searchable), "What is left as it is?" (links, attached files, layers, notes with no drawing of their own, bookmarks), "Why can my form not be flattened?" (the reasons in plain words, fonts for other scripts coming later, and printing to PDF from the reader as the thing to try), "What happens to comments?" (their marks drawn, their words removed), "Will it still work with a screen reader?", "Is a signed form still signed?"; the password sentence. No banned word ("unlock" is not needed here).

### 13. The Privacy page draft

One visible draft sentence beside the uniform-requests paragraphs: on Flatten PDF, a file with nothing to flatten makes fewer requests for qpdf than one with something to flatten, which can tell GitHub that much; nothing of the file is sent.

### 14. Fixtures (`make.mjs`, section 19)

- `flatten-kinds.pdf`: two pages (the second turned 90°): the 11 annotations of the crafted table (with `SECRET-` comment texts), a note with a popup, a file-attachment annotation with `SECRET-ATTACHED`, a square in a layer that is off, a link with its own drawing, a text field and check box with drawings, a signed-looking signature field with a drawing and an empty one, and a tag tree pointing at a field and the note.
- `flatten-cannot-draw.pdf`: `/NeedAppearances` true, Helvetica in `/DR`, fields holding Hindi, Telugu, Arabic and Chinese values.

Each other doubt case is made in memory by `tests/unit/flatten-helpers.ts`.

## Effect on page weight and on when WebAssembly is fetched

The page is a tool page like the others: about 79 KB by gzip before a file is picked, unchanged by this tool except its words (task 6.3 weighs it). No WebAssembly or engine is fetched before a pick; after it, the same read set as every qpdf tool. The job fetches `flatten-pdf-*.js` and shared chunks already built (`pages-*.js`, `option-values-*.js`); no new shared built file is expected (task 4.2).

## Threats considered

| Threat | Handling |
| --- | --- |
| Malicious PDF: deep or looping field, page or structure trees | iterative walks, visited sets, depth limits (decisions 3, 6); `readPages`' own page-tree limits |
| One `/Annots` array shared by many pages, or one annotation on many pages | counted per page against the bounds before qpdf flattens (decision 8) |
| Many annotations on one page (qpdf's square time) | 1,000 a page, 100,000 in all, checked at read time (decision 8) |
| Huge dictionaries (JSON bomb) | `readPages`' 64 MB caps; over them the file is turned away |
| Values and display strings built to slow the check | each capped at 32,767 characters before it is looked at |
| A password field drawn in clear | turned away (decision 3); tested with `SECRET-PASSWORD` absent from the output |
| Letters replaced silently | turned away (decision 3); tests search the output for `?` where a value was |
| A hidden layer shown | `/OC` carried onto the drawing (decision 5); tested |
| Removed data kept (field values, names, comments' text, scripts in field actions) | clean-up (decision 6); tests search every decoded object for marked strings |
| Our private key planted in the input | deleted in the first update (decision 4) |
| Oversized output (generated drawings, copied streams) | size budget (decision 9) through `cappedWrite` |
| Oversized file | no limit; the shared 100 MB and 20,000-page notices |
| Hostile file name | never passed to qpdf or into any message; qpdf paths are made by the engine |
| Fonts and drawings inside appearances | not decoded by us; qpdf copies them; `qpdf --check` on the result |
| Document scripts | left as they are; not run by this site |

## Tests

- `tests/unit/flatten-pdf.test.ts`: `plan` on each crafted case (kinds, flags, shared arrays counted per page, bounds at 1,000 and 1,001 a page and 100,000 and 100,001 in all, each doubt reason, buttons on and off, XFA alone and hybrid, fonts and encodings, the 32,767 cap); the engine on `form.pdf`, `tagged.pdf`, `flatten-kinds.pdf` (drawn where expected by PDF.js pixels at each annotation's place; kept kinds still annotations with their own drawing; hidden layer still hidden with `/OC` on the drawn form; no stray widget or popup; no tag pointer to a removed object; no `SECRET-` comment, field name or value in any decoded object except drawn values; `/AcroForm` gone); `flatten-cannot-draw.pdf` and every in-memory doubt case refused by `inspect` and by `run`; every other fixture giving `[]` or its shared failure; output passes `qpdf --check`, has no password or restrictions; size budget refused on a crafted file; a 10,000-annotation page refused at read in under a second; a planted `/PDFkaroKept` removed.
- The multilingual file: `[]` (nothing to flatten), and a copy with a highlight added is flattened with every page's text unchanged (the shared stream check).
- `engine-loads` shard: `flatten-pdf` asks for `qpdf` only, reading and in the job, over every fixture.
- `tests/e2e/flatten-pdf.spec.ts` at 360 and 1280: every state of the spec; the no-upload test with `qz7form.pdf` on the three outcomes; `uniform-requests.spec.ts`; `performance.spec.ts` (flattening a 500-page file of 50 fields a page blocks the page no more than 100 ms at a time).

## Risks / Trade-offs

- [The doubt rule turns away forms a reader would flatten well] → it is conservative by design; question 2 lets the owner choose more work; the page names print to PDF as the thing to try.
- [qpdf's drawing of a field differs from a reader's in details (no border or background from `/MK`, padding)] → those are drawn by readers from `/MK` and qpdf does not; measured: values in place, no border. Named in the hand checks; owner text review may add a sentence.
- [Drawn values are untagged] → owner question 7; alternative B later.
- [`/OC` on a form XObject is honoured by poppler; other readers untested] → hand checks in Acrobat, Chrome, Firefox and Preview (issue #7).
- [A structure tree deeper than 64 keeps pointers below that depth] → crafted files only; the pointed-to objects then stay in the file; named.
- [qpdf's flattening of annotations with NoRotate or NoZoom on turned pages] → `flatten-kinds.pdf`'s second page is turned; checked by drawing and by hand.
- [Five or six qpdf instances, two of them `readPages` reads] → measured cost is that of a rewrite each; the 110 MB file's job is expected under 3 s in Node (task 3.4 measures and records it, with Chromium peak memory against the shared ceilings).

## Migration Plan

None: a new page. Rollback is removing the registry entry.

## Open Questions

- qpdf's character tables for `/MacRomanEncoding` and `/StandardEncoding` fonts: until task 2.2 checks them, such fonts accept printable ASCII only, which turns away more files, never fewer.
