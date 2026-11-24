# Design

## Context

See `proposal.md` for why Grayscale PDF is next and what the owner decided on 24 Nov 2026 ("Everything, kept as text").

**Order: the content reader first.** In its own OpenSpec change and pull request, `add-content-reader`, proposed once this plan passes stage 1 and reviewed at both stages, `src/engines/content.ts` is added with the rules of decision 4: capped decoding of drawing instructions, the strict tokenizer with its inline-picture rule, and an editor that changes only named byte ranges. No tool uses it at that merge; its unit tests (including every hostile case below) are its first tests, as `add-text-option` had none before Watermark. It gets its own line in "Where the project stands". This tool is built once it is merged. Whether `zlibDeflate` (now in `shrink.ts`) moves to a small file of its own, so this tool's job need not fetch the `shrink` chunk, is decided in that change; either way the job set is fixed by tool.

What exists and is reused:

- **The one-file tool flow** with no options, as Crop PDF has it: the row with the first page's thumbnail and no summary line, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices, Cancel, "Go back to your file", the result with static `resultNotes`, and the "no new file" outcome (`noSmaller`, `[]` from the engine).
- **`plainCopy`** (`plain.ts`): the input decrypted once with no object streams, so qpdf's JSON update reaches every object; page tools drop passwords this way.
- **`readPages(tools, plain, { objects: true })`** (`pages.ts`): each page's id, own dictionary, content streams, effective `/Resources`, and every object's dictionary with no stream data, from capped qpdf JSON.
- **Raw stream data in batches** (`rawBatches`, `readRawStreams` in `qpdf-json.ts`, `--decode-level=none`): qpdf never decodes a stream for this tool.
- **`inflateLimited`** (`picture.ts`) and **`zlibDeflate`** (`shrink.ts` today).
- **The update written in pieces:** `opening`, `entryText` (`qpdf-json.ts`); `PlainSource`, `sizeLimit`, `writePageUpdate` (`pages.ts`); `OutputLimit`, `cappedWrite` (`qpdf.ts`).
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`).

## Goals / Non-Goals

**Goals:**

- Every RGB and CMYK colour this tool can name shown and printed as grey, in content, forms, patterns, Type 3 glyphs, annotation appearances, pictures and shadings; text, links, forms, bookmarks and tags kept (the owner's decision).
- No drawing state followed: every change is local to one dictionary entry or one operator, so it is right wherever the stream is drawn from.
- Fail safe: a stream read with any doubt, or an unconvertible colour, is left exactly as it was; nothing is ever half changed.
- No pixel work and no decoding by qpdf; decoding in our code, capped per stream and per job; output capped.
- No dependency, no new component, no new option kind.

**Non-Goals:**

- Storing grey values in place of colour values; making the file smaller; converting spot colours, Lab, JPEG 2000 or inline pictures; a per-file report of what was left; options; next steps after the result.

## Decisions

### 1. The approach: grey stand-in colour spaces, and four operators rewritten

The alternatives weighed:

- **(a) Rewrite every colour to its grey value** (`rg`, `RG`, `k`, `K`, `sc`, `scn`, `SC`, `SCN`, `cs`, `CS`, in page content, forms, tiling patterns, Type 3 glyphs and appearance streams, with ICC-based, Separation and DeviceN colours turned to `DeviceGray`). The file would hold grey values. But `sc` takes its meaning from the current colour space, which is set earlier, saved and restored by `q` and `Q`, and **inherited by every form and Type 3 glyph drawn from that point** (and by appearance streams in some readers). Rewriting `0.2 0.4 0.6 sc` to one number needs the space in force where it is drawn, which differs per caller; a form drawn from two places with two spaces cannot be rewritten once. Getting this wrong gives wrong operand counts, which readers handle differently (error, ignore, or take the last numbers). It is the same class of problem that made Resize drop its content check. Rejected for this version.
- **(b) Redefine named colour spaces in resources** so operators need not change. This reaches every `cs` / `sc` use of a named space, pictures and shadings, with no state at all, because a space object means the same wherever it is used. It cannot reach `rg`, `RG`, `k`, `K`, which name their space themselves.
  - **(b′) The file's default colour spaces** (`/DefaultRGB`, `/DefaultCMYK` in resources, ISO 32000 8.6.5.6) would redirect even those operators, but which readers honour them, for operators and for pictures, is uneven and cannot be tested beyond PDF.js here; and the colour data would stay. Rejected.
- **(c) A see-through layer** over each page (a grey rectangle painted with the `Saturation` blend mode, which by the standard's own formula leaves the luminosity 0.3 R + 0.59 G + 0.11 B): no reading of drawing instructions at all. But annotations are drawn above it and stay in colour; the file holds colour and transparency, so many printer drivers and print-shop tools treat every page as colour, and some printers flatten transparency into pictures, turning text into pixels; and a reader that does not do blend modes shows colour. It makes the page look grey rather than making the file grey. Rejected.
- **Re-encoding pictures as grey data.** A JPG goes back through the browser's encoder, which writes three components, so the "grey" JPG is still an RGB JPG (as Compress PDF's grey scans are, open owner question), loses quality once, and needs a pixel budget against hostile progressive JPGs (a scan-count cap is still left for later). A JPG transcoder that keeps only the luma channel losslessly would be exact but is a large new piece. Lossless pictures could be converted exactly, but doing that only for them gives two stories on one page. Not in this version (owner question 1).
- **Chosen: (b) everywhere a colour space is named, plus the smallest operator rewrite for the four operators that name their own space,** all pointing at one grey stand-in per kind of colour:
  - `r g b rg` becomes `/GreyRGB cs r g b sc`, `RG` likewise with `CS` and `SC`; `c m y k k` becomes `/GreyCMYK cs c m y k sc`, `K` likewise; a `cs` or `CS` whose operand is `/DeviceRGB` or `/DeviceCMYK` gets `/GreyRGB` or `/GreyCMYK` instead. The numbers are kept byte for byte. After the rewrite the current space is the stand-in, which has the same number of components as before, so a later `sc`, a form or glyph that inherits the space, and an uncoloured pattern all still get the numbers they expect, and draw grey. No state is followed.
  - Every place that names a convertible colour space points at the stand-in instead (decision 3).

Why plainest and sound: every change is one dictionary entry or one operator with its own operands, so each is right in every context; the content reader only has to find six operators and their operands, and anything it is unsure of is left; no picture is decoded. The cost (colour values stay underneath; the file does not shrink) is said on the page and asked at stage 1.

### 2. The grey, and the stand-ins

**The grey** is the PDF standard's luminosity (ISO 32000-1 11.3.5.3, `Lum`): `0.3 R + 0.59 G + 0.11 B`, also what PDF.js uses. **CMYK** goes through the standard's simple conversion to RGB (10.4.2.4): `R = 1 − min(1, C + K)`, `G = 1 − min(1, M + K)`, `B = 1 − min(1, Y + K)`, then the same luminosity. Readers show CMYK through their own profiles, so the grey of a CMYK colour is close to, not exactly, its luminosity as each reader shows it; said in the questions. Owner question 2.

**The stand-ins,** written once per job, as new objects with ids above the file's highest, only when used:

```
GreyRGB  = [/DeviceN [/GreyR /GreyG /GreyB] /DeviceGray F3]
GreyCMYK = [/DeviceN [/GreyC /GreyM /GreyY /GreyK] /DeviceGray F4]
F3: << /FunctionType 4 /Domain [0 1 0 1 0 1] /Range [0 1] >>  { 0.11 mul exch 0.59 mul add exch 0.3 mul add }
F4: << /FunctionType 4 /Domain [0 1 0 1 0 1 0 1] /Range [0 1] >>  the formula above, with min written as 2 copy gt {exch} if pop
```

- `DeviceN` with a `DeviceGray` alternate is PDF 1.3; a device without inks of these names (every office printer and screen) draws the alternate, so the grey. The names are not process inks, so a press never prints them on its colour plates; they show in print shops' tools (owner question 1).
- **Type 4 functions** are exact for any formula, including the `min` in CMYK. PDF.js compiles them to JavaScript. If the hand checks show a reader slow on large pictures, a Type 0 sampled function with two samples a side is exact for the RGB formula (it is linear) and is the fallback; named in Risks.
- Components of a `DeviceN` space are tints from 0 to 1, and a picture's default `/Decode` for it is `[0 1]` per component, the same as for `DeviceRGB`, `DeviceCMYK` and ICC-based spaces with their default range. So only spaces whose every component ranges 0 to 1 are given a stand-in (decision 3); Lab and ICC-based spaces with other ranges are left.

### 3. What is pointed at the stand-ins, and what is left

**Colour spaces by kind:**

| Space | What happens |
| --- | --- |
| `DeviceGray`, `CalGray`, ICC-based with 1 component, `Separation` or `DeviceN` with a `DeviceGray` alternate, `/Pattern` alone | Already grey; unchanged |
| `DeviceRGB`, `CalRGB`, ICC-based with 3 components and range `[0 1]` each (or none) | `GreyRGB` |
| `DeviceCMYK`, ICC-based with 4 components and range `[0 1]` each (or none) | `GreyCMYK` |
| `[/Indexed base hival lookup]` with a base above | `[/Indexed stand-in hival lookup]`, the palette bytes unchanged (a `DeviceN` base is allowed, ISO 32000 8.6.6.3) |
| `[/Pattern base]` with a base above | `[/Pattern stand-in]` |
| `Separation`, `DeviceN` (other alternates), `Lab`, ICC-based with other ranges or another count, anything unreadable | Left as it is |

An ICC-based space's component count is its stream dictionary's `/N`; its profile is never read.

**Where a space is named, each use site changed (never the space object in place, because the same object can be a transparency group's blending space, where `DeviceN` is not allowed):**

- each entry of a resources dictionary's `/ColorSpace` (the entry's value becomes a reference to the stand-in, or a new indexed or pattern array, one new object per distinct original);
- an image XObject's `/ColorSpace` (an 8- or 16-bit or smaller picture, any filter but JPEG 2000; `/Decode`, `/Mask` colour-key ranges, `/SMask` and a soft mask's `/Matte` stay valid, as the component count and sample values do not change); image masks have no space and take the fill colour;
- a shading's `/ColorSpace` (types 1 to 7; its `/Function`, `/Background` and vertex data unchanged).

**Left as they are, named on the page:** transparency group `/CS`, soft-mask `/BC`, output intents and `/Default…` entries (descriptions of blending or output, not drawn colour; a `/DefaultGray` still applies to grey); JPEG 2000 pictures; inline pictures (decision 4); soft masks.

**Annotations and fields** (numbers a reader uses when it draws them again; no state, so written as grey values, keeping the count): `/C` and `/IC` of annotations, and `/BG` and `/BC` in a widget's `/MK`: 3 numbers become `[y y y]`, 4 become `[0 0 0 1 − y]`; 1 or 0 numbers, and arrays already neutral, unchanged. `/DA` strings (each annotation's and the AcroForm's): read by the content reader, `r g b rg` becomes `y g` and `c m y k k` becomes `y g` (readers read a `/DA` for `g`, `rg` and `k` only, and add no `sc` to it, so the grey value is used here, not the stand-in); a `/DA` read with doubt is left. `/DS` and `/RC` rich-text styles are left, named. Bookmark `/C` (three numbers) becomes `[y y y]`.

**Removed:** each page's own `/Thumb` (a stored colour thumbnail of the page), as Resize removes it.

**Drawing instructions read:** the streams below, each read once by object id:

- page content streams (each page's `/Contents`, as a sequence, decision 4);
- form XObjects, except one named only as the `/G` of a soft mask (it sets how see-through something is; its colours become alpha, not colour);
- tiling patterns (`/PatternType 1`) with their own `/Resources`;
- Type 3 glyphs (`/CharProcs` streams);
- annotation appearance streams (`/AP` `/N`, `/R`, `/D`, each a stream or a dictionary of states).

**The stand-in names in resources.** A rewritten operator names `/GreyRGB` or `/GreyCMYK`, so the name must resolve wherever the stream is drawn. The names are chosen once per job as names no `/ColorSpace` dictionary in the file already uses (`GreyRGB`, else `GreyRGB1`, `GreyRGB2`, …). When any rewrite uses a name, it is added to: every page's effective resources (on the dictionary actually in force, own or inherited; a page with none gets a new `/Resources` holding only `/ColorSpace`, as it had nothing to inherit); every form's, tiling pattern's, Type 3 font's and appearance stream's own resources; and the AcroForm `/DR`. A form or Type 3 font with no own `/Resources` is drawn with its caller's, which are pages or forms that all now hold the names. **An appearance stream or tiling pattern with no own `/Resources` is left as it is**, because adding one would hide the fonts it finds elsewhere, and there is no dictionary certain to be in force for it. Adding an unused colour space entry changes nothing drawn.

### 4. Reading drawing instructions safely (`src/engines/content.ts`, in `add-content-reader`)

**Decoding, in our code, never by qpdf.** Raw data is read with `--decode-level=none` in batches (`rawBatches`, at most 32 MB a batch, a fresh qpdf each). `decodeContent(raw, dict)` decodes a chain of at most two filters among `/FlateDecode` (zlib header checked; `inflateLimited`), `/ASCII85Decode` and `/ASCIIHexDecode` (output never longer than input), or none, with no `/DecodeParms` (a predictor on a content stream is rare). Each stream is decoded with a cap of **64 MiB** (`maxContentBytes`); past it, or with any other filter (`/LZWDecode`, `/RunLengthDecode`, …), parameters, a bad header or a short stream, the stream is left as it is. Every decoded byte counts against the job's **content budget**, `min(2 GiB, 512 MiB + 200 × plain copy length)`; past it the job stops with `OutputLimit` and the shared words ("The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it."): a genuine file's drawings do not decode to 200 times the file plus half a gigabyte, and the advice fits the crafted file that does. The budget bounds time, not memory: one stream is held at a time. Task 3.3 measures tokenizing 2 GiB in Chromium; if over two minutes, the budget is lowered before the pull request. A shared stream is decoded once.

**The tokenizer, strict, one pass, no recursion,** over ISO 32000 7.2 and 7.8.2. It gives the token list with byte ranges, or **doubt**, and doubt leaves the whole stream as it was. Tokens:

- whitespace: tab, LF, FF, CR, space. **NUL, any other control byte, and any byte from 0x80 up outside a string, a name or an inline picture's data is doubt** (readers differ on them);
- comments, `%` to the next CR or LF;
- literal strings, with nesting of balanced parentheses and every backslash escape (a backslash takes the next byte, an end of line included); a stream that ends inside one is doubt;
- hex strings `<…>` of hex digits and whitespace only, else doubt;
- `<<`, `>>`, `[`, `]`, nested at most 32 deep and balanced at the end, else doubt; `{` and `}` are doubt;
- names, `/` and regular bytes, `#` followed by two hex digits (any other `#` is doubt);
- numbers, exactly `[+-]?(\d+(\.\d*)?|\.\d+)`;
- every other run of regular bytes must be one of the operators of ISO 32000-2 Table A.1 or `true`, `false`, `null`; any other run is doubt, **including glued tokens** (`0rg`, `ETQ`, `1.2.3`), which some readers split and others refuse. Between `BX` and `EX` a run of letters only (an unknown operator readers skip) is allowed; a run that starts with a digit, sign or dot is still doubt.

**The operators edited** must have exactly their operands since the previous operator: `rg`, `RG` three numbers; `k`, `K` four numbers; `cs`, `CS` one name. Any other operand run before these six is doubt. Operands of other operators are not checked.

**Inline pictures** (`BI … ID data EI`), left in colour, are only stepped over, and only when every reader's rule finds the same end:

- the dictionary between `BI` and `ID` holds names, numbers, booleans, arrays and dictionaries only;
- `ID` is followed by exactly one whitespace byte (a CR followed by LF is doubt, as readers take one or two bytes);
- the data's end by its own rule: with no filter, `H × ceil(W × BPC × n / 8)` bytes (`/IM true`: one bit, one component; `n` from `/G`, `/RGB`, `/CMYK`, `/I` and their long names; a named resource colour space is doubt); `/AHx`: through the first `>`; `/A85`: through the first `~>`; `/DCT`: a JPG that `walkJpeg` reads to its end marker exactly; any other filter is doubt; a `/L` or `/Length` must agree;
- after the data, optional whitespace, `EI`, then whitespace, a delimiter or the end of the stream;
- and no whitespace-`EI`-delimiter sequence anywhere earlier in the data, so a reader that searches for `EI` finds the same end.

Otherwise doubt.

**Streams in sequence.** A page's `/Contents` streams are read one by one; each must end at a token boundary (its last byte whitespace, a delimiter, or the end of a string, array or dictionary), with no string, array, dictionary or inline picture open and **no operands waiting for an operator**; otherwise every stream of that page is left (and, where shared, for every page). So an edited operator's operands are always in its own stream. Forms, patterns, glyphs and appearance streams are read alone by the same rule.

**The editor** takes the decoded bytes and a list of byte ranges with their new text, in order and not overlapping, and gives the new bytes; every byte outside the ranges is copied unchanged. Each edit's text starts and ends with a space, so it can never join a neighbouring token. The tool's edits: before the operand run of `rg`, `RG`, `k` or `K`, insert ` /GreyRGB cs ` (or `CS`, `/GreyCMYK`); replace the operator itself with ` sc ` (or ` SC `); replace a `cs` or `CS` operand `/DeviceRGB` or `/DeviceCMYK` with the stand-in name.

The edited stream is deflated by `zlibDeflate` before it is handed to qpdf (written with `/Filter /FlateDecode`, `/DecodeParms` and `/DL` removed, every other key kept), so qpdf's memory holds compressed data only.

### 5. The engine (`src/engines/tools/grayscale-pdf.ts`)

`loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }`; `inspect = inspectPdf`. Imports from `content`, `plain`, `inspect`, `pages`, `qpdf-json`, `qpdf` and the files holding `inflateLimited` and `zlibDeflate`; never from another engine or `stamp`.

1. One file only; `plainCopy` into a `PlainSource`; "Reading the file". Only `passwords` is read from the options.
2. `readPages(tools, plain, { objects: true })`.
3. **The plan, from dictionaries only:** the colour-space use sites and their stand-ins (decision 3); annotation, field, `/DA` and bookmark colours; the drawing streams with the page that first reaches each (an iterative walk from each page through its resources' forms, patterns and Type 3 fonts and its annotations' appearances, with one visited set and a depth limit of 64; streams not reached from a page come last); soft-mask-only forms left out; appearance streams and patterns with no own resources left out. Every value the update will write is counted against `sizeLimit(plain bytes, pages)` as it is built (at least 2 bytes a number), as Resize does; past it, `OutputLimit`.
4. **The drawing streams**, read in batches in that order, each decoded, tokenized and edited (decision 4); "Page N of M" (`working`, unit page) when the last stream first reached from page N is done, counting every page.
5. If nothing changes, `[]`.
6. The plan's dictionaries and the objects map are let go. A fresh qpdf takes the plain copy from the `PlainSource`. The update is written in pieces to `/update.json` (`opening(max)`, the stand-ins and functions, each changed dictionary, each edited stream with its data file), each counted against `sizeLimit`. `writePageUpdate` writes (`--update-from-json`, `--object-streams=generate`, capped by `cappedWrite`) and runs `qpdf --check`; writing progress 80 to 100.

