# tool-engines Specification

## Purpose

How the code that processes files is shaped: pure engine functions, run in a Web Worker, loaded only after a file is picked, using the libraries the tech stack names. Derived from "Architecture and tech stack" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: Engines are pure functions

Each operation SHALL be a function of the form `(files: Uint8Array[], options) => Promise<Uint8Array[]>` with a progress callback, in its own file under `src/engines/`. An engine MAY return no files, meaning the input could not be improved; only a tool whose words say what that means may do so. An engine MUST NOT touch the DOM, so that it can be unit tested in Node. (SPEC.md: Rules for the code, 2)

#### Scenario: An engine is run in Node

- **WHEN** an engine's unit tests run under Vitest in Node with no browser
- **THEN** the engine runs and returns its output

#### Scenario: An engine reaches for the page

- **WHEN** an engine file uses `window`, `document`, `navigator`, `localStorage` or a DOM type
- **THEN** lint or the engine's Node unit tests fail

#### Scenario: An engine gives no file

- **WHEN** an engine returns no files to a tool that has words for it
- **THEN** the page shows those words; for a tool without them, the page shows the engine failure

### Requirement: Engines run in a Web Worker

Every engine SHALL run in a Web Worker. The UI thread SHALL never process a file. (SPEC.md: Rules for the code, 3)

#### Scenario: A large job runs

- **WHEN** a 500-page file is processed
- **THEN** the page still responds to input while the job runs

### Requirement: Typed worker messages with progress and cancel

The page and the worker SHALL talk through typed messages kept in `src/workers/`, covering start, progress, done, error and cancel. Progress SHALL be reported in real units. Cancel SHALL stop the work. (SPEC.md: Repo layout; Tool page anatomy, States; CLAUDE.md: Phase 0, step 5)

#### Scenario: Progress is reported

- **WHEN** an engine finishes page 14 of 120
- **THEN** the worker sends a progress message carrying 14 and 120

#### Scenario: A job is cancelled

- **WHEN** the page sends cancel while a job is running
- **THEN** the work stops, its memory is released and no done message follows

### Requirement: Engines load late

WebAssembly and engine code SHALL be fetched when the visitor picks a file, not when the page loads. No page or component SHALL import an engine at load. (SPEC.md: Rules for the code, 4)

#### Scenario: A page loads and no file is chosen

- **WHEN** a tool page finishes loading and the visitor has not picked a file
- **THEN** no WebAssembly file and no engine script has been requested

#### Scenario: A file is picked

- **WHEN** the visitor picks a file
- **THEN** the engine for that tool is fetched and the page shows the engine loading state meanwhile

#### Scenario: A component imports an engine

- **WHEN** a page or component statically imports a file from `src/engines/`
- **THEN** lint or review rejects the change

### Requirement: The library for each job

Engines SHALL use the library that the tech stack table in `SPEC.md` names for the job, or the owner's later choice. A different choice MUST be justified in the change's design. (SPEC.md: Architecture and tech stack; CLAUDE.md: Owner decisions, 13 Nov 2026)

#### Scenario: A page-structure tool is designed

- **WHEN** a tool merges, splits, rotates, deletes, reorders, encrypts, decrypts or repairs
- **THEN** it uses qpdf compiled to WebAssembly

#### Scenario: A drawing tool is designed

- **WHEN** a tool adds page numbers, a watermark or a signature, turns images into a PDF, or fills a form
- **THEN** it uses `@cantoo/pdf-lib`

#### Scenario: A rendering tool is designed

- **WHEN** a tool shows thumbnails, turns a PDF into images or extracts text
- **THEN** it uses PDF.js (`pdfjs-dist`)

#### Scenario: OCR is designed

- **WHEN** a tool reads text from a scan
- **THEN** it uses Tesseract.js

#### Scenario: Compression is designed

- **WHEN** a tool compresses a PDF
- **THEN** it uses our own recompression on qpdf, with pictures decoded and encoded by the browser in the worker, by the owner's decision of 13 Nov 2026, and no Ghostscript

### Requirement: Licence-bound dependencies wait for the owner

Ghostscript MUST NOT be added to the repo, and no `LICENSE` file SHALL be added, until the owner confirms the licence decision. Any other dependency under the AGPL SHALL be pointed out to the owner in the change that adds it. (SPEC.md: Open decisions, Licence; CLAUDE.md: Questions waiting for the owner)

#### Scenario: Compress PDF is proposed

- **WHEN** a change needs Ghostscript and the owner has not confirmed the licence
- **THEN** the change is blocked and the owner is asked

#### Scenario: Another AGPL dependency is proposed

