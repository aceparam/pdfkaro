## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/crop-pdf` with the title tag "Crop PDF margins in your browser - PDFkaro", the heading "Crop PDF margins" and the sentence "Cut the white margins off the pages of a PDF. Your file stays on your device." Its meta description SHALL say the file stays on the device and is not uploaded. It SHALL be listed seventh under "Organise pages". Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/crop-pdf`
- **THEN** the heading, sentence and title are as above, the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page and the hub list it

- **WHEN** the site is built
- **THEN** "Crop PDF" is the seventh link under "Organise pages" on the home page and on `/organise-pages`, and the hub's description names cropping

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line, followed by the main button. The tool SHALL have no options, so the main button SHALL be usable as soon as the file is read. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the main button is not shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page and "12 pages, 1.4 MB", focus moves to "Crop and download", and the status region says "report.pdf, 12 pages, 1.4 MB."

#### Scenario: Keyboard only

- **WHEN** a keyboard user chooses a file with the picker and presses Enter on the focused main button
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with the note that the password stays in the browser. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the main button is not, and focus moves to the field

#### Scenario: The right password

- **WHEN** `open-sesame` is typed and Enter pressed
- **THEN** the file is read, its row is shown and focus moves to "Crop and download"

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-cut.pdf`
- **THEN** the page says "damaged-cut.pdf is damaged and cannot be read.", offers "Choose another file", and shows no link to Repair PDF

### Requirement: Where each page's content is

A page's content SHALL be what a reader draws for it that is not white, with the boxes of the form fields, links and other annotations a reader shows on it. The page SHALL be measured as a reader shows it: turned, within its shown box, at its user unit, with form values. A pixel SHALL count as white when each of its colour channels is 240 or more of 255. (SPEC.md: What we are building, rule 4; Definition of done, "Leaves alone what it was not asked to change")

#### Scenario: A text page with wide margins

- **WHEN** a page of `text.pdf` is measured
- **THEN** its content is the area of its lines of text, and the margins around them are not content

#### Scenario: An empty form field with no border

- **WHEN** a page holds a text field with no border, no fill and no value, near its edge and outside the drawn text
- **THEN** the field's box is content, so the field is kept inside the cut page

#### Scenario: A light line near the edge

- **WHEN** a page has a footer line drawn in grey `#d9d6cc`
- **THEN** the line is content and is kept inside the cut page

#### Scenario: Off-white paper

- **WHEN** a scanned page whose paper is grey 236 is measured
- **THEN** the paper counts as content, so the page reaches its edges and is left as it is

### Requirement: How each page is cut

Each page SHALL be cut to its content plus a margin of one fortieth of its shorter shown side, never past where it was shown before. A page with no content, a page whose cut would move no edge by 1 point or more, and a page that cannot be measured safely SHALL be left as it was. From the first page for which the drawing step was refused data it needed, every page SHALL be left as it was. (SPEC.md: What we are building, rule 4; Definition of done)

#### Scenario: Each page to its own content (the owner's decision of 23 Nov 2026)

- **WHEN** a file whose page 1 has text in its top half and page 2 has a small chart in its middle is cropped
- **THEN** page 1 is cut to the text and page 2 to the chart, each with its margin, and the two pages now differ in size

#### Scenario: The margin left

- **WHEN** an A4 page whose content ends 100 points from its left edge is cropped
- **THEN** the new left edge is about 14.9 points (595 ÷ 40) to the left of the content

#### Scenario: A blank page

- **WHEN** a file with a blank page between two text pages is cropped
- **THEN** the blank page is left as it was, and the text pages are cut

#### Scenario: A picture too large for the drawing step

- **WHEN** an A4 page holds a 5,000 by 4,000 picture across most of it and a small "Page 1" at the bottom
- **THEN** the page is left as it was, never cut to the page number

#### Scenario: A page drawn to its edges

- **WHEN** a page whose picture fills it to every edge is cropped
- **THEN** the page is left as it was

#### Scenario: Text the drawing step cannot draw

- **WHEN** `chinese-unembedded.pdf` is cropped, and a file whose page 1 is Latin text and page 2 holds Latin text and Chinese text in a font it does not embed
- **THEN** `chinese-unembedded.pdf`'s page is left as it was; in the second file page 1 is cut and page 2 is left as it was

#### Scenario: Turned pages, pages of mixed sizes and user units

- **WHEN** `mixed.pdf` (A4, Letter on its side, A5 turned a quarter, A4 upside down) and a page with a user unit of 2 are cropped
- **THEN** each cut page, drawn by PDF.js, shows the same content as the part of the original page it covers, upright as before, with no content of the original's drawn page outside it

#### Scenario: A page that already has a crop box

- **WHEN** a page whose crop box, inherited from the page tree, is smaller than its paper is cropped
- **THEN** its new crop box lies inside the old one, and what the old crop box hid stays hidden

### Requirement: What the new file changes and keeps

Pressing "Crop and download" SHALL write one PDF in which each cut page's only change is its crop box, written on the page, and its own bleed, trim and art boxes cut back to it. Content, `/MediaBox`, `/Rotate` and `/UserUnit` SHALL NOT change. Everything else SHALL be kept. The file MUST pass `qpdf --check` and SHALL have no password and no restrictions, as the page SHALL say. (SPEC.md: Tool page anatomy, 5; Definition of done; the owner's decision of 13 Nov 2026 on page tools, extended to Crop)

#### Scenario: Only the crop box changes

- **WHEN** `text.pdf` is cropped
- **THEN** each page's decoded content streams are byte for byte as before, its paper box, turn and user unit are as before, and its crop box is new

#### Scenario: Page boxes

- **WHEN** a page with a trim box and a bleed box larger than its content, and an art box wholly inside the margin, is cropped
- **THEN** the trim and bleed boxes equal their overlap with the new crop box, the art box is removed, and a page that had none has none

#### Scenario: A box shared by several pages

- **WHEN** two pages share one trim box object and one of them is cut
- **THEN** the shared object is unchanged, the other page still uses it, and the cut page holds its own cut-back trim box

#### Scenario: A box that cannot be written safely

- **WHEN** a page's measured content would give a crop box that is not four finite numbers in order inside the page's old shown box
- **THEN** that page is left as it was
#### Scenario: Everything else stays

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are cropped
- **THEN** their bookmarks, link, `note.txt`, form fields and values, tags and text are kept, and every link and form field lies inside its page's new crop box

#### Scenario: Text in other scripts

- **WHEN** `multilingual.pdf` is cropped
- **THEN** its text, read by PDF.js, is as before, each page's decoded content streams are byte for byte as before, and each cut page drawn by PDF.js shows ink in every script band the original showed

#### Scenario: A protected file

- **WHEN** `password.pdf` opened with its password, and `restricted.pdf`, are cropped
- **THEN** each result has no password and no restrictions

#### Scenario: Page objects keep their other values

- **WHEN** a cut page of `text.pdf` is compared with the original's
- **THEN** its paper box, turn, user unit, content, resources and annotations are as before, and no bleed, trim or art box has been added

#### Scenario: The output name

- **WHEN** `report.pdf` is cropped
- **THEN** the result is named `report-cropped.pdf`

#### Scenario: The result's notes

- **WHEN** a job finishes
- **THEN** the notes say that each page is cut to what is drawn on it with a small margin, that blank pages, pages with no white margin and pages the tool cannot measure safely are left as they are, that what was cut off is still in the file and can be got back and its text found by some programs, that pages, text, links, form fields, notes, bookmarks, attached files and details are kept but earlier saved versions and a valid signature are not, and that the file has no password or restrictions, in three notes

### Requirement: The cut-off part stays in the file

The result, the text below the tool and the Privacy page draft SHALL say that what was cut off is still in the file: anyone who has the file can get it back, with no special editor, and some programs can still find, copy or read aloud the text in it, so cropping is not a way to hide something private. (SPEC.md: What we are building, rule 4, "Honest about limits"; Privacy, limits and security)

#### Scenario: The result says so

- **WHEN** a job finishes
- **THEN** the result's notes include "What was cut off is still in the file. Anyone who has the file can get it back, and some programs can still find, copy or read aloud the text in it. Cropping is not a way to hide something private."

#### Scenario: The text below the tool and the Privacy draft say so

- **WHEN** the built `/crop-pdf` and `/privacy` pages are fetched without running scripts
- **THEN** each says that what Crop PDF cuts off stays in the file, that anyone who has the file can get it back, and that some programs can still find, copy or read aloud the text in it

#### Scenario: The text is still in the file

- **WHEN** a page whose margin holds the words `SECRET-margin` drawn in white, which no reader shows, is cropped so that the words lie outside the new crop box
- **THEN** PDF.js's text of the new file still holds `SECRET-margin`, as the page says

### Requirement: A file where no page is cut

When no page of the file would change, for whatever reason, the job SHALL end with no new file, and the page SHALL say "No pages were cropped." with why pages are left and that the file can be used as it is, with "Start again" and no Download. It MUST NOT be called damaged or a failure. (SPEC.md: What we are building, rule 4; Definition of done)

#### Scenario: A file with no margins

- **WHEN** a file whose every page is filled to its edges is cropped
- **THEN** the page shows "No pages were cropped." and "No new file was made. This tool cuts only white margins, and leaves a page as it is when it cannot be sure where everything on it is. Pages with grey or dark edges, such as many scans, are left too. You can use your file as it is.", focus moves to the heading, nothing downloads, and "Start again" empties the page

#### Scenario: A file the tool cannot measure safely

- **WHEN** `chinese-unembedded.pdf`, whose text PDF.js cannot draw, is cropped
- **THEN** the page shows "No pages were cropped." and the same words, and does not claim the file has no white margins

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units, "Page N of M" while pages are measured and then the writing, with a bar that never goes back and a Cancel button. Cancel SHALL stop the work and return to the file, with its password if it had one. The page MUST NOT be blocked for more than 100 ms. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A long file

- **WHEN** `pages-500.pdf` is cropped
- **THEN** the page shows "Page 1 of 500" up to "Page 500 of 500", then the writing, with the bar never going back

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel while pages are measured
- **THEN** the work stops, no result is shown, focus moves to the main button, and pressing it runs the job again without asking for the password again

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button, the notes and "Start again". Nothing SHALL download until Download is pressed. The notes SHALL say how pages are cut and which are left, that the cut-off part stays in the file, what is kept and what is not, and that the file has no password or restrictions. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are written
- **THEN** the result reads `report-cropped.pdf` with "12 pages" and its size, focus moves to the result heading, the notes are shown, and nothing has downloaded

#### Scenario: A screen reader

- **WHEN** a screen reader user reaches the result
- **THEN** the heading is announced, then the name, size and pages, the Download button by its name, and the notes as text

### Requirement: A job that fails

When the job fails the page SHALL say "The pages were not cropped." and what happened in one sentence, give one thing to try, and offer "Go back to your file", which keeps the file and its password. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The pages were not cropped." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Memory runs out

- **WHEN** the worker runs out of memory
- **THEN** the page says so and gives "Try on a computer, or split the file first and crop the parts."

### Requirement: Large files

There SHALL be no fixed size limit. When the file is over 100 MB the page SHALL say "This file is more than 100 MB" and still let the job run. A file of more than 20,000 pages SHALL show the shared notice and still let the job run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security, Browser tools; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** the generated file of 120,000 pages has been read
- **THEN** "This file has more than 20,000 pages" is shown and the main button can be used

#### Scenario: A file over 100 MB

- **WHEN** the generated file over 100 MB has been read
- **THEN** "This file is more than 100 MB" is shown and the main button can be used

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and none SHALL go to another origin. Which of the site's own files are fetched SHALL NOT depend on the file. Files, names, passwords and page text MUST NOT be written to browser storage, the page address or the console. (SPEC.md: Privacy, limits and security, Browser tools; the owner's decision of 22 Nov 2026 on requests)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, crops it and downloads the result, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the Crop engine and PDF.js and with no `fflate`, pdf-lib or other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report`, the password, the file's text, the `SECRET-margin` words drawn in white in a margin the crop cuts off, or the form value `SECRET-field`; and storage, the title, the address and the console hold none of them

#### Scenario: The same files for any file

- **WHEN** the uniform-requests test, on `/crop-pdf`, picks a damaged file, a protected file, a file that is not a PDF and `scanned.pdf`, and runs jobs on `text.pdf`, `rich.pdf`, the protected file with its password, `form.pdf`, `compress-json-bomb.pdf` (whose job fails at the page-reading cap), `multilingual.pdf` (which must finish) and `chinese-unembedded.pdf` (which must finish, with no page cropped)
- **THEN** the site's files requested after each pick are the same, and those of every job are the tool's job set, however the job ends

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/tools/crop-pdf.md`, marked as a draft until the owner reviews them, with nothing from "Banned patterns". The questions SHALL cover uploading, where the cut goes, why a page was not cut, why pages differ in size, that the cut-off part stays in the file, choosing margins, what is kept, passwords and the original file. (SPEC.md: Tool page anatomy, 7; How the words should read; SEO)

#### Scenario: The text is in the served page

- **WHEN** the built `/crop-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML, between 250 and 500 words, with no exclamation mark and none of the banned words

#### Scenario: Pages of different sizes are explained

- **WHEN** the questions are read
- **THEN** one asks "Why are my pages different sizes now?" and answers that each page is cut to what is on it, and the answer on where the cut goes uses plain words, with no colour values or fractions