Errors are fixed sentences; no page text, name, link address, field value or password goes into one.

### 6. A file with nothing to change

Nothing changes when the plan finds no use site, no non-neutral annotation, field, `/DA` or bookmark colour, and no operator to edit in any stream read without doubt. Then the engine gives `[]` and the page shows heading "Nothing in this file needed turning grey." and advice "No new file was made. Its pages already use only grey, or only kinds of colour this tool leaves as they are. You can use your file as it is." The words cover both cases, because `noSmaller` is one fixed text per tool. `0 0 0 rg` is not treated as already grey: leaving it would leave `DeviceRGB` in force for a later `sc` or an inheriting form, which is the state this design avoids following (owner question 5).

### 7. Progress, memory and time

- **Progress:** "Reading the file"; "Page N of M" from 20% to 80%; "Writing the grayscale file" 80 to 100. Cancel ends the worker at any point.
- **Memory:** the plain copy, one batch reader (the file and at most 32 MB raw), one decoded stream (at most 64 MiB) and its edited and deflated copies, the plan, the deflated edited streams so far (no larger than the file's own drawing data plus the added text), then the writer. Ceiling: Add page numbers' on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium).
- **Batch count:** `rawBatches` holds at most `objectsPerCall` (200) ids a batch, so a file with 120,000 own content streams needs 600 fresh qpdf instances. Task 3.3 measures it on a 20,000-page file with its own coloured streams; the lever, if too slow, is a larger count for this reader, safe because `callWithPassword` already passes the ids in an argument file.
- **Time, measured in task 3.3:** `make-large.mjs`'s 100 MB file and its `--scans` file (pictures only: use sites, no pixel work), the 120,000-page file (one shared stream), the 20,000-page file above, and a crafted file at the content budget. **Budget:** each 100 MB file under one minute and the 120,000-page file under 15 minutes in desktop Chromium, the crafted file under two minutes, every peak under the ceiling. If over, the change is updated before the pull request.