- **WHEN** a change adds a dependency under the AGPL other than Ghostscript
- **THEN** the change says so and the owner is told

### Requirement: OCR language data loads on choice

Tesseract language data SHALL be downloaded only when the visitor picks that language. (SPEC.md: Architecture and tech stack)

#### Scenario: A visitor picks Hindi

- **WHEN** a visitor picks Hindi in OCR
- **THEN** only the Hindi language data is fetched

### Requirement: Dependencies are checked and listed

Before a library is added it SHALL be confirmed as still maintained, and its licence SHALL be noted in `LICENSES.md`. The pull request SHALL say in a sentence why it is needed. (SPEC.md: Architecture and tech stack; Build phases, 4)

#### Scenario: A dependency is added

- **WHEN** a change adds a package
- **THEN** `LICENSES.md` has a line for it and the pull request says why it is needed

### Requirement: Site stack

The site SHALL be built with Astro with static output and TypeScript, with the interface written as React components. A component with no interaction SHALL be rendered to static HTML and ship no JavaScript. Interactive parts SHALL be React islands, and on a tool page only the tool widget SHALL ship JavaScript. Styling SHALL be hand-written CSS, with no Tailwind, component kit or icon library. (SPEC.md: Architecture and tech stack; React by the owner's decision in CLAUDE.md)

#### Scenario: A style is added

- **WHEN** a style is added
- **THEN** it goes in the one global stylesheet, `src/styles/site.css`, if it is shared, or in a scoped style beside its component if it is not

#### Scenario: A tool page is built

- **WHEN** a tool page is built
- **THEN** the output is static HTML with one island for the tool widget and no other script for the page content

#### Scenario: A page with no interaction is built

- **WHEN** a page such as the 404 page or a placeholder page is built
- **THEN** the output is static HTML that loads no JavaScript

#### Scenario: The home page is built

- **WHEN** the home page is built
- **THEN** every tool is in the served HTML, and the only script on the page is the island that filters the list

### Requirement: Repo layout

Code SHALL sit where the repo layout says: `src/tools/registry.ts`, `src/engines/`, `src/workers/`, `src/components/`, `src/pages/`, `src/content/`, `src/styles/site.css`, `server/`, `tests/fixtures/`, `public/` and `LICENSES.md`. (SPEC.md: Repo layout)

#### Scenario: An engine is added

- **WHEN** a change adds an engine
- **THEN** it is one file under `src/engines/`, and any worker entry point it needs is under `src/workers/`

### Requirement: Shared components are reused

Tools SHALL reuse `ToolShell`, `FilePicker`, `PageGrid` and `Result`. A tool that needs a new shared component SHALL add it in its own pull request first. (SPEC.md: Build phases, 3)

#### Scenario: A tool needs a new shared part

- **WHEN** a tool's design calls for a shared component that does not exist
- **THEN** that component is proposed and merged as its own change before the tool's change

### Requirement: Logic is kept apart from views

Rules and state SHALL live in plain TypeScript modules and hooks that render nothing, and components SHALL receive what they show through props. A component MUST NOT read the registry, storage or the network directly when a prop can carry the value. This keeps components reusable on other pages and lets a later phone app reuse the logic with new views. (Owner request; SPEC.md: Rules for the code, 1 and 2)

#### Scenario: A rule is tested without rendering

- **WHEN** the rule that filters the list of tools is unit tested
- **THEN** the test calls a plain function in Node and renders no component

#### Scenario: A component is reused

- **WHEN** the list of tools is shown on a second page
- **THEN** the same component is used with different props, and no copy of it is made

### Requirement: Drawing on the pages of a PDF

A tool that draws on the pages of a PDF (Add page numbers, then Watermark and Sign PDF) SHALL draw with `@cantoo/pdf-lib`. Each drawing SHALL be upright as the page is shown, inside the part of the page a reader shows, and above the page's own content, which SHALL stay in the page's content and SHALL be unable to move the drawing. Nothing else in the file SHALL change. (SPEC.md: Architecture and tech stack; Definition of done)

#### Scenario: A turned page

- **WHEN** a page turned a quarter, half or three quarters by its `/Rotate` is drawn on at the bottom centre
- **THEN** the drawing is upright at the bottom centre of the page as a reader shows it

#### Scenario: Odd turns and boxes

- **WHEN** a page's turn is -90, 450, 45 or inherited from the page tree, its user unit is 2, 0 or negative, its crop box is smaller than its paper, has no area or lies off the paper, its trim box is smaller, or its paper box is offset, reversed or missing
- **THEN** the drawing lands where PDF.js shows that edge of the page, at the same size on screen, and the page's stored turn, boxes and user unit are not changed

#### Scenario: Content that leaves its drawing state unbalanced

- **WHEN** a page's content stream changes the drawing state with more `q` than `Q`, a scaling `cm` and a fill colour
- **THEN** the drawing is still at its place, at its size and in its colour

#### Scenario: Tagged and shared content

- **WHEN** pages whose content is tied to accessibility tags, or that share one content stream, are drawn on
- **THEN** each page's own content streams are still its content, unchanged and still shared, and every piece of marked content the tag tree names for a page is still in that page's content

#### Scenario: Everything else stays

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are drawn on
- **THEN** their bookmarks, links, attached files, form fields and values, tags and text are kept, and the result passes `qpdf --check`

### Requirement: A picture option is read in the worker

A picture chosen for an option SHALL be read in the tool worker, not on the page, with the shared picture reader, before the job, and the page SHALL be told only whether it is ready, with its pixels, damaged, or saved in a way the tool cannot read. With the job, each shown, ready picture SHALL go to the worker beside the files and reach the engine as bytes under its option's key. (SPEC.md: Rules for the code, 2 to 4)

#### Scenario: A picture is checked

- **WHEN** each picture in `tests/fixtures/pictures/` is read for a test entry's picture option of JPG and PNG
- **THEN** each gives the outcome the fixtures README gives it, read from its bytes alone, and the page receives the outcome and nothing of the picture

#### Scenario: A picture goes with the job

- **WHEN** a job starts with a shown, ready picture
- **THEN** the run message carries the picture beside the files, the worker hands its bytes to the engine under the option's key, and a hidden or unready picture is not carried

#### Scenario: A message with a bad picture entry

- **WHEN** the worker receives a run message whose pictures are not an object of plain keys to files
- **THEN** it ignores the message, as it ignores any message of the wrong shape

### Requirement: Drawing on some pages only

A tool that draws on pages MAY tell the drawing step which pages to draw on. A page not chosen SHALL be left exactly as it was: no layer, no change to its dictionary, resources or content. A tool that does not say which pages to draw on SHALL have every page drawn on, as before. A tool that says but chooses no page SHALL be refused before anything is written. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; Architecture and tech stack)

