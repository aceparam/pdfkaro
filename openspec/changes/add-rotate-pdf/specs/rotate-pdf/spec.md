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

### Requirement: The file is read, then its pages are shown

While the engine loads, the file's line SHALL show "Getting ready". Once read, it SHALL show the page count and size, with a Remove button named for the file, followed by the pages as thumbnails with "Page N" under each and a "Skip to the main button" link before them, in batches of 500. (SPEC.md: Tool page anatomy, 4; States every tool handles; Details that apply everywhere)

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its line reads "report.pdf, 12 pages, 1.4 MB" with "Remove", and twelve pages follow, each drawn as it is

#### Scenario: A keyboard user skips the pages

- **WHEN** a keyboard user presses "Skip to the main button"
- **THEN** focus moves to "Turn and download" without passing through the pages

### Requirement: Turning a page

Every page SHALL have "Left" and "Right" buttons, named "Turn page N left" and "Turn page N right", each turning the page a quarter. The page's thumbnail SHALL be drawn turned, scaled to fit its slot. A turn SHALL be announced with how far the page now is from how it was in the file, and focus SHALL stay on the button pressed. (SPEC.md: Tool page anatomy, 4; SEO, Specific jobs)

#### Scenario: A page is turned right

- **WHEN** a keyboard user presses "Turn page 3 right" in a 12-page file
- **THEN** page 3's thumbnail is drawn a quarter turned to the right, the status region says "Page 3 turned right. It is now a quarter turn right of how it was.", and focus stays on "Turn page 3 right"

#### Scenario: A page is turned twice

- **WHEN** "Turn page 3 right" is pressed twice
- **THEN** the thumbnail is turned half round from how it was and the status region says "Page 3 turned right. It is now half a turn from how it was."

#### Scenario: A page is turned back

- **WHEN** "Turn page 3 right" then "Turn page 3 left" are pressed
- **THEN** the thumbnail is drawn as it was and the status region says "Page 3 turned left. It is back the way it was."

### Requirement: Turning every page

Above the pages, "Turn all left" and "Turn all right" SHALL turn every page of the file a quarter, including pages not shown yet, on top of any page's own turns. The turn SHALL be announced. (SPEC.md: Tool page anatomy, 4)

#### Scenario: Every page is turned

- **WHEN** the visitor presses "Turn all right" on a 12-page file
- **THEN** every thumbnail is drawn a quarter turned to the right, and the status region says "Every page turned right."

#### Scenario: Every page of a long file

- **WHEN** the visitor presses "Turn all right" on a 900-page file showing 500 pages, then shows the next batch
- **THEN** the pages of the next batch are drawn turned too

### Requirement: What the line above the pages says

A line above the pages SHALL say how many pages will be turned, or that none will, and how to turn a page. The turns SHALL be forgotten on remove or replace, and kept through Cancel and failure. (SPEC.md: Tool page anatomy, 4)

#### Scenario: Nothing is turned

- **WHEN** a file has been read, or every page has been turned back
- **THEN** the line reads "No pages will be turned. Press “Left” or “Right” under a page to turn it, or turn them all."

#### Scenario: Some pages are turned

- **WHEN** pages 2, 5 and 9 of a 12-page file are turned
- **THEN** the line reads "3 pages will be turned."

#### Scenario: Every page is turned

- **WHEN** every page of a 12-page file is turned the same way
- **THEN** the line reads "Every page will be turned."

### Requirement: Turning the file

The main button SHALL read "Turn and download" and SHALL work with nothing turned. Pressing it SHALL write one PDF of every page, each turned as shown, which MUST pass `qpdf --check` and SHALL change nothing else in the file. It SHALL have no password and no restrictions, and the page SHALL say so. (SPEC.md: Tool page anatomy, 5; Definition of done; the owner's decision of 13 Nov 2026)

#### Scenario: Pages are turned

- **WHEN** page 2 of a 3-page file is turned right and page 3 turned twice, and the job runs
- **THEN** page 1 is as it was, page 2 is a quarter turn more to the right, and page 3 is turned half round

#### Scenario: A page that was already turned

- **WHEN** a page whose file already turns it a quarter is turned right
- **THEN** the new file turns it a half, adding to the turn it had

#### Scenario: Nothing else changes

- **WHEN** a page of `rich.pdf` is turned
- **THEN** its bookmarks, link and `note.txt` are kept, and its text is as it was

#### Scenario: A protected file

- **WHEN** a file opened with its password is turned
- **THEN** the result has no password and no restrictions

#### Scenario: Turns that are not valid

- **WHEN** the engine is sent a turn for a page not in the file, a turn that is not a whole number of quarters, or a list that is not one
- **THEN** it refuses, and writes nothing

### Requirement: Progress and cancel

While the job runs the page SHALL show progress with a bar and a Cancel button, claiming no count it has not reached. Cancel SHALL stop the work and return to the pages with the same turns. The page MUST stay responsive while a job runs and while pages are turned. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the work stops, no result is shown, and the pages are back with the same turns

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-rotated` before `.pdf`. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are written
- **THEN** the result reads `report-rotated.pdf` with "12 pages" and its size, focus moves to the result heading, and nothing has downloaded

### Requirement: A job that fails

When the job fails the page SHALL say what happened in one sentence and give one thing to try, with a way back to the pages that keeps the turns. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The new file was not made." and that the tool could not be loaded, and to check the connection and try again

### Requirement: Large files

There SHALL be no fixed size limit. When the file is over 100 MB the page SHALL say "This file is more than 100 MB" and still let the job run. A file of more than 20,000 pages SHALL show the shared notice and still let the job run. (SPEC.md: States every tool handles, Too large; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read and "Turn all right" and one page's "Right" are pressed
- **THEN** "This file has more than 20,000 pages" is shown, neither press blocks the page for more than 100 ms, and the main button can be used

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and none SHALL go to another origin. Files, names, passwords and the turns MUST NOT be written to browser storage or the page address. (SPEC.md: Privacy, browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, turns a page, writes and downloads, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, including the Rotate engine and with no `fflate` or other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report` or the password; and storage, the title, the address and the console hold none of them

#### Scenario: No hidden text reaches a request

- **WHEN** a page of `rich.pdf`, and of `tagged.pdf`, is turned and the file written while every request and the console are watched
- **THEN** their bookmark titles, attachment name and marked strings are in no request and not in the console, and the address has no query and no hash

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft until the owner reviews them. The questions SHALL cover uploading, turning one page or all, that everything else in the file stays (it is not cleaned), the original file, passwords, and that the page forgets the file and the turns. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page)

#### Scenario: The text is in the served page

- **WHEN** the built `/rotate-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML
