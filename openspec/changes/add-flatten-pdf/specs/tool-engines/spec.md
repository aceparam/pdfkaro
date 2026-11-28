# Spec Delta

## MODIFIED Requirements

### Requirement: The library for each job

Engines SHALL use the library that the tech stack table in `SPEC.md` names for the job, or the owner's later choice. A different choice MUST be justified in the change's design. (SPEC.md: Architecture and tech stack; CLAUDE.md: Owner decisions, 13 Nov 2026 and 28 Nov 2026)

#### Scenario: A page-structure tool is designed

- **WHEN** a tool merges, splits, rotates, deletes, reorders, encrypts, decrypts or repairs
- **THEN** it uses qpdf compiled to WebAssembly

#### Scenario: A file qpdf cannot read is repaired

- **WHEN** Repair PDF is given a file qpdf cannot open
- **THEN** it reads the file with `@cantoo/pdf-lib` after our own pre-pass, with pdf-lib's decoders and parser guarded, and qpdf writes and checks the result, by the owner's decision of 28 Nov 2026

#### Scenario: Form fields and comments are flattened

- **WHEN** Flatten PDF draws a file's form fields and comments into its pages
- **THEN** it uses qpdf's own flattening and field drawing, with our own steps before and after it, and no pdf-lib; the tech stack table names no library for flattening, and the choice is justified in `add-flatten-pdf`'s design

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
