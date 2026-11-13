## ADDED Requirements

### Requirement: Choosing one file

The page SHALL take one PDF file, from the picker button, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of a listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: A file is chosen

- **WHEN** a visitor presses "Choose a PDF file" and chooses `report.pdf`
- **THEN** the file is listed on its own line, with Remove

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then its pages are shown

While the engine loads, the file's line SHALL show "Getting ready". Once read, it SHALL show the page count and size, with a Remove button named for the file, followed by the pages as thumbnails with "Page N" under each and a "Skip to the main button" link before them, in batches of 500. (SPEC.md: Tool page anatomy, 4; States every tool handles; Details that apply everywhere)

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its line reads "report.pdf, 12 pages, 1.4 MB" with "Remove", and twelve pages follow in their original order

#### Scenario: A keyboard user skips the pages

- **WHEN** a keyboard user presses "Skip to the main button"
- **THEN** focus moves to "Reorder and download" without passing through the pages

### Requirement: Moving pages

Every page SHALL have "Earlier" and "Later" buttons, named "Move page N earlier" and "Move page N later", and no Remove, and SHALL be movable by mouse drag. A page SHALL keep its name wherever it moves. The first page's "Earlier" and the last page's "Later" SHALL be unavailable but focusable. A move SHALL be announced, and focus SHALL stay on a usable move button. (SPEC.md: Details that apply everywhere, reordering; Tool page anatomy, 4)

#### Scenario: A page is moved with the keyboard

- **WHEN** a keyboard user presses "Move page 3 earlier" twice in a 12-page file
- **THEN** page 3 is first, the status region says "Page 3 moved to place 1 of 12.", and focus moves to "Move page 3 later" because "Earlier" can no longer be used

#### Scenario: A page is dragged

- **WHEN** a visitor drags page 5 onto page 2
- **THEN** page 5 takes place 2 and the status region says "Page 5 moved to place 2 of 12."

#### Scenario: The ends

- **WHEN** a file has been read
- **THEN** the first page's "Earlier" and the last page's "Later" are marked unavailable and can still be focused

#### Scenario: Moving past the pages shown

- **WHEN** the "Later" of the last page shown of a 900-page file, place 500, is pressed
- **THEN** the next batch is shown, the page is at place 501 in view with focus on its "Later" button, and the status region says "Page 500 moved to place 501 of 900."

### Requirement: What the line above the pages says

A line above the pages SHALL say whether the order has changed and how to move a page, or that a one-page file has nothing to move. The order SHALL be forgotten on remove or replace, and kept through Cancel and failure. (SPEC.md: Tool page anatomy, 4)

#### Scenario: The order is unchanged

- **WHEN** a file of several pages has been read, or its pages have been moved back to where they were
- **THEN** the line reads "Pages in their original order. Press “Earlier” or “Later” under a page to move it."

#### Scenario: Pages have moved

- **WHEN** page 3 of a 12-page file has been moved to place 1
- **THEN** the line reads "The order has changed. Press “Earlier” or “Later” under a page to move it."

#### Scenario: A file of one page

- **WHEN** a one-page file has been read
- **THEN** the line reads "This file has one page, so there is nothing to move.", both buttons are unavailable, and the main button can still be used

### Requirement: Reordering

The main button SHALL read "Reorder and download" and SHALL work with the order unchanged. Pressing it SHALL write one PDF of every page in the order shown, which MUST pass `qpdf --check` and SHALL keep everything else in the file as it was, bookmarks pointing to their pages. It SHALL have no password and no restrictions, and the page SHALL say so. (SPEC.md: Tool page anatomy, 5; Definition of done; the owner's decision of 13 Nov 2026)

#### Scenario: Pages are reordered

- **WHEN** page 3 of a 3-page file is moved to place 1 and the job runs
- **THEN** the result has pages 3, 1 and 2, in that order

#### Scenario: The order is unchanged

- **WHEN** the job runs with no page moved
- **THEN** the result has every page in its original order

#### Scenario: Bookmarks follow their pages

- **WHEN** the two pages of `rich.pdf` are swapped
- **THEN** "Chapter one" still points to the page that reads "Chapter one", now second, `note.txt` is kept, and the link stays on its page

#### Scenario: A protected file

- **WHEN** a file opened with its password is reordered
- **THEN** the result has no password and no restrictions

#### Scenario: An order that does not name every page once

- **WHEN** the engine is sent an order that leaves out, repeats or adds a page
- **THEN** it refuses, and writes nothing

### Requirement: Progress and cancel

While the job runs the page SHALL show progress with a bar and a Cancel button, claiming no count it has not reached. Cancel SHALL stop the work and return to the pages in the same order. The page MUST stay responsive while a job runs and while pages are moved. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A job is running

- **WHEN** a job starts
- **THEN** the line reads "Starting on 1 file", then "Writing the new file", with a bar and a Cancel button that takes focus

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the work stops, no result is shown, and the pages are back in the same order

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-reordered` before `.pdf`. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are reordered
- **THEN** the result reads `report-reordered.pdf` with "12 pages" and its size, focus moves to the result heading, and nothing has downloaded

#### Scenario: Start again

- **WHEN** the visitor presses "Start again"
- **THEN** the page returns to the file picker alone, and the file, its order and the result are forgotten

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and show no pages until it is opened. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no pages are shown, and focus moves to the field

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a file cut off part way
- **THEN** the page says it is damaged and cannot be read, shows no pages, and offers "Choose another file"

### Requirement: A job that fails

When the job fails the page SHALL say what happened in one sentence and give one thing to try, with a way back to the pages that keeps the order. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The new file was not made." and that the tool could not be loaded, and to check the connection and try again

### Requirement: Large files

There SHALL be no fixed size limit. When the file is over 100 MB the page SHALL say "This file is more than 100 MB" and still let the job run. A file of more than 20,000 pages SHALL show the shared notice and still let the job run. (SPEC.md: States every tool handles, Too large; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read and its first page's "Later" is pressed
- **THEN** "This file has more than 20,000 pages" is shown, the move blocks the page for no more than 100 ms, and the main button can be used

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and none SHALL go to another origin. Files, names, passwords and the page order MUST NOT be written to browser storage or the page address. (SPEC.md: Privacy, browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, moves a page, reorders and downloads, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the Reorder engine and with no `fflate`, Split, Merge, Extract or Delete file; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report` or the password; and storage, the title, the address and the console hold none of them

#### Scenario: No hidden text reaches a request

- **WHEN** a page of `tagged.pdf` is moved and the file reordered while every request and the console are watched
- **THEN** its tag text, link address, field value and page text are in no request and not in the console, and the address has no query and no hash

#### Scenario: No bookmark title reaches a request

- **WHEN** the pages of `rich.pdf` are swapped while every request and the console are watched
- **THEN** "Chapter one", "Chapter two" and `note.txt` are in no request and not in the console

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft until the owner reviews them. The questions SHALL cover uploading, moving pages by keyboard or phone, bookmarks and attached files, the bookmark list and tagged reading order keeping their order, the original file, passwords, and that the page forgets the file and the order. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page)

#### Scenario: The text is in the served page

- **WHEN** the built `/rearrange-pdf-pages` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML
