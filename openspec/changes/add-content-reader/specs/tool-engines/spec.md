## ADDED Requirements

### Requirement: Drawing instructions are decoded within caps

The shared content reader SHALL decode drawing streams itself, never through qpdf, and only for the filters measured to reach it after the plain copy: a lone Flate, a lone RunLength, and chains of two to four of Flate, RunLength, LZW, ASCII85 and ASCIIHex holding a RunLength. Any other filter, untaken parameters or data not ending properly SHALL be reported as not decoded. It SHALL make no request. (SPEC.md: Privacy, limits and security; Rules for the code, 2)

#### Scenario: The filters that reach the reader

- **WHEN** test PDFs whose content streams have no filter, Flate, Flate with a PNG or TIFF predictor, `/Fl`, RunLength, `/RL`, LZW, ASCII85, ASCIIHex, chains of these with and without RunLength, an unknown filter, an indirect `/Filter`, and the keys `/F`, `/DP` and `/FFilter` are each put through the plain copy
- **THEN** the filters and keys left on each stream are exactly the ones recorded in the change's design, and the reader decodes every stream whose filters are in its set to the original content

#### Scenario: A filter outside the set

- **WHEN** a stream reaching the reader has `/DCTDecode`, `/CCITTFaxDecode`, an unknown filter, a lone LZW, ASCII85 or ASCIIHex, a chain without RunLength other than a lone Flate, a chain of five steps, or no filter
- **THEN** it is reported as not decoded, and no byte of it is decoded

#### Scenario: Damaged or cut-off data

- **WHEN** Flate data has a bad zlib header, a preset dictionary or ends before its last block; RunLength data has no end mark; LZW data uses a code not yet in its table, starts after a clear with a code of 256 or more, passes 4,096 entries with no clear, or has no end code; ASCII85 data has a byte outside its alphabet, a NUL, an FF, a `z` inside a group, a group past 2³² − 1 or a lone last character; or ASCIIHex data has a byte that is not a hex digit or whitespace
- **THEN** the stream is reported as not decoded and left as it is

#### Scenario: No request

- **WHEN** the reader's unit tests run with the global `fetch` replaced by a function that records and throws
- **THEN** it is never called

### Requirement: Filter keys every reader reads alike

A stream SHALL be reported as not decoded when its dictionary holds a key PDF.js reads before or instead of qpdf's (`/F`, `/FFilter`, `/FDecodeParms`, `/DP`, or `/BPC` inside `/DecodeParms`), or when its `/DecodeParms` does not match its filter's shape: a name filter takes a dictionary, `null` or none; an array filter takes an array of its length, `null` or none. (SPEC.md: Privacy, limits and security)

#### Scenario: A short key beside the long one

- **WHEN** a Flate stream has `/DP` with a predictor, `/F /FlateDecode`, `/FFilter`, or `/BPC 8` inside its `/DecodeParms`
- **THEN** it is reported as not decoded

#### Scenario: Shapes that do not match

- **WHEN** a name filter has a one-item `/DecodeParms` array, or `[/RunLengthDecode /FlateDecode]` has a dictionary `/DecodeParms`
- **THEN** it is reported as not decoded

### Requirement: Each decode step is capped and counted

Each decode step SHALL work in pieces with its output capped at 64 MiB, checked before each piece, run, group or code is added, and every byte each step gives, intermediate steps included, SHALL be passed to the caller's budget as it is made. A stream past the cap at any step SHALL be reported as too large. While decoding, memory SHALL stay under the raw data plus 3 × 64 MiB plus 2 MiB. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: A step past the cap in a chain

- **WHEN** the ASCII85 step of `[/ASCII85Decode /RunLengthDecode]` gives more than 64 MiB
- **THEN** the stream is reported as too large, though its last step was not reached

#### Scenario: A decode bomb

- **WHEN** a Flate stream of under 100 KB inflates past 64 MiB, a RunLength or ASCII85 step's output passes 64 MiB, or the LZW step of `[/LZWDecode /RunLengthDecode]` does
- **THEN** decoding stops within a megabyte past the cap and the stream is reported as too large

#### Scenario: Memory while decoding

- **WHEN** a four-step chain whose middle step reaches the cap is decoded, measured with Node's `arrayBuffers`
- **THEN** its growth stays under the raw data plus 3 × 64 MiB plus 2 MiB

#### Scenario: A predictor row longer than its input

- **WHEN** a predictor's row bytes plus one are more than the step's input, or `Colors × BPC × Columns` passes 2³¹ − 1
- **THEN** the stream is reported as not decoded and nothing is allocated for its rows

#### Scenario: The budget is spent

- **WHEN** a caller's budget refuses more bytes while a stream is decoded
- **THEN** decoding stops at once with the caller's own error, and nothing more is decoded

### Requirement: Bytes after the end of Flate data are cut short

Every inflating step, in the content reader and the shared zlib steps, SHALL stop pushing input once 66.5 KiB in a row makes no output, then end with an empty final push that succeeds only for data that reached its final block, so bytes after the end take no time growing with their square. (SPEC.md: Privacy, limits and security)

#### Scenario: Bytes after the end of Flate data

- **WHEN** a lone Flate stream is followed by 16 MiB of other bytes, or the last Flate step of `[/FlateDecode /RunLengthDecode /FlateDecode]` (a few hundred raw bytes) by about 63 MiB
- **THEN** each decodes to its content in under a second

#### Scenario: Bytes after the end, in the shared zlib steps

- **WHEN** the shared inflate with a cap, or the first bytes, are asked of zlib data followed by 16 MiB of other bytes
- **THEN** each finishes in under a second, with the same answer as for the data alone

### Requirement: Decode steps refuse sizes that would stretch memory

A predictor row over 1 MiB and LZW input over 256 MiB SHALL be reported as not decoded, and a step's output SHALL grow from small pieces made only when written to. (SPEC.md: Privacy, limits and security)

#### Scenario: A predictor row of 1 MiB and one byte

- **WHEN** a Flate stream has a PNG predictor whose rows are 1 MiB, and another whose rows are one byte longer
- **THEN** the first decodes and the second is reported as not decoded

#### Scenario: LZW past 256 MiB

- **WHEN** the LZW step of a chain is given more than 256 MiB
- **THEN** it is reported as not decoded before a code is read

#### Scenario: A small stream

- **WHEN** 10,000 small streams are decoded one after another
- **THEN** each takes under 200 µs, as a step's pieces start at 4 KiB and are made only when written to

### Requirement: Drawing instructions are read with certainty or left

The content reader SHALL read a decoded stream in two streaming passes by ISO 32000 7.2 and 7.8.2, with constant state and no list of tokens or edits. The first pass SHALL check the stream and work out the edited length; the second SHALL write the edited copy into a buffer of exactly that length. At the first doubt the whole stream SHALL be left as it was. (SPEC.md: Privacy, limits and security; What we are building, rule 4)

#### Scenario: Bounded memory on a large stream

- **WHEN** a 64 MiB stream of `q ` is read with no edit, and again with an editor that replaces every `q` with ` q `, measured with Node's `arrayBuffers` and `heapUsed`
- **THEN** the reader's own growth beyond the decoded stream and the edited copy stays under 16 MiB, and no array of tokens is built

#### Scenario: Valid input is never doubt

- **WHEN** a stream holds any of the 73 operators with their operands, `[(a)-20(b)]TJ`, `/a/b`, `<</MCID 0>>BDC`, `true`, `false`, `null`, CR-only and CRLF line ends, FF as whitespace, comments mid-line and inside arrays, names with `#xx`, 32 mixed levels of arrays and dictionaries, or nothing at all
- **THEN** it is not doubt, and the editor sees exactly the operators and operand runs written, an array or dictionary as one operand

#### Scenario: Generated streams

- **WHEN** a seeded generator builds random valid token sequences, with and without spaces wherever tokens may touch
- **THEN** the operators and runs the reader reports equal the ones the generator built

### Requirement: What counts as doubt

Doubt SHALL include: a control or non-ASCII byte outside a string or inline data; a name byte outside 0x21–0x7E; a regular-byte run that is not a number, name, `true`, `false`, `null` or Table A.1 operator, inside `BX`/`EX` too; braces, a stray `)` or `>`; anything open, or operands waiting, at the end; nesting past 32; an operator in an array or dictionary; `ID`/`EI` outside `BI`; unbalanced `BX`/`EX`; an edited stream past 3 × 64 MiB. (SPEC.md: Privacy, limits and security)

#### Scenario: Glued tokens

- **WHEN** a stream holds `0.5 0.5 0.5rg`, `ETQ` or `1.2.3`
- **THEN** it is read as doubt and left byte for byte

#### Scenario: Each doubt case

- **WHEN** a stream holds a NUL or other control byte, a byte over 0x7F outside a string, `/A\0rg`, `{`, `}`, a stray `)`, a lone `>`, an unterminated string, array or dictionary, an unbalanced `]` or `>>`, 33 nested levels, `[ 1 rg ]`, `<< /A q >>`, `ID` or `EI` with no `BI`, `BX` with no `EX`, `EX` with no `BX`, a hex string with a byte that is not a hex digit, a name with a bad `#` or `#` at its end, a malformed number (`.`, `+`, `-.`, `1e5`, `--1`), or operands with no operator after them
- **THEN** each is read as doubt and left byte for byte

#### Scenario: Unknown operators inside BX and EX

- **WHEN** a stream holds `BX 1 0 0 rgx EX` or `BX Qf EX`, which PDF.js was drawn reading as `rg` and as `Q` then `f`
- **THEN** each is read as doubt and left byte for byte

#### Scenario: An edit that grows too much

- **WHEN** an editor's edits would make a stream longer than 3 × 64 MiB
- **THEN** the first pass reads it as doubt as soon as the length passes that, asks the editor nothing more, and no buffer for the edited copy is allocated

### Requirement: Dictionaries hold keys and values in pairs, and numbers are short

Inside `<< >>`, the content reader SHALL take a name key and then exactly one value, in turn, and read anything else as doubt; a number over 32 bytes SHALL be doubt. (SPEC.md: Privacy, limits and security)

#### Scenario: A dictionary key with no value

- **WHEN** a stream holds `/P <</A>> BDC 1 0 0 rg 0 0 9 9 re f EMC`, which PDF.js was drawn reading as nothing at all
- **THEN** it is read as doubt and left byte for byte

#### Scenario: Keys and values out of turn

- **WHEN** a stream holds `<</A>>`, `<</A 1 /B>>`, `<<1 /A 2>>` or `[<</A>>]`
- **THEN** each is read as doubt and left byte for byte

#### Scenario: A long number

- **WHEN** a stream holds a number of 33 bytes, or of 60 MiB
- **THEN** it is read as doubt, and nothing of it is copied

### Requirement: Inline pictures are stepped over only where every reader agrees

The content reader SHALL step over an inline picture (`BI … ID data EI`) only when its end found from its own size or end mark is the end PDF.js and every other reader's rule would find, and read it as doubt otherwise. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: A clear inline picture

- **WHEN** a stream holds `q 1 0 0 rg BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q 0 1 0 rg`, or the same with `/F []`
- **THEN** the picture is stepped over and the operators on both sides of it reach the editor

### Requirement: The inline picture's dictionary and data end

The dictionary SHALL be name keys each with one name, number, boolean, array or dictionary; `W`, `H`, `BPC` whole numbers; `CS` and `BPC` given unless `/IM true`, which takes no `CS`. One whitespace byte, not CR LF, SHALL follow `ID`. With no filter the data SHALL be `H × ceil(W × BPC × n / 8)` bytes, without overflow; ASCIIHex SHALL end at the first `>`, ASCII85 at the first `~`, then `>`. Other filters, named colour spaces, a wrong `/L` SHALL be doubt. (SPEC.md: Privacy, limits and security)

#### Scenario: ASCII85 with a stray tilde

- **WHEN** an inline picture with `/F /A85` has a `~` not followed by `>`, or a second `~`
- **THEN** the stream is doubt and left byte for byte

#### Scenario: A size that would overflow

- **WHEN** an inline picture's `W`, `H` and `BPC` multiply past what the stream holds or past the largest safe whole number
- **THEN** the stream is doubt, worked out with no overflow

#### Scenario: A dictionary that is not clear

