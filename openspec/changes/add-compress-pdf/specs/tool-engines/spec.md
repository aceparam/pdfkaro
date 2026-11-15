# tool-engines

## MODIFIED Requirements

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
