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
