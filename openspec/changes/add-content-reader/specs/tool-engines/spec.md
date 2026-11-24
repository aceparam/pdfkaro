## ADDED Requirements

### Requirement: Drawing instructions are decoded within caps

The shared content reader SHALL decode drawing streams itself, never through qpdf, and only for the filters measured to reach it after the plain copy: a lone Flate, a lone RunLength, and chains of two to four of Flate, RunLength, LZW, ASCII85 and ASCIIHex holding a RunLength. Any other filter, untaken parameters or data not ending properly SHALL be reported as not decoded. It SHALL make no request. (SPEC.md: Privacy, limits and security; Rules for the code, 2)

#### Scenario: The filters that reach the reader

- **WHEN** test PDFs whose content streams have no filter, Flate, Flate with a PNG or TIFF predictor, `/Fl`, RunLength, `/RL`, LZW, ASCII85, ASCIIHex, chains of these with and without RunLength, an unknown filter and an indirect `/Filter` are each put through the plain copy
- **THEN** the filters left on each stream are exactly the ones recorded in the change's design, and the reader decodes every stream whose filters are in its set to the original content

#### Scenario: A filter outside the set

- **WHEN** a stream reaching the reader has `/DCTDecode`, `/CCITTFaxDecode`, an unknown filter, a lone LZW, ASCII85 or ASCIIHex, a chain without RunLength other than a lone Flate, a chain of five steps, or no filter
- **THEN** it is reported as not decoded, and no byte of it is decoded

#### Scenario: Damaged or cut-off data

- **WHEN** Flate data has a bad zlib header, a preset dictionary or ends before its last block; RunLength data has no end mark; LZW data uses a code not yet in its table or has no end code; ASCII85 data has a byte outside its alphabet, a `z` inside a group, a group past 2³² − 1 or a lone last character; or ASCIIHex data has a byte that is not a hex digit or whitespace
- **THEN** the stream is reported as not decoded and left as it is

#### Scenario: No request

- **WHEN** the reader's unit tests run with the global `fetch` replaced by a function that records and throws
- **THEN** it is never called

### Requirement: Each decode step is capped and counted

Each decode step SHALL work in pieces with its output capped at 64 MiB, and every byte each step gives, intermediate steps included, SHALL be passed to the caller's budget as it is made. A stream past the cap at any step SHALL be reported as too large, holding no more than the cap and one piece. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: A step past the cap in a chain

- **WHEN** the ASCII85 step of `[/ASCII85Decode /RunLengthDecode]` gives more than 64 MiB
- **THEN** the stream is reported as too large, though its last step was not reached

#### Scenario: A decode bomb

- **WHEN** a Flate stream of under 100 KB inflates past 64 MiB, or a RunLength or ASCII85 step's output passes 64 MiB
- **THEN** decoding stops within a megabyte past the cap and the stream is reported as too large, holding no more than the cap and one piece in memory

#### Scenario: The budget is spent

- **WHEN** a caller's budget refuses more bytes while a stream is decoded
- **THEN** decoding stops at once with the caller's own error, and nothing more is decoded

### Requirement: Drawing instructions are read with certainty or left

The content reader SHALL read a decoded stream in two streaming passes by ISO 32000 7.2 and 7.8.2, with constant state and no list of tokens or edits. The first pass SHALL check the stream and work out the edited length; the second SHALL write the edited copy into a buffer of exactly that length. At the first doubt the whole stream SHALL be left as it was. (SPEC.md: Privacy, limits and security; What we are building, rule 4)

#### Scenario: Bounded memory on a large stream

- **WHEN** a 64 MiB stream of `q ` is read with no edit, and again with an editor that edits every `q`
- **THEN** the reader's own memory beyond the decoded stream and the edited copy stays within a few megabytes, as measured and recorded in the change's design, and no array of tokens is built

### Requirement: What counts as doubt

Doubt SHALL include: a control or non-ASCII byte outside a string, name or inline data; a run of regular bytes that is not a number, name, `true`, `false`, `null` or a Table A.1 operator (outside `BX`/`EX`); braces; anything open at the end; nesting past 32; an operator inside an array or dictionary; `ID` or `EI` outside `BI`; unbalanced `BX`/`EX`; operands waiting at the end; an edited stream past 3 × 64 MiB. (SPEC.md: Privacy, limits and security)

#### Scenario: Glued tokens

- **WHEN** a stream holds `0.5 0.5 0.5rg`, `ETQ` or `1.2.3`
- **THEN** it is read as doubt and left byte for byte

#### Scenario: Each doubt case

- **WHEN** a stream holds a NUL or other control byte, a byte over 0x7F outside a string, `{`, an unterminated string, array or dictionary, an unbalanced `]` or `>>`, 33 nested arrays, `[ 1 rg ]`, `<< /A q >>`, `ID` or `EI` with no `BI`, `BX` with no `EX`, `EX` with no `BX`, a hex string with a byte that is not a hex digit, a name with a bad `#`, or operands with no operator after them
- **THEN** each is read as doubt and left byte for byte

#### Scenario: An edit that grows too much

- **WHEN** an editor's edits would make a stream longer than 3 × 64 MiB
- **THEN** the first pass reads it as doubt and no buffer for the edited copy is allocated

### Requirement: Inline pictures are stepped over only where every reader agrees

The content reader SHALL step over an inline picture (`BI … ID data EI`) only when its end found from its own size or end mark is the end PDF.js and every other reader's rule would find, and read it as doubt otherwise. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: A clear inline picture

- **WHEN** a stream holds `q 1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q 0 1 0 rg`
- **THEN** the picture is stepped over and the operators on both sides of it reach the editor

### Requirement: The inline picture's dictionary and data end

The dictionary SHALL hold only names, numbers, booleans, arrays and dictionaries. `ID` SHALL be followed by one whitespace byte, not CR then LF. With no filter the data SHALL be `H × ceil(W × BPC × n / 8)` bytes, worked out without overflow; with ASCIIHex it SHALL end at the first `>`, and with ASCII85 at the first `~`, followed by `>`. Any other filter, a named colour space, or a `/L` or `/Length` that disagrees SHALL be doubt. (SPEC.md: Privacy, limits and security)

#### Scenario: ASCII85 with a stray tilde

- **WHEN** an inline picture with `/F /A85` has a `~` not followed by `>`, or a second `~`
- **THEN** the stream is doubt and left byte for byte

#### Scenario: A size that would overflow

- **WHEN** an inline picture's `W`, `H` and `BPC` multiply past what the stream holds or past the largest safe whole number
- **THEN** the stream is doubt, worked out with no overflow

#### Scenario: Other filters

- **WHEN** an inline picture has `/F /Fl`, `/F /DCT`, `/F [/A85 /Fl]`, a named colour space such as `/CS /CS0`, CR LF after `ID`, or a `/L` that disagrees with its data
- **THEN** the stream is doubt and left byte for byte

### Requirement: What follows an inline picture

After the data, optional whitespace, `EI`, and a space, LF, CR or the end SHALL come, with no earlier `EI` in the data followed by whitespace (NUL included), a delimiter or the end. With no filter, PDF.js's look-ahead SHALL accept the real `EI`: 15 printable bytes, then the first operator within 75 bytes with only numbers and names before it and PDF.js's operand count, or only whitespace to the content's end. (SPEC.md: Privacy, limits and security)

#### Scenario: A false end inside the data

- **WHEN** an inline picture's data holds `xEI ` or `EI` before a NUL, a tab, a delimiter or the stream's end, before its real end
- **THEN** the stream is doubt and left byte for byte

#### Scenario: Where PDF.js would read on

- **WHEN** a clear inline picture's `EI` is followed by a tab, a form feed, a NUL or `/`, or, with no filter, by a byte outside printable ASCII within 15 bytes, or by a long string before the next operator
- **THEN** the stream is doubt and left byte for byte, because PDF.js was measured to take a different end there

### Requirement: Streams in sequence

Each of a page's content streams SHALL be read on its own and SHALL end with nothing open and no operands waiting; one that is not the page's last SHALL also end at a token boundary, not inside a comment, with any inline picture's look-ahead inside it. The reader SHALL say which streams had doubt, so a caller leaves every content stream of that page, and a shared one for every page, as it was. Other streams SHALL be read alone by the same rules. (SPEC.md: Privacy, limits and security)

#### Scenario: A token split between streams

- **WHEN** a page's two content streams split a number, an operator, a string or a dictionary between them, or the first ends with operands waiting
- **THEN** the first stream is doubt, and the test-only caller leaves both streams byte for byte

