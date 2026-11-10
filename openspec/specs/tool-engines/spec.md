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

- **WHEN** an engine file uses `window`, `document`, `navigator`, `localStorage` or a DOM type
- **THEN** lint or the engine's Node unit tests fail

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

#### Scenario: OCR is designed

- **WHEN** a tool reads text from a scan
- **THEN** it uses Tesseract.js

#### Scenario: Compression is designed

- **WHEN** a tool compresses a PDF
- **THEN** it uses the library the owner has confirmed, and Ghostscript compiled to WebAssembly is only the assumed default until the licence decision is made

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

The site SHALL be built with Astro with static output and TypeScript. The interface SHALL be written as React components. A component with no interaction SHALL be rendered to static HTML at build time and ship no JavaScript. Interactive parts SHALL be React islands, and on a tool page only the tool widget SHALL ship JavaScript. Styling SHALL be hand-written CSS: one global stylesheet at `src/styles/site.css` plus scoped component styles. Tailwind, component kits and icon libraries MUST NOT be used. (SPEC.md: Architecture and tech stack; React in place of Preact by the owner's decision of 10 Nov 2026, recorded in CLAUDE.md)

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
