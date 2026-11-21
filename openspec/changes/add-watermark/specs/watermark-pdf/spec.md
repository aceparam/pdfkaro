# watermark-pdf

## Purpose

What the Watermark tool at `/watermark-pdf` does: it draws the visitor's own text across every page of one PDF, in the visitor's browser, and leaves the rest of the file as it was.

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/watermark-pdf` with the title tag "Add a watermark to a PDF in your browser - PDFkaro", the heading "Add a watermark to a PDF" and the sentence "Put your own text across every page of a PDF. Your file stays on your device." Its meta description SHALL say the file stays on the device and is not uploaded. It SHALL be listed second under "Edit and sign". (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/watermark-pdf`
- **THEN** the heading, sentence and title are as above, the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page lists it

- **WHEN** the home page is built
- **THEN** "Watermark" is the second link under "Edit and sign", after "Add page numbers"

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed with the text field

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove ("Choose another file" replaces it) and no summary line above it; the field "Watermark text" SHALL follow it, empty and focused, then the main button, waiting. (SPEC.md: Tool page anatomy, 4; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the field is not shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page and "12 pages, 1.4 MB", with no Remove, then the empty field "Watermark text" with its hint, focused, then "Add watermark and download" with "Type the watermark text first." under it and read with it, and the status region says "report.pdf, 12 pages, 1.4 MB."

### Requirement: The watermark text

The field SHALL take up to 50 characters on one line, of the standard fonts' characters: letters from English and other Western European languages, numbers and common marks. The main button SHALL wait until text is typed. Other characters, or more than 50, SHALL be refused with a sentence, as every text field does. The engine SHALL refuse any text the field would refuse, before reading the file. (SPEC.md: Tool page anatomy, 4 and 5; What we are building, rule 4)

#### Scenario: Nothing is typed

- **WHEN** the visitor presses "Add watermark and download" with the field empty or holding only spaces
- **THEN** nothing happens, no code for the job is fetched, and the button reads "Type the watermark text first." to a screen reader

#### Scenario: Text is typed

- **WHEN** the visitor types "Draft for review" and presses Enter
- **THEN** the job starts, as if the main button had been pressed

#### Scenario: Hindi is typed

- **WHEN** the visitor types "मसौदा"
- **THEN** the field is marked invalid, the page says "Use letters from English and other Western European languages, numbers and common marks." with no list of characters, the main button does nothing, and no question marks are ever drawn

#### Scenario: A few characters from other Latin alphabets

- **WHEN** the visitor types "Łódź"
- **THEN** the page says "Ł and ź cannot be used. Use letters from English and other Western European languages, numbers and common marks."

#### Scenario: Accented Western European letters

- **WHEN** the visitor types "Brouillon – à relire"
- **THEN** it is taken, and every page shows those characters as typed

#### Scenario: Too much text

- **WHEN** the visitor pastes 63 characters
- **THEN** the field keeps all 63, the page says "This text has 63 characters. Use 50 or fewer.", and the main button does nothing

#### Scenario: The engine is sent a text it does not accept

- **WHEN** the engine is sent no text, an empty text, 51 characters, "मसौदा", a tab or something that is not a string
- **THEN** it refuses before reading the file, writes nothing, its error does not hold the text, and the page says "The watermark was not added." and "The watermark text could not be used. Check it and try again."

### Requirement: Drawing the watermark

Pressing the main button SHALL write one PDF in which every page shows the text once, across the centre of the page as a reader shows it, rising from lower left to upper right at 45 degrees, upright whatever the page's turn, size or boxes. It SHALL be bold Helvetica in mid-grey at 40% opacity, whole inside the shown part with a margin, and above the page's own content. The result MUST pass `qpdf --check`. (SPEC.md: Tool page anatomy, 5; Definition of done)

#### Scenario: An ordinary file

- **WHEN** `text.pdf`, 3 pages, is watermarked with "Draft"
- **THEN** each page shows "Draft" across its centre at 45 degrees, grey and seen through, with the page's text readable under it and as before

#### Scenario: Characters that mean something inside a PDF

- **WHEN** the text is `a) Tj (b \ % <x> [/y]`
- **THEN** the result passes `qpdf --check`, PDF.js reads the text back exactly, and the layer's content stream holds it only inside one hex string

#### Scenario: Pages turned and of mixed sizes

- **WHEN** `mixed.pdf` (A4, Letter on its side, A5 turned a quarter, A4 upside down) is watermarked
- **THEN** each page, as a reader shows it, has the text centred on it, rising from its lower left to its upper right, and whole on the page

#### Scenario: A page whose shown part is smaller than its paper

- **WHEN** a page's crop box shows only part of its paper
- **THEN** the text is centred on the part shown and whole inside it, not on the whole paper

#### Scenario: How large the text is

- **WHEN** "Draft" and then a text of 50 characters are drawn on an A4 page
- **THEN** "Draft" is about 119 points, a fifth of the page's width, and the long text is smaller so that it fits; on every page the text, turned, stays at least a twelfth of the shorter side from each edge

#### Scenario: A page with pictures

- **WHEN** `scanned.pdf`, whose pages are whole-page pictures, is watermarked
- **THEN** the text shows over the picture on every page

#### Scenario: Content that leaves its own drawing state

- **WHEN** a page's content sets a low opacity, a scaling `cm` and a fill colour and does not restore them
- **THEN** the watermark is still at its place, its size, its grey and its opacity

#### Scenario: A long file

- **WHEN** `pages-500.pdf` is watermarked
- **THEN** all 500 pages show the text, and copying the text of a page gives its own text

### Requirement: Nothing else changes

The new file SHALL keep every page and everything on it: text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. Each page's own content SHALL stay in that page's content, and the watermark SHALL be marked as a watermark, not text of the page. The file SHALL have no password and no restrictions. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; the owner's decisions of 13 Nov 2026)

#### Scenario: A file with everything

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are watermarked
- **THEN** their bookmarks, link, `note.txt`, form fields and values, note, tags, named destination and reading thread are kept, and their text is as before

#### Scenario: A file with tagged content

- **WHEN** a page whose text is tied to an accessibility tag is watermarked
- **THEN** every piece of marked content the tag tree names for that page is still in that page's own content, a reader still finds the text from its tag, and the watermark is in no tag, marked as a pagination artifact of subtype watermark

#### Scenario: Pages that share one content stream

- **WHEN** a file whose pages all draw the same content stream is watermarked
- **THEN** that stream is still one stream, shared, and unchanged

#### Scenario: A protected file

- **WHEN** `password.pdf` opened with its password, or `restricted.pdf`, is watermarked
- **THEN** the result opens with no password and has no restrictions

### Requirement: What the page says about the new file

The result SHALL say that text, links, form fields, bookmarks and attached files are kept; that earlier saved versions stored inside the file are not and a digital signature will no longer be valid; and that the new file has no password and no restrictions. The page text SHALL also say that a file that met PDF/A no longer does, and that the watermark marks the file but does not stop anyone removing it. (SPEC.md: What we are building, rule 4, "Honest about limits"; CLAUDE.md: Signed files)

#### Scenario: The result notes

- **WHEN** a job finishes
- **THEN** the result shows both notes, and the questions below the tool cover signatures, PDF/A and removing the watermark

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units with a Cancel button: "Reading the file", then "Page 14 of 120" while the watermark is drawn, then "Writing the watermarked file", with the bar not full until the file is written. Cancel SHALL stop the work and return to the file with the text as typed. The page MUST stay responsive. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A job is running

- **WHEN** a 120-page file is watermarked
- **THEN** the page shows "Reading the file", "Page 14 of 120" as it goes, then "Writing the watermarked file", a bar that never goes back, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor has typed "Draft", starts the job and presses Cancel
- **THEN** the work stops, no result is shown, and the file is listed with "Draft" still in the field

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-watermarked` before `.pdf`. Nothing SHALL download until Download is pressed. "Start again" SHALL empty the field for the next file. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are watermarked
- **THEN** the result reads `report-watermarked.pdf` with "12 pages" and its size, focus moves to the result heading, and nothing has downloaded

#### Scenario: Start again

- **WHEN** the visitor presses "Start again" and chooses another file
- **THEN** once it is read, the field is empty and the main button waits

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and show no text field until it is opened. A wrong password SHALL be reported and the field kept; "Choose another file" SHALL replace the file. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no watermark field is shown, and focus moves to the password field; once the right password opens the file, focus moves to the watermark field

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says it is wrong and the password field stays

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-xref.pdf` or `damaged-cut.pdf`
- **THEN** the page says it is damaged and cannot be read, shows no watermark field, and offers "Choose another file"

### Requirement: A job that fails

When the job fails, its code cannot be fetched, the browser runs out of memory, or the new file would grow far past what a watermark adds, the page SHALL say "The watermark was not added." with what happened in one sentence and one thing to try, and offer "Go back to your file" with the file and its text kept. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The watermark was not added." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says the browser ran out of memory and to try on a computer, or to split the file first and add the watermark to each part

#### Scenario: The new file would be far too large

- **WHEN** the file being written passes its size limit
- **THEN** writing stops at the limit, and the page says the new file would be far larger than expected, so it was not made, and that the file may be damaged and to try another copy of it

#### Scenario: Going back after a failure

- **WHEN** the visitor presses "Go back to your file"
- **THEN** the file is listed with the text as typed, and focus is on the main button

### Requirement: Large files

There SHALL be no fixed size limit. A file over 100 MB SHALL show "This file is more than 100 MB", and a file of more than 20,000 pages SHALL show "This file has more than 20,000 pages", and the job SHALL still run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read
- **THEN** the 20,000-page notice is shown, typing in the field blocks the page for no more than 100 ms a key, and the main button can be used once text is typed

#### Scenario: Pages that share one small content stream

- **WHEN** a file of thousands of pages that all draw the same tiny content stream is watermarked
- **THEN** the job finishes, and the new file is larger than the old by no more than a few hundred bytes a page

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, the file name, a password or the watermark text, and none SHALL go to another origin. None of them SHALL be written to browser storage, the page address, the title or the console. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, types "Kv4wm Qx8mrk", watermarks the file and downloads it, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the engine and pdf-lib's file and no other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report`, the password, `Kv4wm Qx8mrk`, `Kv4wm` or `Qx8mrk`; and storage, the title, the address and the console hold none of them

#### Scenario: No hidden text reaches a request

- **WHEN** `rich.pdf`, `tagged.pdf` and `form.pdf` are watermarked while every request and the console are watched
- **THEN** their bookmark titles, attachment name, document titles, `SECRET-` markers and field values are in no request and not in the console, and the address has no query and no hash

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft for the owner, with nothing from "Banned patterns" and no question that restates the title. The questions SHALL cover uploading, which characters work, how it looks, removing it, what is kept and what is not, signatures and PDF/A, passwords, and that the page forgets the file and the text. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page; How the words should read)

#### Scenario: The text is in the served page

- **WHEN** the built `/watermark-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML
