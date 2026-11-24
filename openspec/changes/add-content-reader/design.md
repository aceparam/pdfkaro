# Design

## Context

See `proposal.md` for why the reader comes first, and `openspec/changes/add-grayscale-pdf/design.md`, decision 4, for the rules it implements. That plan passed stage 1; its task 0.2 copies back into it every rule this change alters, so each departure is listed in one place (decision 12).

What exists and is reused:

- **`plainCopy`** (`src/engines/plain.ts`): the input decrypted once with `--object-streams=disable`, written at qpdf's default decode level (`generalized`) with `--compress-streams=y`. Every page tool reads from it, so what it does to filters decides what reaches the reader (decision 2).
- **Raw stream data in batches** (`rawBatches`, `readRawStreams` in `qpdf-json.ts`, `--decode-level=none`): how an engine gets a stream's bytes and dictionary without qpdf decoding them. Unchanged here.
- **fflate's streaming inflater and deflater**, given to engines through `tools` (`need(tools, 'fflate')`), never imported as a value by an engine file.
- **The helpers to move:** `zlibDeflate`, `DeflateClass`, `Fflate`, `need` and the private `adler32` and `isZlib` in `shrink.ts`; `inflateLimited` and `InflateClass` in `picture.ts`. Importers: `shrink.ts`, `picture.ts`, the engines `compress-pdf`, `compress-to-target`, `images-to-pdf` and `sign-pdf` (types or values), and the tests `compress-pdf.test.ts`, `picture.test.ts`, `target-helpers.ts`.
- **`scripts/check-worker.mjs`**: `lateSources` takes each file's quoted sentences of 16 characters or more starting with a capital (no `$`) and fails if the worker file holds one; a file with none fails the check.
- **Lint**: every file under `src/engines/` is closed to components, hooks, pages and layouts (value imports and `import()`), and engine files may not touch the page or the network.

Measurements in this change were made with scripts in the session's scratchpad (not committed), using the repo's qpdf (`@neslinesli93/qpdf-wasm` 0.3.1, qpdf 12.2.0) and PDF.js (`pdfjs-dist` 6.5.438, legacy build in Node), and one build in a temporary git worktree. The unit tests of task 3 repeat each of them, so the numbers here are checked, not trusted.

## Goals / Non-Goals

**Goals:**

- One pure module that decodes, reads and edits drawing instructions by grayscale decision 4, with any doubt leaving a stream byte for byte as it was.
- Bounded work: each decode step capped at 64 MiB of output, every decoded byte counted against the caller's budget, two passes with constant state, an edited copy whose length is known and counted before it is allocated.
- The reader knows nothing of any tool's purpose; a caller supplies an editor.
- The zlib helpers in one shared file, with byte-identical output from every tool that uses them and no change in any tool's fetched files.

**Non-Goals:**

- Any tool, page, failure kind, message field or widget change (they ride with `add-grayscale-pdf`).
- Following the drawing state (current colour space, saves, forms); reading a picture's data; decoding filters that do not reach the reader.
- Repairing anything: a stream that cannot be read with certainty is left, never fixed.

## Decisions

### 1. One module, its interface

`src/engines/content.ts`, pure, with no page, no network and no library of its own. It imports only from `zlib.ts` (`isZlib`, and the `InflateClass` type) and types from `qpdf-json.ts` (`Dict`). The caller passes fflate's `Inflate`, a resolver and a budget, so the module throws no other module's error and is tested in Node with no qpdf.

```ts
export const maxContentBytes = 64 * 1024 * 1024;     // a decode step's output, and the grayscale per-page cap
export const maxEditedBytes = 3 * maxContentBytes;   // an edited stream
export const maxSteps = 4;                           // filters in a chain
export const maxNesting = 32;                        // arrays and dictionaries together

/** Counts bytes against the caller's budget; throws the caller's own error once it is passed. */
export type Spend = (bytes: number) => void;
/** Follows one reference to a direct value, or gives undefined. */
export type Resolve = (value: unknown) => unknown;

export type Decoded = { kind: 'decoded'; data: Uint8Array } | { kind: 'too-large' } | { kind: 'not-decoded' };
export function decodeContent(raw: Uint8Array, dict: Dict, resolve: Resolve, Inflate: InflateClass, spend: Spend): Decoded;

export type OperandKind = 'number' | 'name' | 'string' | 'hex' | 'array' | 'dictionary' | 'boolean' | 'null';
export type Operand = { kind: OperandKind; start: number; end: number };
/** The operands since the previous operator: how many, where the first starts, and the last four (last at the end). */
export type OperandRun = { count: number; start: number; last: readonly Operand[] };
/** Text put before the operands (or before the operator when there are none), in place of the operator, and after it. */
export type Edit = { before?: string; operator?: string; after?: string };
export type Editor = {
  operators: ReadonlySet<string>;
  edit(operator: string, run: OperandRun, data: Uint8Array): Edit | null | 'doubt';
};
/** Where a stream sits: read alone (a form, pattern, glyph, appearance stream or a /DA string), or one of a page's /Contents. */
export type Place = 'alone' | 'not-last' | 'last';
export type Read = { kind: 'edited'; data: Uint8Array; edits: number } | { kind: 'unchanged' } | { kind: 'doubt' };
export function editContent(data: Uint8Array, editor: Editor, place: Place, spend: Spend): Read;

/** A name operand's value with #xx decoded; a number operand's value. */
export function nameValue(data: Uint8Array, operand: Operand): string;
export function numberValue(data: Uint8Array, operand: Operand): number;

export class PageTooLarge extends Error { /* decision 8 */ }
```

The per-page sum of decoded bytes, "every stream of a page left", and the use of `PageTooLarge` are the caller's (grayscale decision 4 and its step 4), because only the caller knows which streams make a page. The reader gives each stream's verdict and the rules a caller must apply are written in the spec ("Streams in sequence").

**Alternatives:** the reader throwing `OutputLimit` itself (would import `qpdf.ts` into a pure module and tie it to one budget rule; a callback keeps it general); an edit list returned for the caller to apply (holds memory per edit, which decision 4 forbids); a token iterator (callers would re-implement the doubt rules).

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
| `[/ASCII85Decode /FlateDecode]` whose Flate data is damaged | `/FlateDecode` of what qpdf could decode, garbage included, with a warning (exit 3) |
| `/LZWDecode` cut off (no end code) | `/FlateDecode` of the part decoded, with no warning |
| damaged `/LZWDecode`, `/ASCII85Decode` (a byte outside its alphabet, or a leading `<~`) or `/ASCIIHexDecode` | the plain copy fails (exit 2), so the file is "damaged" for every page tool |

So qpdf decodes a whole chain only when it can decode every step at its default level; a chain holding RunLength (which qpdf decodes only at `specialized`), an image filter or an unknown name is kept whole. **ASCII85, ASCIIHex and LZW still reach the reader, but only inside such chains.** No filter, and lone ASCII85, ASCIIHex or LZW with parameters qpdf can use, never reach it.

**The decoded set, cut to exactly that:**

- a lone Flate (`/FlateDecode` or `/Fl`, as a name or a one-item array), with its `/DecodeParms`;
- a lone RunLength (`/RunLengthDecode` or `/RL`, likewise);
- a chain of two to four steps, each Flate, RunLength, LZW (`/LZWDecode`, `/LZW`), ASCII85 (`/ASCII85Decode`, `/A85`) or ASCIIHex (`/ASCIIHexDecode`, `/AHx`), holding at least one RunLength.

Everything else is `not-decoded` and left: no filter (never reaches it; a test fails if a later qpdf stops compressing such streams, so the set is looked at again), a lone LZW, ASCII85 or ASCIIHex (reaches it only when qpdf could not use its parameters, so neither should the reader), a chain without RunLength other than a lone Flate (qpdf would have decoded it unless something in it is wrong), a chain of five or more steps, and any other name. The `/Filter` value and each `/DecodeParms` value may be direct or one reference that `resolve` turns into a direct value; the names inside must be direct. `/DecodeParms` is absent, `null`, a dictionary for a lone filter, or an array of the chain's length of `null` or dictionaries; anything else is `not-decoded`. Names are compared as qpdf's JSON gives them, which is their decoded form.

**Why abbreviations are taken in a stream:** qpdf leaves them as written and decodes them itself (its `--filtered-stream-data` gave the original), and PDF.js maps them too, so readers agree on them.

### 3. Decoding in pieces, with caps

Each step reads the previous step's output (the raw bytes for the first) in pieces of at most 64 KiB and appends to its own output, which may not pass `maxContentBytes`; at the first byte past it the whole decode stops as `too-large`, holding at most the cap and one piece. **A step past the cap counts as the stream decoding past the cap, whichever step it is** (an ASCII85 step, whose `z` turns one byte into four, may pass it before the last step does). The bytes each step gives are passed to `spend` as each piece is made, intermediate steps included, so a chain is counted for all the work it makes; `spend` throwing stops the decode with that error. At most two steps' outputs are held at once.

