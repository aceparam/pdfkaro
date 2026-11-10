# tool-engines Specification

## Purpose

How the code that processes files is shaped: pure engine functions, run in a Web Worker, loaded only after a file is picked, using the libraries the tech stack names. Derived from "Architecture and tech stack" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: Engines are pure functions

Each operation SHALL be a function of the form `(files: Uint8Array[], options) => Promise<Uint8Array[]>` with a progress callback, in its own file under `src/engines/`. An engine MUST NOT touch the DOM, so that it can be unit tested in Node. (SPEC.md: Rules for the code, 2)

#### Scenario: An engine is run in Node

- **WHEN** an engine's unit tests run under Vitest in Node with no browser
- **THEN** the engine runs and returns its output

#### Scenario: An engine reaches for the page

- **WHEN** an engine file refers to `window`, `document` or any DOM type
- **THEN** the change is rejected in review

### Requirement: Engines run in a Web Worker

Every engine SHALL run in a Web Worker. The UI thread MUST NOT parse, render or write a file, and MUST NOT be blocked for more than 100 ms. (SPEC.md: Rules for the code, 3; Definition of done, Each tool)

#### Scenario: A large job runs

- **WHEN** a 500-page file is processed
- **THEN** no task on the UI thread runs longer than 100 ms and the page still responds to input

### Requirement: Typed worker messages with progress and cancel

The page and the worker SHALL talk through typed messages kept in `src/workers/`, covering start, progress, done, error and cancel. Progress SHALL be reported in real units. Cancel SHALL stop the work. (SPEC.md: Repo layout; Tool page anatomy, States; CLAUDE.md: Phase 0, step 5)

#### Scenario: Progress is reported

- **WHEN** an engine finishes page 14 of 120
- **THEN** the worker sends a progress message carrying 14 and 120

#### Scenario: A job is cancelled

- **WHEN** the page sends cancel while a job is running
- **THEN** the work stops, its memory is released and no done message follows

### Requirement: Engines load late

WebAssembly and engine code SHALL be fetched when the visitor picks a file, not when the page loads. (SPEC.md: Rules for the code, 4)

#### Scenario: A page loads and no file is chosen

- **WHEN** a tool page finishes loading and the visitor has not picked a file
- **THEN** no WebAssembly file and no engine script has been requested

#### Scenario: A file is picked

- **WHEN** the visitor picks a file
- **THEN** the engine for that tool is fetched and the page shows the engine loading state meanwhile

### Requirement: The library for each job

Engines SHALL use the library that the tech stack table in `SPEC.md` names for the job. A different choice MUST be justified in the change's design. (SPEC.md: Architecture and tech stack)

#### Scenario: A page-structure tool is designed

- **WHEN** a tool merges, splits, rotates, deletes, reorders, encrypts, decrypts or repairs
- **THEN** it uses qpdf compiled to WebAssembly

#### Scenario: A drawing tool is designed

- **WHEN** a tool adds page numbers, a watermark or a signature, turns images into a PDF, or fills a form
- **THEN** it uses `@cantoo/pdf-lib`

#### Scenario: A rendering tool is designed

- **WHEN** a tool shows thumbnails, turns a PDF into images or extracts text
- **THEN** it uses PDF.js (`pdfjs-dist`)

#### Scenario: Compression or OCR is designed

- **WHEN** a tool compresses a PDF or reads text from a scan
- **THEN** it uses Ghostscript compiled to WebAssembly for compression and Tesseract.js for OCR

### Requirement: Ghostscript waits for the licence decision

Ghostscript MUST NOT be added to the repo, and no `LICENSE` file SHALL be added, until the owner confirms the licence decision. (SPEC.md: Open decisions, Licence; CLAUDE.md: Questions waiting for the owner)

#### Scenario: Compress PDF is proposed

- **WHEN** a change needs Ghostscript and the owner has not confirmed the licence
- **THEN** the change is blocked and the owner is asked

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

The site SHALL be built with Astro with static output and TypeScript. Interactive parts SHALL be Preact islands, and only the tool widget SHALL ship JavaScript. Styling SHALL be hand-written CSS: one global stylesheet at `src/styles/site.css` plus scoped component styles. Tailwind, component kits and icon libraries MUST NOT be used. (SPEC.md: Architecture and tech stack)

#### Scenario: A page is built

- **WHEN** a tool page is built
- **THEN** the output is static HTML with one island for the tool widget and no script for the rest of the page

### Requirement: Repo layout

Code SHALL sit where the repo layout says: `src/tools/registry.ts`, `src/engines/`, `src/workers/`, `src/components/`, `src/pages/`, `src/content/`, `src/styles/site.css`, `server/`, `tests/fixtures/`, `public/` and `LICENSES.md`. (SPEC.md: Repo layout)

#### Scenario: An engine is added

- **WHEN** a change adds an engine
- **THEN** it is one file under `src/engines/` and its worker entry is under `src/workers/`

### Requirement: Shared components are reused

Tools SHALL reuse `ToolShell`, `FilePicker`, `PageGrid` and `Result`. A tool that needs a new shared component SHALL add it in its own pull request first. (SPEC.md: Build phases, 3)

#### Scenario: A tool needs a new shared part

- **WHEN** a tool's design calls for a shared component that does not exist
- **THEN** that component is proposed and merged as its own change before the tool's change

### Requirement: Tests

Engines SHALL have unit tests in Vitest. Each tool SHALL have one end-to-end test in Playwright. (SPEC.md: Architecture and tech stack; Definition of done)

#### Scenario: A tool is finished

- **WHEN** a tool is called done
- **THEN** its engine unit tests and its one end-to-end test exist and pass, with none skipped