### 8. The registry entry (words a draft for the owner's review)

```ts
{ id: 'grayscale-pdf', group: 'smaller', runsIn: 'browser', phase: 2, accepts: ['application/pdf'],
  related: ['compress-pdf', 'compress-pdf-to-1mb', 'pdf-to-jpg', 'watermark-pdf', 'merge-pdf'],
  pages: [{ slug: 'grayscale-pdf', name: 'Grayscale PDF',
            summary: 'Turn the colours in a PDF grey, keeping its text.',
            title: 'Convert a PDF to grayscale in your browser - PDFkaro',
            description: 'Turn the colours in a PDF grey, keeping its text searchable and its links and forms working. The file stays on your device and is not uploaded.',
            heading: 'Convert a PDF to grayscale',
            sentence: 'Turn the colours in a PDF to shades of grey, keeping its text. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Convert to grayscale and download', writingLabel: 'Writing the grayscale file',
            doneHeading: 'Your grayscale file is ready', failedHeading: 'The file was not converted.',
            tooFewFiles: 'Choose a PDF file to convert to grayscale.', outputSuffix: 'grayscale',
            minFiles: 1, multiple: false, resultPages: 'input',
            memoryAdvice: 'Try on a computer, or split the file first and convert the parts.',
            items: 'files', itemControls: false, outputs: 'one',
            noSmaller: { heading: 'Nothing in this file needed turning grey.',
                         advice: 'No new file was made. Its pages already use only grey, or only kinds of colour this tool leaves as they are. You can use your file as it is.' },
            resultNotes: [
              'Text, drawn shapes and pictures now show and print in grey, and text can still be searched and copied. Spot colours, Lab colours, JPEG 2000 pictures, small pictures stored inside a page\'s drawing instructions, and any part this tool could not read with certainty are left in colour.',
              'The colours are still stored in the file underneath, so a program that takes pictures out of it may get them in colour, and the file does not get smaller.',
              "Links, form fields, notes, bookmarks, attached files and the document's details are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them." ] } }
```

