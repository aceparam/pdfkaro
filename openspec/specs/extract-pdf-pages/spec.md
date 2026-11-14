# extract-pdf-pages Specification

## Purpose
Extract pages from a PDF, at `/extract-pdf-pages`: the visitor chooses pages of one PDF and gets one new PDF holding them in page order, made in the browser, with the bookmarks that still apply, the attached files, and no password or restrictions.

## Requirements

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
- **THEN** its line reads "report.pdf, 12 pages, 1.4 MB" with "Remove", and twelve pages follow

#### Scenario: A keyboard user skips the pages

- **WHEN** a keyboard user presses "Skip to the main button"
- **THEN** focus moves to "Extract and download" without passing through the pages

### Requirement: Choosing the pages to take out

Every page SHALL have a "Take" toggle button, named "Take page N", marked as pressed or not, drawing no cut line. A line above the pages SHALL say what is chosen. Once pages are shown and none is chosen, the main button SHALL be unavailable but focusable, with "Choose at least one page for the new file." tied to it. Choices SHALL be forgotten on remove or replace, and kept through Cancel and failure. (SPEC.md: Tool page anatomy, 4 and 5; owner, 13 Nov 2026)

#### Scenario: No page is chosen

- **WHEN** a 12-page file has been read
- **THEN** the line reads "No pages chosen. Press “Take” under each page you want.", and the main button is unavailable with "Choose at least one page for the new file." tied to it

#### Scenario: Pages are chosen

- **WHEN** the visitor presses "Take" under pages 1, 3 and 7
- **THEN** the three buttons show as pressed, no cut line is drawn, the line reads "Pages 1, 3 and 7 chosen.", and the main button can be used

#### Scenario: A page is chosen with the keyboard and a screen reader

- **WHEN** a keyboard user tabs to "Take page 3" and presses Space
- **THEN** the button is announced as pressed, focus stays on it, and the status region says "Page 3 chosen, 1 in all."

#### Scenario: Many pages are chosen

- **WHEN** twelve pages are chosen
- **THEN** the line reads "12 pages chosen."

#### Scenario: The last chosen page is cleared

- **WHEN** only page 3 is chosen and the visitor presses its "Take" again
- **THEN** the status region says "Page 3 no longer chosen. No pages chosen.", and the main button is unavailable again

#### Scenario: The file is still getting ready

- **WHEN** the file is still being read, or asks for a password
- **THEN** the sentence "Choose at least one page for the new file." is not shown

#### Scenario: The last page

- **WHEN** a file has been read
- **THEN** its last page has a "Take" button too

### Requirement: Extracting

The main button SHALL read "Extract and download". Pressing it SHALL write one PDF of the chosen pages, in page order, which MUST pass `qpdf --check` and SHALL keep those pages' text, links and form fields. It SHALL have no password and no restrictions, and the page SHALL say so. (SPEC.md: Tool page anatomy, 5; Definition of done; the owner's decision of 13 Nov 2026)

#### Scenario: Three pages are extracted

- **WHEN** pages 1, 3 and 7 of a 12-page file are extracted
- **THEN** the result has 3 pages, pages 1, 3 and 7 in that order

#### Scenario: A protected file

- **WHEN** pages of a file opened with its password are extracted
- **THEN** the result has no password and no restrictions

### Requirement: Bookmarks and attached files in the new file

The new file SHALL keep the bookmarks that point to a chosen page and no others, a kept bookmark whose parent was dropped moving up, and the files attached to the document. The page SHALL say so. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; the owner's decision of 13 Nov 2026)

#### Scenario: Bookmarks are kept for chosen pages

- **WHEN** pages 2 and 3 of a file with a nested outline are extracted
- **THEN** the bookmarks to pages 2 and 3 are kept, moved up past dropped parents, and none points nowhere

### Requirement: Document details and accessibility tags come over whole

The new file SHALL keep the document's details, accessibility tags, named destinations and reading threads whole, with the form fields (and their values) and annotations the tags point to; the page SHALL say these can carry text and fields from pages that were not taken. Other content of those pages SHALL be gone. (SPEC.md: Privacy, limits and security; the owner's decision of 13 Nov 2026)

#### Scenario: A tagged file

- **WHEN** page 1 of `tagged.pdf`, whose page 2 has a tag with alternative text, an untagged field, and a filled field, a note and a web link that the tags point to, is extracted
- **THEN** the result has one page; page 2's text and its untagged field are gone; its tag text, the tagged field with its value, the note and the link are still in the file; and the page text says such things can remain

#### Scenario: A file with bookmarks and an attachment

- **WHEN** page 2 of `rich.pdf` is extracted
- **THEN** the result keeps "Chapter two" and not "Chapter one", keeps `note.txt`, and no bookmark points nowhere

### Requirement: Progress and cancel

While the job runs the page SHALL show progress with a bar and a Cancel button, claiming no count it has not reached. Cancel SHALL stop the work and return to the pages with the same pages chosen. The page MUST stay responsive while a job runs. (SPEC.md: States every tool handles, Working)

#### Scenario: A job is running

- **WHEN** a job starts
- **THEN** the line reads "Starting on 1 file", then "Writing the new file", with a bar and a Cancel button that takes focus

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the work stops, no result is shown, and the pages are back with the same pages chosen

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-extracted` before `.pdf`. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6)

#### Scenario: A job finishes

- **WHEN** 3 pages of `report.pdf` are extracted
- **THEN** the result reads `report-extracted.pdf` with "3 pages" and its size, focus moves to the result heading, and nothing has downloaded

#### Scenario: Start again

- **WHEN** the visitor presses "Start again"
- **THEN** the page returns to the file picker alone, and the file, its choices and the result are forgotten

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and show no pages until it is opened. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no pages are shown, and focus moves to the field

#### Scenario: The password is right

- **WHEN** the visitor types the right password
- **THEN** its pages appear

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a file cut off part way
- **THEN** the page says it is damaged and cannot be read, shows no pages, and offers "Choose another file"

### Requirement: A job that fails

When the job fails the page SHALL say what happened in one sentence and give one thing to try, with a way back to the pages that keeps the choices. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says the tool could not be loaded and to check the connection and try again

### Requirement: Large files

There SHALL be no fixed size limit. When the file is over 100 MB the page SHALL say "This file is more than 100 MB" and still let the job run. (SPEC.md: States every tool handles, Too large)

#### Scenario: A file over 100 MB

- **WHEN** a 105 MB file is listed
- **THEN** the warning is shown and the main button can still be used once a page is chosen

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and none SHALL go to another origin. Files, names and passwords MUST NOT be written to browser storage or the page address. (SPEC.md: Privacy, browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, chooses pages, extracts and downloads, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the Extract engine and with no `fflate`, Split or Merge file; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report` or the password; and storage, the title, the address and the console hold none of them

#### Scenario: No bookmark title reaches a request

- **WHEN** page 2 of `rich.pdf` is taken and extracted while every request and the console are watched
- **THEN** "Chapter one", "Chapter two" and `note.txt` are in no request and not in the console

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft until the owner reviews them. The questions SHALL cover whether the file is uploaded, how to choose pages, what happens to bookmarks and attached files, what else comes over from pages not taken, that the original file is not changed, and that the new file has no password. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page)

#### Scenario: The text is in the served page

- **WHEN** the page is fetched and no script is run
- **THEN** the heading, the sentence, the how-to steps and the questions are in the response, with a title under 60 characters and a description under 155 that says files stay on the device
