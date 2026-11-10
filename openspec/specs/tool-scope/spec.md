# tool-scope Specification

## Purpose

The limits on what particular tools do and do not do, so that each tool's own change starts from the right scope. Derived from "Scope notes for specific tools" and "What we are building" in `SPEC.md`, which stays the source of truth if the two ever differ. Full behaviour for each tool is specified in that tool's own capability when it is built.

## Requirements

### Requirement: Browser first

A tool SHALL run in the visitor's browser unless the catalogue marks it "Server". A tool MUST NOT be moved to the server without the owner's word. (SPEC.md: What we are building, rule 2)

#### Scenario: A browser tool is designed

- **WHEN** a design for a tool marked "Browser" is written
- **THEN** it processes the file in a Web Worker on the visitor's device and makes no upload

### Requirement: Nothing between the visitor and the download

No tool SHALL require an account, add a watermark the visitor did not ask for, or show a daily limit or upgrade prompt. (SPEC.md: What we are building, rule 3)

#### Scenario: A visitor finishes a job

- **WHEN** a tool produces a result
- **THEN** the visitor can download it at once, without signing in and without any mark added to the file

### Requirement: Honest about limits

When a tool will do a poor job on the chosen file, the page SHALL say so and MUST NOT hand back a broken result as if it were good. (SPEC.md: What we are building, rule 4)

#### Scenario: A scanned page is given to PDF to Word

- **WHEN** a visitor chooses a scanned PDF with no text layer in PDF to Word
- **THEN** the page says the tool works poorly on scans and what to try, before or in place of a result

### Requirement: Unlock removes a known password only

Unlock PDF SHALL remove a password the visitor types in and SHALL remove print and edit restrictions. It MUST NOT guess or crack an unknown password. (SPEC.md: Scope notes)

#### Scenario: The visitor knows the password

- **WHEN** the visitor types the correct password
- **THEN** the result opens with no password and no restrictions

#### Scenario: The visitor does not know the password

- **WHEN** the visitor types a wrong password
- **THEN** the page says the password is wrong and tries no others

### Requirement: Redact removes the content

Redact SHALL remove redacted content from the file and MUST NOT only draw a box over it. Redacted pages SHALL be turned into images so the text underneath cannot be copied out, and the page SHALL say so. (SPEC.md: Scope notes)

#### Scenario: Text is extracted from a redacted file

- **WHEN** text is extracted from the output of Redact
- **THEN** none of the redacted text is present anywhere in the file

### Requirement: Sign PDF places a signature image

Sign PDF SHALL place a drawn, typed or uploaded signature image on the page. Certificate signatures SHALL be the separate phase 3 tool. (SPEC.md: Scope notes)

#### Scenario: A visitor signs a page

- **WHEN** a visitor draws a signature and places it
- **THEN** the result has the signature image at that place and carries no certificate signature

### Requirement: Edit PDF adds on top of the page

Edit PDF SHALL add text, images, shapes, highlights and whiteout on top of a page. It MUST NOT offer to rewrite the existing text of a PDF in place. (SPEC.md: Scope notes)

#### Scenario: A visitor wants to change existing words

- **WHEN** a visitor opens Edit PDF
- **THEN** the tools offered are add text, add image, shapes, highlight and whiteout, and none edits existing text in place

### Requirement: Compress to a target size is one tool with preset pages

Compress to a target size SHALL be one tool. Each preset page (`/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb`, `-2mb`) SHALL open the compressor with that target already selected. (SPEC.md: Scope notes)

#### Scenario: A preset page is opened

- **WHEN** a visitor opens `/compress-pdf-to-200kb` and chooses a file
- **THEN** the target of 200 KB is already selected and the main button works without touching any option

### Requirement: PDF to Office tools state their limits

PDF to Word, PDF to Excel and PDF to PowerPoint SHALL use open-source conversion until the owner decides otherwise, and each page SHALL say the tool works best on simple text documents. (SPEC.md: Scope notes; Open decisions)

#### Scenario: A PDF to Word page is read

- **WHEN** a visitor opens PDF to Word
- **THEN** the page says, before a file is chosen, that it works best on simple text documents

### Requirement: No AI tools

The site SHALL NOT include summarise, chat with a PDF or translate tools until the owner decides otherwise. (SPEC.md: Scope notes; Open decisions)

#### Scenario: An AI tool is proposed

- **WHEN** a change proposes a tool that sends document text to a model provider
- **THEN** the change is stopped and the owner is asked
