## ADDED Requirements

### Requirement: Choosing one file

The page SHALL take one PDF file, from the picker button, from a drop anywhere on the page, or from paste. When several files arrive at once, the first PDF SHALL be taken and the page SHALL say the others were not added. A new file dropped or pasted while one is listed SHALL take its place. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: A file is chosen

- **WHEN** a visitor presses "Choose a PDF file" and chooses `report.pdf`
- **THEN** the file is listed on its own line

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: Another file is pasted

- **WHEN** `report.pdf` is listed and the visitor pastes `minutes.pdf`
- **THEN** `minutes.pdf` is listed in its place, with its own pages

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses `notes.txt`, or a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then its pages are shown

While the engine loads, the file's line SHALL show "Getting ready". Once read, the line SHALL show the page count, the size and a Remove button named for the file, followed by the pages as thumbnails with "Page N" under each, drawn as they come into view, and a "Skip to the main button" link before them. The status region SHALL say the file's line. (SPEC.md: Tool page anatomy, 4; States every tool handles; Details that apply everywhere)

#### Scenario: The engine is loading

- **WHEN** a file has been picked and the engine has not finished loading
- **THEN** its line shows the name with "Getting ready", and no pages are shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its line reads "report.pdf, 12 pages, 1.4 MB" with "Remove", twelve pages follow, and a screen reader hears "report.pdf, 12 pages, 1.4 MB."

#### Scenario: A keyboard user skips the pages

- **WHEN** a keyboard user tabs from "Remove" to "Skip to the main button" and presses Enter
- **THEN** focus moves to "Split and download" without passing through the pages

#### Scenario: The file is removed

- **WHEN** the visitor presses "Remove"
- **THEN** the file, its pages and their thumbnails are forgotten, and the page returns to the file picker alone

### Requirement: Marking where to cut

