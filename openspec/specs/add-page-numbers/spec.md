# add-page-numbers Specification

## Purpose
What the Add page numbers tool at `/add-page-numbers-to-pdf` does: it puts a number on every page of one PDF, at the edge the visitor chooses, in the visitor's browser, and leaves the rest of the file as it was.

## Requirements

### Requirement: The page

The tool SHALL be served at `/add-page-numbers-to-pdf` with the title tag "Add page numbers to a PDF in your browser - PDFkaro", the heading "Add page numbers to a PDF" and the sentence "Put a number on every page of a PDF. Your file stays on your device." Its meta description SHALL say the file stays on the device and is not uploaded. It SHALL be listed first under "Edit and sign". (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/add-page-numbers-to-pdf`
- **THEN** the heading, sentence and title are as above, the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page lists it

- **WHEN** the home page is built
- **THEN** "Add page numbers" is the first link under "Edit and sign"

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed with its option

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with Remove and no summary line above it; "Where the numbers go" SHALL follow it, then the main button. (SPEC.md: Tool page anatomy, 4; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the option is not shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page, "12 pages, 1.4 MB" and "Remove", then "Where the numbers go" with "Bottom centre" chosen and focused, then "Add numbers and download", and the status region says "report.pdf, 12 pages, 1.4 MB."

### Requirement: Where the numbers go

The option "Where the numbers go" SHALL offer six places: "Bottom left", "Bottom centre", "Bottom right", "Top left", "Top centre" and "Top right", in that order, with "Bottom centre" chosen at first. It SHALL be used by keyboard and screen reader as every option is. The engine SHALL refuse any other place before reading the file. (SPEC.md: Tool page anatomy, 4; Definition of done)

#### Scenario: Nothing is touched

- **WHEN** the visitor chooses a file and presses "Add numbers and download" without touching the option
- **THEN** every page is numbered from 1, at the bottom centre

#### Scenario: A place is chosen by keyboard

- **WHEN** a keyboard user, with focus on "Bottom centre", presses the up arrow twice and then Tab
- **THEN** "Top right" is chosen, a screen reader reads it as 6 of 6 in "Where the numbers go", and focus moves to "Add numbers and download"

#### Scenario: The engine is sent a place it does not accept

- **WHEN** the engine is sent a place not among the six, or none
- **THEN** it refuses before reading the file, and writes nothing

### Requirement: Numbering the file

Pressing "Add numbers and download" SHALL write one PDF in which every page carries its number, from 1 on the first page, as digits only. Each number SHALL be upright at the chosen edge of the page as a reader shows it, inside the part shown, whatever the page's turn, size or boxes. The result MUST pass `qpdf --check`. (SPEC.md: Tool page anatomy, 5; Definition of done)

#### Scenario: An ordinary file

- **WHEN** `text.pdf`, 3 pages, is numbered with the option as it starts
- **THEN** the pages show 1, 2 and 3, each centred across the bottom of its page, and their text as before

#### Scenario: Pages turned and of mixed sizes

- **WHEN** `mixed.pdf` (A4, Letter on its side, A5 turned a quarter, A4 upside down) is numbered at "Bottom right"
- **THEN** each page, as a reader shows it, has its number upright near its own bottom right corner

#### Scenario: A page whose shown part is smaller than its paper

- **WHEN** a page's crop box shows only part of its paper
- **THEN** the number sits near the chosen edge of the part shown, not of the whole paper

#### Scenario: How large the number is

- **WHEN** an A4 page is numbered at "Bottom centre"
- **THEN** the number is set at about 10 points, its digits about 7 points tall, with its foot about 10 mm above the bottom edge; on an A0 page it is larger, and on a page too small for that size and margin it is smaller, but always whole on the page

#### Scenario: A long file

- **WHEN** `pages-500.pdf` is numbered
- **THEN** page 500 shows 500, and copying the text of a page gives its own text with its number

### Requirement: Nothing else changes

The new file SHALL keep every page and everything on it: text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. Each page's own content SHALL stay in that page's content, and the number SHALL be marked as a page number, not text of the page. The file SHALL have no password and no restrictions. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; the owner's decisions of 13 Nov 2026)

#### Scenario: A file with everything

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are numbered
- **THEN** their bookmarks, link, `note.txt`, form fields and values, note, tags, named destination and reading thread are kept, and their text is as before

#### Scenario: A file with tagged content

- **WHEN** a page whose text is tied to an accessibility tag is numbered
- **THEN** every piece of marked content the tag tree names for that page is still in that page's own content, a reader still finds the text from its tag, and the number is in no tag

#### Scenario: A protected file

- **WHEN** `password.pdf` opened with its password, or `restricted.pdf`, is numbered
- **THEN** the result opens with no password and has no restrictions

### Requirement: What the page says about the new file

The result SHALL say that text, links, form fields, bookmarks and attached files are kept; that earlier saved versions stored inside the file are not and a digital signature will no longer be valid; and that the new file has no password and no restrictions. The page text SHALL also say that a file that met PDF/A no longer does. (SPEC.md: What we are building, rule 4, "Honest about limits"; CLAUDE.md: Signed files)

#### Scenario: The result notes

- **WHEN** a job finishes
- **THEN** the result shows both notes, and the questions below the tool cover signatures and PDF/A

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units with a Cancel button: "Reading the file", then "Page 14 of 120" while numbers are drawn, then "Writing the numbered file", with the bar not full until the file is written. Cancel SHALL stop the work and return to the file with the same place chosen. The page MUST stay responsive. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A job is running

- **WHEN** a 120-page file is numbered
- **THEN** the page shows "Reading the file", "Page 14 of 120" as it goes, then "Writing the numbered file", a bar that never goes back, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor has chosen "Top left", starts the job and presses Cancel
- **THEN** the work stops, no result is shown, and the file is listed with "Top left" still chosen

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-numbered` before `.pdf`. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are numbered
- **THEN** the result reads `report-numbered.pdf` with "12 pages" and its size, focus moves to the result heading, and nothing has downloaded

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and show no option until it is opened. A wrong password SHALL be reported and the field kept; "Choose another file" SHALL replace the file. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no option is shown, and focus moves to the field

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says it is wrong and the field stays

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-xref.pdf` or `damaged-cut.pdf`
- **THEN** the page says it is damaged and cannot be read, shows no option, and offers "Choose another file"

### Requirement: A job that fails

When the job fails, its code cannot be fetched, the browser runs out of memory, or the new file would grow far past what numbers add, the page SHALL say "The numbers were not added." with what happened in one sentence and one thing to try, and offer "Go back to your file" with the file and its place kept. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The numbers were not added." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says the browser ran out of memory and to try on a computer, or to split the file first and number the parts

#### Scenario: The new file would be far too large

- **WHEN** the file being written passes its size limit
- **THEN** writing stops at the limit, and the page says the new file would be far larger than expected, so it was not made, and that the file may be damaged and to try another copy of it

#### Scenario: A page too small or too large to number

- **WHEN** a page is shown less than 1 point or more than 100,000,000 points on a side
- **THEN** the job stops with the engine failure, and nothing is written

### Requirement: Large files

There SHALL be no fixed size limit. A file over 100 MB SHALL show "This file is more than 100 MB", and a file of more than 20,000 pages SHALL show "This file has more than 20,000 pages", and the job SHALL still run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read
- **THEN** the 20,000-page notice is shown, changing the place blocks the page for no more than 100 ms, and the main button can be used

#### Scenario: Pages that share one small content stream

- **WHEN** a file of thousands of pages that all draw the same tiny content stream is numbered
- **THEN** the job finishes, and the new file is larger than the old by no more than a few hundred bytes a page

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, the file name, a password or the chosen place, and none SHALL go to another origin. None of them SHALL be written to browser storage or the page address. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, chooses "Top left", numbers the file and downloads it, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the engine and pdf-lib's file and no other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report`, the password, `top-left` or `Top left`; and storage, the title, the address and the console hold none of them

#### Scenario: No hidden text reaches a request

- **WHEN** `rich.pdf`, `tagged.pdf` and `form.pdf` are numbered while every request and the console are watched
- **THEN** their bookmark titles, attachment name, document titles, `SECRET-` markers and field values are in no request and not in the console, and the address has no query and no hash

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft until the owner reviews them, with nothing from "Banned patterns" and no question that restates the title. The questions SHALL cover uploading, where the numbers can go, leaving out a cover, what is kept and what is not, signatures and PDF/A, passwords, and that the page forgets the file. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page; How the words should read)

#### Scenario: The text is in the served page

- **WHEN** the built `/add-page-numbers-to-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML
