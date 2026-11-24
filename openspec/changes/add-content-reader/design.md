# Design

## Context

See `proposal.md` for why the reader comes first, and `openspec/changes/add-grayscale-pdf/design.md`, decision 4, for the rules it implements. That plan passed stage 1; its task 0.2 copies back into it every rule this change alters, so each departure is listed in one place (decision 12).

What exists and is reused:

- **`plainCopy`** (`src/engines/plain.ts`): the input decrypted once with `--object-streams=disable`, written at qpdf's default decode level (`generalized`) with `--compress-streams=y`. Every page tool reads from it, so what it does to filters decides what reaches the reader (decision 2).
- **Raw stream data in batches** (`rawBatches`, `readRawStreams` in `qpdf-json.ts`, `--decode-level=none`): how an engine gets a stream's bytes and dictionary without qpdf decoding them. Unchanged here.
- **fflate's streaming inflater and deflater**, given to engines through `tools` (`need(tools, 'fflate')`), never imported as a value by an engine file.
- **The helpers to move:** `zlibDeflate`, `DeflateClass`, `Fflate` and the private `adler32` and `isZlib` in `shrink.ts`; `inflateLimited` and `InflateClass` in `picture.ts`. Importers: `shrink.ts`, `picture.ts`, the engines `compress-pdf`, `compress-to-target`, `images-to-pdf` and `sign-pdf` (types or values), and the tests `compress-pdf.test.ts`, `picture.test.ts`, `target-helpers.ts`. Four engine files keep private copies of `need` (`thumbnail.ts`, `picture-thumbnail.ts`, `sign-pdf.ts`, `images-to-pdf.ts`); they stay as they are (Left for later).
- **`scripts/check-worker.mjs`**: `lateSources` takes each file's quoted sentences of 16 characters or more starting with a capital (no `$`) and fails if the worker file holds one; a file with none fails the check.
- **Lint**: every file under `src/engines/` is closed to components, hooks, pages and layouts (value imports and `import()`), and engine files may not touch the page or the network.

Measurements in this change were made with scripts in the session's scratchpad (not committed), using the repo's qpdf (`@neslinesli93/qpdf-wasm` 0.3.1, qpdf 12.2.0) and PDF.js (`pdfjs-dist` 6.5.438, legacy build in Node), and one build in a temporary git worktree. The stage 1 reviewers drew further PDF.js cases (decision 5) and measured qpdf's JSON names (decision 4). The unit tests of task 3 repeat each of them, so the numbers here are checked, not trusted.

## Goals / Non-Goals

**Goals:**

- One pure module that decodes, reads and edits drawing instructions by grayscale decision 4, with any doubt leaving a stream byte for byte as it was.
- Bounded work: each decode step capped at 64 MiB of output, checked as each piece, run, group or code is made; every decoded byte counted against the caller's budget; two passes with constant state; an edited copy whose length is known and counted before it is allocated.
- The reader knows nothing of any tool's purpose; a caller supplies an editor.
- The zlib helpers in one shared file, with byte-identical output from every tool that uses them and no change in any tool's fetched files.

**Non-Goals:**

- Any tool, page, failure kind, message field or widget change (they ride with `add-grayscale-pdf`).
- Following the drawing state (current colour space, saves, forms); reading a picture's data; decoding filters that do not reach the reader.
- Repairing anything: a stream that cannot be read with certainty is left, never fixed. The plain copy's own `/DP` bug (Left for later) is not fixed here.

## Decisions

### 1. One module, its interface

`src/engines/content.ts`, pure, with no page, no network and no library of its own. It imports only `isZlib`, `pushPieces` and the `InflateClass` type from `zlib.ts`, and `import type { Dict }` from `qpdf-json.ts`. The caller passes fflate's `Inflate`, a resolver and a budget, so the module throws no other module's error and is tested in Node with no qpdf.

```ts
export const maxContentBytes = 64 * 1024 * 1024;     // a decode step's output, and the grayscale per-page cap
export const maxEditedBytes = 3 * maxContentBytes;   // an edited stream
export const maxSteps = 4;                           // filters in a chain
export const maxNesting = 32;                        // arrays and dictionaries together

/** Counts bytes against the caller's budget; throws the caller's own error once it is passed. */
export type Spend = (bytes: number) => void;
/** Follows one reference to a direct value, or gives undefined. */
export type Resolve = (value: unknown) => unknown;

export type DecodedContent = { kind: 'decoded'; data: Uint8Array } | { kind: 'too-large' } | { kind: 'not-decoded' };
export function decodeContent(raw: Uint8Array, dict: Dict, resolve: Resolve, Inflate: InflateClass, spend: Spend): DecodedContent;

export type OperandKind = 'number' | 'name' | 'string' | 'hex' | 'array' | 'dictionary' | 'boolean' | 'null';
export type Operand = { kind: OperandKind; start: number; end: number };
/**
 * The operands since the previous operator: how many, where the first starts, the last four (last at the end),
 * and a fixed-size summary of the whole run: how many were numbers, and a bitmask of every kind seen.
 */
export type OperandRun = { count: number; start: number; last: readonly Operand[]; numbers: number; kinds: number };
export const kindBit: Record<OperandKind, number>;   // one bit per kind, for `kinds`
/**
 * Text put before the operands (or before the operator when there are none), in place of the operands
 * (from `run.start` to the end of the last operand), in place of the operator, and after it.
 * `counts: false` marks an edit that does not by itself make the stream changed (grayscale's starting black).
 */
export type Edit = { before?: string; operands?: string; operator?: string; after?: string; counts?: false };
export type Editor = {
  operators: ReadonlySet<string>;
  edit(operator: string, run: OperandRun, data: Uint8Array): Edit | null | 'doubt';
};
/** Where a stream sits: read alone (a form, pattern, glyph, appearance stream or a /DA string), or one of a page's /Contents. */
export type Place = 'alone' | 'not-last' | 'last';
/** `edits` counts only edits that count; `allEdits` counts every edit applied. */
export type Read = { kind: 'edited'; data: Uint8Array; edits: number; allEdits: number } | { kind: 'unchanged' } | { kind: 'doubt' };
export function editContent(data: Uint8Array, editor: Editor, place: Place, spend: Spend): Read;

/** A name operand as qpdf's JSON writes it: #xx decoded, then strict UTF-8; undefined when not valid UTF-8. */
export function nameValue(data: Uint8Array, operand: Operand): string | undefined;
export function numberValue(data: Uint8Array, operand: Operand): number;

export class PageTooLarge extends Error { /* decision 8 */ }
```

The per-page sum of decoded bytes, "every stream of a page left", the strictest `Place` for a shared stream (decision 6) and the use of `PageTooLarge` are the caller's (grayscale decision 4 and its step 4), because only the caller knows which streams make a page. The reader gives each stream's verdict, and the rules a caller must apply are written in the spec ("Streams in sequence").

