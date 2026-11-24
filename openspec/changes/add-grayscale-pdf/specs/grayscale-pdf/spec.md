## Purpose

What the Grayscale PDF tool at `/grayscale-pdf` does: the colours of one PDF shown and printed as grey, with its text kept searchable and its links and forms working, what is left as it is, how drawing instructions are read safely, what the new file keeps, and every state the page shows (the owner's decision of 24 Nov 2026, "Everything, kept as text").

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/grayscale-pdf` with the title, heading and sentence below, and a meta description that says the file stays on the device and is not uploaded. It SHALL be listed under "Make smaller and fix" after the five Compress to a target size pages, and the hub's description SHALL name turning a PDF grey. Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/grayscale-pdf`
- **THEN** the title is "Convert a PDF to grayscale in your browser - PDFkaro", the heading "Convert a PDF to grayscale", the sentence "Turn the colours in a PDF to shades of grey, keeping its text. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page and the hub list it

- **WHEN** the site is built
- **THEN** "Grayscale PDF" is listed under "Make smaller and fix" right after "Compress PDF to 2 MB" on the home page and on `/make-smaller-and-fix`, and the hub's description still names upload limits and now names turning a PDF grey

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line, then the main button "Convert to grayscale and download", which works with nothing else to choose. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the main button, as on every tool, is shown but cannot be used yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page and "12 pages, 1.4 MB", then "Convert to grayscale and download", and the status region says "report.pdf, 12 pages, 1.4 MB."

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with the note that the password stays in the browser. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the main button is not, and focus moves to the field

#### Scenario: The right password is given

- **WHEN** the visitor types `open-sesame` and presses Enter
- **THEN** the file is read and listed, and the job can run

### Requirement: A damaged file, and very large files

A file qpdf cannot read SHALL be named with a sentence saying it seems to be damaged and one thing to try, with no Repair PDF link until Repair PDF is published. A file over 100 MB, or over 20,000 pages, SHALL show the shared notice and still run. (SPEC.md: States every tool handles, Damaged file and Too large; Privacy, limits and security, Browser tools; CLAUDE.md: Owner decisions, 13 Nov 2026)

#### Scenario: A damaged file

- **WHEN** a visitor chooses `damaged-cut.pdf`
- **THEN** the page says the file seems to be damaged, shows no main button, and offers to choose another file

#### Scenario: A file over 100 MB

- **WHEN** a visitor chooses a 110 MB PDF
- **THEN** the shared notice says the job may be slow or run out of memory on a phone, and the main button still works

### Requirement: Colours become grey through a grey stand-in

The tool SHALL show and print as grey every colour in `DeviceRGB`, `DeviceCMYK`, `CalRGB`, or an ICC-based space of three or four components each ranging 0 to 1, in drawing, pictures and shadings, by pointing each place that names such a space at a shared grey stand-in of the same number of components, and by rewriting only `rg`, `RG`, `k`, `K` and device operands of `cs`/`CS` into it, numbers kept. No picture SHALL be decoded. (SPEC.md: Tool catalogue; CLAUDE.md: Owner decisions, 24 Nov 2026)

#### Scenario: Where colours are reached

- **WHEN** colours are drawn in page content, form XObjects, tiling patterns, Type 3 glyphs and annotation appearance streams
- **THEN** each of them is converted, and no page is drawn as a picture

#### Scenario: The grey formula

- **WHEN** a colour is shown through a stand-in
- **THEN** its grey is 0.3 R + 0.59 G + 0.11 B, a CMYK colour first converted by the PDF standard's simple rule (red = 1 − min(1, cyan + black), and so on)

#### Scenario: RGB text and shapes

- **WHEN** a page draws red text with `1 0 0 rg` and a blue line with `0 0 1 RG`
- **THEN** in the result they read `/GreyRGB cs 1 0 0 sc` and `/GreyRGB CS 0 0 1 SC`, and PDF.js draws them as greys of 0.3 and 0.11

#### Scenario: A form that inherits the colour space

- **WHEN** a form with no `cs` of its own draws `0.2 0.4 0.6 sc` and is drawn once after `1 0 0 rg` and once after `/CS0 cs` with an ICC-based RGB space
- **THEN** both drawings come out neutral grey, and the form's own stream is unchanged

#### Scenario: A picture and a shading

- **WHEN** a page shows an RGB JPG, an indexed picture with an RGB palette and an axial RGB shading
- **THEN** each one's colour space points at the RGB stand-in (the palette's base for the indexed one), their data, palette bytes and functions are unchanged, and PDF.js draws every pixel neutral, within 2 of the original pixel's grey on average

#### Scenario: CMYK

- **WHEN** a page fills a rectangle with `0 1 0 0 k`
- **THEN** it reads `/GreyCMYK cs 0 1 0 0 sc` and is drawn as the grey 0.41

