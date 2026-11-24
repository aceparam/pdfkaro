## Purpose

What the Resize pages tool at `/resize-pdf` does: every page of one PDF made A4 or Letter, the same way round as shown, its content scaled to fit and centred with nothing cut off, and what moves with it, what the new file keeps, and every state the page shows (the owner's decisions of 24 Nov 2026).

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/resize-pdf` with the title, heading and sentence below, and a meta description that says the file stays on the device and is not uploaded. It SHALL be listed eighth under "Organise pages", after Crop PDF. Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/resize-pdf`
- **THEN** the title is "Resize PDF pages to A4 or Letter in your browser - PDFkaro", the heading "Resize PDF pages to A4 or Letter", the sentence "Make every page of a PDF A4 or Letter size, scaled to fit. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page and the hub list it

- **WHEN** the site is built
- **THEN** "Resize pages to A4 or Letter" is the eighth link under "Organise pages" on the home page and on `/organise-pages`, and the hub's description names resizing

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed with its option

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line; "Paper size" SHALL follow it, then the main button. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and neither the option nor the main button is shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page and "12 pages, 1.4 MB", then "Paper size" with "A4, 210 by 297 mm" chosen and focused, then "Resize and download", and the status region says "report.pdf, 12 pages, 1.4 MB."

### Requirement: Paper size

The option "Paper size" SHALL offer "A4, 210 by 297 mm" and "Letter, 8.5 by 11 inches", in that order, with A4 chosen at first, by the owner's decision of 24 Nov 2026. It SHALL work by keyboard and screen reader as every option does and be kept through Cancel, a failure and "Choose another file". The engine SHALL refuse any other value before reading the file. (SPEC.md: Tool page anatomy, 4; CLAUDE.md: Owner decisions)

#### Scenario: Nothing is touched

- **WHEN** the visitor chooses a Letter file and presses "Resize and download" without touching the option
- **THEN** every page becomes A4

#### Scenario: Letter is chosen by keyboard

- **WHEN** a keyboard user, with focus on "A4, 210 by 297 mm", presses the down arrow and then Tab
- **THEN** "Letter, 8.5 by 11 inches" is chosen, a screen reader reads it as 2 of 2 in "Paper size", and focus moves to "Resize and download"

#### Scenario: Keyboard only through the job

- **WHEN** a keyboard user chooses a file with the picker, chooses Letter with the arrow keys, tabs to the main button and presses Enter
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step

#### Scenario: The engine is sent a size it does not accept

- **WHEN** the engine is sent a paper size other than `a4` or `letter`, or none
- **THEN** it refuses before reading the file, and writes nothing

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with the note that the password stays in the browser. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the option and the main button are not, and focus moves to the field

#### Scenario: The right password

- **WHEN** `open-sesame` is typed and Enter pressed
- **THEN** the file is read, its row and "Paper size" are shown, and focus moves to the chosen paper size

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-cut.pdf`
- **THEN** the page says "damaged-cut.pdf is damaged and cannot be read.", offers "Choose another file", and shows no link to Repair PDF

### Requirement: How each page is fitted

Each page, as a reader shows it, SHALL become the chosen paper the same way round (on its side when wider than tall), its content scaled by the largest one factor at which all of it fits and centred, so nothing is cut off. What the old shown box hid SHALL stay hidden. A page already the chosen size the same way round, within 1 point each side, SHALL be left exactly as it was. (CLAUDE.md: Owner decisions, "Resize pages scales to fit, A4 or Letter only (24 Nov 2026)"; SPEC.md: Definition of done)

#### Scenario: Letter to A4

- **WHEN** a Letter page (612 by 792 points) is resized to A4
- **THEN** the page is 595.276 by 841.89 points, its content is scaled by 0.9727 to 595.28 by 770.36 points and centred, with about 35.8 points of white space at the top and at the bottom, and nothing is cut off

#### Scenario: A4 to Letter

- **WHEN** an A4 page is resized to Letter
- **THEN** the page is 612 by 792 points, its content is scaled by 0.9407 and centred, with about 26 points of white space at each side

#### Scenario: A small page is enlarged

- **WHEN** an upright A5 page is resized to A4
- **THEN** its content is enlarged to fill the A4 page

#### Scenario: Each page keeps its own way round

- **WHEN** `mixed.pdf` (A4, Letter on its side, A5 turned a quarter, A4 upside down) is resized to Letter
- **THEN** every page is Letter; the Letter page on its side and the A5 page turned a quarter are shown on their side; each page shows the same way up as before, its stored turn unchanged; and each page drawn by PDF.js matches the original page drawn, scaled and centred, with nothing drawn in the white space

#### Scenario: A square page

- **WHEN** a page 500 by 500 points is resized to A4
- **THEN** it becomes upright A4, its content scaled to 595.28 by 595.28 points and centred

#### Scenario: A page with a user unit

- **WHEN** a page with `/UserUnit 2` and a paper box of 306 by 396 units (Letter as shown) is resized to A4
- **THEN** the page is A4 in points with no user unit, and drawn by PDF.js it matches the original scaled and centred

#### Scenario: A page that hid part of itself

- **WHEN** a page whose crop box, inherited from the page tree, is smaller than its paper box is resized
- **THEN** only what the old crop box showed is drawn on the new page, scaled and centred, and what it hid is not drawn

#### Scenario: Pages already the chosen size

- **WHEN** `mixed.pdf` is resized to A4
- **THEN** its two A4 pages are left exactly as they were, the Letter page on its side becomes A4 on its side, and the A5 page turned a quarter is enlarged to A4 on its side

#### Scenario: Within a point

- **WHEN** `multilingual.pdf`, whose pages are 594.96 points wide, is resized to A4
- **THEN** every page is left as it was

### Requirement: What moves with the page

On a resized page, what the file stores in page coordinates outside the content SHALL move and scale with it: annotations' rectangles and other stored places, every destination pointing to the page, and reading-thread beads. A malformed value SHALL be left as it was. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change: links, bookmarks, form fields and text stay intact")

#### Scenario: Links and fields line up

- **WHEN** `rich.pdf` and `form.pdf` are resized to Letter
- **THEN** each link and form field rectangle is moved and scaled with its page, a link still covers the words it covered, and the field still sits on its box with its value

#### Scenario: Bookmarks land in the same place

- **WHEN** a file whose bookmarks point to `/XYZ` and `/FitR` places on its pages is resized
- **THEN** each bookmark points to the same spot on its resized page, moved and scaled, with its zoom kept and an empty coordinate left empty

#### Scenario: A destination to a page left as it was

- **WHEN** a bookmark points to a page that is already the chosen size
- **THEN** the bookmark is unchanged

#### Scenario: A malformed annotation

- **WHEN** a link's `/QuadPoints` holds an odd number of values
- **THEN** its `/QuadPoints` is left as it was and its rectangle is still moved

### Requirement: What the new file changes and keeps

Pressing "Resize and download" SHALL write one PDF in which each resized page keeps its own content streams byte for byte, wrapped by two new streams that place them on the new paper, with the boxes and keys below changed. Everything else SHALL be kept. The file MUST pass `qpdf --check` and SHALL have no password and no restrictions, as the page SHALL say. (SPEC.md: Tool page anatomy, 5; Definition of done; the owner's decision of 13 Nov 2026 on page tools, extended to Resize)

#### Scenario: Content is not rewritten

- **WHEN** `text.pdf` is resized to Letter
- **THEN** each page's own decoded content streams are byte for byte as before, between a new first stream and a new last stream, and its resources are as before

#### Scenario: Page keys

- **WHEN** a page with `/Rotate 90`, `/UserUnit 2`, its own bleed, trim and art boxes, a `/Thumb` and a `/VP` is resized
- **THEN** its `/MediaBox` and `/CropBox` are the new paper as direct arrays on the page, its `/Rotate` is 90 as before, and it has no `/UserUnit`, `/BleedBox`, `/TrimBox`, `/ArtBox`, `/Thumb` or `/VP`

#### Scenario: Everything else stays

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are resized to Letter
- **THEN** their bookmarks, link, `note.txt`, form fields and values, tags and text are kept

#### Scenario: Text in other scripts

- **WHEN** `multilingual.pdf` is resized to Letter
- **THEN** its text, read by PDF.js, is as before, each page's own content streams are byte for byte as before, and each page drawn by PDF.js shows ink in every script band the original showed, scaled

#### Scenario: A protected file

- **WHEN** `password.pdf` opened with its password, and `restricted.pdf`, are resized to Letter
- **THEN** each result has no password and no restrictions

#### Scenario: The output name

- **WHEN** `report.pdf` is resized
- **THEN** the result is named `report-resized.pdf`

#### Scenario: The result's notes

- **WHEN** a job finishes
- **THEN** two notes say that each page is now the paper size chosen, the same way round, its content made smaller or larger to fit, keeping its shape, centred, with white space at two edges on a page of another shape, and pages already that size left as they are; and that text, links, form fields, notes, bookmarks, attached files and details are kept and links, fields and notes move with the page, that earlier saved versions and a valid signature are not kept, and that the file has no password or restrictions

### Requirement: A file where no page changes

When every page is already the chosen size, the job SHALL end with no new file, and the page SHALL say "Every page is already that size." and "No new file was made. Every page of this file is already the paper size you chose. You can use your file as it is.", with "Start again" and no Download. It MUST NOT be called damaged or a failure. (SPEC.md: What we are building, rule 4; Definition of done)

#### Scenario: An A4 file and A4 chosen

- **WHEN** `text.pdf`, whose pages are all A4, is resized to A4
- **THEN** the page shows "Every page is already that size." and its words, focus moves to the heading, nothing downloads, and "Start again" empties the page

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units: "Reading the file", then "Page N of M" while the changes are worked out, then the writing, with a bar that never goes back and a Cancel button. Cancel SHALL stop the work and return to the file with its password and the paper size chosen. The page MUST NOT be blocked for more than 100 ms. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A long file

- **WHEN** `pages-500.pdf` is resized to Letter
- **THEN** the page shows "Reading the file", then "Page 1 of 500" up to "Page 500 of 500", then the writing, with the bar never going back, and no task blocks the page for more than 100 ms

#### Scenario: Cancel is pressed

- **WHEN** the visitor, with Letter chosen, presses Cancel while the job runs
- **THEN** the work stops, no result is shown, Letter is still chosen, focus moves to the main button, and pressing it runs the job again without asking for the password again

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button, the notes and "Start again". Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are written
- **THEN** the result reads `report-resized.pdf` with "12 pages" and its size, focus moves to the result heading, the notes are shown, and nothing has downloaded

#### Scenario: A screen reader

- **WHEN** a screen reader user reaches the result
- **THEN** the heading is announced, then the name, size and pages, the Download button by its name, and the notes as text

### Requirement: A job that fails

When the job fails the page SHALL say "The pages were not resized." and what happened in one sentence, give one thing to try, and offer "Go back to your file", which keeps the file, its password and the paper size chosen. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The pages were not resized." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Memory runs out

- **WHEN** the worker runs out of memory
- **THEN** the page says so and gives "Try on a computer, or split the file first and resize the parts."

#### Scenario: The new file would be far too large

- **WHEN** the update or the new file passes the size budget
- **THEN** the page shows the shared `output-limit` sentence and its advice, and "Go back to your file"

### Requirement: Large files

There SHALL be no fixed size limit. When the file is over 100 MB the page SHALL say "This file is more than 100 MB" and still let the job run. A file of more than 20,000 pages SHALL show the shared notice and still let the job run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security, Browser tools; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** the generated file of 120,000 pages has been read
- **THEN** "This file has more than 20,000 pages" is shown and the main button can be used

#### Scenario: A file over 100 MB

- **WHEN** the generated file over 100 MB has been read
- **THEN** "This file is more than 100 MB" is shown and the main button can be used

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and none SHALL go to another origin. Which of the site's own files are fetched SHALL NOT depend on the file or the paper size chosen. Files, names, passwords and page text MUST NOT be written to browser storage, the page address or the console. (SPEC.md: Privacy, limits and security, Browser tools; the owner's decision of 22 Nov 2026 on requests)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, chooses Letter, resizes it and downloads the result, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the Resize engine and with no `fflate`, pdf-lib or other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report`, the password, the file's text, the bookmark title `SECRET-bookmark` or the form value `SECRET-field`; and storage, the title, the address and the console hold none of them

#### Scenario: The same files for any file

- **WHEN** the uniform-requests test, on `/resize-pdf`, picks a damaged file, a protected file, a file that is not a PDF and `scanned.pdf`, and runs jobs on `text.pdf`, `rich.pdf`, the protected file with its password, `form.pdf`, `compress-json-bomb.pdf` (whose job fails at the page-reading cap), `mixed.pdf` (which must finish with a file) and `multilingual.pdf` and `text.pdf` (which must finish with no new file)
- **THEN** the site's files requested after each pick are the same, and those of every job are the tool's job set, however the job ends

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/tools/resize-pdf.md`, marked as a draft until the owner reviews them, with nothing from "Banned patterns". The questions SHALL cover uploading, pages of another shape, small pages made larger, which way round, why no new file was made, links, forms and bookmarks, what an earlier crop hid, passwords and the original file. (SPEC.md: Tool page anatomy, 7; How the words should read; SEO)

#### Scenario: The text is in the served page

- **WHEN** the built `/resize-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML, between 250 and 500 words, with no exclamation mark and none of the banned words

#### Scenario: Honest about forms

- **WHEN** the questions are read
- **THEN** one says that links, fields and notes move with the page, and that text typed into a form field afterwards may look larger for its box on a page that was made much smaller