**Alternatives:** the reader throwing `OutputLimit` itself (would import `qpdf.ts` into a pure module and tie it to one budget rule; a callback keeps it general); an edit list returned for the caller to apply (holds memory per edit, which decision 4 forbids); a token iterator (callers would re-implement the doubt rules); keeping every operand of a run (memory grows with a hostile run; the count, the last four and the summary answer every rule grayscale needs, `sc`'s "any count of numbers" included as `numbers === count`).

### 2. What reaches the reader: measured

Each case is a one-page PDF whose content stream has the filter shown, put through exactly `plainCopy`'s qpdf call, and read back with `--json=2 --json-key=qpdf --json-stream-data=none`; qpdf's `--filtered-stream-data` confirmed each decodable result gives the original content. Every case was also run on an AES-256 copy opened with its password; the results were the same.

| Input filter (and `/DecodeParms`) | In the plain copy |
| --- | --- |
| none; `[]`; `null`; an empty stream | `/FlateDecode` |
| `/FlateDecode` | `/FlateDecode`, data as it was |
| `/FlateDecode` with Predictor 12 (Columns 16), 2, 1, 99, Columns 0, BPC 4 or 16, Colors 3 | `/FlateDecode` with the same `/DecodeParms`, data as it was (qpdf does not recompress Flate-only streams) |
| `/Fl` | `/Fl`, as it was |
| `[/FlateDecode]` with Predictor 12 in a one-item array | `/FlateDecode`, decoded and recompressed, no `/DecodeParms` |
| `/FlateDecode` with damaged or cut-off data | `/FlateDecode`, data as it was |
| `/RunLengthDecode`, `/RL` | as they were |
| `/LZWDecode` (EarlyChange 0 or 1, with PNG or TIFF predictor) | `/FlateDecode` |
| `/LZWDecode` with Predictor 99 | `/LZWDecode` with its `/DecodeParms`, as it was |
| `/ASCII85Decode`, `/A85`, `/ASCIIHexDecode`, `/AHx`, `[/A85 /A85]` | `/FlateDecode` |
| `[/ASCII85Decode /FlateDecode]` (also with a predictor on Flate), `[/ASCIIHexDecode /FlateDecode]`, `[/ASCII85Decode /LZWDecode]`, `[/FlateDecode /FlateDecode]` | `/FlateDecode` (the architect's finding, confirmed) |
| `[/ASCII85Decode /RunLengthDecode]`, `[/ASCIIHexDecode /RunLengthDecode]`, `[/RunLengthDecode /FlateDecode]`, `[/FlateDecode /RunLengthDecode]`, `[/LZWDecode /RunLengthDecode]` (also with EarlyChange 0), `[/RunLengthDecode /LZWDecode]` with a PNG predictor, `[/RunLengthDecode /FlateDecode]` with a TIFF predictor, `[/A85 /AHx /RL]`, `[/RL /RL]`, and the abbreviated `[/A85 /RL]`, `[/AHx /RL]`, `[/LZW /RL]`, `[/Fl /RL]` | as they were, every step and parameter kept |
| `[/ASCII85Decode /FooDecode]`, `[/FooDecode /ASCII85Decode]`, `[/ASCII85Decode /DCTDecode]`, `/CCITTFaxDecode` | as they were |
| `/Crypt` (identity) | `/FlateDecode` |
| `/Filter 6 0 R` (a reference to a name or an array) | the reference kept, pointing at the name or array |
| `/FlateDecode` with `/DP` (a predictor) | `/FlateDecode` with `/DP` kept |
| no `/Filter` but `/F /FlateDecode` | `/Filter /FlateDecode` added, `/F /FlateDecode` kept |
| `/FlateDecode` with `/FFilter` | both kept |
| `/FlateDecode` with `/BPC 8` inside `/DecodeParms` | kept |
| a name filter with a one-item `/DecodeParms` array; `[/RunLengthDecode /FlateDecode]` with a dictionary `/DecodeParms` | both kept as they were (shapes that do not match) |
| no filter but `/DP` (a predictor) | `/FlateDecode` with `/DP` kept: PDF.js then applies the predictor to content that never had one (Left for later) |
| `[/ASCII85Decode /FlateDecode]` whose Flate data is damaged | `/FlateDecode` of what qpdf could decode, garbage included, with a warning (exit 3) |
| `/LZWDecode` cut off (no end code) | `/FlateDecode` of the part decoded, with no warning |
| damaged `/LZWDecode`, `/ASCII85Decode` (a byte outside its alphabet, or a leading `<~`) or `/ASCIIHexDecode` | the plain copy fails (exit 2), so the file is "damaged" for every page tool |

So qpdf decodes a whole chain only when it can decode every step at its default level; a chain holding RunLength (which qpdf decodes only at `specialized`), an image filter or an unknown name is kept whole. **ASCII85, ASCIIHex and LZW still reach the reader, but only inside such chains.** No filter, and lone ASCII85, ASCIIHex or LZW with parameters qpdf can use, never reach it. Keys qpdf ignores but PDF.js reads (`/F`, `/DP`) are kept.

**The decoded set, cut to exactly that:**

- a lone Flate (`/FlateDecode` or `/Fl`, as a name or a one-item array), with its `/DecodeParms`;
- a lone RunLength (`/RunLengthDecode` or `/RL`, likewise);
- a chain of two to four steps, each Flate, RunLength, LZW (`/LZWDecode`, `/LZW`), ASCII85 (`/ASCII85Decode`, `/A85`) or ASCIIHex (`/ASCIIHexDecode`, `/AHx`), holding at least one RunLength.

**Dictionary keys that make the decode differ between readers are `not-decoded`.** PDF.js reads `dict.get("F", "Filter")` and `dict.get("DP", "DecodeParms")` for every stream (the short key first), and `/BPC` before `/BitsPerComponent` in its predictor; qpdf reads only the long keys. So a stream dictionary holding `/F`, `/FFilter`, `/FDecodeParms` or `/DP`, or a `/DecodeParms` dictionary holding `/BPC`, is `not-decoded`. **The shapes must match** as PDF.js reads them: a name filter takes a dictionary, `null` or no `/DecodeParms`; an array filter takes an array of its length (items `null` or dictionaries), `null` or none. PDF.js ignores a dictionary with an array filter and an array with a name filter, where qpdf may not, so either mismatch is `not-decoded`.

Everything else is `not-decoded` and left: no filter (never reaches it; a test fails if a later qpdf stops compressing such streams, so the set is looked at again), a lone LZW, ASCII85 or ASCIIHex (reaches it only when qpdf could not use its parameters, so neither should the reader), a chain without RunLength other than a lone Flate (qpdf would have decoded it unless something in it is wrong), a chain of five or more steps, and any other name. The `/Filter` value and the `/DecodeParms` value may be direct or one reference that `resolve` turns into a direct value; names and items inside must be direct. Names are compared as qpdf's JSON gives them, which is their decoded form.

**Why abbreviations are taken in a stream:** qpdf leaves them as written and decodes them itself (its `--filtered-stream-data` gave the original), and PDF.js maps them too, so readers agree on them.

### 3. Decoding in pieces, with caps

Each step reads the previous step's output (the raw bytes for the first) in pieces of at most 64 KiB. **Its output grows as a list of pieces, the first 4 KiB and each later one twice the one before up to 1 MiB, each made only when a byte is written into it, joined once into one buffer of exact length when the step ends (the only piece itself when it is exactly full); the pieces are let go at once.** (Stage 2: a 1 MiB piece made for every step took 246 µs a small stream, 45 µs with this.) The cap is checked before each piece of output is added: per inflate output chunk, per RunLength run, per ASCII85 group (a `z` included), per ASCIIHex pair, per LZW code's string and per predictor row, so at most one such unit past the cap is ever made. At the first byte past `maxContentBytes` the whole decode stops as `too-large`, and nothing is joined. **A step past the cap counts as the stream decoding past the cap, whichever step it is** (an ASCII85 step, whose `z` turns one byte into four, may pass it before the last step does). The bytes each step gives are passed to `spend` as each piece is made, intermediate steps included; `spend` throwing stops the decode with that error.

**Memory:** while a step runs it holds its input (at most 64 MiB, or the raw data), its pieces (at most 64 MiB and one unit) and, at the join, the joined copy, so at most the raw data and 3 × 64 MiB plus one piece; once joined, the input and the pieces are let go. One figure is used for decoding, in the spec and the tests: **`arrayBuffers` growth during a decode stays under the raw data's length plus 3 × 64 MiB plus 2 MiB**, measured on a four-step chain whose middle step reaches the cap (task 3.3).

The steps, each strict; any rule broken is `not-decoded`. Defaults, as the standard gives them: `/Predictor` 1, `/Colors` 1, `/BitsPerComponent` 8, `/Columns` 1, `/EarlyChange` 1.

- **Flate:** an empty stream decodes to nothing (measured at task 3.1: the plain copy leaves `/FlateDecode` with no data on an empty stream, which every reader draws as nothing); otherwise a zlib header (`isZlib`: method 8, window at most 32 KB, check bits, no preset dictionary); raw deflate pushed to fflate's `Inflate` in 1 KiB pieces by `pushPieces` in `zlib.ts` (so no one push can make more than about a megabyte); the data must reach its final block. **fflate never says when the deflate stream has ended** (the `final` its `ondata` passes is the push's own flag) and every push after the end copies all the input still pending, so trailing bytes took time growing with their square (stage 2: 16 MiB 42 s, 32 MiB 564 s, reachable from about 300 raw bytes through `[/Fl /RL /Fl]`). **Once 66.5 KiB of input in a row makes no output, the data is taken to end there**: no block holds output back longer than a stored block's 65,535 bytes and its header (measured: at most 64,512 bytes with no output at level 0), an empty final push follows, which fflate accepts only for a stream that reached its final block, and nothing more is pushed; a stream padded with that many empty stored blocks is `not-decoded` (fail-safe). Trailing bytes after the end are ignored, and the Adler-32 checksum is not compared, as PDF.js does; zlib-based readers give all the data before they report a bad checksum, so readers agree on what is drawn.
- **Predictors** (on Flate or LZW): 1, none; 2 (TIFF) only at 8 bits; 10 to 15 (PNG) at 1, 2, 4, 8 or 16 bits. `/Colors` 1 to 32, `/Columns` 1 to 2²⁴, whole numbers, and `Colors × BPC × Columns` at most 2³¹ − 1, so PDF.js's 32-bit `>>` works it out the same. Row bytes are `ceil(Colors × BPC × Columns / 8)`; **when row bytes plus one is more than the step's input length, or row bytes pass 1 MiB (stage 2), the step is refused before anything is allocated.** PNG rows each start with a tag 0 to 4 and the data must be a whole number of rows; TIFF data a whole number of rows. Rows are undone one at a time, holding two rows. A predictor's output is never larger than its input.
- **Parameters a step does not take:** a `/DecodeParms` dictionary on RunLength, ASCII85 or ASCIIHex must be empty, and one on Flate or LZW may hold only `/Predictor`, `/Colors`, `/BitsPerComponent` and `/Columns` (and `/EarlyChange` on LZW), each a direct whole number; anything else is `not-decoded` (added at task 3.1, the strict reading of "untaken parameters").
- **RunLength:** 0 to 127 copies the next n + 1 bytes, 129 to 255 repeats the next byte 257 − n times, 128 ends; the data must reach the end mark (bytes after it are ignored, as readers stop there).
- **LZW:** input over 256 MiB is refused, as bit positions are read with 32-bit shifts (stage 2); `/EarlyChange` 0 or 1; codes of 9 to 12 bits, most significant bit first, the width growing one entry earlier with EarlyChange 1; 256 clears, 257 ends; after a clear (and at the start) the first code must be below 256; a code equal to the next free entry (KwKwK) is accepted only when there is a previous code; a code past it is `not-decoded`; once the table holds 4,096 entries only a clear or the end code is accepted; the data must reach the end code. The table holds at most 4,096 entries (prefix code, last byte, length), so its memory is fixed; each code's string is checked against the cap before it is written.
- **ASCII85:** space, tab, CR and LF skipped, as PDF.js skips only those; **a NUL or FF in the data is `not-decoded`** (PDF.js reads them as data, qpdf as whitespace); `!` to `u` in groups of five; `z` only at the start of a group; a group past 2³² − 1, a final group of one character, any other byte (`<` included) or no `~>` at the end is `not-decoded`; a final group of two to four characters gives one to three bytes.
- **ASCIIHex:** hex digits and whitespace, ending at `>`; an odd last digit is followed by 0; any other byte, or no `>`, is `not-decoded`.

### 4. The tokenizer and the two passes

As grayscale decision 4, except where decision 12 says. Over ISO 32000 7.2 and 7.8.2:

- whitespace: tab, LF, FF, CR, space; **NUL, any other control byte and any byte from 0x80 up outside a string or an inline picture's data are doubt**;
- comments, `%` to the next CR or LF;
- literal strings with a nesting count of balanced parentheses and every backslash escape (a backslash takes the next byte, a line end included); a `)` with no open string is doubt; hex strings of hex digits and whitespace only; a lone `>` is doubt;
- `<<`, `>>`, `[`, `]`, at most 32 deep together, each closing the kind it opened (a 32-bit mask holds the kinds, read with `>>>` so the 32nd level does not turn negative), balanced at the end; an operator inside either is doubt; **inside `<< >>`, a name key and then exactly one value, in turn**, held by one more 32-bit mask (a bit per open dictionary: a value wanted, or a key), so a key that is not a name and a key with no value (`<</A>>`, `<</A 1 /B>>`) are doubt (stage 2: PDF.js takes `>>` as the missing value and swallows what follows; drawn, `/P <</A>> BDC 1 0 0 rg 0 0 9 9 re f EMC` gave PDF.js an empty operator list); `{` and `}` are doubt;
- names: `/` and bytes 0x21 to 0x7E other than delimiters; **a name holding any byte outside 0x21 to 0x7E is doubt** (PDF.js ends a name at NUL: `/A\0rg`; a byte from 0x80 up is doubt too, consistently); `#` with two hex digits; any other `#`, including one at the end of the name, is doubt;
- numbers: exactly `[+-]?(\d+(\.\d*)?|\.\d+)`, **at most 32 bytes** (stage 2: a longer one is doubt, so no number is ever long to copy); anything else starting with a digit, sign or dot (`.`, `+`, `-.`, `1e5`, `--1`) is doubt;
- every other run of regular bytes is one of the 73 operators of ISO 32000-2 Table A.1 (the same set as PDF.js 6.5.438's operator table) or `true`, `false`, `null`; **any other run is doubt, between `BX` and `EX` too** (PDF.js splits an unknown run at the longest known command: drawn, `BX 1 0 0 rgx EX` sets a fill colour and `BX Qf EX` runs `Q` then `f`); glued tokens (`0rg`, `ETQ`, `1.2.3`) are doubt; `BX`/`EX` are counted, and unbalanced at the end or an `EX` with no `BX` is doubt; `ID` or `EI` outside `BI` is doubt.

**`nameValue`** gives `undefined` for a name over 127 bytes once `#xx` is decoded, checked on its length before anything is copied (stage 2: one 60 MiB name in an inline picture's dictionary had grown memory by 1.8 GB; now 0.1 MiB), and otherwise matches qpdf's JSON keys, as the architect measured them: qpdf decodes `#xx`, then reads the bytes as UTF-8, and writes invalid UTF-8 in its `n:` form (`/A#20B` gives `/A B`, `/C#e9` gives `n:/C#e9`, `/D#c3#a9` gives `/Dé`). So `nameValue` decodes `#xx`, then decodes strictly as UTF-8 (`TextDecoder` with `fatal: true`), and gives `undefined` for invalid UTF-8; an editor treats `undefined` as doubt. A test compares `nameValue` with qpdf's own keys for these names.

**State kept:** the position, the nesting count and mask, the string nesting count, the `BX` count, the inline picture's few values while inside one (decision 5), and the operand run: its count, its start, a ring of its last four operands (kind, start, end), the count of number operands and the bitmask of kinds seen. An array or dictionary is one operand spanning its brackets. Nothing else; no token or edit is stored, so memory does not grow with the stream.

**Pass 1** reads the whole stream. At each operator the editor names, it calls `editor.edit(operator, run, data)`; `'doubt'` ends the read as doubt; **the edited length passing `maxEditedBytes` ends it as doubt at once** (stage 2), so the editor is asked nothing more; an edit adds its pieces' lengths and takes away the lengths of what `operands` and `operator` replace. Pass 1 also keeps the number of edits, the number that count, and a running 32-bit FNV-1a hash of each edit's position and pieces. At the end it checks the end-of-stream rules (decision 6). If doubt, the stream is left. If no edit was asked, the result is `unchanged` and nothing is allocated. If the edited length passes `maxEditedBytes`, doubt. Otherwise `spend(edited length)` is called, a buffer of exactly that length is allocated, and **pass 2** reads the stream again, asking the editor the same questions and copying every byte outside an edit; before each `set` it checks that the piece fits in what is left of the buffer. At the end the edit count, the written length and the hash must equal pass 1's. A piece that does not fit, or a count, length or hash that differs, is a programming error: a thrown error with a fixed sentence ("The edited drawing instructions did not come out as worked out."), never a `RangeError` and never a written stream. The editor must be a pure function of its arguments.

**Each piece** is checked in both passes: `operands` and `operator` may be empty (removal); every other piece, and a non-empty `operands` or `operator`, is printable ASCII that starts and ends with a space and, run through the strict tokenizer, is whole tokens only (numbers, names, operators, `true`, `false`, `null`) with no `%`, `(`, `<`, `[`, `{` and no `BI`, `ID` or `EI`. A piece that breaks this is a programming error with its own fixed sentence ("An edit to drawing instructions must be whole tokens between spaces."). `operands` is allowed only when the run has at least one operand.

### 5. Inline pictures

Stepped over only when every reader finds the same end; otherwise doubt. Grayscale decision 4's rules are all kept, and the PDF.js-specific ones are corrected from what PDF.js 6.5.438 does (`Parser.makeInlineImage`, `findDefaultInlineStreamEnd`, `findASCII85DecodeInlineStreamEnd`, `findASCIIHexDecodeInlineStreamEnd`, `inlineStreamSkipEI`), read in its source and checked by drawing (rows marked † were drawn by the stage 1 reviewers):

| Content after a clear inline picture with no filter (`BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI` …, unless shown) | PDF.js's operators after the picture |
| --- | --- |
| `EI Q 1 0 0 rg 0 0 9 9 re f` | restore, fill colour, path: the right end |
| `EI` then tab, form feed or NUL, then `Q 1 0 0 rg …` | nothing: everything after was taken as picture data |
| `EI/F1 12 Tf 1 0 0 rg …` | nothing: likewise |
| `EI 1 Q 1 0 0 rg …` (a wrong operand count first) | the right end (PDF.js reads on to the next operator) |
| `xEI 1 EI Q …` (a false end in the data) | nothing after: the false end was taken |
| † `/W 1`: `ID EEI Q …` (data `E`, then the real `EI`) | nothing after: the scan does not restart on `E` |
| † `ID aEEI Q …` (data `aE`) | nothing after |
| † `ID EIEI Q …` (data `EI`) | nothing after |
| `/F /A85` data `@:F~>` then `EI/F1 12 Tf …` | the `/` was skipped, the rest misread |

What PDF.js does: with no filter (or any filter but DCT, ASCII85 and ASCIIHex) it runs a three-state scan from the first data byte (state 0: `E` goes to 1; state 1: `I` goes to 2, anything else, `E` included, back to 0; state 2: a space, LF or CR makes a candidate, anything else goes back to 0). It takes the first candidate **whose next 15 bytes are each LF, CR, 0x20 to 0x7F or a NUL not followed by NUL, and whose next 75 bytes, lexed, reach a known operator with its expected operand count** (its table: exact counts, or at most 4 for `sc`/`SC` and 33 for `scn`/`SCN`); failing both checks it reads on, and at the end of the content falls back to the last candidate. With ASCII85 or ASCIIHex it takes data through the first `~` or `>`, then the first `E I` after it, then skips one more byte, whatever it is. It decides by the first filter of an array.

**The rule** (each point doubt if broken):

- the dictionary between `BI` and `ID` is pairs of a name key and a value, at most 32 keys, with no comment; values nested in its arrays and dictionaries follow the same rule (no string, hex string or `null` anywhere in it); a key that is not a name, a key with no value, a key given twice, or in both its short and long forms (`/W` and `/Width`), is doubt; values are names, numbers, booleans, arrays and dictionaries only;
- the values read are `W`, `H`, `BPC`, `CS`, `IM`, `F` and `L` (and their long names); `W`, `H` and `BPC` are written as whole numbers (`2.0` is doubt); `W` and `H` from 1; `BPC` 1, 2, 4, 8 or 16; **`CS` and `BPC` are required unless `/IM true`**; `/IM true` means one bit and one component, its `BPC`, if given, must be 1, and a `CS` with it is doubt;
- `n` from `/G` or `/DeviceGray` (1), `/RGB` or `/DeviceRGB` (3), `/CMYK` or `/DeviceCMYK` (4); a named resource colour space is doubt; an indexed space (`[/I …]`) needs a string for its palette and so is doubt by the dictionary rule;
- `F` absent or an empty array (both mean no filter), or one name (or a one-name array) of `/AHx`, `/ASCIIHexDecode`, `/A85`, `/ASCII85Decode`; any other filter (`/DCT` and `/Fl` included) or a longer array is doubt;
- `ID` followed by exactly one whitespace byte, not a CR followed by LF;
- the data's end: with no filter `H × ceil(W × BPC × n / 8)` bytes, each product checked against the bytes left and against the largest safe whole number before the next is taken, so nothing overflows; with ASCIIHex, hex digits and whitespace only, through the first `>`; with ASCII85, through the first `~`, which must be followed by `>`; a `/L` or `/Length` must equal the data's length (with a filter, counted through its end mark);
- after the data, optional whitespace (space, tab, LF, FF, CR), then `EI`, then **a space, LF or CR, or the end of the stream** (PDF.js takes nothing else, and skips one byte after an ASCII85 or ASCIIHex `EI`);
- **no `EI` followed by whitespace (NUL included), a delimiter or the end anywhere earlier in the data or the whitespace before the real `EI`**, and for ASCII85 no other `~` (kept from decision 4);
- **with no filter, PDF.js's own three-state scan, run from the first data byte, must reach the real `EI` as its first candidate** (added after the reviewers' drawings: data ending in `E` or `EI` makes it miss the real end);
- **with no filter, PDF.js's look-ahead must accept the real `EI`**: counting from the byte after the space, LF or CR that follows it, the next 15 bytes (as many as there are) are each LF, CR or 0x20 to 0x7E; and either the first operator after it ends within 75 bytes, with only numbers and names before it (no comment, string, array, dictionary, `true`, `false` or `null`) and exactly PDF.js's operand count (at most its count for `sc`, `SC`, `scn`, `SCN`), or only space, LF and CR follow to the end of a stream that is `alone` or `last`. The operand counts are written once in `content.ts` beside the operator list, copied from PDF.js 6.5.438's table and checked against PDF.js by drawing (task 3.4);
- **in a page's content stream that is not the last, that look-ahead must lie inside the stream**: fewer than 15 bytes after the `EI`, or no operator before the stream ends, is doubt, because PDF.js reads the page's streams joined.

A wrong operand count first, which PDF.js reads past, is doubt here: stricter than needed, and simpler.

### 6. Streams in sequence

`editContent` takes a `Place`. For every place, the stream must end with no string, array, dictionary or inline picture open and **no operands waiting for an operator**. For `not-last` (a page's `/Contents` stream other than the last) it must also end at a token boundary (its last byte whitespace, a delimiter, or the end of a string, array or dictionary), not inside a comment, and satisfy decision 5's last point. `last` and `alone` may end with an operator or a comment with no line end. A caller leaves every content stream of a page when any of them is doubt, and a shared stream for every page that uses it; the spec says so and the test-only caller does so. `/DA` strings (grayscale) are read as `alone`.

**A stream reached from several places is read once, with its strictest place:** `not-last` before `last` before `alone`. PDF.js joins a page's streams with an LF, so for PDF.js only the look-ahead rule matters across a boundary; other readers may join them with nothing, and the `not-last` boundary and comment rules protect them. Reading once with the strictest place keeps "read once by object id" true and means a stream that passes is safe in every place it is used.

### 7. The editor

The editor names its operators; others are stepped over without a call. `BI`, `ID` and `EI` are never offered to it: an inline picture is stepped over as one unit and copied as it is, and operands waiting before `BI` are doubt (added at task 3.2). For each, it sees the operator, the run (count, start, last four operands, the count of numbers and the bitmask of kinds) and the stream's bytes, and can read a name or number with `nameValue` or `numberValue`. It gives an `Edit` of up to four pieces, `null` for no change, or `'doubt'`. With no operands, `before` goes immediately before the operator. **`operands` replaces the bytes from `run.start` to the end of the last operand**, so `/DeviceRGB cs` can become `/GreyRGB cs 0 0 0 scn` (`operands: ' /GreyRGB '`, `after: ' 0 0 0 scn '`). **Removal** is `operands: ''` with `operator: ''` (or `operator: ''` alone for an operator with no operands), which removes the whole command and leaves the whitespace around it; an empty `operands` or `operator` alone is refused with the pieces' sentence (stage 2); the removal is still counted as an edit. **`counts: false`** marks an edit that does not by itself make the stream changed; `Read.edits` counts only the others, and `allEdits` all of them, so grayscale decision 6 can tell a stream whose only edits are inserted starting blacks (`edits === 0`, `allEdits > 0`) and not write it. Operand checks (such as "exactly three numbers before `rg`", or "only numbers before `sc`" as `run.numbers === run.count`) are the editor's: the reader enforces only the tokenizer's rules. This covers every edit grayscale decision 4 lists and a later stray-`Q` check or operator removal, and holds no rule about colour.

The **test-only editor** (in `tests/unit/content-helpers.ts`) replaces `w` after one number with ` w 2 w `, puts ` h ` after `re`, puts ` q ` before the operands of `cm`, replaces the operands of `cs` with ` /CS9 ` and puts ` 0 scn ` after it marked `counts: false`, removes `d0` commands with empty `operands` and `operator`, and answers doubt for an operator named in a test, so every edit position, removal, `counts` and the doubt path run without any grayscale rule.

### 8. `PageTooLarge`

```ts
export class PageTooLarge extends Error {
  override name = 'PageTooLarge';
  readonly page: number;
  constructor(page: number) {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('A page number must be a whole number from 1 up.');
    super('A page has too much drawing on it to work on here.');
    this.page = page;
  }
}
```

Known to the worker by its name, as `OutputLimit` is; the message is fixed, neutral (any tool may throw it) and never holds page text. `check-worker.mjs` looks for this same sentence. Mapping it to a failure kind, the `page` field on the worker's message, the widget state and the words are `add-grayscale-pdf`'s (its task 2.1). Nothing throws it in this change except its own test.

**Every error `content.ts` and `zlib.ts` throw has a fixed sentence**, listed once in the tests (`PageTooLarge`'s, the page-number refusal, the two editor programming errors, `inflatePrefix`'s), holding nothing from the stream; a test throws each and compares its message with the list.

### 9. `zlib.ts`, `need`, and the built files

`src/engines/zlib.ts` holds, moved with no change in behaviour: `InflateClass`, `DeflateClass`, `Fflate`, `adler32` (private), `isZlib` (now exported, used by `shrink.ts`, `inflatePrefix` and `content.ts`), `zlibDeflate`, and `inflateLimited` with its private `TooLong` (`picture.ts` keeps its own for `pngDataFits`). **`need` stays in `shrink.ts`: moved to its own file, `tools-given.ts`, it became a built file of its own, `tools-given-*.js`, fetched by Compress PDF's and Compress to a target size's jobs (task 4.1), as only the two compress engines import it and `shrink.ts` itself never used it.** The plan expected the bundler to put it in `shrink-*.js`, on the belief that `shrink.ts` imported it; that would have added a file to two tools' fetched files, which this change must not do, so it was put back where it was, unchanged, and the two engines import it from `shrink.ts` as before (the four private copies are Left for later). Importers change their import lines; `shrink.ts` and `picture.ts` do not re-export. New:

```ts
/** The first `bytes` bytes of zlib data, inflated; stops as a success once they are made. */
export function inflatePrefix(data: Uint8Array, Inflate: InflateClass, bytes: number): Uint8Array | undefined;
```

**`pushPieces`** (stage 2) pushes raw deflate data in 1 KiB pieces and stops once 66.5 KiB in a row makes no output (decision 3); `inflateLimited`, `inflatePrefix` and the reader's Flate step all use it. **This changes the moved `inflateLimited` on hostile input only, a named departure from "no change in behaviour":** for data with more than 66.5 KiB after its end it now answers at once instead of after time growing with the square of the trailing bytes (Compress PDF reaches it on raw picture streams), with the same answer; for data padded with that many empty stored blocks it now gives `undefined`, and the picture is left as it was. Task 2.2's comparison was run again after it: identical (decision 11).

It throws `'The start of zlib data was asked for an impossible length.'` for a `bytes` that is not a whole number from 1 to 65,536 (a programming error, and the file's fixed sentence for `check-worker.mjs`); gives `undefined` without a zlib header (`isZlib`) or when the data ends, or fails, before `bytes` bytes; pushes 1 KiB pieces and stops as soon as `bytes` are made. **It ignores predictors and every other filter key**, so grayscale's ICC header read must refuse a profile stream with `/DecodeParms`, `/DP`, `/F` or a filter other than a lone `/FlateDecode` (recorded for its task 0.2).

**Measured in a build** (a temporary worktree with the move made and `shrink.ts`/`picture.ts` **re-exporting**, not with the import lines changed, and with `need` still in `zlib.ts`; gzip -9 sizes of the built files; the pull request quotes task 4.1's figures from the real change):

| File | Before | After |
| --- | --- | --- |
| `picture-*.js` | 3,868 B | 4,114 B |
| `shrink-*.js` | 3,314 B | 3,049 B |
| `compress-pdf-*.js`, `compress-to-target-*.js`, `images-to-pdf-*.js`, `sign-pdf-*.js` | 773, 3,211, 1,291, 2,978 B | 786, 3,219, 1,284, 2,979 B |
| `tool.worker-*.js` | 5,231 B | 5,232 B (only file names inside changed) |
| any `zlib-*.js` | none | none |

**Measured at task 4.1** (the real change, in a temporary worktree, against a build of `origin/main` 7b81ccb; gzip -9): `picture-*.js` 3,868 → 4,106 B, `shrink-*.js` 3,314 → 3,048 B, `compress-pdf-*.js` 773 → 776, `compress-to-target-*.js` 3,211 → 3,214, `images-to-pdf-*.js` 1,291 → 1,284, `sign-pdf-*.js` 2,978 → 2,980, `tool.worker-*.js` 5,231 → 5,233; every other built file within 10 B (only the hashed names inside it changed). The same files in both builds, no `zlib-*.js` or other new file, and no built file holding a sentence of `content.ts`. A first build with `need` in `tools-given.ts` made `tools-given-*.js`, so `need` stays in `shrink.ts` (above). The most fetched after a pick, from `npm run weigh`: 2,026.6 KB, against 2,026.5 KB before. Page weight before a pick: unchanged but for 0.1 KB of rounding on two compress pages (the hashed names in their HTML); the 37 pages' HTML is byte for byte the same once hashed names and island ids are masked.

`zlib.ts` is used only by `picture.ts` and `shrink.ts`, and every engine that imports `shrink.ts` imports `picture.ts` through it, so the bundler puts `zlib.ts` in `picture-*.js`. **No tool's set of fetched files changes**: Image to PDF and Sign PDF fetch about 0.25 KB more in `picture-*.js`, Compress PDF and Compress to a target size about the same in total. `content.ts` is in no built file until an engine imports it. Page weight before a pick is unchanged (no island imports either file).

**Recorded for `add-grayscale-pdf`:** once its engine imports `content.ts` and `zlibDeflate`, `zlib.ts` gains an importer outside `picture.ts`'s, and the bundler will likely give it its own file, which `picture-*.js` and so Image to PDF (its job and its thumbnails), Sign PDF, Compress PDF and Compress to a target size would then fetch. That change must measure it, list the file in `page-weight.mjs` and the uniform-requests lists, and name it. **If instead the bundler does not split `zlib.ts` out** (so Grayscale's job would fetch all of `picture-*.js`), Grayscale stops at its task 4.1 and updates its plan before going on: either a manual chunk for `zlib.ts` (the one place a chunk is named by hand, in `astro.config.mjs`), or naming the extra file in its allowlists and the Privacy facts.

### 10. Late loading and lint

`check-worker.mjs`'s `lateSources` gains `{ what: 'the content reader (content.ts)' }` and `{ what: 'the shared zlib steps (zlib.ts)' }`. `content.ts`'s fixed sentences are those of decision 8; `zlib.ts`'s is `inflatePrefix`'s. The check holds trivially for `content.ts` until an engine imports it, then for real. No lint change: the rules for `src/engines/**` already cover the new files. `page-weight.mjs`'s descriptions of `picture` and `shrink` say where the zlib steps and `need` now are.

### 11. Tests

`globalThis.fetch` is replaced in each new test file by a function that records and throws, asserted never called. Expected outputs are worked out in the test from the inputs (or, for the generated test, from the generator), never from the module's own exports.

- **`tests/unit/content-decode.test.ts`**: every case of decision 2's table built in the test (`content-helpers.ts` has the encoders: Flate through Node's zlib, RunLength, LZW with both EarlyChange values, ASCII85, ASCIIHex, PNG and TIFF predictors), put through the real `plainCopy` and read with `readRawStreams`; the filters and keys left equal the table, and `decodeContent` gives the original content for every case in the decoded set and `not-decoded` for every other, `/F`, `/FFilter`, `/FDecodeParms`, `/DP`, `/BPC` in `/DecodeParms` and both shape mismatches included; each step's rules directly (decision 3), each broken rule giving `not-decoded`: the defaults, ASCII85 with a NUL and with an FF, the LZW edge cases (a first code of 256 or more after a clear, KwKwK with and without a previous code, a 4,097th entry, the width change at both EarlyChange values), a predictor whose row would overflow 32 bits and one whose row is longer than its input (refused with no allocation); a Flate stream of under 100 KB inflating past 64 MiB stopping as `too-large` within a megabyte past the cap; a RunLength step and an ASCII85 step (all `z`) passing the cap; an LZW bomb in `[/LZWDecode /RunLengthDecode]`; a chain whose middle step passes it; `spend` called with every byte made, intermediate steps included, and its error passed through; an indirect `/Filter` and `/DecodeParms` through `resolve`, and a reference inside the array refused.
- **`tests/unit/content.test.ts`**:
  - **must not be doubt**, a table each checked against the exact operator sequence and every run the editor sees (count, start, kinds, spans, the last four after five or more operands, `numbers` and `kinds`, an array or dictionary as one operand): all 73 operators with their operands (`d0`, `T*`, `f*`, `'` and `"` among them); glued but valid `[(a)-20(b)]TJ`, `/a/b`, `<</MCID 0>>BDC`; `true`, `false`, `null`; CR-only and CRLF line ends and FF as whitespace; comments mid-line and inside arrays; names with `#xx`; an empty stream; 32 mixed levels of arrays and dictionaries; `sc` with six operands, a name first (`numbers` 5, the name's bit in `kinds`);
  - **doubt**, each left byte for byte: glued `0.5 0.5 0.5rg`, `ETQ`, `1.2.3`; NUL and other control bytes; a byte over 0x7F outside a string; a name with a byte outside 0x21 to 0x7E (`/A\0rg`, `/A\x80`); `{`, `}`, a stray `)`, a lone `>`; unterminated strings, arrays and dictionaries; a mismatched `]`/`>>`; 33 nested levels; an operator inside `[ ]` and `<< >>`; `ID`/`EI` outside `BI`; `BX` without `EX`, `EX` without `BX`; an unknown operator inside `BX`/`EX` (`BX 1 0 0 rgx EX`, `BX Qf EX`, both drawn by PDF.js to show why); a bad hex string; a bad `#` and `#` at the end of a name; malformed numbers (`.`, `+`, `-.`, `1e5`, `--1`); operands waiting at the end;
  - **inline pictures**: the clear cases (`F` absent and an empty `F` array alike); `xEI `, `EI` before NUL, tab, a delimiter and the end inside the data; `EEI`, `aEEI` and `EIEI` endings; a stray `~` and `~` not followed by `>`; CR LF after `ID`; `/Fl`, `/DCT`, `[/A85 /Fl]`; a named colour space and `[/I …]`; a key that is not a name and a key with no value; a duplicate and a short-and-long key; `/IM true` with `/CS`; missing `CS` or `BPC` without `IM`; `/W 2.0`; a wrong `/L`; `W`, `H` and `BPC` that overflow; `EI` followed by tab, FF, NUL or `/`; a non-printable byte within 15 bytes; a comment, a string, `true`, `false` or `null` in the look-ahead; a wrong first operand count; the look-ahead crossing a `not-last` stream's end;
  - **streams in sequence**: a number, an operator, a string and a dictionary split between two streams; operands waiting; a comment with no line end in a `not-last` and in a `last` stream; a `last` stream and a form ending in `Q`; a stream shared as `not-last` on one page and `alone` elsewhere read once as `not-last`;
  - **the editor**: the test-only editor's edits at every position (with operands, without, `operands` replaced, a removal, at the start and end of a stream, beside strings, comments and an inline picture), the edited length equal to pass 1's, every byte outside the edits unchanged, `edits` and `allEdits` with a `counts: false` edit, `unchanged` with no allocation when nothing is edited, doubt from the editor, a piece without its spaces, a piece holding `%`, `(`, `<`, `[` or `BI`, and `operands` on an empty run refused in both passes, an editor that answers differently in pass 2 refused with the fixed sentence (not a `RangeError`), `spend` called with the edited length before allocation, an edited length past 3 × 64 MiB read as doubt with no allocation;
  - `nameValue` against qpdf's own JSON keys for `/A#20B`, `/C#e9` (`undefined`) and `/D#c3#a9`; `PageTooLarge` with 14, and refused for 0, 1.5, −3, `NaN` and 2⁵³; every thrown sentence against the fixed list (decision 8); drawn by PDF.js: a page edited by the test-only editor reads the same text at the same places.
- **A generated test** (`tests/unit/content-generated.test.ts`): a seeded generator builds random valid token sequences (numbers, names with and without `#xx`, strings with escapes, hex strings, nested arrays and dictionaries, comments, operators with operand runs of every length, a few clear inline pictures), with and without spaces wherever the grammar allows tokens to touch; the operators and runs the reader reports through a recording editor must equal what the generator built; a few hundred sequences per run, the seed printed on failure.
- **Memory and time, measured at task 3.4** (Node 22 in this session's container, `npm test` alone): a 64 MiB stream of `q ` read with no edit in 1.35 s, with 0 MiB `arrayBuffers` and 0.1 MiB heap growth; edited with every `q` replaced by ` q ` (a 128 MiB copy) in 6.3 s for both passes, growth beyond the copy 0 MiB `arrayBuffers` and 6.1 MiB heap. The four-step chain `[/ASCII85Decode /RunLengthDecode /RunLengthDecode /FlateDecode]` (raw data 1.3 MiB, the second RunLength step making 64 MiB less 1 KiB, the result 32 MiB) decoded in 0.5 s with 124 MiB `arrayBuffers` growth, against a limit of 195.3 MiB. A first build of the editor allocated a run object, an operand array, a piece copy and a `subarray` per edit, and took 16.6 s with 15.9 MiB heap growth for the edit; the reader now shares one empty operand list, checks each distinct piece once per read in one reused buffer, and copies short spans byte by byte.
- **Memory and time, as planned at task 3.3:** a 64 MiB stream of `q ` read with no edit, and with the test-only editor told to replace every `q` with ` q ` (the edited copy 128 MiB, under the 3 × 64 MiB limit); and a four-step chain `[/ASCII85Decode /RunLengthDecode /RunLengthDecode /FlateDecode]` whose middle step reaches the cap. Node's `arrayBuffers` and `heapUsed` sampled before, during and after. Assertions: the reader's own growth beyond the input and the edited copy under 16 MiB (a token list would need gigabytes); the chain's `arrayBuffers` growth under the raw data plus 3 × 64 MiB plus 2 MiB. Budget: each reader pass under 10 s in Node on the CI machine, else the change is updated before the pull request.
- **PDF.js agreement (task 3.4):** each row of decision 5's table drawn by PDF.js; and for each of the 73 operators, a clear inline picture followed by that operator with PDF.js's operand count, then `1 0 0 rg 0 0 9 9 re f`, drawn with the fill seen after the picture. The operators that cannot simply be followed so are compared by PDF.js's operator list structurally instead (the operator present after the picture with its arguments, and nothing taken as picture data), and are listed as exceptions in the test: `BI`, `ID`, `EI`, `BX`, `EX` (each with its own valid surroundings), `d0` and `d1` (only in a Type 3 glyph, drawn as one), `Tj`, `TJ`, `'`, `"` (a string or array operand, outside the look-ahead's "numbers and names" and so tested as doubt cases there), `BDC`, `DP` (a dictionary operand, likewise), `sh`, `Do`, `gs`, `Tf`, `cs`, `CS`, `ri`, `BMC`, `MP` (a name the page must resolve, given in its resources), and `d` (an array operand, tested as doubt in the look-ahead).
- **`tests/unit/zlib.test.ts`**: `inflateLimited`'s and `zlibDeflate`'s existing tests moved unchanged from `picture.test.ts` and `compress-pdf.test.ts`; `inflatePrefix` on a Flate-compressed `pictures/p3.icc` (first 20 bytes equal the file's), on zlib data inflating past 256 MiB (stops early, measured under a second), on raw deflate with no header and on data of 12 bytes (`undefined`), and its refusal of 0, 65,537 and 1.5.
- **Byte-identical outputs (task 2.2):** a script in the scratchpad runs Compress PDF, Compress to a target size (all five targets), Image to PDF (on every picture fixture) and Sign PDF (the three ways) on every file in `tests/fixtures/` on `main` and on the branch, and compares, encrypted outputs after decrypting with qpdf and the trailer `/ID` aside; their own unit tests pass with only import lines changed.
- **Every fixture (task 3.5):** each file's content and form streams through the reader, with each file's expected counts of decoded, not-decoded and doubt streams asserted.

### 12. Departures from grayscale decision 4

For `add-grayscale-pdf` task 0.2 to copy back, in its design decision 4, spec and tasks. None changes that tool's approach or its owner questions.

1. **The filter set** (decision 2). Measured: no filter never reaches the reader (qpdf compresses it); Flate keeps any `/DecodeParms`; `/Fl` and `/RL` arrive as written; ASCII85, ASCIIHex and LZW (full or short names) arrive only inside chains holding RunLength (or a filter nobody decodes); a `/Filter` reference stays a reference; streams qpdf could partly decode arrive as plain Flate of what it made. `decodeContent` takes a lone Flate, a lone RunLength, and chains of two to four steps holding a RunLength. Since ASCII85 can still reach the reader, each step is decoded in pieces with the 64 MiB cap, as decision 4 said.
2. **Dictionary keys and shapes** (decision 2): `/F`, `/FFilter`, `/FDecodeParms`, `/DP`, or `/BPC` in `/DecodeParms` make a stream `not-decoded`, as PDF.js reads the short keys first and qpdf keeps them; a `/DecodeParms` whose shape does not match its filter (dictionary with an array filter, array with a name filter) is `not-decoded`.
3. **A step past 64 MiB** counts as the stream decoding past 64 MiB, whichever step; the cap is checked per piece, run, group and code (decision 3).
4. **Inline pictures** (decision 5). Decision 4 described PDF.js as taking "the first `EI` followed by whitespace, NUL included, or a delimiter"; PDF.js 6.5.438 runs a three-state scan that does not restart on `E`, takes only `EI` followed by a space, LF or CR that passes two look-ahead checks, and after ASCII85 or ASCIIHex data skips one byte after `EI`. Decision 4's earlier-`EI` rule is kept unchanged. Added: the real `EI` followed by a space, LF or CR, or the end; with no filter, PDF.js's three-state scan must reach the real `EI` as its first candidate; PDF.js's look-ahead emulated (15 printable bytes; the first operator within 75 bytes, only numbers and names before it, PDF.js's operand count; or only whitespace to the end of a `last` or `alone` stream); in a `not-last` stream the look-ahead inside the stream. Made explicit: keys must be names with values; a duplicate key or a short-and-long pair is doubt; `CS` and `BPC` required unless `/IM true`; `/IM true` with a `BPC` other than 1 or with a `CS` is doubt; whole numbers written as whole numbers; an indexed space is doubt (its palette is a string); `F` is a name, a one-name array or an empty array (no filter).
5. **Streams in sequence** (decision 6). The last-byte token-boundary rule applies to a page's streams other than the last; a page's last stream and a stream read alone need only nothing open and no operands waiting. A stream reached from several places is read once with its strictest place (`not-last`, `last`, `alone`).
6. **Tokens** (decision 4): a name with any byte outside 0x21 to 0x7E is doubt; every unknown operator is doubt, with no exception between `BX` and `EX`; a stray `)`, a lone `>` and `}` are doubt.
7. **The editor** (decisions 1 and 7): `Edit` has `before`, `operands`, `operator`, `after` and `counts`; removal is empty `operands` and `operator`; `OperandRun` carries `numbers` and `kinds`, so the `sc`/`SC` rule reads `run.numbers === run.count`; `Read.edits` counts only edits that count and `allEdits` all, so "a stream whose only edit is an inserted starting black" is `edits === 0`; pieces must be whole tokens between spaces; `nameValue` gives `undefined` (doubt) for a name that is not valid UTF-8 after `#xx` decoding, matching qpdf's JSON keys.
8. **The budget** is a callback (`spend`) the caller gives; the grayscale engine's throws `OutputLimit`. Intermediate steps of a chain are counted too.
9. **Flate:** a valid zlib header with no preset dictionary, and data reaching its final block; the Adler-32 checksum is not compared. **ASCII85:** NUL and FF in the data are `not-decoded`.
10. **New limits:** chains of at most four steps; predictors 1, 2 (at 8 bits) and 10 to 15 (at 1, 2, 4, 8 or 16 bits), `Colors` 1 to 32, `Columns` 1 to 2²⁴, `Colors × BPC × Columns` at most 2³¹ − 1, rows refused when longer than the input; the LZW rules of decision 3.
11. **`PageTooLarge`'s message** is the fixed, neutral "A page has too much drawing on it to work on here."; the page's own sentence with its number stays in grayscale's `failures.ts`.
12. **Files:** `isZlib` moves to `zlib.ts` too; `need` stays in `shrink.ts` (a file of its own would be a new built file); `inflatePrefix` ignores predictors, so the ICC header read refuses `/DecodeParms`, `/DP`, `/F` and any filter but a lone Flate.
13. **Found while building (tasks 3.1 and 3.2):** an empty Flate stream decodes to nothing; `/DecodeParms` keys a step does not take are `not-decoded`; `BI`, `ID` and `EI` are not offered to the editor, and operands before `BI` are doubt; an inline picture's dictionary has at most 32 keys and no comment, and no string, hex string or `null` nested in it.
14. **Found at stage 2:** a dictionary key with no value, or a key that is not a name, is doubt; numbers over 32 bytes are doubt; `nameValue` gives `undefined` past 127 bytes; a predictor row over 1 MiB and LZW input over 256 MiB are `not-decoded`; a Flate step stops pushing once 66.5 KiB in a row makes no output (`pushPieces`, which `inflateLimited` and `inflatePrefix` use too); pass 1 stops as doubt once the edited length passes `maxEditedBytes`; removal needs both pieces empty (or the operator alone when there are no operands).
15. **`need` and `zlib-*.js` for grayscale:** grayscale's design (its lines 10 and 164) still moves `need` into `zlib.ts`. Its task 0.2 must instead keep a private copy of `need` in its engine, as `thumbnail.ts`, `picture-thumbnail.ts`, `sign-pdf.ts` and `images-to-pdf.ts` do, since a shared `need` file is its own built file (decision 9). When its engine imports `content.ts` and `zlibDeflate`, `zlib.ts` will split out as `zlib-*.js`, about 759 B by gzip (measured by the architect at stage 2), fetched by Image to PDF, Sign PDF, Compress PDF and Compress to a target size as well; that change names it in `page-weight.mjs`, the uniform-requests lists and the Privacy facts.
16. **The built files:** `zlib.ts` is inside `picture-*.js` after this change; grayscale's import will likely split it out, and if it does not, grayscale stops at its task 4.1 (decision 9).

## Effect on page weight and on when WebAssembly is fetched

None. No island, component or page imports any of the new modules. No engine imports `content.ts` yet, so it is in no built file. `zlib.ts` lands in `picture-*.js` (measured at task 4.1), fetched only by the tools that already fetch them, at the pick or the job as before. WebAssembly is fetched exactly as before.

## Threats considered

- **A hostile drawing stream:** a decode bomb stops at the cap per step, checked per piece, run, group and code, and counted against the budget as it is made; LZW's table is fixed in size and its edge cases refused; ASCII85's four-to-one growth is capped like any step; predictor rows are checked against 32 bits and against the input before anything is allocated; the reader has no recursion (the inline picture's dictionary values are read with a loop and a stack of at most 32 frames, since stage 2), a nesting limit of 32, constant state and two linear passes; the inline-picture scans are linear and the look-ahead bounded at 75 bytes; very long tokens are kept as spans, never copied (numbers over 32 bytes are doubt, names over 127 bytes give `undefined` from `nameValue`, and only an inline picture's `CS` and `F` names and its keys are read); Flate data followed by trailing bytes stops after 66.5 KiB with no output; an edit bomb is held to 3 × 64 MiB and counted before allocation.
- **Readers disagreeing:** glued tokens, control bytes, names PDF.js ends early, unknown operators PDF.js splits, inline-picture ends (with PDF.js's own scan and look-ahead emulated and tested), CR LF after `ID`, streams split mid-token, comments across streams, filter keys PDF.js reads first: each is doubt or `not-decoded`, and such a stream is left exactly as it was, so the reader never creates a disagreement that was not in the file.
- **A misbehaving editor:** pieces checked through the tokenizer in both passes; a count, length or hash that differs between passes, or a piece that does not fit, is a thrown programming error with a fixed sentence, never a written stream.
- **Leaking:** every error has a fixed sentence holding nothing from the stream (tested against a list); the module makes no request and writes nothing to the console.
- **An oversized file, a hostile file name:** not reached by this module; the engine bounds the first and never sees the second.

No server is involved, so SSRF and macros do not apply.

## Risks / Trade-offs

- **Strictness leaves real streams alone:** chains of more than four steps, unusual predictors, `/DP` keys, unknown operators inside `BX`/`EX`, ASCIIHex inline data with other bytes, inline pictures followed by an unusual operand count. → Fail-safe by design; a tool names "parts that could not be read with certainty" on its page (grayscale does).
- **PDF.js's inline rules are tied to 6.5.438.** → The PDF.js agreement tests fail if an upgrade moves an end; the operand table is checked by drawing.
- **Other readers (pdfium, Acrobat, Preview, MuPDF, qpdf) were not measured.** → The earlier-`EI` rule, exact sizes and the space, LF or CR after `EI` cover the end rules they are known to use; grayscale's hand checks open edited files with inline pictures in each.
- **The Adler-32 checksum is not compared.** → Readers agree on the data; a stream whose checksum is wrong is edited like any other and rewritten with a correct one by the caller.
- **A later qpdf may change what the plain copy leaves.** → The measured table is a unit test; a change fails it and the set is looked at again.
- **`zlib.ts` will likely become its own file with grayscale.** → Recorded for that change, with what to do if it does not (decision 9).
- **The reader is unused until grayscale merges.** → Its tests are its first users, as `add-text-option`'s were; the test-only editor and the generated test run every path.

## Migration Plan

None. New files, helpers moved with byte-identical output, a check extended. Rolling back is reverting the pull request; no tool depends on `content.ts` until `add-grayscale-pdf`.

## Left for later

- **The plain copy's `/DP` bug** (found at stage 1 by the code and security reviewers, confirmed here): `plainCopy` turns an unfiltered content stream that has `/DP` into Flate with `/DP` kept, so PDF.js applies the predictor and draws nothing, after every page tool. It needs its own fix and change; the reader leaves such a stream (`/DP` is `not-decoded`).
- **The four private copies of `need`** (`thumbnail.ts`, `picture-thumbnail.ts`, `sign-pdf.ts`, `images-to-pdf.ts`) and the one in `shrink.ts` could share one neutral file; not done here, as it would change built files (a lone `need` file is its own chunk, measured at task 4.1).

## Open Questions

None that change the specs, the approach or the tasks. The memory and time figures (task 3.3) and the rebuilt sizes (task 4.1) are filled in during the work.