#### Scenario: The stand-in name is already used

- **WHEN** a `/ColorSpace` dictionary in the file already has a key `GreyRGB`
- **THEN** the tool uses `GreyRGB1`, and the existing entry is unchanged

### Requirement: Colours of notes, fields and bookmarks

The colours a reader draws notes, form fields and bookmarks with (`/C`, `/IC`, a widget's `/MK` `/BG` and `/BC`, a bookmark's `/C`) SHALL be written as neutral values with the same count of numbers. A `/DA` string's `rg` or `k` SHALL become a `g` with the grey. `/DS` and `/RC` styles SHALL be left as they are. (SPEC.md: Definition of done, Each tool; CLAUDE.md: Owner decisions, 24 Nov 2026)

#### Scenario: Counts are kept

- **WHEN** a colour array has three numbers, or four
- **THEN** three become three equal numbers, four become `0 0 0` and the black of the grey, and arrays of one or no number, or already neutral, are unchanged

#### Scenario: A highlight and a field

- **WHEN** a highlight has `/C [1 1 0]` and a field has `/MK << /BG [1 0 0] >>` and `/DA (/Helv 12 Tf 1 0 0 rg)`
- **THEN** the result has `/C [0.89 0.89 0.89]`, `/BG [0.3 0.3 0.3]` and `/DA (/Helv 12 Tf 0.3 g)`, and typing into the field in a reader shows grey text

### Requirement: What is left as it is

The tool SHALL leave exactly as they were the kinds of colour it cannot convert safely, and every stream read with doubt, and SHALL name these kinds in the result notes and the text below the tool. (SPEC.md: What we are building, honest about limits; CLAUDE.md: Owner decisions, 24 Nov 2026)

#### Scenario: The kinds left

- **WHEN** a file holds `Separation` or `DeviceN` colours (other than already grey ones), Lab colours, ICC-based colours with other ranges, JPEG 2000 pictures, inline pictures, a form named only as a soft mask's group, an appearance stream or tiling pattern with no resources of its own, transparency group or output intent colour spaces, rich-text styles or colours set by scripts
- **THEN** each of them is left byte for byte as it was

#### Scenario: A spot colour

- **WHEN** a page fills a shape in a `Separation` colour with a CMYK alternate
- **THEN** that operator, its colour space and its drawing are byte for byte as before, and the rest of the page is grey

#### Scenario: The notes name what is left

- **WHEN** the result is shown
- **THEN** a note says spot colours, Lab colours, JPEG 2000 pictures, small pictures stored inside a page's drawing instructions, and any part that could not be read with certainty are left in colour

### Requirement: Drawing instructions are read safely

Drawing instructions SHALL be decoded by the engine, never by qpdf, with caps per stream and per job, and split into tokens by strict rules; any doubt SHALL leave the whole stream, or for a page's contents every stream of that page, exactly as it was. Every byte outside an edit SHALL be unchanged. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: What is decoded

- **WHEN** a stream is filtered with Flate, ASCII85 or ASCIIHex (at most two, no parameters) and decodes to at most 64 MiB
- **THEN** it is decoded from raw data qpdf read with no decoding; any other filter, parameters or more data leaves the stream as it is

#### Scenario: What is doubt

- **WHEN** a stream holds a control or non-ASCII byte outside a string or name, braces, an unbalanced string, array or dictionary, a wrong operand count for an edited operator, or ends inside a token or with operands waiting
- **THEN** that stream is byte for byte as before

#### Scenario: A glued token

- **WHEN** a page's content holds `0.5 0.5 0.5rg`
- **THEN** that stream is byte for byte as before

#### Scenario: An inline picture with an unclear end

- **WHEN** a stream holds an inline picture whose data contains ` EI ` before its real end
- **THEN** that stream is byte for byte as before

#### Scenario: A decode bomb

- **WHEN** one content stream inflates to 1 GB
- **THEN** decoding stops at 64 MiB, that stream is left as it is, and the job goes on

#### Scenario: Many decode bombs

- **WHEN** a small file holds 20 such streams
- **THEN** the job stops at the content budget of `min(2 GiB, 512 MiB + 200 × the plain copy's length)` decoded bytes, under "The file was not converted.", with "The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it." and "Go back to your file"

#### Scenario: Only the edits change

- **WHEN** any result is compared with its input
- **THEN** every decoded drawing stream holds the same tokens in the same order outside the edited operators, and PDF.js reads the same text at the same places on every page

### Requirement: What the new file keeps

The new file SHALL keep every page, its searchable text, links, form fields and their values, notes, bookmarks, attached files, tags and the document's details; remove each page's `/Thumb`; have no password and no restrictions; and pass `qpdf --check`. The page SHALL say what is not kept and that the colours stay stored underneath. (SPEC.md: Definition of done, Each tool; CLAUDE.md: Owner decisions, 13 Nov 2026)

#### Scenario: What the page says

- **WHEN** the result or the text below the tool is read
- **THEN** it says that earlier saved versions are not kept, that a digital signature stops being valid, and that the colours stay stored in the file underneath, so a program that takes pictures out may get them in colour and the file does not get smaller

#### Scenario: A file with bookmarks, a link and an attachment

- **WHEN** `rich.pdf` is converted
- **THEN** its two bookmarks, its link and `note.txt` are kept, and the result passes `qpdf --check`

#### Scenario: A protected file

- **WHEN** `password.pdf` is converted with its password
- **THEN** the result opens with no password and has no restrictions, and the page has said so

### Requirement: A file with nothing to change

When nothing in the file would change, the engine SHALL give no file and the page SHALL show the heading "Nothing in this file needed turning grey." with "No new file was made. Its pages already use only grey, or only kinds of colour this tool leaves as they are. You can use your file as it is.", focus on the heading, no Download and "Start again". Black set as RGB counts as a change. (SPEC.md: States every tool handles, Done)

#### Scenario: A grey-only file

- **WHEN** a file drawn only with `g`, `G` and `DeviceGray` pictures is converted
- **THEN** no file is made and the page shows that heading and those words

### Requirement: Working, done and failed

While the job runs the page SHALL show progress in real units with a bar that never goes back and a Cancel button. When done, the result SHALL show the new file with a Download button and the three notes; nothing downloads on its own. A failure SHALL show one sentence and "Go back to your file". (SPEC.md: States every tool handles, Working, Done and Failed; Details that apply everywhere)

#### Scenario: A job runs to the end

- **WHEN** a visitor converts `report.pdf` of 12 pages
- **THEN** the page shows "Reading the file", "Page 1 of 12" to "Page 12 of 12", then "Writing the grayscale file", then "Your grayscale file is ready" with `report-grayscale.pdf`, its size and Download, and focus moves to the result heading

#### Scenario: Cancel

- **WHEN** the visitor presses Cancel during the job
- **THEN** the worker is ended, and the row and the main button are shown again, with no password asked again

#### Scenario: A failure

- **WHEN** a job fails
- **THEN** the page shows "The file was not converted." with one sentence and "Go back to your file"

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says so with "Try on a computer, or split the file first and convert the parts."

### Requirement: Nothing is uploaded

No request SHALL carry the file's contents, its name or its password, and no page or worker SHALL log them. The tool's no-upload test SHALL convert a protected coloured file and three fixtures with marked strings and find none of them in any request, header, title, storage, address or console, with an exact allowlist of the site's own files read from the build. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test converts `qz7report.pdf`, which needs a password and holds `SECRET-` strings in its text, a link, a destination, a bookmark and a field, and downloads the result
- **THEN** no request, header, title, storage entry, address or console line holds the name, its stem, the password or its fragments, or any `SECRET-` string, plain or URL-encoded, and every request is in the allowlist, with no PDF.js, pdf-lib or other engine in the job

### Requirement: The same requests for every file

Which of the site's own files the page fetches SHALL depend on the tool only, never on the file: the read and draw sets after every pick, and qpdf, `fflate` and the engine's chunks in every job. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 22 Nov 2026)

#### Scenario: The uniform-requests test

- **WHEN** `uniform-requests.spec.ts` runs `/grayscale-pdf` with every pick, a coloured file, a grey-only file and a failing job
- **THEN** each phase fetches the same files for every input

### Requirement: Keyboard and screen reader

The whole flow SHALL work with a keyboard alone and with a screen reader. (SPEC.md: Definition of done, Each tool)

#### Scenario: Keyboard only

- **WHEN** a keyboard user chooses a file with the picker, tabs to the main button and presses Enter
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step, and Download is reached by Tab

#### Scenario: Screen reader

- **WHEN** a screen reader user runs a job
- **THEN** the row is announced once read, progress is read in real units ("Page 3 of 12"), and the result heading is announced when focus moves to it

### Requirement: Page text and the Privacy draft

The text below the tool SHALL be 250 to 500 words of steps and real questions, marked as a draft for the owner, with nothing from "Banned patterns". The Privacy page draft SHALL say that Grayscale PDF keeps the original colours in the new file. (SPEC.md: SEO, Every tool page; Look and feel; Privacy, limits and security, Whole site)

#### Scenario: The text is built

- **WHEN** the page is built with scripts off
- **THEN** the steps and questions are in the served HTML, including "Will this make my file smaller?" and "What stays in colour?", saying what stays in colour, that the colours stay stored underneath and the file does not get smaller, and that the text stays searchable

#### Scenario: The Privacy draft

- **WHEN** `/privacy` is built
- **THEN** it says Grayscale PDF shows colours in grey but keeps the original colours in the new file, and the privacy page test checks that sentence