The steps, each strict; any rule broken is `not-decoded`:

- **Flate:** a zlib header (`isZlib`: method 8, window at most 32 KB, check bits, no preset dictionary); raw deflate pushed to fflate's `Inflate` in 1 KiB pieces (so no one push can make more than about a megabyte, as `inflateLimited` does); the data must reach its final block. Trailing bytes after it are ignored, and the Adler-32 checksum is not compared, as PDF.js does; zlib-based readers give all the data before they report a bad checksum, so readers agree on what is drawn.
- **Predictors** (on Flate or LZW): `/Predictor` absent or 1, none; 2 (TIFF) only with `/BitsPerComponent` 8; 10 to 15 (PNG) with `/BitsPerComponent` 1, 2, 4, 8 or 16. `/Colors` 1 to 32, `/Columns` 1 to 2²⁴, whole numbers. Row bytes `ceil(Colors × BPC × Columns / 8)` are worked out with each product checked to be a safe whole number no larger than the cap. PNG rows each start with a tag 0 to 4 and the data must be a whole number of rows; TIFF data a whole number of rows. Rows are undone one at a time, holding two rows. A predictor's output is never larger than its input, so the cap falls on the inflate before it.
- **RunLength:** 0 to 127 copies the next n + 1 bytes, 129 to 255 repeats the next byte 257 − n times, 128 ends; the data must reach the end mark (bytes after it are ignored, as readers stop there).
- **LZW:** `/EarlyChange` 0 or 1 (default 1); codes of 9 to 12 bits, most significant bit first; 256 clears, 257 ends; a code past the next free entry, or a table that fills with no clear, is `not-decoded`; the data must reach the end code. The table holds at most 4,096 entries (prefix code, last byte, length), so its memory is fixed.
- **ASCII85:** whitespace (NUL, tab, LF, FF, CR, space) skipped; `!` to `u` in groups of five; `z` only at the start of a group; a group past 2³² − 1, a final group of one character, any other byte (`<` included) or no `~>` at the end is `not-decoded`; a final group of two to four characters gives one to three bytes.
- **ASCIIHex:** hex digits and whitespace, ending at `>`; an odd last digit is followed by 0; any other byte, or no `>`, is `not-decoded`.

### 4. The tokenizer and the two passes

As grayscale decision 4, unchanged except where decision 12 says. Over ISO 32000 7.2 and 7.8.2:

- whitespace: tab, LF, FF, CR, space; **NUL, any other control byte and any byte from 0x80 up outside a string, a name or an inline picture's data are doubt**;
- comments, `%` to the next CR or LF;
- literal strings with a nesting count of balanced parentheses and every backslash escape (a backslash takes the next byte, a line end included); hex strings of hex digits and whitespace only;
- `<<`, `>>`, `[`, `]`, at most 32 deep together, each closing the kind it opened (a 32-bit mask holds the kinds), balanced at the end; an operator inside either is doubt; `{` and `}` are doubt;
- names: `/` and regular bytes, `#` with two hex digits (any other `#` is doubt);
- numbers: exactly `[+-]?(\d+(\.\d*)?|\.\d+)`;
- every other run of regular bytes is one of the 73 operators of ISO 32000-2 Table A.1 (the same set as PDF.js 6.5.438's operator table) or `true`, `false`, `null`; any other run is doubt, glued tokens included (`0rg`, `ETQ`, `1.2.3`); between `BX` and `EX` a run of letters only is allowed and consumes its operands; `BX`/`EX` counted, unbalanced at the end or an `EX` with no `BX` is doubt; `ID` or `EI` outside `BI` is doubt.

**State kept:** the position, the nesting count and mask, the string nesting count, the `BX` count, the inline picture's few values while inside one (decision 5), and the operand run: its count, its start and a ring of its last four operands (kind, start, end). An array or dictionary is one operand spanning its brackets. Nothing else; no token or edit is stored, so memory does not grow with the stream.

**Pass 1** reads the whole stream. At each operator the editor names, it calls `editor.edit(operator, run, data)`; `'doubt'` ends the read as doubt; an edit adds its pieces' lengths and takes away the operator's length. At the end it checks the end-of-stream rules (decision 6). If doubt, the stream is left. If no edit was asked, the result is `unchanged` and nothing is allocated. If the edited length passes `maxEditedBytes`, doubt. Otherwise `spend(edited length)` is called, a buffer of exactly that length is allocated, and **pass 2** reads the stream again, asking the editor the same questions and copying every byte outside an edit. Each piece must be printable ASCII that starts and ends with a space, checked in both passes; one that is not is a programming error (a thrown error with a fixed sentence, not doubt). If pass 2's written length differs from pass 1's, or the editor answers differently, that too is a programming error. The editor must be a pure function of its arguments.

### 5. Inline pictures

Stepped over only when every reader finds the same end; otherwise doubt. Grayscale decision 4's rules are all kept, and the PDF.js-specific ones are corrected from what PDF.js 6.5.438 does (`Parser.makeInlineImage`, `findDefaultInlineStreamEnd`, `findASCII85DecodeInlineStreamEnd`, `findASCIIHexDecodeInlineStreamEnd`, `inlineStreamSkipEI`), read in its source and checked by drawing:

| Content after a clear inline picture with no filter (`BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI` …) | PDF.js's operators after the picture |
| --- | --- |
| `EI Q 1 0 0 rg 0 0 9 9 re f` | restore, fill colour, path: the right end |
| `EI` then tab, form feed or NUL, then `Q 1 0 0 rg …` | nothing: everything after was taken as picture data |
| `EI/F1 12 Tf 1 0 0 rg …` | nothing: likewise |
| `EI 1 Q 1 0 0 rg …` (a wrong operand count first) | the right end (PDF.js reads on to the next operator) |
| `xEI 1 EI Q …` (a false end in the data) | nothing after: the false end was taken |
| `/F /A85` data `@:F~>` then `EI/F1 12 Tf …` | the `/` was skipped, the rest misread |

What PDF.js does: with no filter (or any filter but DCT, ASCII85 and ASCIIHex) it takes the first `E I` followed by a space, LF or CR **whose next 15 bytes are each LF, CR, 0x20 to 0x7F or a NUL not followed by NUL, and whose next 75 bytes, lexed, reach a known operator with its expected operand count** (its table: exact counts, or at most 4 for `sc`/`SC` and 33 for `scn`/`SCN`); failing both checks it reads on, and at the end of the content falls back to the last such `EI`. With ASCII85 or ASCIIHex it takes data through the first `~` or `>`, then the first `E I` anywhere after it, then skips one more byte, whatever it is. It decides by the first filter of an array.

**The rule** (each point doubt if broken):

- the dictionary between `BI` and `ID` holds names, numbers, booleans, arrays and dictionaries only; a key given twice, or in both its short and long forms (`/W` and `/Width`), is doubt; the values read are `W`, `H`, `BPC`, `CS`, `IM`, `F` and `L` (and their long names); `W` and `H` are whole numbers from 1; `BPC` is 1, 2, 4, 8 or 16; `/IM true` means one bit and one component and its `BPC`, if given, must be 1;
- `n` from `/G` or `/DeviceGray` (1), `/RGB` or `/DeviceRGB` (3), `/CMYK` or `/DeviceCMYK` (4); a named resource colour space is doubt; an indexed space (`[/I …]`) needs a string for its palette and so is doubt by the dictionary rule;
- `F` absent, an empty array, or one name (or a one-name array) of `/AHx`, `/ASCIIHexDecode`, `/A85`, `/ASCII85Decode`; any other filter (`/DCT` and `/Fl` included) or a longer array is doubt;
- `ID` followed by exactly one whitespace byte, not a CR followed by LF;
- the data's end: with no filter `H × ceil(W × BPC × n / 8)` bytes, each product checked against the bytes left and against the largest safe whole number before the next is taken, so nothing overflows; with ASCIIHex, hex digits and whitespace only, through the first `>`; with ASCII85, through the first `~`, which must be followed by `>`; a `/L` or `/Length` must equal the data's length (with a filter, counted through its end mark);
- after the data, optional whitespace (space, tab, LF, FF, CR), then `EI`, then **a space, LF or CR, or the end of the stream** (added: PDF.js takes nothing else, and skips one byte after an ASCII85 or ASCIIHex `EI`);
- **no `EI` followed by whitespace (NUL included), a delimiter or the end anywhere earlier in the data or the whitespace before the real `EI`**, and for ASCII85 no other `~` (kept from decision 4; it is wider than PDF.js's candidates, so PDF.js can take no earlier end);
- **with no filter, PDF.js's look-ahead must accept the real `EI`** (added): counting from the byte after the space, LF or CR that follows it, the next 15 bytes (as many as there are) are each LF, CR or 0x20 to 0x7E; and either the first operator after it ends within 75 bytes, with only numbers and names before it and exactly PDF.js's operand count (at most its count for `sc`, `SC`, `scn`, `SCN`), or only space, LF and CR follow to the end of a stream that is `alone` or `last`. The operand counts are written once in `content.ts` beside the operator list, copied from PDF.js 6.5.438's table and checked against PDF.js by drawing (task 3.4);
- **in a page's content stream that is not the last, that look-ahead must lie inside the stream** (added): fewer than 15 bytes after the `EI`, or no operator before the stream ends, is doubt, because PDF.js reads the page's streams joined.

Strings are not allowed in the look-ahead, so the reader and PDF.js's lexer cannot disagree there. A wrong operand count first, which PDF.js reads past, is doubt here: stricter than needed, and simpler.

### 6. Streams in sequence

`editContent` takes a `Place`. For every place, the stream must end with no string, array, dictionary or inline picture open and **no operands waiting for an operator**. For `not-last` (a page's `/Contents` stream other than the last) it must also end at a token boundary (its last byte whitespace, a delimiter, or the end of a string, array or dictionary), not inside a comment, and satisfy decision 5's last point. `last` and `alone` may end with an operator or a comment with no line end. A caller leaves every content stream of a page when any of them is doubt, and a shared stream for every page that uses it; the spec says so and the test-only caller does so. `/DA` strings (grayscale) are read as `alone`.

### 7. The editor

The editor names its operators; others are stepped over without a call. For each, it sees the operator, the run (count, start, last four operands) and the stream's bytes, and can read a name or number with `nameValue` or `numberValue`. It gives an `Edit` of up to three pieces, `null` for no change, or `'doubt'`. With no operands, `before` goes immediately before the operator. Operand checks (such as "exactly three numbers before `rg`") are the editor's: the reader enforces only the tokenizer's rules. This is enough for every edit grayscale decision 4 lists and for a later stray-`Q` check or an operator removal, and holds no rule about colour.

The **test-only editor** (in `tests/unit/content-helpers.ts`) replaces `w` after one number with ` w 2 w `, puts ` h ` after `re`, puts ` q ` before the operands of `cm`, and answers doubt for an operator named in a test, so every edit position and the doubt path run without any grayscale rule.

### 8. `PageTooLarge`

```ts
export class PageTooLarge extends Error {
  override name = 'PageTooLarge';
  readonly page: number;
  constructor(page: number) {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('A page number must be a whole number from 1 up.');
    super('A page has too much drawing on it to convert here.');
    this.page = page;
  }
}
```

Known to the worker by its name, as `OutputLimit` is; the message is fixed and never holds page text. Mapping it to a failure kind, the `page` field on the worker's message, the widget state and the words are `add-grayscale-pdf`'s (its task 2.1). Nothing throws it in this change except its own test.

### 9. `zlib.ts`, and the built files

`src/engines/zlib.ts` holds, moved with no change in behaviour: `InflateClass`, `DeflateClass`, `Fflate`, `need`, `adler32` (private), `isZlib` (now exported, used by `shrink.ts`, `inflatePrefix` and `content.ts`), `zlibDeflate`, and `inflateLimited` with its private `TooLong` (`picture.ts` keeps its own for `pngDataFits`). Importers change their import lines; `shrink.ts` and `picture.ts` do not re-export. New:

```ts
/** The first `bytes` bytes of zlib data, inflated; stops as a success once they are made. */
export function inflatePrefix(data: Uint8Array, Inflate: InflateClass, bytes: number): Uint8Array | undefined;
```

It throws `'The start of zlib data was asked for an impossible length.'` for a `bytes` that is not a whole number from 1 to 65,536 (a programming error, and the file's fixed sentence for `check-worker.mjs`); gives `undefined` without a zlib header (`isZlib`) or when the data ends, or fails, before `bytes` bytes; pushes 1 KiB pieces and stops as soon as `bytes` are made.

**Measured in a build** (a temporary worktree with the move made and `shrink.ts`/`picture.ts` re-exporting; gzip -9 sizes of the built files):

| File | Before | After |
| --- | --- | --- |
| `picture-*.js` | 3,868 B | 4,114 B |
| `shrink-*.js` | 3,314 B | 3,049 B |
| `compress-pdf-*.js`, `compress-to-target-*.js`, `images-to-pdf-*.js`, `sign-pdf-*.js` | 773, 3,211, 1,291, 2,978 B | 786, 3,219, 1,284, 2,979 B |
| `tool.worker-*.js` | 5,231 B | 5,232 B (only file names inside changed) |
| any `zlib-*.js` | none | none |

`zlib.ts` is used only by `picture.ts` and `shrink.ts`, and every engine that imports `shrink.ts` imports `picture.ts` through it, so the bundler puts `zlib.ts` in `picture-*.js`. **No tool's set of fetched files changes**: Image to PDF and Sign PDF fetch about 0.25 KB more in `picture-*.js`, Compress PDF and Compress to a target size about the same in total. `content.ts` is in no built file until an engine imports it. Page weight before a pick is unchanged (no island imports either file). Task 4.1 measures again on the real change.

**Recorded for `add-grayscale-pdf`:** once its engine imports `content.ts` and `zlibDeflate`, `zlib.ts` gains an importer outside `picture.ts`'s, and the bundler will likely give it its own file, which `picture-*.js` and so Image to PDF (its job and its thumbnails), Sign PDF, Compress PDF and Compress to a target size would then fetch. That change must measure it, list the file in `page-weight.mjs` and the uniform-requests lists, and name it.

### 10. Late loading and lint

`check-worker.mjs`'s `lateSources` gains `{ what: 'the content reader (content.ts)' }` and `{ what: 'the shared zlib steps (zlib.ts)' }`. `content.ts`'s fixed sentences are its programming-error sentences and `PageTooLarge`'s message; `zlib.ts`'s is `inflatePrefix`'s. The check holds trivially for `content.ts` until an engine imports it, then for real. No lint change: the rules for `src/engines/**` already cover both files. `page-weight.mjs`'s descriptions of `picture` and `shrink` say where the zlib steps now are.

### 11. Tests

`globalThis.fetch` is replaced in each new test file by a function that records and throws, asserted never called. Expected outputs are worked out in the test from the inputs, never from the module's own exports.

- **`tests/unit/content-decode.test.ts`**: every case of decision 2's table built in the test (`content-helpers.ts` has the encoders: Flate through Node's zlib, RunLength, LZW with both EarlyChange values, ASCII85, ASCIIHex, PNG and TIFF predictors), put through the real `plainCopy` and read with `readRawStreams`; the filters left equal the table, and `decodeContent` gives the original content for every case in the decoded set and `not-decoded` for every other; each step's rules directly (decision 3), each broken rule giving `not-decoded`; a 70 KB Flate stream that inflates to 1 GiB stopping as `too-large` within a megabyte past the cap; a RunLength step and an ASCII85 step (all `z`) passing the cap as `too-large`; a chain whose middle step passes it; an LZW table filled with no clear; a predictor whose row size would overflow; `spend` called with every byte made, intermediate steps included, and its error passed through; an indirect `/Filter` and `/DecodeParms` through `resolve`, and a reference inside the array refused.
- **`tests/unit/content.test.ts`**: the tokenizer and reader: every doubt case of the spec (glued `0.5 0.5 0.5rg`, `ETQ`, `1.2.3`, NUL, other control bytes, a byte over 0x7F outside a string, `{`, unterminated strings, arrays and dictionaries, a mismatched `]`/`>>`, 33 nested arrays, an operator inside `[ ]` and `<< >>`, `ID`/`EI` outside `BI`, `BX` without `EX` and `EX` without `BX`, a bad hex string, a bad `#`, operands waiting at the end), each left byte for byte; strings holding every byte, escapes and nested parentheses read correctly; inline pictures: the clear cases, `xEI `, `EI` before NUL, tab, delimiter and the end inside the data, a stray `~`, `~` not followed by `>`, CR LF after `ID`, `/Fl`, `/DCT`, `[/A85 /Fl]`, a named colour space, `[/I …]`, a duplicate and a short-and-long key, a wrong `/L`, `W`, `H` and `BPC` that overflow, `EI` followed by tab, FF, NUL or `/`, a non-printable byte within 15 bytes, a long string before the next operator, a wrong first operand count, and the look-ahead crossing a `not-last` stream's end; streams in sequence: a number, an operator, a string and a dictionary split between two streams, operands waiting, a comment with no line end in a `not-last` and in a `last` stream, a `last` stream and a form ending in `Q`; the editor: the test-only editor's edits at every position (with operands, without, at the start and end of a stream, beside strings, comments and an inline picture), the edited length equal to pass 1's, every byte outside the edits unchanged, `unchanged` with no allocation when nothing is edited, doubt from the editor, a piece without its spaces refused in both passes, an editor that answers differently in pass 2 refused, `spend` called with the edited length before allocation, and an edited length past 3 × 64 MiB read as doubt with no allocation; `nameValue` with `#xx`; `PageTooLarge` with 14, and refused for 0, 1.5, −3, `NaN` and 2⁵³; drawn by PDF.js: a page edited by the test-only editor reads the same text at the same places.
- **Memory and time, measured and recorded here at task 3.3:** a 64 MiB stream of `q ` read with no edit, and with the test-only editor told to replace every `q` with ` q ` (the edited copy 128 MiB, under the 3 × 64 MiB limit); Node's `heapUsed` and `arrayBuffers` sampled before, during and after; the test asserts the reader's own growth beyond the input and the edited copy stays under 16 MiB (a token list would need gigabytes) and records time; budget: each pass under 10 s in Node on the CI machine, else the change is updated before the pull request.
- **PDF.js agreement (task 3.4):** each row of decision 5's table drawn by PDF.js, so a later PDF.js that ends inline pictures elsewhere fails a test; and for each of the 73 operators, a clear inline picture followed by that operator with PDF.js's operand count, then `1 0 0 rg 0 0 9 9 re f`, drawn with the fill seen after the picture (the operand table matches PDF.js).
- **`tests/unit/zlib.test.ts`**: `inflateLimited`'s and `zlibDeflate`'s existing tests moved unchanged from `picture.test.ts` and `compress-pdf.test.ts`; `inflatePrefix` on a Flate-compressed `pictures/p3.icc` (first 20 bytes equal the file's), on zlib data inflating to 1 GiB (stops early, measured under a second), on raw deflate with no header and on data of 12 bytes (`undefined`), and its refusal of 0, 65,537 and 1.5.
- **Byte-identical outputs (task 2.2):** a script in the scratchpad runs Compress PDF, Compress to a target size (all five targets), Image to PDF (on every picture fixture) and Sign PDF (the three ways) on every file in `tests/fixtures/` on `main` and on the branch, and compares, encrypted outputs after decrypting with qpdf and the trailer `/ID` aside; their own unit tests pass with only import lines changed.

### 12. Departures from grayscale decision 4

For `add-grayscale-pdf` task 0.2 to copy back, in its design decision 4, spec and tasks. None changes that tool's approach or its owner questions.

1. **The filter set** (decision 2). Decision 4 asked for Flate, none, RunLength and LZW with and without predictors and in chains to be measured. Measured: no filter never reaches the reader (qpdf compresses it); Flate keeps any `/DecodeParms`; `/Fl` and `/RL` arrive as written; ASCII85, ASCIIHex and LZW (full or short names) arrive only inside chains holding RunLength (or a filter nobody decodes); a `/Filter` reference stays a reference; streams qpdf could partly decode arrive as plain Flate of what it made. `decodeContent` takes a lone Flate, a lone RunLength, and chains of two to four steps holding a RunLength. Since ASCII85 can still reach the reader, each step is decoded in pieces with the 64 MiB cap, as decision 4 said.
2. **A step past 64 MiB** counts as the stream decoding past 64 MiB, whichever step (decision 4 spoke of the stream's decoded size).
3. **Inline pictures** (decision 5). Decision 4 described PDF.js as taking "the first `EI` followed by whitespace, NUL included, or a delimiter"; PDF.js 6.5.438 takes only `EI` followed by a space, LF or CR that passes two look-ahead checks, and after ASCII85 or ASCIIHex data skips one byte after `EI`. Decision 4's earlier-`EI` rule is kept unchanged. Added: the real `EI` followed by a space, LF or CR, or the end; with no filter, PDF.js's look-ahead emulated (15 printable bytes; the first operator within 75 bytes, only numbers and names before it, PDF.js's operand count; or only whitespace to the end of a `last` or `alone` stream); and in a `not-last` stream that look-ahead inside the stream. Made explicit: a duplicate key or a short-and-long pair is doubt; `/IM true` with a `BPC` other than 1 is doubt; an indexed space is doubt (its palette is a string); `F` is a name or a one-name array.
4. **Streams in sequence** (decision 6). The last-byte token-boundary rule applies to a page's streams other than the last; a page's last stream and a stream read alone need only nothing open and no operands waiting (decision 4's "read alone by the same rule" read this way; otherwise nearly every form ending in `Q` would be left).
5. **The budget** is a callback (`spend`) the caller gives; the grayscale engine's throws `OutputLimit`. Intermediate steps of a chain are counted too.
6. **Flate:** a valid zlib header with no preset dictionary, and data reaching its final block; the Adler-32 checksum is not compared (as PDF.js; zlib-based readers draw the same data).
7. **New limits:** chains of at most four steps; predictors 1, 2 (at 8 bits) and 10 to 15 (at 1, 2, 4, 8 or 16 bits), `Colors` 1 to 32, `Columns` 1 to 2²⁴; LZW tables never past 4,096 entries without a clear.
8. **`PageTooLarge`'s message** is the fixed "A page has too much drawing on it to convert here."; the page's own sentence with its number stays in grayscale's `failures.ts`.
9. **`isZlib`** moves to `zlib.ts` too (shared by `shrink.ts`, `inflatePrefix` and the reader).
10. **The built files:** `zlib.ts` is inside `picture-*.js` after this change; grayscale's import will likely split it out (decision 9).

## Effect on page weight and on when WebAssembly is fetched

None. No island, component or page imports either module. No engine imports `content.ts` yet, so it is in no built file. `zlib.ts` lands in `picture-*.js`, fetched only by the tools that already fetch it, at the pick or the job as before. WebAssembly is fetched exactly as before.

## Threats considered

- **A hostile drawing stream:** a decode bomb stops at the cap per step, counted against the budget as it is made; LZW's table is fixed in size; ASCII85's four-to-one growth is capped like any step; predictor row sizes are checked before use; the reader has no recursion, a nesting limit of 32, constant state and two linear passes; the inline-picture scans are linear and the look-ahead bounded at 75 bytes; very long tokens are kept as spans, never copied; an edit bomb is held to 3 × 64 MiB and counted before allocation.
- **Readers disagreeing:** glued tokens, control bytes, inline-picture ends (with PDF.js's own rules emulated and tested), CR LF after `ID`, streams split mid-token, comments across streams: each is doubt, and a stream with doubt is left exactly as it was, so the reader never creates a disagreement that was not in the file.
- **A misbehaving editor:** pieces checked in both passes; a length or answer that differs between passes is a thrown programming error, never a written stream.
- **Leaking:** no error holds page text, a name or a value; the module makes no request and writes nothing to the console.
- **An oversized file, a hostile file name:** not reached by this module; the engine bounds the first and never sees the second.

No server is involved, so SSRF and macros do not apply.

## Risks / Trade-offs

- **Strictness leaves real streams alone:** chains of more than four steps, unusual predictors, ASCIIHex inline data with other bytes, inline pictures followed by an unusual operand count. → Fail-safe by design; a tool names "parts that could not be read with certainty" on its page (grayscale does).
- **PDF.js's inline rules are tied to 6.5.438.** → The PDF.js agreement tests fail if an upgrade moves an end; the operand table is checked by drawing.
- **Other readers (pdfium, Acrobat, Preview, MuPDF, qpdf) were not measured.** → The earlier-`EI` rule, exact sizes and the space, LF or CR after `EI` cover the end rules they are known to use; grayscale's hand checks open edited files with inline pictures in each.
- **The Adler-32 checksum is not compared.** → Readers agree on the data; a stream whose checksum is wrong is edited like any other and rewritten with a correct one by the caller.
- **A later qpdf may change what the plain copy leaves.** → The measured table is a unit test; a change fails it and the set is looked at again.
- **`zlib.ts` will likely become its own file with grayscale.** → Recorded for that change (decision 9).
- **The reader is unused until grayscale merges.** → Its tests are its first users, as `add-text-option`'s were; the test-only editor runs every path.

## Migration Plan

None. Two new files, helpers moved with byte-identical output, a check extended. Rolling back is reverting the pull request; no tool depends on `content.ts` until `add-grayscale-pdf`.

## Open Questions

None that change the specs, the approach or the tasks. The memory and time figures (task 3.3) and the rebuilt sizes (task 4.1) are filled in during the work.