- Placed right after `compress-to-target`, before the next group's first entry. Title 52 characters, description 144. The registry test's lists of tools allowed `noSmaller` gain `grayscale-pdf`.
- **Hub words** ("Make smaller and fix", drafts): description "Make a PDF smaller or small enough for an upload limit, or turn it grey, in your browser. The file stays on your device and is not uploaded." (141 characters); sentence "Tools that make a PDF file smaller, small enough for an upload limit, or grey."; title unchanged; `claimsDevice` stays true.

### 9. Page text (`src/content/tools/grayscale-pdf.md`)

Three steps (choose the file; press "Convert to grayscale and download"; download), then questions in plain words, each answer two or three short sentences, 250 to 500 words, marked as a draft:

- Is my file uploaded?
- Can I still search and copy the text? (yes; the text is not turned into a picture)
- Will this make my file smaller? (no; the colours stay stored underneath; Compress PDF or a target size does that)
- Are the colours really gone? (they show and print grey; the values stay in the file, so a program that takes pictures out may get them in colour, and a program that checks for colour may find it)
- What stays in colour? (spot colours, Lab colours, JPEG 2000 pictures, small pictures stored inside drawing instructions, parts that could not be read with certainty, colours in notes' text styles or scripts)
- How is the grey worked out? (the PDF standard's mix of red, green and blue; colours of equal brightness come out the same grey)
- Do links, forms and bookmarks still work? (yes; field and note colours turn grey too; a signature is no longer valid)
- Why did I get no new file?
- What happens to a password? Is my original changed?

No banned word, no "100%", no exclamation mark, no question restating the title.

### 10. The Privacy page draft

One draft sentence beside Crop PDF's (in the part on what a new file can carry), tied to this design and its tests: "Grayscale PDF shows colours in grey but keeps the original colours in the new file, where a program can still read them." Guarded in `tests/unit/privacy-page.test.ts`.

## Effect on page weight and on when WebAssembly is fetched

- **Before a pick:** the generic widget island with this tool's words; the registry entry adds under 1 KB. Under 100 KB (`npm run weigh`).
- **At a pick:** the read set (qpdf, the spare qpdf making the WebAssembly request at once) and the draw set (PDF.js and its data) for the thumbnail, as for every PDF tool. WebAssembly is fetched at the pick, never at page load.
- **At the job:** a fresh worker loads qpdf, `fflate`, the engine and the shared chunks it imports as built. `check:worker` keeps the engine in its own file; `page-weight.mjs` names any new chunk.

## Threats considered

- **A hostile PDF:** qpdf reads only capped JSON (`maxPagesJson`, `maxDictionaryJson`) and raw data with no decoding; our decoding is capped per stream (64 MiB) and per job (the content budget); the tokenizer is linear with no recursion and a nesting limit; the walk over resources is iterative with a visited set and a depth limit; the update is counted against `sizeLimit` as it is built and the write is capped by `cappedWrite`; the result passes `qpdf --check`. No picture is decoded, so no picture bomb or hostile progressive JPG reaches a decoder.
- **Readers that read drawing instructions differently** (glued tokens, control bytes, inline picture ends, CR LF after `ID`, streams split mid-token): each is doubt, and a stream with doubt is left exactly as it was, so the tool never creates a disagreement that was not already in the file.
- **A decode bomb:** stops at 64 MiB for one stream (left as it is); many such streams stop the job at the content budget with `output-limit`, within the time task 3.3 measures.
- **Shared objects named many times:** one stand-in per kind; one new object per distinct indexed or pattern space; each stream decoded and edited once; each changed dictionary written once.
- **An oversized file:** no fixed limit; the 100 MB notice; memory as decision 7; Cancel ends the worker.
- **A hostile file name:** the engine never sees it; the page builds `-grayscale` names as every tool does.
- **Text or values leaking:** no page text, name, link address, field value or password goes into an error, a progress report, a message or the console; the no-upload tests watch for marked strings.

No server is involved, so SSRF and macros do not apply.

## Tests

Expected greys are computed in the test from the known colours by the formula of decision 2, never from the engine's exports. `globalThis.fetch` is replaced by a function that throws and records, asserted never called.

- **`tests/unit/grayscale-pdf.test.ts`** (Node, the browser's qpdf, PDF.js with `@napi-rs/canvas`):
  - `run` on every file in `tests/fixtures/`, each outcome recorded (converted; nothing to change; damaged; not a PDF; password needed);
  - for every result: `qpdf --check`; no password or restrictions; same page count; **PDF.js text content of every page identical** (strings and positions); every decoded drawing stream equal to the original token by token outside the edits of decision 4;
  - **looks grey:** files made in the test (`grayscale-helpers.ts`) with RGB text and shapes by `rg`/`RG`, by `/DeviceRGB cs` and `sc`, by an ICC-based RGB named space, and by CalRGB; a form drawn twice with no `cs` of its own after the caller set `1 0 0 rg` and `/CS0 cs`; a coloured and an uncoloured tiling pattern (`[/Pattern /DeviceRGB]`); a coloured Type 3 glyph; an axial and a mesh shading; an RGB JPG, an RGB lossless picture, a 16-bit picture, an indexed picture, a picture with a colour-key mask and one with a soft mask carrying `/Matte`; a highlight with `/C` and an appearance; a widget with `/MK` colours and red `/DA` text; drawn by PDF.js before and after: every pixel of the result neutral (`|R − G|`, `|G − B|` at most 2) and within 2 of `0.3 R + 0.59 G + 0.11 B` of the original's pixel on average, at most 6 apart at any pixel;
  - **CMYK:** flat `k` and `K` fills, a CMYK named space and a CMYK picture (`pictures/cmyk.jpg`): each drawn neutral, flat fills at the grey of decision 2 within 2;
  - **left as they are:** Separation, DeviceN, Lab, an ICC space with another range, JPEG 2000 (`images.pdf`), an inline picture with a clear end (stepped over; the operators around it edited); each byte for byte, drawn in colour as before;
  - **doubt, each leaving the stream byte for byte:** glued `0.5 0.5 0.5rg`, `ETQ`, `1.2.3`, a control byte, a byte over 0x7F outside a string, `{`, an unbalanced string, array or dictionary, a hex string with a bad byte, a bad `#` in a name, `rg` with two or four operands, `cs` with a number, an inline picture with an `EI` inside its data, with CR LF after `ID`, with a Flate filter, with a named colour space, with a wrong `/L`; contents split mid-token, inside a string, with operands waiting at a stream's end; a form also used only as a soft mask's group (left), and one used both ways (edited); an appearance stream with no resources (left);
  - **decoding:** `[/ASCII85Decode /FlateDecode]` and `/ASCIIHexDecode` streams edited; `/LZWDecode`, a predictor and a bad zlib header left; a 1 GB decode bomb in one stream left at 64 MiB; 20 of them stopping the job with `OutputLimit` at the content budget, within the time recorded;
  - **names:** a file already using `/GreyRGB` in a `/ColorSpace` dictionary gets `/GreyRGB1`; a page with no resources gets them; inherited resources on a `/Pages` node get them once;
  - `/C`, `/IC`, `/MK`, `/DA` and bookmark colours: 3 and 4 numbers made neutral, 1 and 0 unchanged, neutral unchanged, a `/DA` with doubt left; `/DS` and `/RC` unchanged; `/Thumb` removed;
  - `rich.pdf`, `form.pdf`, `tagged.pdf` kept (links, bookmarks, attachment, fields and values, tags pointing at their text); `multilingual.pdf` with every script's text (its stream check token by token, `multilingual.test.ts`); a grey-only file giving `[]`;
  - progress order and the bar never going back; the update cap through a small limit; no error holding page text, a field value or the password.
- **Engine loads:** `grayscale-pdf` in the `engine-loads` shards against every fixture, asking for `qpdf` when reading and `qpdf` and `fflate` in the job.
- **`tests/e2e/grayscale-pdf.spec.ts`** (importing `test` from `tests/e2e/fixtures.ts`), at 360px and 1280px, with coloured files made in the test into a temporary folder: the page; the row and the main button; "Getting ready"; two files dropped; not a PDF; damaged; the password flow; a job on a coloured file with "Reading the file", "Page N of M" and the bar never going back, the three result notes, and the download `<name>-grayscale.pdf` checked with qpdf and PDF.js (text kept, pixels neutral); a grey-only file with "Nothing in this file needed turning grey.", focus on the heading, no Download, "Start again"; Cancel back to the file with the password not asked again; failures from a stand-in engine (memory, `output-limit`, engine not fetched) under "The file was not converted." with "Go back to your file"; the 100 MB and 20,000-page notices; keyboard only.
- **No-upload tests** in the same spec: a protected coloured file made in the test named `qz7report.pdf`, with a link to `https://example.invalid/SECRET-uri`, a named destination `SECRET-dest`, a bookmark `SECRET-bookmark`, a field filled with `SECRET-field` and red text `SECRET-text`; secrets: the name, its stem, the password and its fragments, the text and every `SECRET-` string, plain and URL-encoded (`withEncoded`); and `rich.pdf`, `tagged.pdf`, `form.pdf` with their `SECRET-` strings; nothing in requests, headers, title, storage, address or console; the allowlist exact, read from the build, with no PDF.js in the job, no pdf-lib, `stamp` or other engine.
- **Uniform requests:** `/grayscale-pdf` in `uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs`, `failingJob`, `images.pdf` (`expect: 'done'`), a grey-only fixture found at the build (`expect: 'no-file'`), `form.pdf` and `multilingual.pdf` with the outcomes recorded in task 3.3.
- **100 ms:** "Grayscale PDF: listing and converting the 500-page file blocks the page for no more than 100 ms at a time" in `performance.spec.ts`.

## Risks / Trade-offs

- **Colour values stay in the file**, and the file does not get smaller. → Said on the page, in the result notes and on the Privacy draft; owner question 1.
- **A reader without `DeviceN` or Type 4 functions** would draw the stand-in wrongly. Both are PDF 1.3 and supported by PDF.js, pdfium, Acrobat, Apple's PDFKit, Poppler and MuPDF. → Hand checks in every reader named in "Definition of done", and printing.
- **A reader slow on large pictures through a Type 4 function** (pdfium evaluates it per pixel). → Hand checks time a 300-pixel-to-the-inch A4 scan in Chrome; the fallback is a Type 0 sampled function for RGB (exact, as the formula is linear), a change before the pull request if needed.
- **Parts left in colour:** spot colours, Lab, JPEG 2000, inline pictures, doubtful streams, unusual compressions. → Named on the page; owner question 3. Producers that put most drawing in inline pictures or LZW streams (older or unusual software) give files that stay partly in colour.
- **CMYK greys** follow the standard's simple conversion, not each reader's profile, so a CMYK colour's grey may be a little lighter or darker than it looks in colour. → Said in the questions; owner question 2.
- **`0 0 0 rg` counts as a change**, so an all-black word-processor file gives a new file that looks the same. → Owner question 5.
- **No per-file report** of what was left. → Fixed notes; owner question 7.
- **Raw-data batches** on files with very many content streams. → Measured; the lever in decision 7.
- **Signatures and earlier saved versions** are lost, as for every page tool. → Said on the page.

## Migration Plan

None. A new page and registry entry; no existing page, address or stored data changes. Rolling back is removing the entry and the files. The content reader is its own pull request and is not rolled back with this one.

## Open Questions

For the owner: question 1 at stage 1; questions 2 to 7 going ahead on their defaults (proposal, "Open decisions and owner questions touched"), listed in the pull request and added to "Questions waiting for the owner".