Every page but the last SHALL have a "Cut after" toggle button, named "Cut after page N" and marked as pressed or not, which marks or clears a cut after that page. A line above the pages SHALL say what the main button will give. With no cuts, the main button SHALL give one file per page. Cuts SHALL be forgotten when the file is removed or replaced. (SPEC.md: Tool page anatomy, 4; the owner's decision of 12 Nov 2026)

#### Scenario: No cuts are marked

- **WHEN** a 12-page file has been read and no cut is marked
- **THEN** the line reads "No cuts marked. You will get one file per page, 12 files."

#### Scenario: Two cuts are marked

- **WHEN** the visitor presses "Cut after" under pages 3 and 7
- **THEN** both buttons are shown as pressed, a cut is drawn after each of those pages, and the line reads "Cuts after pages 3 and 7. You will get 3 files."

#### Scenario: A cut is cleared

- **WHEN** the visitor presses "Cut after" under page 3 again
- **THEN** that cut is cleared and the line reads "Cut after page 7. You will get 2 files."

#### Scenario: The only cut is cleared

- **WHEN** a 12-page file has one cut, after page 3, and the visitor presses that toggle again
- **THEN** the line reads "No cuts marked. You will get one file per page, 12 files." and a screen reader hears "Cut after page 3 cleared. No cuts marked. You will get one file per page, 12 files."

#### Scenario: Many cuts

- **WHEN** twelve cuts are marked
- **THEN** the line reads "12 cuts marked. You will get 13 files."

#### Scenario: The last page

- **WHEN** a file has been read
- **THEN** its last page has no "Cut after" button

#### Scenario: A cut is marked with the keyboard and a screen reader

- **WHEN** a keyboard user tabs to "Cut after page 3" and presses Space
- **THEN** the button is announced as pressed, focus stays on it, and the status region says "Cut after page 3. You will get 2 files."

#### Scenario: A one-page file

- **WHEN** a one-page file has been read
- **THEN** it has no "Cut after" button, and the line reads "This file has one page. You will get it back as one file."

### Requirement: Splitting

The main button SHALL read "Split and download". Pressing it SHALL write one PDF for each run of pages between cuts, in page order, or one per page with no cuts. Every part MUST pass `qpdf --check` and SHALL keep its pages' text, links and form fields. Parts SHALL have no password and no restrictions, by the owner's decision of 12 Nov 2026, and the page SHALL say so. (SPEC.md: Tool page anatomy, 5; Definition of done, Each tool)

#### Scenario: A file is split at two cuts

- **WHEN** a 12-page file is split with cuts after pages 3 and 7
- **THEN** three parts are written: pages 1 to 3, pages 4 to 7 and pages 8 to 12

#### Scenario: A file is split with no cuts

- **WHEN** a 12-page file is split with no cut marked
- **THEN** twelve parts are written, one page each

#### Scenario: A protected file

- **WHEN** a file opened with its password is split
- **THEN** the parts have no password and no restrictions

### Requirement: Bookmarks and attached files in parts

Each part SHALL keep the bookmarks that point to its own pages and no others; a kept bookmark whose parent was dropped moves up to the parent's place. Files attached to the original SHALL go with the first part only. Both are the owner's decisions of 12 Nov 2026, and the page SHALL say so. (SPEC.md: Definition of done, Each tool, "Leaves alone what it was not asked to change")

#### Scenario: A file with bookmarks, a link and an attachment

- **WHEN** `rich.pdf`, two pages with a bookmark to each, a link and an attached file, is split with no cuts
- **THEN** part 1 keeps "Chapter one", the link and the attached file, and part 2 keeps "Chapter two" and no attached file; no part has a bookmark that points nowhere

#### Scenario: A file with form fields

- **WHEN** a file with form fields is split
- **THEN** each part keeps the fields on its own pages, and they still work

### Requirement: More parts than a zip can hold

A job that would give more than 65,535 parts, or more than 4 GB of parts, SHALL fail with a sentence saying a zip cannot hold that many files and to mark cuts, and SHALL never hand back a broken zip. There SHALL be no other limit. (SPEC.md: States every tool handles, Failed; Privacy, limits and security, "There is no fixed size limit")

#### Scenario: Too many parts

- **WHEN** a 120,000-page file is split with no cuts
- **THEN** the page says "This would make more than 65,535 files, more than one zip can hold. Mark cuts so the file is split into fewer parts." at once, and "Go back to your files" returns to the pages

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units, "File 3 of 12", with a bar that never goes back and a Cancel button. Cancel SHALL stop the work and return to the pages with the cuts as they were. The page MUST stay responsive while a job runs. (SPEC.md: States every tool handles, Working; Rules for the code, 3)

#### Scenario: A job is running

- **WHEN** a file is being split into 12 parts
- **THEN** the page shows "Starting", then "File 3 of 12" as each part is written, then "Putting the files into one zip", with a bar and a Cancel button that takes focus

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the work stops, no result is shown, and the pages are back with the same cuts marked

#### Scenario: Progress is announced

- **WHEN** a job is running and a screen reader is in use
- **THEN** progress is in a status region, and is not announced more than once a second

### Requirement: The result

When the job is done the page SHALL show the result's name and size, a Download button and "Start again". Several parts SHALL come as one zip named from the input with `-split`, holding files named with `-part-` and a number, and the result SHALL say how many files it holds. One part SHALL come as a PDF named with `-split`, with its page count. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6)

#### Scenario: Several parts

- **WHEN** `report.pdf` is split into 3 parts
- **THEN** the result reads `report-split.zip` with "3 files" and its size, and the zip holds `report-part-1.pdf`, `report-part-2.pdf` and `report-part-3.pdf`

#### Scenario: Twelve parts sort in order

- **WHEN** a file is split into 12 parts
- **THEN** the zip holds `report-part-01.pdf` to `report-part-12.pdf`

#### Scenario: One part

- **WHEN** a one-page `form.pdf` is split
- **THEN** the result reads `form-split.pdf` with "1 page" and its size, and no zip is made

#### Scenario: The result is announced and nothing downloads on its own

- **WHEN** the job finishes while a screen reader is in use
- **THEN** focus moves to the result heading, it is announced, and no download has started until Download is pressed

#### Scenario: Start again

- **WHEN** the visitor presses "Start again"
- **THEN** the page returns to the file picker alone, and the file, its cuts and the result are forgotten

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and SHALL show no pages until it is opened. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed; Privacy, browser tools)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no pages are shown, and focus moves to the field