#### Scenario: A comment across streams

- **WHEN** a page's first content stream ends with `% note` and no line end, and the second begins with `1 0 0 rg`
- **THEN** the first stream is doubt, and both are left byte for byte

#### Scenario: The last stream

- **WHEN** a page's last content stream, or a form read alone, ends with a comment and no line end
- **THEN** it is not doubt for that reason

### Requirement: Edits are local and every other byte is kept

The content reader SHALL take a caller's editor, which names its operators and, for each, from the operator and its operand run alone, gives text to put before the operands, in place of the operator and after it, or says doubt. Each piece SHALL start and end with a space. The reader SHALL ask the same in both passes, copy every byte outside an edit unchanged, and hold no rule about colour or any tool's purpose. (SPEC.md: Rules for the code, 2; Definition of done, Each tool)

#### Scenario: A test-only editor

- **WHEN** a test-only editor that replaces `w` (after one number) with ` w 2 w ` and puts ` h ` after `re` is run over a stream that also holds strings, comments, an inline picture and operators it does not name
- **THEN** the edited stream differs from the original only at those operators, its length is the one worked out in the first pass, and PDF.js reads the same text at the same places from a page drawn with it

#### Scenario: An editor that says doubt

- **WHEN** the editor says doubt for one operator
- **THEN** the whole stream is left byte for byte

#### Scenario: Text that could join a token

- **WHEN** an editor gives a piece of text that does not start and end with a space
- **THEN** the reader refuses it as a programming error, in both passes, and no edited copy is made

#### Scenario: No edit

- **WHEN** a stream is read with certainty and the editor asks for no change
- **THEN** the reader says it is unchanged and allocates no edited copy

### Requirement: A page with too much drawing on it

The shared content reader's module SHALL hold an error, known to the worker by its name `PageTooLarge`, that carries the number of the page whose drawing instructions decode past 64 MiB, a whole number from 1 up, and a fixed message that holds no page text, name or value. (SPEC.md: Privacy, limits and security; States every tool handles, Failed)

#### Scenario: The error carries its page

- **WHEN** `PageTooLarge` is made for page 14
- **THEN** its name is `PageTooLarge`, its `page` is 14 and its message is the fixed sentence

#### Scenario: A page number that is not a page

- **WHEN** it is made with 0, 1.5, −3, `NaN` or a number past the largest safe whole number
- **THEN** it refuses with a plain error and no `PageTooLarge` is made

### Requirement: Shared zlib steps

Deflating, inflating with a cap, and naming an engine's tools SHALL live in one shared engine file, and SHALL behave exactly as before they moved. A new step SHALL give back the first bytes of zlib data and stop there as a success, however large the data, and give nothing for data without a zlib header or with fewer bytes. (SPEC.md: Rules for the code, 2; Repo layout)

#### Scenario: The tools that use them give the same files

- **WHEN** Compress PDF, Compress to a target size, Image to PDF and Sign PDF run on every file in `tests/fixtures/` after the move
- **THEN** each output is byte for byte the output before the move, encrypted outputs compared after decrypting and the trailer `/ID` aside

#### Scenario: The start of a large stream

- **WHEN** the first 20 bytes are asked of a Flate-compressed colour profile larger than 128 bytes, and of zlib data that inflates to 1 GiB
- **THEN** the 20 bytes come back, and inflating stops once they are made

#### Scenario: Not zlib data, or too short

- **WHEN** they are asked of raw deflate data with no zlib header, or of zlib data that inflates to 12 bytes
- **THEN** nothing comes back

### Requirement: The content reader loads late

The content reader and the shared zlib steps SHALL never be in the worker's own file, and no component, hook, page or layout SHALL import a value from them or load them. (SPEC.md: Rules for the code, 3 and 4)

#### Scenario: The worker file is checked

- **WHEN** `npm run check:worker` runs on the built site
- **THEN** it fails if the worker file holds a fixed sentence of the content reader or of the shared zlib steps

#### Scenario: A component imports the reader

- **WHEN** a file under `src/components/`, `src/hooks/`, `src/pages/` or `src/layouts/` imports a value from `src/engines/content` or `src/engines/zlib`, or loads either with `import()`
- **THEN** lint fails, by the rules that already cover every file under `src/engines/`