#### Scenario: Only the last page

- **WHEN** a three-page file is drawn on with only its last page chosen
- **THEN** the last page carries the drawing, the first two pages' objects are as they were in the plain copy, and the result passes `qpdf --check`

#### Scenario: Tools that draw on every page

- **WHEN** Add page numbers or Watermark runs
- **THEN** every page is drawn on, and their tests pass unchanged

#### Scenario: No page chosen

- **WHEN** a tool tells the drawing step which pages to draw on and chooses none
- **THEN** the job fails as the engine's failure before any layer is drawn or anything is written, and the plain copy is never handed back as if drawn on

#### Scenario: A long file with one page chosen

- **WHEN** the 120,000-page test file is drawn on with only its first page chosen
- **THEN** one layer is drawn, progress counts one page, and the new file is no more than a few kilobytes larger than the plain copy written with object streams

### Requirement: What every page shares, counted once

A tool MAY tell the drawing step the encoded size of what every run makes and the new file holds once (`sharedBytes`, such as Sign PDF's picture). It SHALL be counted once against the size budget, before anything is drawn. When the chosen pages alone fit the budget and the shared bytes would pass it, the job SHALL stop with the size-limit failure marked `'shared'`; when the chosen pages alone pass it, with the plain size-limit failure. (SPEC.md: Definition of done)

#### Scenario: Shared bytes that fit

- **WHEN** a 12 MB stream shared by every run is drawn on a small file
- **THEN** the new file holds it once and is inside the budget

#### Scenario: Shared bytes that pass the budget

- **WHEN** the shared bytes are as large as the budget itself and the chosen pages alone fit
- **THEN** the job stops with the size-limit failure marked `'shared'` before any run is prepared or drawn

#### Scenario: Pages that pass the budget on their own

- **WHEN** the chosen pages alone pass the budget, whatever the shared bytes
- **THEN** the job stops with the plain size-limit failure, not marked `'shared'`, so a tool never blames what is shared

### Requirement: Each tool loads one fixed set at the pick

Each engine SHALL declare what its reading uses; its thumbnail code follows from how its thumbnails are drawn. On any pick, and whenever a reading worker starts, the worker SHALL load the engine and its reading libraries, then start the thumbnail code, all before it reads any file, without waiting for the thumbnail code. Which files are loaded, and in what order, SHALL come from the tool, never from a file. (SPEC.md: Rules for the code, 3 and 4; owner, 11 and 22 Nov 2026)

#### Scenario: A file is picked on a slow connection

- **WHEN** a visitor picks a file and the set is still loading
- **THEN** the file name is shown with "Getting ready" beside it, as before, and the file is read only once the engine and its reading libraries have loaded

#### Scenario: The thumbnail code is slow or fails

- **WHEN** PDF.js is slow to arrive or cannot be fetched
- **THEN** the file is still read and listed, its blank box stays, and the main button can be used once every file is read, as before

#### Scenario: A damaged file, or one that needs a password

- **WHEN** the file picked is damaged, or needs a password that has not been given
- **THEN** the damaged file state or the password field is shown as before, and the thumbnail code has been started all the same

#### Scenario: A pick that takes no file

- **WHEN** every file picked is of a kind the page does not take
- **THEN** the file's line is shown with "Getting ready" and its Remove button ("notes.docx, Getting ready"), or for several files the summary line with "Getting ready", until the set has loaded or failed, or for at most 60 seconds; then the picker returns with the sentence saying the file cannot be used, read out in the status line, and a worker whose set has not yet loaded is left to finish loading it before it is ended

#### Scenario: Remove during that wait

- **WHEN** the visitor presses Remove on that line while the set is loading
- **THEN** the wait ends, the worker is ended, and the picker returns as it does when the last file is removed

#### Scenario: A reading worker starts again

- **WHEN** a reading worker is started again, after a job, Cancel, a failure or a thumbnail that took too long
- **THEN** it loads the same set, in the same order, before it reads any file

#### Scenario: Keyboard only

- **WHEN** a visitor picks, with the keyboard, a file of a kind the page does not take
- **THEN** focus moves to the "Getting ready" line, Tab reaches its Remove button, and when the wait ends focus moves to the picker and the sentence is read out

### Requirement: A reading worker is not ended while its set is loading

Until a reading worker's pick set, thumbnail code included, has loaded or failed, the page SHALL end it only for the visitor's own actions, and a thumbnail waiting in that time SHALL be dropped by message. The thumbnail limit SHALL start only once the set has settled. When the page stops waiting (after 60 seconds), it SHALL NOT end the worker. (SPEC.md: Privacy, limits and security; owner, 22 Nov 2026)

#### Scenario: The thumbnail limit on a slow connection

- **WHEN** PDF.js's files take more than 10 seconds to arrive and a thumbnail is waiting for them
- **THEN** the worker is not ended; the 10-second limit starts only once the set has settled

#### Scenario: Another file or a password while the set loads

- **WHEN** the visitor adds a file or types a password while the set is still loading
- **THEN** any waiting thumbnail is dropped by message, and the same worker reads the file

#### Scenario: A signature picture chosen again while the set loads

- **WHEN** a Sign PDF picture is chosen again while the set is still loading and the earlier picture is still being read
- **THEN** the old worker is ended once its set has settled, or after 60 seconds, and the new read starts after that on a fresh worker

#### Scenario: A reading failure while the set loads

- **WHEN** reading a file fails, such as by running out of memory, while the set is still loading
- **THEN** the failure is shown once the set has settled, or after 60 seconds, as before, and the worker is ended only once its set has settled

#### Scenario: A thumbnail waiting longer than the page waits

- **WHEN** a thumbnail has waited 60 seconds for a set that has not settled
- **THEN** it gives no picture and is dropped by message, and the worker is kept until its set settles

#### Scenario: Removing the last file

- **WHEN** the visitor removes the last file while any worker of the page is still finishing its set
- **THEN** every worker of the page is ended at once, and none that was given a file, a password or a picture outlives the working area

#### Scenario: The visitor's own actions

- **WHEN** the visitor presses Cancel, "Start again" or the main button, removes the last file, or leaves the page while the set is loading
- **THEN** every worker of the page, any left to finish loading included, is ended at once, as before

### Requirement: Each job loads one fixed set in a fresh worker

Pressing the main button SHALL end the reading worker and run the job in a fresh worker. Before the engine sees any file, that worker SHALL load everything the tool's job can use, the zip step included, in a fixed order, whatever the file, the options, or how the job ends. A file loaded for the pick SHALL be loaded again only if the job uses it. (SPEC.md: Rules for the code, 3 and 4; owner, 22 Nov 2026)

#### Scenario: A job that fails early

- **WHEN** a Watermark job fails before it draws anything, such as when the file's pages cannot be read at the job
- **THEN** pdf-lib was loaded before the engine read the file, as it is for a job that succeeds

#### Scenario: A Compress PDF job on a file with no lossless picture

- **WHEN** Compress PDF runs on a file with no lossless picture, or with no picture at all
- **THEN** `fflate` was loaded before the engine read the file, as it is for a file with lossless pictures

#### Scenario: A thumbnail is being drawn when the button is pressed

- **WHEN** a thumbnail is still being drawn and the visitor presses the main button
- **THEN** the drawing stops, the reading worker is ended, and the job starts in a fresh worker with its progress shown, as before

#### Scenario: The job's set cannot be fetched

- **WHEN** a file of the job's set cannot be fetched
- **THEN** the job fails with "The tool could not be loaded. Check your connection and try again.", keeping the file, as before

### Requirement: Every library an engine asks for is declared

A unit test SHALL run every engine's reading, picture reading and job against every file in `tests/fixtures/` with a recording set of libraries, and SHALL fail if an engine asks for a library outside the set it declares for that step, if an engine declares no sets, or if a tool that can give several files does not declare the zip library for its job. In the browser, the worker SHALL refuse any library not declared for the step. (SPEC.md: Definition of done; Rules for the code, 2)

#### Scenario: A new engine asks for a library for some files only

- **WHEN** an engine asks for a library that its declared set does not name, for any fixture
- **THEN** the unit test fails, naming the engine, the step, the fixture and the library

#### Scenario: An undeclared library is asked for in the browser

- **WHEN** an engine asks the worker, during a step, for a library its declaration does not name for that step
- **THEN** nothing is fetched for it and the step fails as "The tool could not be loaded. Check your connection and try again."

#### Scenario: A new engine is added

- **WHEN** a file is added to `src/engines/tools/` without a declaration of its sets
- **THEN** the unit test fails

### Requirement: Finding where a page's content is

The shared drawing step SHALL also say, for one page of an open PDF, where its content is in the page's own unturned units, or that it is blank, or that it cannot be measured safely. It SHALL draw the page in the worker as a reader shows it, at a bounded number of pixels, read the pixels and add the annotation boxes a reader shows, making no request. Thumbnails and pictures of pages SHALL be drawn as before. (SPEC.md: Architecture and tech stack; Rules for the code, 2 and 3)

#### Scenario: A page is measured in Node

- **WHEN** the unit test measures a page of `text.pdf` with the Node canvas maker
- **THEN** it gets a box in the page's units that holds every line of text, with no request made

#### Scenario: A turned page with a user unit

- **WHEN** a page with `/Rotate 90`, an offset paper box and `/UserUnit 2` is measured
- **THEN** the box is in the page's own unturned units, and drawing the page clipped to that box shows all of its ink

#### Scenario: A refused character map

- **WHEN** a page needs a character map the fixed helper data does not hold
- **THEN** that page and every later page of the same open document are called unsafe to measure

#### Scenario: Pixels are bounded

- **WHEN** a poster-sized page or a page with a user unit of 1000 is measured
- **THEN** it is drawn at no more than the fixed number of pixels, and the canvas budget of the drawing step applies as for every drawing

#### Scenario: A page too thin to draw whole

- **WHEN** a page of 1 by 100,000,000 points is measured, so its drawing at the pixel cap cannot cover the whole page
- **THEN** it is called unsafe to measure

#### Scenario: A drawing that fails

- **WHEN** drawing a page throws an error other than PDF.js stopping
- **THEN** that page is called unsafe to measure, and the next page is measured

#### Scenario: Other drawings are unchanged

- **WHEN** thumbnails, PDF to JPG and PDF to PNG run after this step is added
- **THEN** their unit and end-to-end tests pass unchanged

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

Every inflating step, in the content reader and the shared zlib steps, SHALL, once 66.5 KiB of input in a row makes no output, push the next piece as the final one and nothing after it: data that had already ended is read as it was, data whose final block ends in that piece is read whole, and any other data is refused, so bytes after the end take no time growing with their square and the data is never cut short at a prefix. (SPEC.md: Privacy, limits and security)

#### Scenario: Blocks that make nothing, lined up with the pieces

- **WHEN** Flate data makes some drawing, then about 70 KiB of empty blocks lined up with the 1 KiB pieces, then more drawing that zlib reads
- **THEN** the reader, the shared inflate with a cap and the first-bytes step each refuse it, in under a second, and none gives the first part alone

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

- **WHEN** a small stream, alone and in a two-step chain, is decoded with every buffer the reader makes counted
- **THEN** none is over 4 KiB and they come to under 64 KiB, as a step's pieces start at 4 KiB and are made only when written to

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