- **WHEN** an inline picture's dictionary has a key that is not a name, a key with no value, a key twice or in its short and long forms, `/IM true` with `/CS`, no `CS` or no `BPC` without `/IM true`, or `/W 2.0`
- **THEN** the stream is doubt and left byte for byte

#### Scenario: Other filters

- **WHEN** an inline picture has `/F /Fl`, `/F /DCT`, `/F [/A85 /Fl]`, a named colour space such as `/CS /CS0`, CR LF after `ID`, or a `/L` that disagrees with its data
- **THEN** the stream is doubt and left byte for byte

### Requirement: What follows an inline picture

After the data come optional whitespace, `EI`, and a space, LF, CR or the end, with no earlier `EI` in the data followed by whitespace (NUL included), a delimiter or the end. With no filter, PDF.js's three-state scan from the first data byte SHALL reach the real `EI` first, and its look-ahead SHALL accept it: 15 printable bytes, then an operator within 75 bytes after only numbers and names, with PDF.js's count, or only whitespace to the end. (SPEC.md: Privacy, limits and security)

#### Scenario: A false end inside the data

- **WHEN** an inline picture's data holds `xEI ` or `EI` before a NUL, a tab, a delimiter or the stream's end, before its real end
- **THEN** the stream is doubt and left byte for byte

#### Scenario: Data ending in E or EI

- **WHEN** an inline picture with no filter is `ID EEI Q …` with `/W 1`, or `ID aEEI Q …` or `ID EIEI Q …` with `/W 2`, which PDF.js was drawn missing the real end of
- **THEN** the stream is doubt and left byte for byte

#### Scenario: Where PDF.js would read on

- **WHEN** a clear inline picture's `EI` is followed by a tab, a form feed, a NUL or `/`, or, with no filter, by a byte outside printable ASCII within 15 bytes, or by a comment, string, `true`, `false` or `null` before the next operator
- **THEN** the stream is doubt and left byte for byte, because PDF.js may take a different end there

### Requirement: Streams in sequence

Each of a page's content streams SHALL be read on its own and end with nothing open and no operands waiting; one not the page's last SHALL also end at a token boundary, not in a comment, with any inline look-ahead inside it. A caller SHALL leave every content stream of a page when one has doubt, and a shared one for every page. A stream reached from several places SHALL be read once with its strictest place: not last, last, alone. (SPEC.md: Privacy, limits and security)

#### Scenario: A token split between streams

- **WHEN** a page's two content streams split a number, an operator, a string or a dictionary between them, or the first ends with operands waiting
- **THEN** the first stream is doubt, and the test-only caller leaves both streams byte for byte

#### Scenario: A comment across streams

- **WHEN** a page's first content stream ends with `% note` and no line end, and the second begins with `1 0 0 rg`
- **THEN** the first stream is doubt, and both are left byte for byte

#### Scenario: The last stream

- **WHEN** a page's last content stream, or a form read alone, ends with a comment and no line end, or with `Q`
- **THEN** it is not doubt for that reason

#### Scenario: A shared stream

- **WHEN** one stream is a page's first content stream and also read alone elsewhere
- **THEN** it is read once, by the rules for a stream that is not the last

### Requirement: Edits are local and every other byte is kept

The content reader SHALL take a caller's editor, which names its operators and, for each, from the operator and its run alone, gives text to put before the operands, in place of them, in place of the operator and after it, or says doubt. Pieces SHALL be whole tokens between spaces, or empty to remove. The reader SHALL ask the same in both passes, copy every other byte unchanged, and hold no rule about any tool's purpose. (SPEC.md: Rules for the code, 2; Definition of done, Each tool)

#### Scenario: A test-only editor

- **WHEN** a test-only editor that replaces `w` (after one number) with ` w 2 w `, puts ` h ` after `re`, replaces the operands of `cs` and removes `d0` commands is run over a stream that also holds strings, comments, an inline picture and operators it does not name
- **THEN** the edited stream differs from the original only at those operators, its length is the one worked out in the first pass, and PDF.js reads the same text at the same places from a page drawn with it

#### Scenario: The whole run, summarised

- **WHEN** `sc` is preceded by six operands, a name first and five numbers
- **THEN** the editor sees a count of 6, 5 numbers, the name's kind in the summary, and the last four operands' kinds and spans

#### Scenario: Edits that do not count

- **WHEN** a stream's only edits are marked as not counting
- **THEN** the reader says how many edits it made and that none of them counts, so a caller can leave the stream unwritten

#### Scenario: An editor that says doubt

- **WHEN** the editor says doubt for one operator
- **THEN** the whole stream is left byte for byte

#### Scenario: A piece that could join or open a token

- **WHEN** an editor gives a piece that does not start and end with a space, holds `%`, `(`, `<`, `[` or `BI`, or replaces the operands of an operator that has none
- **THEN** the reader refuses it as a programming error with a fixed sentence, in both passes, and no edited copy is made

#### Scenario: An editor that answers differently the second time

- **WHEN** an editor gives a longer piece in the second pass than in the first
- **THEN** the reader refuses with its fixed sentence, not a range error, and no edited copy is given

#### Scenario: No edit

- **WHEN** a stream is read with certainty and the editor asks for no change
- **THEN** the reader says it is unchanged and allocates no edited copy

#### Scenario: Names read as qpdf reads them

- **WHEN** the editor reads the names `/A#20B`, `/C#e9` and `/D#c3#a9`, and a name of 128 bytes or 60 MiB
- **THEN** it gets the first and last as qpdf's JSON keys write them, and nothing for `/C#e9`, which is not valid UTF-8, or for the long names, which are never copied

### Requirement: Removal empties a command whole

An edit SHALL remove a command only by giving empty operands and an empty operator together, or an empty operator for an operator with no operands; an empty operands or operator alone SHALL be refused as a programming error with the pieces' fixed sentence. (SPEC.md: Rules for the code, 2)

#### Scenario: Half a removal

- **WHEN** an editor empties the operands of `1 0 0 rg` but keeps its operator, or empties its operator but keeps its operands
- **THEN** the reader refuses it with its fixed sentence, and no edited copy is made

### Requirement: A page with too much drawing on it

The shared content reader's module SHALL hold an error, known to the worker by its name `PageTooLarge`, that carries the number of the page whose drawing instructions decode past 64 MiB, a whole number from 1 up, and a fixed, neutral message that holds no page text, name or value. (SPEC.md: Privacy, limits and security; States every tool handles, Failed)

#### Scenario: The error carries its page

- **WHEN** `PageTooLarge` is made for page 14
- **THEN** its name is `PageTooLarge`, its `page` is 14 and its message is "A page has too much drawing on it to work on here."

#### Scenario: A page number that is not a page

- **WHEN** it is made with 0, 1.5, −3, `NaN` or a number past the largest safe whole number
- **THEN** it refuses with a plain error and no `PageTooLarge` is made

### Requirement: Fixed sentences only

Every error the content reader and the shared zlib steps throw SHALL have a fixed sentence that holds nothing from the stream, the file or the caller's data. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: Every thrown sentence is on the list

- **WHEN** a test makes each of the modules' errors happen
- **THEN** each message equals one sentence of the fixed list written in the test

### Requirement: Shared zlib steps

Deflating and inflating with a cap SHALL live in one shared engine file, behaving exactly as before they moved. A new step SHALL give back the first bytes of zlib data and stop there as a success, however large the data, and give nothing for data without a zlib header or with fewer bytes; it SHALL ignore predictors, which its caller must refuse. (SPEC.md: Rules for the code, 2; Repo layout)

#### Scenario: The tools that use them give the same files

- **WHEN** Compress PDF, Compress to a target size, Image to PDF and Sign PDF run on every file in `tests/fixtures/` after the move
- **THEN** each output is byte for byte the output before the move, encrypted outputs compared after decrypting and the trailer `/ID` aside

#### Scenario: The start of a large stream

- **WHEN** the first 20 bytes are asked of a Flate-compressed colour profile larger than 128 bytes, and of zlib data that inflates past 256 MiB
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

- **WHEN** a file under `src/components/`, `src/hooks/`, `src/pages/` or `src/layouts/` imports a value from `src/engines/content` or `src/engines/zlib`, or loads one with `import()`
- **THEN** lint fails, by the rules that already cover every file under `src/engines/`
