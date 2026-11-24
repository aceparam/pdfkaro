# Design

## Context

See `proposal.md` for why Grayscale PDF is next and what the owner decided on 24 Nov 2026 ("Everything, kept as text"; and, on this plan, "Yes, looks and prints grey": colours shown and printed grey through grey stand-ins, the original values kept in the file, and the page says so).

**Order: the content reader first.** In its own OpenSpec change and pull request, `add-content-reader`, proposed once this plan passes stage 1 and reviewed at both stages:

- `src/engines/content.ts` with the rules of decision 4: capped decoding of exactly the filters that reach it after `plainCopy` (measured in that change), the strict two-pass reader with its inline-picture rule, the editor, and a named error `PageTooLarge` (known to the worker by its name, as `OutputLimit` is);
- `src/engines/zlib.ts`: `zlibDeflate`, `DeflateClass`, `Fflate`, `need` and `inflateLimited`, moved from `shrink.ts` and `picture.ts` with no change in behaviour, and a new `inflatePrefix(data, Inflate, bytes)` that checks the zlib header, gives back the first `bytes` bytes of the inflated data and stops there as a success (`inflateLimited` gives back nothing once its cap is passed, so it cannot read the start of a larger stream) (Compress PDF, Compress to a target size and Image to PDF byte for byte as before), so this tool's job fetches neither `shrink-*.js` nor `picture-*.js`;
- `content.ts` added to `lateSources` in `scripts/check-worker.mjs` with its own fixed sentences, so the worker file is checked not to hold it; lint keeps components from importing it, as for every file under `src/engines/`.

No tool uses `content.ts` at that merge; its unit tests (every hostile case below) are its first tests. It gets its own line in "Where the project stands". This tool is built once it is merged; any rule that change alters or drops is copied into this change before task 1 (task 0.2).

What exists and is reused:

- **The one-file tool flow** with no options, as Crop PDF has it: the row with the first page's thumbnail and no summary line, the password field, the damaged and not-a-PDF states, the 100 MB and 20,000-page notices, Cancel, "Go back to your file", the result with static `resultNotes`, and the "no new file" outcome (`noSmaller`, `[]` from the engine).
- **`plainCopy`** (`plain.ts`): the input decrypted once with no object streams, so qpdf's JSON update reaches every object; page tools drop passwords this way. It writes with qpdf's default decode level, so some filters are already undone or recompressed before this tool reads (decision 4).
- **`readPages(tools, plain, { objects: true })`** (`pages.ts`): each page's id, own dictionary, content streams, effective `/Resources`, and every object's dictionary with no stream data, from capped qpdf JSON.
- **Raw stream data in batches** (`rawBatches`, `readRawStreams` in `qpdf-json.ts`, `--decode-level=none`). `rawBatches` gains an optional id limit (decision 7), riding along with this tool and named in its pull request (it stays here because this tool is its only user; Compress PDF's calls are unchanged).
- **The update written in pieces:** `opening`, `entryText` (`qpdf-json.ts`); `PlainSource`, `sizeLimit`, `writePageUpdate` (`pages.ts`); `OutputLimit`, `cappedWrite` (`qpdf.ts`).
- **`loads`** per engine and the uniform request sets (`add-uniform-requests`).

## Goals / Non-Goals

**Goals:**

- Every RGB and CMYK colour this tool can name shown and printed as grey on screens and office printers, in content, forms, patterns, Type 3 glyphs, annotation appearances, pictures and shadings; text, links, forms, bookmarks and tags kept (the owner's decisions).
- No drawing state followed: every change is local to one dictionary entry or one operator with its own operands, so it is right wherever the stream is drawn from.
- Fail safe: each drawing stream is either edited by the rules here or left byte for byte as it was; an unconvertible colour space is left as it is.
- No pixel work. qpdf does not decode for reading; our decoding is capped per stream and per job, and the job stops before qpdf's check would read an oversized page whole.
- No dependency, no new component, no new option kind.

**Non-Goals:**

- Storing grey values in place of colour values; making the file smaller; converting spot colours, Lab, JPEG 2000 or inline pictures; a per-file report of what was left; options; next steps after the result.

## Decisions

### 1. The approach: grey stand-in colour spaces, and a few operators rewritten

The alternatives weighed:

- **(a) Rewrite every colour to its grey value** (`rg`, `RG`, `k`, `K`, `sc`, `scn`, `SC`, `SCN`, `cs`, `CS`, in page content, forms, tiling patterns, Type 3 glyphs and appearance streams, with ICC-based, Separation and DeviceN colours turned to `DeviceGray`). The file would hold grey values. But `sc` takes its meaning from the current colour space, which is set earlier, saved and restored by `q` and `Q`, and **inherited by every form and Type 3 glyph drawn from that point**. Rewriting `0.2 0.4 0.6 sc` to one number needs the space in force where it is drawn, which differs per caller; a form drawn from two places with two spaces cannot be rewritten once. Getting this wrong gives wrong operand counts, which readers handle differently. It is the same class of problem that made Resize drop its content check. Rejected for this version.
- **(b) Redefine named colour spaces in resources** so operators need not change. This reaches every `cs` / `scn` use of a named space, pictures and shadings, with no state, because a space object means the same wherever it is used. It cannot reach `rg`, `RG`, `k`, `K`, which name their space themselves.
  - **(b′) The file's default colour spaces** (`/DefaultRGB`, `/DefaultCMYK`, ISO 32000 8.6.5.6) would redirect even those operators, but which readers honour them is uneven and cannot be tested beyond PDF.js here. Rejected.
- **(c) A see-through layer** over each page (a grey rectangle painted with the `Saturation` blend mode, which by the standard's formula leaves the luminosity): no reading of drawing instructions. But annotations are drawn above it and stay in colour; the file holds colour and transparency, so many printer drivers treat every page as colour and some flatten transparency into pictures; a reader without blend modes shows colour. Rejected.
- **Re-encoding pictures as grey data.** The browser's encoder writes three-component JPGs, loses quality once, and needs a pixel budget against hostile progressive JPGs; a lossless luma-only JPG transcoder would be a large new piece. Not wanted: the owner chose "looks and prints grey".
- **Chosen: (b) everywhere a colour space is named, plus the smallest operator rewrite** for the operators that name their own space, all pointing at one grey stand-in per kind of colour (decision 4 gives the exact edits). After a rewrite the current space is the stand-in, which has the same number of components as before, so a later `scn`, a form or glyph that inherits the space, and an uncoloured pattern all still get the numbers they expect, and draw grey.

### 2. The grey, and the stand-ins

**The grey** is the PDF standard's luminosity (ISO 32000-1 11.3.5.3, `Lum`): `0.3 R + 0.59 G + 0.11 B`, also what PDF.js uses. **CMYK** goes through the standard's simple conversion to RGB (10.4.2.4): `R = 1 − min(1, C + K)`, `G = 1 − min(1, M + K)`, `B = 1 − min(1, Y + K)`, then the same luminosity. **CalRGB and ICC-based colours** use their raw components as RGB or CMYK. All three are approximations of how readers show the colour: readers show CMYK through their own profiles, PDF.js converts CalRGB through its white point, gamma and matrix, and Acrobat applies ICC profiles. Owner question 2.

**The stand-ins,** written once per job, as new objects with ids above the file's highest, only when used:

```
GreyRGB  = [/DeviceN [/GreyR /GreyG /GreyB] /DeviceGray F3]
GreyCMYK = [/DeviceN [/GreyC /GreyM /GreyY /GreyK] /DeviceGray F4]
F3: << /FunctionType 4 /Domain [0 1 0 1 0 1] /Range [0 1] >>  { 0.11 mul exch 0.59 mul add exch 0.3 mul add }
F4: << /FunctionType 4 /Domain [0 1 0 1 0 1 0 1] /Range [0 1] >>  the formula above, with min written as 2 copy gt {exch} if pop
```

- `DeviceN` with a `DeviceGray` alternate is PDF 1.3. A screen or an office printer has no inks of these names and draws the alternate, so the grey. **A press or print-shop workflow that keeps `DeviceN` may instead make three or four extra plates named `GreyR`, `GreyG`, `GreyB` (or `GreyC` … `GreyK`)**; print shops' tools list them as extra inks. So no page or note claims more than "shows and prints grey on screens and office printers", the text below the tool says a print shop's tools may list extra inks, and a hand check runs print preflight software (Acrobat's Output Preview).
- **Type 4 functions** are exact for any formula, including the `min` in CMYK. PDF.js 6.5.438 evaluates them in its worker without generating code (no `new Function`), so they raise no Content Security Policy question. If the hand checks show a reader slow on large pictures, a Type 0 sampled function with two samples a side is exact for the RGB formula (it is linear) and is the fallback; named in Risks.
- **Starting colour.** Selecting a `DeviceN` space starts its colour at 1.0 in every component (ISO 32000-1 8.6.8): F3(1, 1, 1) is white, where `DeviceRGB` starts black; F4(1, 1, 1, 1) is black, as `DeviceCMYK` starts. So wherever the edits select `GreyRGB` by `cs`/`CS` without a colour following (a rewritten device operand, or a named entry now pointing at it), they write the starting black ` 0 0 0 scn` (`SCN`) after it (decision 4). PDF.js does not reset the colour on `cs`, so no pixel test can catch a missing start; a token-level test and an Acrobat and Chrome hand check do.
- Components of a `DeviceN` space are tints from 0 to 1, and a picture's default `/Decode` for it is `[0 1]` per component, the same as for `DeviceRGB`, `DeviceCMYK` and ICC-based spaces with their default range. So only spaces whose every component ranges 0 to 1 get a stand-in.

### 3. What is pointed at the stand-ins, and what is left

**Sorting colour spaces,** with no recursion: a value is followed through references at most 4 steps; names are compared by their decoded form (`/Device#52GB` is `/DeviceRGB`).

| Space | What happens |
| --- | --- |
| `DeviceGray`, `CalGray`, ICC-based with 1 component, `Separation` or `DeviceN` with a `DeviceGray` alternate, `/Pattern` alone | Already grey; unchanged |
| `DeviceRGB`, `CalRGB`, ICC-based with `/N 3`, a `/Range` absent or exactly 6 numbers each pair `0 1`, and a profile whose data-space field (4 bytes at offset 16) is `RGB ` | `GreyRGB` |
| `DeviceCMYK`, ICC-based with `/N 4`, a `/Range` absent or exactly 8 numbers each pair `0 1`, and a profile data space `CMYK` | `GreyCMYK` |
| `[/Indexed base hival lookup]` whose base is itself one of the two rows above | `[/Indexed stand-in hival lookup]`, the palette bytes unchanged (a `DeviceN` base is allowed, ISO 32000 8.6.6.3) |
| `[/Pattern base]` whose base is one of the two rows above | `[/Pattern stand-in]` |
| `Separation`, `DeviceN` (other alternates), `Lab`, ICC-based with another count, range or data space, an unreadable profile, an indexed or pattern base that is not an RGB or CMYK row, anything unreadable | Left as it is |

An ICC profile's data-space field is read from the first 20 bytes of its stream, taken in the raw batches: with no filter, the bytes themselves; with `/FlateDecode`, through `inflatePrefix(data, Inflate, 20)`, which stops successfully after 20 bytes however large the profile; any other filter, or fewer than 20 bytes, makes the profile "unreadable".

**How use sites are found:** one iterative walk over every object in the objects map (not from the pages), into direct dictionaries and arrays at most 32 levels deep, with a visited set. It finds:

- each entry of a resources dictionary's `/ColorSpace` (a resources dictionary is the value of a `/Resources` key), **skipping keys `/DefaultGray`, `/DefaultRGB` and `/DefaultCMYK`**;
- an image's `/ColorSpace` (an image stream, `/Subtype /Image`, any bit depth, any filter but `/JPXDecode`, whether drawn, an `/Alternates` image or otherwise; `/Decode`, `/Mask` colour-key ranges, `/SMask` and a soft mask's `/Matte` stay valid, as the component count and sample values do not change);
- a shading's `/ColorSpace` (a dictionary or stream with `/ShadingType` 1 to 7, a direct one nested in a shading pattern included; its `/Function`, `/Background` and vertex data unchanged).

Each found entry gets a reference to the stand-in, or a new indexed or pattern array (one new object per distinct original). **The space object itself is never changed**, because the same object can be a transparency group's blending space, where `DeviceN` is not allowed. A **soft-mask-only form's own resources dictionary** (decision 3, below) is not changed: its `/ColorSpace` entries are left and no stand-in names are added. Pictures and shadings are changed in their own dictionaries, so one used both inside a soft mask and elsewhere is repointed in both (in an RGB group the mask's luminosity is the same; in a CMYK group it may differ slightly; Risks).

**Named entries selected by `cs`/`CS`, and the starting black.** A resources entry that becomes `GreyRGB` directly (from `DeviceRGB`, `CalRGB` or ICC RGB; not as an indexed or pattern base) changes the starting colour of `/Name cs` from black to white, so text painted after it with no colour set would vanish in readers that follow the standard. Two separate decisions, neither needing a stream to be read twice:

- **Eligible for the starting black (step 3, from dictionaries only):** a name is eligible when every dictionary that can be in force for the stream that selects it (its own resources; or, for a stream without own resources, every page's effective resources and every form's own resources) gives that name a direct RGB entry (`DeviceRGB`, `CalRGB`, or ICC RGB with range 0 to 1). Callers agreeing is a fact about dictionaries, so it is known before any stream is read. In every edited stream, ` 0 0 0 scn` (` 0 0 0 SCN` after `CS`) is inserted after `/Name cs` of an eligible name, as the stream is edited, deflated and counted once (step 4). **This is harmless if the entry is later left:** `DeviceRGB`, `CalRGB` and ICC RGB all start at `0 0 0`, and `scn` is valid for every one of them (ISO 32000-1 8.6.5 and 8.6.8), so the drawing is unchanged.
- **Repointed (step 5, after the streams are read):** an eligible entry is repointed to `GreyRGB` only when every stream that can draw with its dictionary was read and edited without doubt: the streams whose own resources it is (page content for a page's effective resources; a form, pattern, glyph or appearance stream for its own `/Resources`), and, when it can be in force for a stream without own resources (a form or Type 3 font drawn from it), those streams too. **Otherwise (a stream left for any reason: doubt, a filter the reader does not decode, `/F`, an appearance stream or pattern with no own resources, a soft-mask-only form; or a name that is not eligible), that entry is left alone in every dictionary that holds it.** Step 5 only decides dictionary entries; streams are never touched again.

CMYK (starts black either way), indexed (starts at index 0 either way) and pattern entries need no starting colour and are repointed whatever happens to the streams.

**Left as they are, named on the page:** transparency group `/CS` (page and form `/Group`), a soft mask's `/BC`, `/OutputIntents`, `/Default…` keys; JPEG 2000 pictures; inline pictures (decision 4); soft masks.

**Annotations and fields** (numbers a reader uses when it draws them again; no state, so written as grey values, keeping the count): `/C` and `/IC` of annotations, and `/BG` and `/BC` in a widget's `/MK`: 3 numbers become `[y y y]`, 4 become `[0 0 0 1 − y]`; 1 or 0 numbers, and arrays already neutral, unchanged. `/DA` strings: the AcroForm's, and every field's and widget's, found by walking the whole AcroForm `/Fields` tree (`/Kids`, iterative, visited set, depth 32), so an inherited `/DA` on a parent (a radio group) is reached; read by the content reader, `r g b rg` and `c m y k k` become `y g` (readers read a `/DA` for `g`, `rg` and `k` only and add no `scn`, so the grey value is used here, not the stand-in); a `/DA` read with doubt is left; the edited string is written through the JSON value writer. `/DS` and `/RC` rich-text styles are left, named. Bookmark `/C` (three numbers) becomes `[y y y]`.

**Written numbers:** one rule: each grey `y` is computed from components clamped to [0, 1], is finite, is clamped again to [0, 1], and is written with at most 4 decimals, trailing zeros and a trailing point trimmed, never an exponent (`0.3`, `0.89`, `1`, `0`), as Resize's `fixed` rule writes in fixed form.

**Removed:** each page's own `/Thumb`, only when a new file is made; a `/Thumb` alone never makes a file new (decision 6). A picture reached only through `/Thumb` is left out of the use-site walk, so a colour thumbnail alone never makes a file new.

**Drawing streams read,** each read once by object id; **a stream left in one context is left in every context**:

- page content streams (each page's `/Contents`, as a sequence, decision 4);
- form XObjects, except one named only as the `/G` of a soft mask (its colours become alpha, not colour);
- tiling patterns (`/PatternType 1`) with their own `/Resources`;
- Type 3 glyphs (`/CharProcs` streams);
- annotation appearance streams (`/AP` `/N`, `/R`, `/D`, each a stream or a dictionary of states).

A stream with `/F` (data in an outside file) is left.

**The stand-in names in resources.** A rewritten operator names `/GreyRGB` or `/GreyCMYK`, so the name must resolve wherever the stream is drawn. The names are chosen once per job as names no `/ColorSpace` dictionary in the file already uses (`GreyRGB`, else `GreyRGB1`, `GreyRGB2`, …). When any rewrite uses a name, it is added to: every page's effective resources (on the dictionary actually in force, own or inherited; a page with none gets a new `/Resources` holding only `/ColorSpace`, as it had nothing to inherit); every form's, tiling pattern's, Type 3 font's and appearance stream's own resources, except a soft-mask-only form's; and the AcroForm `/DR`. A form or Type 3 font with no own `/Resources` is drawn with its caller's, which are pages or forms that all now hold the names. **An appearance stream or tiling pattern with no own `/Resources` is left as it is**, because adding one would hide the fonts it finds elsewhere. Adding an unused colour space entry changes nothing drawn.

### 4. Reading drawing instructions safely (`src/engines/content.ts`, in `add-content-reader`)

**What reaches the reader.** qpdf does not decode for reading: raw data is read with `--decode-level=none`. But `plainCopy` writes with qpdf's default decode level, so filters it undoes are gone before the read (measured by the architect: `[/ASCII85Decode /FlateDecode]` and `/ASCIIHexDecode` come out as `/FlateDecode` only). The `add-content-reader` change measures exactly what reaches the reader after `plainCopy` for Flate, none, RunLength and LZW, each with and without predictors and in chains, and `decodeContent` is cut to exactly that set; anything else is left as it is. The claim is: qpdf does not decode for reading; `plainCopy`, the write and `--check` decode, streaming, as for every page tool (except `--check`'s whole-page read, below). If ASCII85 can still reach the reader, each filter step is decoded in pieces with the 64 MiB cap on that step's output (ASCII85's `z` turns 1 byte into 4, so no step's output is assumed shorter than its input).

**Size limits.** A drawing stream is decoded with a cap of **64 MiB** (`maxContentBytes`). qpdf's `--check`, run by `writePageUpdate` on the written file, parses each page's whole content into one buffer (architect's measurement: a 64 MiB page passes with 128 MB of qpdf heap, 512 MiB passes with about 1 GB, 1 GiB fails with `std::bad_alloc`). So a stream left as it was would still reach that read. Therefore **a drawing stream that decodes past 64 MiB, or a page whose content streams together decode past 64 MiB, stops the job with `PageTooLarge`**, a new shared failure kind `page-too-large` with words that fit a genuine dense map or drawing as well as a crafted file, naming the page: "Page N has too much drawing on it to convert here. Delete that page, or split the file, and convert the rest." `PageTooLarge` carries the page's number (a field, the first page reaching the stream for a form) to the worker and the widget; the sentence is fixed apart from that number, which carries no page text, and leaves out "so no new file was made", which the heading already says (not `OutputLimit`'s "The file may be damaged", which would be wrong advice for a genuine file). The text below the tool says a page with very large drawing instructions cannot be converted. Owner question 8 asks whether to keep this stop; task 3.3 records how near a realistic dense sample (the `--vector` file's pages and a real map or plan if one is at hand) comes to 64 MiB. A stream with a filter the reader does not decode is left, and its decoded size is unknown; qpdf's own `--check` exposure for such streams is the shared one every writing tool already has, named as a follow-up for all writing tools.

Every decoded byte, and every edited stream's length (worked out before it is allocated, below), counts against the job's **content budget**, `min(2 GiB, 512 MiB + 200 × plain copy length)`; past it the job stops with `OutputLimit`. The budget bounds time; memory is bounded by holding one stream at a time. A shared stream is decoded once.

**The reader: two passes, bounded memory, no recursion,** over ISO 32000 7.2 and 7.8.2. It keeps only the current operand run (its count, its start offset and the kinds and spans of its last four operands), the nesting depth of strings, arrays and dictionaries, and whether it is inside `BX`/`EX` (a counter); no token or edit list is built. It runs twice over a stream: the first pass checks and works out the edited length and the edits' count; the stream is doubt or the length is known; then a buffer of exactly that length is allocated (counted against the content budget first) and the second pass writes it. An edited stream longer than 3 × 64 MiB is doubt. **Doubt leaves the whole stream as it was.** Tokens:

- whitespace: tab, LF, FF, CR, space. **NUL, any other control byte, and any byte from 0x80 up outside a string, a name or an inline picture's data is doubt**;
- comments, `%` to the next CR or LF; a `/Contents` stream other than the last that ends inside a comment (no CR or LF after the `%`) is doubt for that page, as readers that join the streams would continue the comment into the next one;
- literal strings, with nesting of balanced parentheses and every backslash escape (a backslash takes the next byte, an end of line included); a stream that ends inside one is doubt;
- hex strings `<…>` of hex digits and whitespace only, else doubt;
- `<<`, `>>`, `[`, `]`, nested at most 32 deep and balanced at the end, else doubt; **an operator inside `[ ]` or `<< >>` is doubt**; `{` and `}` are doubt;
- names, `/` and regular bytes, `#` followed by two hex digits (any other `#` is doubt); compared by their decoded form;
- numbers, exactly `[+-]?(\d+(\.\d*)?|\.\d+)`;
- every other run of regular bytes must be one of the operators of ISO 32000-2 Table A.1 or `true`, `false`, `null`; any other run is doubt, **including glued tokens** (`0rg`, `ETQ`, `1.2.3`). Between `BX` and `EX` a run of letters only is allowed; a run that starts with a digit, sign or dot is still doubt. **`BX`/`EX` unbalanced at the end, an `EX` with no `BX`, and `ID` or `EI` outside `BI` are doubt.**

**The operators edited** must have exactly their operands since the previous operator: `rg`, `RG` three numbers; `k`, `K` four numbers; `cs`, `CS` one name; `sc`, `SC` any count of numbers. Any other operand run before these is doubt. Operands of other operators are not checked.

**Inline pictures** (`BI … ID data EI`), left in colour, are only stepped over, and only when every reader's rule finds the same end, PDF.js's (`findDefaultInlineStreamEnd`: the first `EI` followed by whitespace, NUL included, or a delimiter, with nothing needed before it; for ASCII85 the first `~`) included:

- the dictionary between `BI` and `ID` holds names, numbers, booleans, arrays and dictionaries only;
- `ID` is followed by exactly one whitespace byte (a CR followed by LF is doubt);
- the data's end by its own rule: with no filter, `H × ceil(W × BPC × n / 8)` bytes, worked out in steps that each check against the bytes left so no product can overflow (`/IM true`: one bit, one component; `n` from `/G`, `/RGB`, `/CMYK`, `/I` and their long names; a named resource colour space is doubt); `/AHx`: through the first `>`; `/A85`: through the first `~`, which must be followed by `>`; any other filter (`/DCT` included, so this tool needs no JPG reader) is doubt; a `/L` or `/Length` must agree;
- after the data, optional whitespace, `EI`, then whitespace, a delimiter or the end of the stream;
- and **no `EI` followed by whitespace, a delimiter or the end anywhere earlier in the data, whatever comes before it**, and for ASCII85 no other `~`.

Otherwise doubt.

**Streams in sequence.** A page's `/Contents` streams are read one by one; each must end at a token boundary (its last byte whitespace, a delimiter, or the end of a string, array or dictionary), with no string, array, dictionary, comment or inline picture open and **no operands waiting for an operator**; otherwise every stream of that page is left (and, where shared, for every page). So an edited operator's operands are always in its own stream. Forms, patterns, glyphs and appearance streams are read alone by the same rule.

**The edits** (each edit's text starts and ends with a space, so it can never join a neighbouring token; every byte outside an edit is copied unchanged):

- `r g b rg` → insert ` /GreyRGB cs ` before the operands and replace `rg` with ` scn `; `RG` likewise with ` /GreyRGB CS ` and ` SCN `;
- `c m y k k` → ` /GreyCMYK cs ` … ` scn `; `K` likewise with `CS` and ` SCN `;
- `/DeviceRGB cs` → ` /GreyRGB cs 0 0 0 scn `; `CS` likewise with ` SCN `; `/DeviceCMYK cs` → ` /GreyCMYK cs ` (starts black);
- `/Name cs` (`CS`) of a name eligible for the starting black (decision 3) → add ` 0 0 0 scn ` (`SCN`) after it, whether or not its entry is later repointed;
- **every `sc` → ` scn ` and `SC` → ` SCN `** in an edited stream: `sc` is not defined for `DeviceN` (ISO 32000-1 Table 74), and `scn` means the same as `sc` for every other space, so this needs no state. No edited stream keeps `sc` or `SC`. A stream left because of doubt, and an unedited stream (a form with nothing else to edit) that inherits a repointed name, may still hold `sc`; named in Risks and the hand checks.

The edited stream is deflated by `zlibDeflate` as soon as it is made and counted against `sizeLimit` then (written with `/Filter /FlateDecode`, `/DecodeParms` and `/DL` removed, every other key kept), so qpdf's memory holds compressed data only.

### 5. The engine (`src/engines/tools/grayscale-pdf.ts`)

`loads = { read: ['qpdf'], job: ['qpdf', 'fflate'] }`; `inspect = inspectPdf`. Imports from `content`, `zlib`, `plain`, `inspect`, `pages`, `qpdf-json` and `qpdf`; never from another engine, `stamp`, `shrink` or `picture`.

1. One file only; `plainCopy` into a `PlainSource`; "Reading the file". Only `passwords` is read from the options.
2. `readPages(tools, plain, { objects: true })`.
3. **The plan, from dictionaries:** the names eligible for the starting black (decision 3); the use sites and their stand-ins (decision 3; ICC profile headers read with the first raw batch); annotation, field, `/DA` and bookmark colours; the drawing streams with the page that first reaches each (an iterative walk from each page through its resources' forms, patterns and Type 3 fonts and its annotations' appearances, with one visited set and a depth limit of 64; streams not reached from a page come last); soft-mask-only forms left out; appearance streams and patterns with no own resources left out. Direct RGB named entries are only listed here as candidates for repointing. Every value the update will write is counted against `sizeLimit(plain bytes, pages)` as it is built (at least 2 bytes a number), as Resize does; past it, `OutputLimit`.
4. **The drawing streams**, read in batches in that order, each decoded, read, edited (the starting black included for eligible names), deflated and counted once (decision 4), then let go; only its deflated copy and whether it was left are kept; "Page N of M" (`working`, unit page) when the last stream first reached from page N is done, counting every page.
5. **The named entries decided** (decision 3): each direct RGB candidate is repointed only if it is eligible and every stream that can draw with its dictionaries was edited without doubt; otherwise it is left in every dictionary. Only dictionary entries are decided here; no stream is read or changed again. Then, if nothing is turned grey, `[]` (decision 6).
6. The plan's dictionaries and the objects map are let go. A fresh qpdf takes the plain copy from the `PlainSource`. The update is written in pieces to `/update.json` (`opening(max)`, the stand-ins and functions, each changed dictionary, each edited stream with its data file), each counted against `sizeLimit`. `writePageUpdate` writes (`--update-from-json`, `--object-streams=generate`, capped by `cappedWrite`) and runs `qpdf --check`; writing progress 80 to 100.

Errors are fixed sentences; no page text, name, link address, field value or password goes into one.

### 6. A file with nothing to turn grey

Nothing is turned grey when the plan finds no use site, no non-neutral annotation, field, `/DA` or bookmark colour, and no operator to edit in any stream read without doubt; a `/Thumb` alone does not count, and **a stream whose only edit is an inserted starting black does not count** (if no other change is made, those streams are not written). Then the engine gives `[]` and the page shows heading "Nothing in this file was turned grey." and advice "No new file was made. Its pages already use only grey, or their colours are kinds this tool leaves as they are, such as spot colours, Lab colours or JPEG 2000 pictures." The words cover both cases, because `noSmaller` is one fixed text per tool. `0 0 0 rg` is not treated as already grey: leaving it would leave `DeviceRGB` in force for a later `sc` or an inheriting form, which is the state this design avoids following (owner question 5).

**The grey-only test file,** `tests/fixtures/grey-only.pdf` (`make.mjs` section 17; no committed fixture qualifies: none has a page `/Group` or an output intent): two pages drawn only with `g`, `G` and a `DeviceGray` picture, a page `/Group << /S /Transparency /CS /DeviceRGB >>`, a form with `/Group /CS /DeviceRGB`, a soft mask with `/BC [1 0 0]`, a resources `/ColorSpace` with `/DefaultRGB` pointing at an ICC RGB profile (`pictures/p3.icc`) that no operator selects, and an `/OutputIntents` entry with that profile. Grayscale gives no file for it. Every other tool runs against it in the shared fixture loops and its outcome is recorded in the fixtures README.

### 7. Progress, memory, qpdf instances and time

- **Progress:** "Reading the file"; "Page N of M" from 20% to 80%; "Writing the grayscale file" 80 to 100. Cancel ends the worker at any point.
- **Memory:** the plain copy, one batch reader (the file and at most 32 MB raw), one decoded stream (at most 64 MiB), its edited copy (its length known before allocation, at most 3 × 64 MiB) and its deflated copy, each let go before the next stream, the plan, the deflated edited streams so far, then the writer. Step 5 decides dictionary entries only, so no decoded stream is kept past step 4 and none is read twice. Ceiling: Add page numbers' on the 100 MB file (1.19 GB in Node, 1.36 GB in Chromium).
- **qpdf instances a job makes:** those `plainCopy` makes (two, as built) and one for `readPages`, then one per raw batch, then one writer only when a file is written. Batches come from `rawBatches` over the drawing streams and ICC profiles, each at most `L` ids and at most 32 MB of stated length, a stream over 32 MB or of unknown length alone. `rawBatches` gains an optional id limit `L`; Compress PDF keeps 200. This tool asks for **2,000**, safe because `readBatch` already passes the ids in an argument file through `callWithPassword`, not on qpdf's stack; task 3.3 checks it on the 20,000-page file, records the count of instances and the cost of each, and falls back to 200 if qpdf refuses. So a file of 120,000 own content streams needs about 60 batch readers, not 600.
- **Time and peak, measured in task 3.3 over the whole job, through `writePageUpdate` and its `--check`:** `make-large.mjs`'s 100 MB file and its `--scans` file (pictures only: use sites, no pixel work); a new `make-large.mjs --vector` file of about 100 MB of compressed, dense coloured vector content (`rg`, `re`, `f` repeated, page streams each under 64 MiB decoded); the 120,000-page file (one shared stream); a 20,000-page file with its own coloured streams (`make-many-pages.mjs`); a crafted file at the content budget made of edit-heavy operators (`0 0 0 rg` repeated, not whitespace); and one 64 MiB stream of `0 0 0 rg `. **Budget:** each 100 MB file under one minute and the 120,000-page file under 15 minutes in desktop Chromium, the crafted file under two minutes, every peak under the Chromium ceiling. If over, the change is updated before the pull request.

### 8. The registry entry (words a draft for the owner's review)

```ts
{ id: 'grayscale-pdf', group: 'smaller', runsIn: 'browser', phase: 2, accepts: ['application/pdf'],
  related: ['compress-pdf', 'compress-pdf-to-1mb', 'pdf-to-jpg', 'watermark-pdf', 'merge-pdf'],
  pages: [{ slug: 'grayscale-pdf', name: 'Grayscale PDF',
            summary: 'Turn the colours in a PDF grey, keeping its text.',
            title: 'Convert a PDF to grayscale in your browser - PDFkaro',
            description: 'Turn the colours in a PDF grey, keeping its text searchable and its links and forms working. The file stays on your device and is not uploaded.',
            heading: 'Convert a PDF to grayscale',
            sentence: 'Turn the colours in a PDF grey and keep its text. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            actionLabel: 'Convert to grayscale and download', writingLabel: 'Writing the grayscale file',
            doneHeading: 'Your grayscale file is ready', failedHeading: 'The file was not converted.',
            tooFewFiles: 'Choose a PDF file to convert to grayscale.', outputSuffix: 'grayscale',
            minFiles: 1, multiple: false, resultPages: 'input',
            memoryAdvice: 'Try on a computer, or split the file first and convert the parts.',
            items: 'files', itemControls: false, outputs: 'one',
            noSmaller: { heading: 'Nothing in this file was turned grey.',
                         advice: 'No new file was made. Its pages already use only grey, or their colours are kinds this tool leaves as they are, such as spot colours, Lab colours or JPEG 2000 pictures.' },
            resultNotes: [
              'Text, shapes and pictures now show in grey, and print in grey on office printers. The text can still be searched. Spot colours, Lab colours, JPEG 2000 pictures and a few other kinds named below the tool stay in colour.',
              'The original colours are still stored in the file, so programs that take pictures out of it, or check a file for colour, may still find colour. The file stays about the same size; this tool does not make it smaller (Compress PDF does).',
              "Links, form fields, notes, bookmarks, attached files and the document's details are kept. Earlier saved versions stored inside the file are not, and a digital signature will no longer be valid. The new file has no password and no restrictions, even if the file you chose had them." ] } }
```

- Placed right after `compress-to-target`, before the next group's first entry. Title 52 characters, description 144. The registry test's lists of tools allowed `noSmaller` gain `grayscale-pdf`.
- **Hub words** ("Make smaller and fix", drafts): description "Make a PDF smaller, small enough for an upload limit, or grey, in your browser. The file stays on your device and is not uploaded." (131 characters); sentence "Tools that make a PDF file smaller, small enough for an upload limit, or grey."; title unchanged; `claimsDevice` stays true.

### 9. Page text (`src/content/tools/grayscale-pdf.md`)

Three steps (choose the file; press "Convert to grayscale and download"; download), then ten questions in plain words, each answer two or three short sentences, 250 to 500 words, marked as a draft:

- Is my file uploaded?
- Can I still search and copy the text? (yes; the text is not turned into a picture)
- Will this make my file smaller? (it stays about the same size; the colours stay stored underneath; Compress PDF or a target size makes it smaller)
- Are the colours really gone? (they show and print grey on screens and office printers; the values stay in the file, so a program that takes pictures out may get them in colour, a program that checks for colour may find it, and a print shop's tools may list three or four extra inks)
- What stays in colour? (the grey is the PDF standard's mix of red, green and blue, and CMYK and colour-managed colours come out close to how they looked; then every kind, in plain words: spot colours; Lab colours; colours with unusual colour profiles; JPEG 2000 pictures; small pictures stored inside a page's drawing instructions; some notes' looks and patterns that carry no settings of their own; parts of a page that could not be read with certainty; colours in notes' text styles or set by scripts; drawing in older XFA forms; colour glyphs in fonts; attached files)
- Do links, forms and bookmarks still work? (yes; field and note colours turn grey too; a signature is no longer valid)
- Why did I get no new file? (nothing was turned grey; the kinds left alone)
- Why did it stop on one page? (a page with very large drawing instructions cannot be converted; the page shows an error naming that page; delete it, or split the file, and convert the rest)
- What happens to a password?
- Is my original changed?

No banned word, no "100%", no exclamation mark, no question restating the title.

### 10. The Privacy page draft

One draft sentence beside Crop PDF's (in the part on what a new file can carry), tied to this design and its tests: "Grayscale PDF shows colours in grey but keeps the original colours in the new file, where a program can still read them." Guarded in `tests/unit/privacy-page.test.ts`.

**For the owner's wording, not written here:** the Privacy draft already says that in a few cases how often the browser asks for a program can depend on the file. For this tool: a job makes one qpdf instance per raw batch (at most 2,000 drawing streams and colour profiles, or 32 MB of their data) besides a fixed few, and a writer only when a new file is made; under the no-cache exception each instance is one WebAssembly request. The pull request lists these facts under the uniform-requests owner question; the owner decides whether the existing sentence is enough.

## Effect on page weight and on when WebAssembly is fetched

- **Before a pick:** the generic widget island with this tool's words; the registry entry adds under 1 KB. Under 100 KB (`npm run weigh`).
- **At a pick:** the read set (qpdf, the spare qpdf making the WebAssembly request at once) and the draw set (PDF.js and its data) for the thumbnail, as for every PDF tool. WebAssembly is fetched at the pick, never at page load.
- **At the job:** a fresh worker loads qpdf, `fflate`, the engine and the shared chunks it imports as built (`content`, `zlib` and the page-tool chunks); not `shrink` or `picture`. `check:worker` keeps the engine in its own file; `page-weight.mjs` names any new chunk.

## Threats considered

- **A hostile PDF:** qpdf reads only capped JSON (`maxPagesJson`, `maxDictionaryJson`) and raw data with no decoding; our decoding is capped per stream and per job; the reader is two bounded passes with no recursion, no token list and a nesting limit, and an edited copy whose length is known and counted before it is allocated; the walks are iterative with visited sets and depth limits; the update is counted against `sizeLimit` as it is built and the write is capped by `cappedWrite`; the result passes `qpdf --check`. No picture is decoded.
- **qpdf's whole-page read in `--check`:** a drawing stream or a page's content over 64 MiB decoded stops the job with `page-too-large` before the write, so `--check` never reads a page larger than measured safe (128 MB of qpdf heap). Streams with a filter this tool does not decode keep the exposure every writing tool has; named as a shared follow-up.
- **Readers that read drawing instructions differently** (glued tokens, control bytes, inline picture ends, CR LF after `ID`, streams split mid-token, comments across streams): each is doubt, and a stream with doubt is left exactly as it was, so the tool never creates a disagreement that was not already in the file.
- **A decode bomb:** one stream (or one page) past 64 MiB stops the job with `page-too-large`; many streams under it stop at the content budget with `output-limit`.
- **An edit bomb:** a stream of `0 0 0 rg` repeated grows about 2.8 times; its edited length is worked out before allocation, counted against the content budget, held to 3 × 64 MiB, and its deflated copy counted against `sizeLimit` when made.
- **Shared objects named many times:** one stand-in per kind; one new object per distinct indexed or pattern space; each stream decoded and edited once; each changed dictionary written once.
- **An oversized file:** no fixed limit; the 100 MB notice; memory as decision 7; Cancel ends the worker.
- **A hostile file name:** the engine never sees it; the page builds `-grayscale` names as every tool does.
- **Text or values leaking:** no page text, name, link address, field value or password goes into an error, a progress report, a message or the console; the no-upload tests watch for marked strings.

No server is involved, so SSRF and macros do not apply.

## Tests

Expected greys are computed in the test from the known colours by the formula of decision 2, never from the engine's exports. `globalThis.fetch` is replaced by a function that throws and records, asserted never called.

- **`tests/unit/grayscale-pdf.test.ts`** (Node, the browser's qpdf, PDF.js with `@napi-rs/canvas`):
  - `run` on every file in `tests/fixtures/`, each outcome recorded (converted; nothing turned grey; damaged; not a PDF; password needed);
  - for every result: `qpdf --check`; no password or restrictions; same page count; **PDF.js text content of every page identical** (strings and positions); **PDF.js's operator list of every page the same as before once every colour-setting operation is removed** (a `/DeviceRGB cs` gives no operation in PDF.js, while its edit gives one), every other operator and argument equal (a check that does not rely on `content.ts`'s own reader), and the colour values checked separately by the pixel tests below; and every decoded drawing stream equal to the original token by token outside the edits of decision 4; **no edited stream holds `sc` or `SC`**;
  - **looks grey (RGB, from the original's pixels):** files made in the test (`grayscale-helpers.ts`) with RGB text and shapes by `rg`/`RG`, by `/DeviceRGB cs` and `sc`; a form drawn twice with no `cs` of its own after the caller set `1 0 0 rg` and `/CS0 cs`; a coloured and an uncoloured tiling pattern (`[/Pattern /DeviceRGB]`); a coloured Type 3 glyph; an axial and a mesh shading; an RGB JPG, an RGB lossless picture, a 16-bit picture, an indexed picture, a picture with a colour-key mask and one with a soft mask carrying `/Matte`; a highlight with `/C` and an appearance; a widget with `/MK` colours and red `/DA` text; drawn by PDF.js before and after: every pixel of the result neutral (`|R − G|`, `|G − B|` at most 2) and within 2 of `0.3 R + 0.59 G + 0.11 B` of the original's pixel on average, at most 6 apart at any pixel;
  - **CalRGB and ICC RGB (from the components):** flat fills and pictures drawn neutral, flat fills at the grey worked out from their raw components within 2 (not from the original's pixels, which PDF.js draws through the white point, gamma and matrix);
  - **CMYK:** flat `k` and `K` fills and a CMYK named space at the grey of decision 2 within 2; the CMYK picture `pictures/cmyk.jpg`, and a CMYK picture with `/Decode [1 0 1 0 1 0 1 0]`: drawn neutral, and within about 15 on average of the original's PDF.js drawing through the luminosity formula, so an inverted picture fails;
  - **the starting black:** at token level, every `/GreyRGB cs` written for a device operand, and every `/Name cs` of an eligible name, is followed by `0 0 0 scn`; a name whose callers disagree is not eligible, left in every dictionary, and given no starting colour; **a stream left because of doubt that does `/CS0 cs` and paints with no colour set, where `/CS0` is ICC RGB: `/CS0` unchanged in every dictionary that holds it** (checked at the dictionary level), and the edited streams that also use `/CS0` given a harmless `0 0 0 scn` after it, with their drawing by PDF.js unchanged from before; a file whose only edits would be such starting blacks gives no file; the same for a form with `/F` and an appearance stream with no resources; a CMYK, indexed and pattern entry used by such a stream still repointed;
  - **a compressed ICC profile:** `pictures/p3.icc`, Flate-compressed (larger than 128 bytes), used as ICC RGB, turned grey; the same profile with no filter; a profile of fewer than 20 bytes left;
  - **name resolution:** a form with no own `/Resources` holding `1 0 0 rg`, drawn from two pages; a Type 3 font with no `/Resources`; a tiling pattern with its own resources; an appearance stream with no resources (left); a page with no resources (given one); inherited resources on a `/Pages` node (given the names once); a file already using `/GreyRGB` in a `/ColorSpace` dictionary (gets `/GreyRGB1`);
  - **left as they are, byte for byte:** Separation, DeviceN, Lab, an ICC space with another range, a `/Range` of the wrong length, an ICC `/N 3` whose profile says `Lab `, an indexed space with an indexed base, JPEG 2000 (`images.pdf`), an inline picture with a clear end (stepped over; the operators around it edited); a page and a form `/Group /CS /DeviceRGB`; a soft mask's `/BC`; `/DefaultRGB` and `/DefaultCMYK` keys; `/OutputIntents`; a stream with `/F`; `/Device#52GB` treated as `/DeviceRGB`; each drawn as before;
  - **doubt, each leaving the stream byte for byte:** glued `0.5 0.5 0.5rg`, `ETQ`, `1.2.3`, a control byte, a byte over 0x7F outside a string, `{`, an unbalanced string, array or dictionary, an operator inside `[ ]` and inside `<< >>`, `ID` and `EI` outside `BI`, `BX` with no `EX` and `EX` with no `BX`, a hex string with a bad byte, a bad `#` in a name, `rg` with two or four operands, `cs` with a number; inline pictures with `xEI ` inside their data, with `EI` before a NUL, with a stray `~` in ASCII85 data, with CR LF after `ID`, with a Flate or DCT filter, with a named colour space, with a wrong `/L`, and with `W`, `H` and `BPC` whose product would overflow; contents split mid-token, inside a string, inside a comment, with operands waiting at a stream's end; a form used only as a soft mask's group (left, its own resources unchanged), and one used both ways (edited);
  - **decoding:** after `plainCopy`, each filter case the `add-content-reader` measurement lists, with expectations from that measurement (no test that passes because `plainCopy` already removed a filter); one stream decoding past 64 MiB stopping the job with `PageTooLarge` carrying that page's number and its words, and a page of two streams of 40 MiB each doing the same; streams of 60 MiB each, each under the per-stream cap, their count worked out in the test from the plain copy's real length so the decoded total passes that file's content budget (twelve such streams compress to about 730 KB, so a fixed count would not), stopping the job with `OutputLimit` within the time recorded;
  - `/C`, `/IC`, `/MK`, `/DA` and bookmark colours: 3 and 4 numbers made neutral, 1 and 0 unchanged, neutral unchanged, values outside [0, 1] clamped, numbers written by the one rule; an inherited `/DA` on a radio group parent edited; a `/DA` with doubt left; `/DS` and `/RC` unchanged; `/Thumb` removed only when a file is made, and a colour `/Thumb` picture alone (on a page of `grey-only.pdf`) giving no file;
  - `rich.pdf`, `form.pdf`, `tagged.pdf` kept (links, bookmarks, attachment, fields and values, tags pointing at their text); `multilingual.pdf` with every script's text (its stream check token by token, `multilingual.test.ts`); `grey-only.pdf` giving `[]`;
  - progress order and the bar never going back; the update cap through a small limit; no error holding page text, a field value or the password.
- **Engine loads:** `grayscale-pdf` in the `engine-loads` shards against every fixture, asking for `qpdf` when reading and `qpdf` and `fflate` in the job.
- **`tests/e2e/grayscale-pdf.spec.ts`** (importing `test` from `tests/e2e/fixtures.ts`), at 360px and 1280px, with coloured files made in the test into a temporary folder: the page; the row and the main button; "Getting ready"; two files dropped; not a PDF; damaged; the password flow; a job on a coloured file with "Reading the file", "Page N of M" and the bar never going back, the three result notes, and the download `<name>-grayscale.pdf` checked with qpdf and PDF.js (text kept, pixels neutral); `grey-only.pdf` with "Nothing in this file was turned grey.", focus on the heading, no Download, "Start again"; Cancel back to the file with the password not asked again; failures from a stand-in engine (memory, `output-limit`, engine not fetched, and `page-too-large` for page 14 with "Page 14 has too much drawing on it to convert here. Delete that page, or split the file, and convert the rest.") under "The file was not converted." with "Go back to your file", at 360px and 1280px; the 100 MB and 20,000-page notices; keyboard only.
- **No-upload tests** in the same spec: a protected coloured file made in the test named `qz7report.pdf`, with a link to `https://example.invalid/SECRET-uri`, a named destination `SECRET-dest`, a bookmark `SECRET-bookmark`, a field filled with `SECRET-field` and red text `SECRET-text`; secrets: the name, its stem, the password and its fragments, the text and every `SECRET-` string, plain and URL-encoded (`withEncoded`); and `rich.pdf`, `tagged.pdf`, `form.pdf` with their `SECRET-` strings; nothing in requests, headers, title, storage, address or console; the allowlist exact, read from the build, with no PDF.js in the job, and no pdf-lib, `stamp`, `shrink`, `picture` or other engine.
- **Uniform requests:** `/grayscale-pdf` in `uniform-requests.spec.ts` with `pdfPicks`, the full `pdfJobs`, `failingJob`, `images.pdf` (`expect: 'done'`), `grey-only.pdf` (`expect: 'no-file'`), `form.pdf` and `multilingual.pdf` with the outcomes recorded in task 3.3.
- **100 ms:** "Grayscale PDF: listing and converting the 500-page file blocks the page for no more than 100 ms at a time" in `performance.spec.ts`.

## Risks / Trade-offs

- **Colour values stay in the file,** and the file stays about the same size. → The owner's answer of 24 Nov 2026; said on the page, in the result notes and on the Privacy draft.
- **Print shops:** a workflow that keeps `DeviceN` may make extra plates named `GreyR`, `GreyG`, `GreyB` (or `GreyC` … `GreyK`) rather than grey. → No claim beyond screens and office printers; a sentence below the tool; a preflight hand check.
- **Overprint:** `/OPM 1` (nonzero overprint mode) applies only to `DeviceCMYK`, so once CMYK becomes `DeviceN`, overprint preview or print-shop output may differ where a file relies on it. → Named; hand check with Output Preview.
- **A reader without `DeviceN` or Type 4 functions** would draw the stand-in wrongly. Both are PDF 1.3 and supported by PDF.js, pdfium, Acrobat, Apple's PDFKit, Poppler and MuPDF. → Hand checks in every reader named in "Definition of done", and printing.
- **The starting colour:** a reader that follows the standard starts `GreyRGB` white; every place the edits select it is followed by a black start, and a direct RGB entry is repointed only when every stream that can select it was edited, so no left stream can select a white-starting stand-in by name. A name left this way stays in colour. → Token and dictionary tests; Acrobat and Chrome hand check of text drawn after `cs` with no colour set.
- **`sc` left under `DeviceN`:** since a direct RGB entry is repointed only when every stream that can select it was edited (and so holds no `sc`), only a left stream that inherits a CMYK, indexed-over-RGB or pattern-over-RGB space selected elsewhere can still hold `sc` under the stand-in, which the standard does not define for `DeviceN`. → Named; hand check in Acrobat and Chrome on such a form.
- **A reader slow on large pictures through a Type 4 function** (pdfium evaluates it per pixel). → Hand checks time a 300-pixel-to-the-inch A4 scan in Chrome; the fallback is a Type 0 sampled function for RGB, a change before the pull request if needed.
- **Parts left in colour:** spot colours, Lab, JPEG 2000, inline pictures, doubtful streams, filters the reader does not decode. → Named on the page; owner question 3.
- **CMYK, CalRGB and ICC greys** follow raw components, not each reader's colour management, so their grey may be a little lighter or darker than the colour looked. → Said in the questions; owner question 2.
- **Soft masks in CMYK groups** may change slightly where a picture used in the mask is repointed. → Named; RGB groups unchanged.
- **qpdf's `--check` reads a page's content whole** for every writing tool. → Bounded here by the 64 MiB stop; a shared follow-up for the other tools.
- **The 64 MiB stop refuses a kind of file:** a genuine page whose drawing unpacks past 64 MiB (a very dense map or plan) cannot be converted. → Its own words with advice that fits; said below the tool; owner question 8; the `--vector` and dense-sample measurement in task 3.3.
- **`0 0 0 rg` counts as a change.** → Owner question 5.
- **No per-file report** of what was left. → Fixed notes and the text below the tool; owner question 7.
- **Signatures and earlier saved versions** are lost, as for every page tool. → Said on the page.

## Migration Plan

None. A new page, registry entry and test file; no existing page, address or stored data changes. Rolling back is removing the entry, the files and `make.mjs` section 17 (with its README rows). The content reader and `zlib.ts` are their own pull request and are not rolled back with this one.

## Open Questions

For the owner: questions 2 to 8, going ahead on their defaults (proposal, "Open decisions and owner questions touched"), listed in the pull request and added to "Questions waiting for the owner". Question 1 was answered on 24 Nov 2026 ("Yes, looks and prints grey").