#### Scenario: The password is right

- **WHEN** the visitor types the right password and presses "Open the file"
- **THEN** the file's line shows its page count and its pages appear

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says the password did not open the file, keeps the field and moves focus to it

#### Scenario: A file with restrictions and no password

- **WHEN** a visitor chooses a file with print and edit restrictions and no password to open it
- **THEN** its pages are shown and no password is asked for

### Requirement: A damaged file

When the file cannot be read as a PDF the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file", which returns to the file picker. It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a file that is cut off part way
- **THEN** the page says "part-3.pdf is damaged and cannot be read.", shows no pages, and offers "Choose another file"

#### Scenario: Repair PDF is not published

- **WHEN** the file is damaged and Repair PDF is not in the registry
- **THEN** no link to Repair PDF is shown

### Requirement: A job that fails

When the job fails the page SHALL say what happened in one sentence and give one thing to try, with a way back to the pages that keeps the cuts. (SPEC.md: States every tool handles, Failed)

#### Scenario: The browser runs out of memory

- **WHEN** the browser runs out of memory during a split
- **THEN** the page says "Your browser ran out of memory. Mark cuts so the file is split into fewer parts, then try again.", and "Go back to your files" returns to the pages with the same cuts

#### Scenario: The engine cannot be fetched

- **WHEN** the engine or the zip step cannot be fetched because the connection has dropped
- **THEN** the page says the tool could not be loaded and to check the connection and try again

### Requirement: Large files

There SHALL be no fixed size limit. When the file is over 100 MB the page SHALL say "This file is more than 100 MB", that the job may be slow and a phone may run out of memory, and SHALL still let the job run. (SPEC.md: States every tool handles, Too large; Privacy, browser tools)

#### Scenario: A file over 100 MB

- **WHEN** a 105 MB file is listed
- **THEN** the warning is shown with the file's size on its line, and the main button can still be used

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and no request SHALL go to another origin. Whether the zip step is fetched SHALL NOT depend on the file. Files, names and passwords MUST NOT be written to any browser storage or to the address of the page. (SPEC.md: Privacy, browser tools; openspec: privacy)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, marks a cut, splits and downloads, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, naming the zip step's file exactly; no request has a body; none goes to another origin; none carries `qz7report.pdf`, `qz7report` or the password in its address; and the test fails the build if any does

#### Scenario: One part and several parts fetch the same files

- **WHEN** the test splits a one-page file and a three-page file, each on a fresh page, recording from the press of the main button to the result
- **THEN** each run's own requests include the zip step's file, and the two sets of paths, leaving out `blob:` addresses, are the same

#### Scenario: The watcher is shown to work

- **WHEN** a control test plants a POST, a `sendBeacon`, an image address holding the file name, a fetch from the worker, a request for the zip step's own path with `?x=1`, and a POST with a body to that path
- **THEN** the no-upload watcher fails on each one, reporting the query as data in the address and the POST for its method and body

#### Scenario: Storage and traces are looked at after a job

- **WHEN** a job has finished
- **THEN** cookies, local storage, session storage, IndexedDB, the Cache API and the private file system hold nothing of the file, and no file name, password or bookmark title ("Chapter one" from `rich.pdf`) is in the page title, the page address or the console

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and questions people really have, 250 to 500 words in all, in `src/content/`, marked as a draft until the owner has reviewed them. The questions SHALL cover how to mark cuts, what comes back with no cuts, how the files are named in the zip, what happens to bookmarks and attached files, and that the parts have no password. (SPEC.md: Tool page anatomy, 7; How the words should read; SEO, Every tool page)

#### Scenario: The text is in the served page

- **WHEN** the page is fetched and no script is run
- **THEN** the heading, the sentence, the how-to steps and the questions are in the response, with a title under 60 characters and a description under 155 that says files stay on the device

#### Scenario: The draft is marked

- **WHEN** the text has not been reviewed by the owner
- **THEN** its file says so, and the tool is reported as waiting on the owner
