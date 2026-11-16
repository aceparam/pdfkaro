# pdf-to-images

## ADDED Requirements

### Requirement: Two pages, one tool

The tool SHALL be served at `/pdf-to-jpg` and `/pdf-to-png` from one registry entry. Each page SHALL set its format through its preset, with no option on the page, and SHALL have its own title tag, meta description, heading and sentence, the sentence ending "Files stay on your device." (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The JPG page is opened

- **WHEN** a visitor opens `/pdf-to-jpg`
- **THEN** the title tag is "Convert PDF to JPG in your browser - PDFkaro", the heading "Convert PDF to JPG", the sentence "Turn each page of a PDF into a JPG picture. Files stay on your device.", and the main button "Convert to JPG and download"

#### Scenario: The PNG page is opened

- **WHEN** a visitor opens `/pdf-to-png`
- **THEN** the title tag is "Convert PDF to PNG in your browser - PDFkaro", the heading "Convert PDF to PNG", the sentence "Turn each page of a PDF into a PNG picture. Files stay on your device.", and the main button "Convert to PNG and download"

### Requirement: Each page has its own text

The text below the tool SHALL be 250 to 500 words on each page, written for that page's search, marked as a draft, and no text SHALL be the other with a word swapped. (SPEC.md: SEO, Every tool page and Specific-search pages)

#### Scenario: The texts are compared

- **WHEN** the two texts are read side by side
- **THEN** the JPG page answers questions about photos, sharing and file size, and the PNG page about sharp text, screenshots and lossless pictures

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop or paste; a second file SHALL replace the first, and a file that is not a PDF SHALL be refused with a sentence naming it. Once read, the file SHALL be listed as one row with a thumbnail of its first page, its page count and its size. (SPEC.md: Tool page anatomy, 3 and 4)

#### Scenario: A file is chosen

- **WHEN** a visitor chooses `report.pdf` of 12 pages
- **THEN** it is listed as one row with "12 pages" and its size, and the main button is shown

### Requirement: Every page becomes a picture

Pressing the main button SHALL draw every page, in order, as one picture in the page's format: at 150 pixels to the inch of the page's own size, scaled down to at most 25 million pixels, on white, with form fields drawn with their values and notes and stamps as the page shows them. JPG pictures SHALL be quality 85; PNG pictures SHALL be without loss. The PDF itself SHALL not be changed. (SPEC.md: Tool catalogue; Architecture and tech stack, PDF.js)

#### Scenario: An A4 page

- **WHEN** an A4 page is converted
- **THEN** its picture is 1240 by 1754 pixels

#### Scenario: A page turned sideways in the file

- **WHEN** a page carries a quarter turn (`/Rotate 90`)
- **THEN** its picture is drawn turned, as a PDF reader shows it

#### Scenario: A poster-sized page

- **WHEN** a page is 100 by 100 inches
- **THEN** its picture is 5000 by 5000 pixels, not 15000 by 15000

#### Scenario: A filled form

- **WHEN** `form.pdf` with typed values is converted
- **THEN** the values show in the picture

### Requirement: The result

A one-page PDF SHALL give one picture named after the file (`report.jpg`). A longer one SHALL give one zip named after the file (`report.zip`) holding `report-page-01.jpg` and so on, in order. The result SHALL show the name, the size and how many pictures, a Download button and "Start again", and nothing SHALL download until the visitor presses Download. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A 12-page file

- **WHEN** a 12-page `report.pdf` is converted to PNG
- **THEN** the result is `report.zip`, holding 12 pictures, `report-page-01.png` to `report-page-12.png`, and no download has started

#### Scenario: A one-page file

- **WHEN** a one-page `menu.pdf` is converted to JPG
- **THEN** the result is `menu.jpg`

### Requirement: Text in fonts a PDF does not embed

The pictures SHALL be drawn with the owner's fixed set of PDF.js helper data (11 Nov 2026), which holds no character maps, and the page text SHALL say that Chinese, Japanese and Korean text in fonts the PDF does not embed may be missing from the pictures. (CLAUDE.md: Owner decisions)

#### Scenario: The page text is read

- **WHEN** the text below either tool is read
- **THEN** it says such text may be missing, in plain words

### Requirement: Progress and cancel

While the job runs the page SHALL show "Page 3 of 12" with a Cancel button, then "Writing the zip" for a zip. Cancel SHALL stop the work and return to the file. The page MUST stay responsive. (SPEC.md: States every tool handles; Rules for the code, 3)

#### Scenario: A job is running

- **WHEN** a 12-page file is converted
- **THEN** the page shows "Page 3 of 12", a bar that never goes back, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel
- **THEN** the work stops and the file is listed as before

### Requirement: A file that needs a password

A protected file SHALL show a password field with a note that the password stays in the browser; a wrong password SHALL say so; the pictures SHALL be drawn with the right password. (SPEC.md: States every tool handles)

#### Scenario: A protected file

- **WHEN** `password.pdf` is converted with its password
- **THEN** its three pages become three pictures

### Requirement: A damaged file

A file that cannot be read SHALL be shown as damaged, naming it, with "Choose another file". (SPEC.md: States every tool handles)

#### Scenario: A damaged file is chosen

- **WHEN** `damaged-xref.pdf` is chosen
- **THEN** the page says it is damaged and cannot be read

### Requirement: A job that fails

When drawing fails, the engine cannot be fetched, memory runs out, or the zip would pass its limits, the page SHALL say what happened in one sentence and one thing to try, keeping the file. (SPEC.md: States every tool handles)

#### Scenario: Out of memory

- **WHEN** the engine runs out of memory
- **THEN** the page says the browser ran out of memory and to try a smaller file or a computer

### Requirement: Large files

A file over 100 MB, or over 20,000 pages, SHALL show the notice the other tools show, and the job SHALL still run. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 20,000 pages)

#### Scenario: The file passes 100 MB

- **WHEN** a 110 MB file is listed
- **THEN** the notice is shown and the main button works

### Requirement: Nothing is uploaded

No request that leaves the page SHALL carry the file's contents, its name or its password. After a pick the page SHALL fetch only the site's own files the tool needs. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the no-upload test converts `rich.pdf` under a telling name, `tagged.pdf`, and `password.pdf` with its password, on both pages, and downloads each result
- **THEN** every request is to the site's own files on an exact list taken from the build (with PDF.js, its worker and data, the engine and `fflate`, and no pdf-lib), and no request, header, console line or page title holds the file name, its stem, the password, `rich.pdf`'s bookmark titles, attachment name and title, or `tagged.pdf`'s `SECRET-` markers

### Requirement: Keyboard and screen reader use

Every part of the tool SHALL work with a keyboard alone and with a screen reader: the picker, the password field, the main button, Cancel, Download and Start again; progress and the result are announced. (SPEC.md: Definition of done)

#### Scenario: The job is done by keyboard

- **WHEN** a visitor uses only Tab, Enter and Space
- **THEN** they can choose a file, convert it and download the result
