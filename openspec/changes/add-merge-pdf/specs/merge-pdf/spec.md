# Spec Delta

## Purpose

What the Merge PDF tool at `/merge-pdf` does: it joins several PDF files into one, in the visitor's browser, in the order the visitor sets. Each requirement refines `SPEC.md`, which stays the source of truth.

## ADDED Requirements

### Requirement: Choosing files

The page SHALL take several PDF files at once and let more be added. Files SHALL be taken from the picker button, from a drop anywhere on the page, and from paste. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Files are chosen

- **WHEN** a visitor chooses two PDF files with the "Choose PDF files" button
- **THEN** both are listed, in the order chosen

#### Scenario: More files are added

- **WHEN** files are listed and the visitor presses "Add more files" and chooses another
- **THEN** it is added to the end of the list

#### Scenario: A file is dropped or pasted

- **WHEN** a visitor drops or pastes a PDF anywhere on the page
- **THEN** it is listed as if it had been chosen with the button

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a file that is not a PDF
- **THEN** it is not listed, and the page says the file is not a PDF and names it

### Requirement: Each file is read before the job

While the engine loads, each file SHALL show "Getting ready" beside its name. When a file has been read, it SHALL show its page count and its size in plain units. The list SHALL say how many files and pages there are in all. (SPEC.md: States every tool handles; Details that apply everywhere)

#### Scenario: The engine is loading

- **WHEN** a file has been picked and the engine has not finished loading
- **THEN** the file's name is shown with "Getting ready" beside it, and a Cancel button is shown

#### Scenario: A file has been read

- **WHEN** a 64-page file of 6.1 MB has been read
- **THEN** it shows "64 pages, 6.1 MB"

### Requirement: The visitor sets the order

Files SHALL be joined in the order listed. Each file SHALL have "Move up", "Move down" and "Remove" buttons, and the list SHALL also be reorderable by drag. Each button SHALL name its file to a screen reader. A button that cannot be used SHALL stay focusable. (SPEC.md: Details that apply everywhere)

#### Scenario: A file is moved with the keyboard

- **WHEN** a visitor focuses "Move down" on the first file and presses Enter
- **THEN** the file moves to second place, focus stays on a button of that file, and the new place is announced

#### Scenario: The first file cannot move up

- **WHEN** a visitor tabs to "Move up" on the first file
- **THEN** the button takes focus, is marked as unavailable, and does nothing when pressed

#### Scenario: A file is removed

- **WHEN** a visitor presses "Remove" on a file
- **THEN** it leaves the list, and when the last file is removed the page returns to the file picker alone

### Requirement: Merging

The main button SHALL read "Merge and download". Pressing it SHALL join every page of every listed file, in order, into one PDF. The result MUST pass `qpdf --check`. Page content, links and form fields SHALL be kept. The first file's bookmarks and attachments SHALL be kept; those of later files are not, and the page SHALL say so. (SPEC.md: Tool page anatomy, 5; Definition of done; What we are building, rule 4)

#### Scenario: Two files are merged

- **WHEN** a 3-page file and a 2-page file are merged in that order
- **THEN** the result has 5 pages, the first 3 from the first file and the last 2 from the second

#### Scenario: The order is changed first

- **WHEN** the visitor moves the second file above the first and merges
- **THEN** the result starts with the pages of the file that is now first

#### Scenario: One file is listed

- **WHEN** only one file is listed
- **THEN** the main button is marked as unavailable, and the page says to add at least one more file

#### Scenario: The first file has bookmarks

- **WHEN** the first file has bookmarks, links and a form field
- **THEN** all three are in the result

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units, with a Cancel button. Cancel SHALL stop the work and return to the list of files. The page MUST stay responsive while a job runs. (SPEC.md: States every tool handles; Rules for the code, 3)

#### Scenario: A job is running

- **WHEN** three files are being merged
- **THEN** the page shows which file of three is being read, then how much of the result has been written, and a Cancel button

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the work stops, no result is shown, and the list of files is back as it was

#### Scenario: Progress is announced

- **WHEN** a job is running and a screen reader is in use
- **THEN** progress is in a status region, and is not announced more than once a second

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and a "Start again" button. The name SHALL be the first file's name with `-merged` before `.pdf`. Nothing SHALL download until the visitor presses Download. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** `report-part-1.pdf` and `appendix.pdf` are merged
- **THEN** the result is named `report-part-1-merged.pdf`, its true size and page count are shown, and no download has started

#### Scenario: Download is pressed

- **WHEN** the visitor presses Download
- **THEN** the browser saves the file under that name

#### Scenario: The result is announced

- **WHEN** the job finishes while a screen reader is in use
- **THEN** the screen reader announces that the file is ready, and focus moves to the result

#### Scenario: Start again

- **WHEN** the visitor presses "Start again"
- **THEN** the page returns to the file picker alone and the files are forgotten

### Requirement: A file that needs a password

When a file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to leave the file out. The merged file has no password, and the page SHALL say so. (SPEC.md: States every tool handles; Privacy, browser tools)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses a password-protected PDF with other files
- **THEN** the file is listed as needing a password, a password field for it is shown with the note, and the main button waits

#### Scenario: The password is right

- **WHEN** the visitor types the right password and presses "Open the file"
- **THEN** the file shows its page count and the main button can be used

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says the password did not open the file, keeps the field, and moves focus to it

#### Scenario: The file is left out

- **WHEN** the visitor presses "Leave this file out"
- **THEN** the file leaves the list and the rest can be merged

#### Scenario: A file has restrictions but no password

- **WHEN** a visitor chooses a file with print and edit restrictions and no password to open it
- **THEN** it is listed with its page count and no password is asked for

### Requirement: A damaged file

When a file cannot be read as a PDF the page SHALL say that the file is damaged, name it, and offer to carry on without it. It MUST NOT offer a link to a tool that is not published. (SPEC.md: States every tool handles; openspec: tool-registry, related tools)

#### Scenario: A damaged file is chosen with others

- **WHEN** a visitor chooses two good files and one with a broken cross-reference table that cannot be read
- **THEN** the page says the third file is damaged, lists the two good files, and offers "Merge the other 2 files"

#### Scenario: Repair PDF is not published

- **WHEN** a file is damaged and Repair PDF is not in the registry
- **THEN** no link to Repair PDF is shown

### Requirement: A job that fails

When the job fails the page SHALL say what happened in one sentence and give one thing to try, with a way back to the files. (SPEC.md: States every tool handles)

#### Scenario: The engine fails

- **WHEN** the engine reports an error it cannot recover from
- **THEN** the page shows one sentence on what happened and one next step, no error code alone and no stack trace, and a button back to the files

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says the tool could not be loaded and to check the connection and try again

### Requirement: Large files

There SHALL be no fixed size limit. When the listed files together are over 100 MB the page SHALL warn that the merge may be slow and that a phone may run out of memory, and SHALL still let the job run. (SPEC.md: Privacy, browser tools)

#### Scenario: The files pass 100 MB

- **WHEN** the listed files add up to 164 MB
- **THEN** the warning is shown and the main button can still be used

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, a file name or a password, and no request SHALL go to another origin. Files, names and passwords MUST NOT be written to any browser storage or to the address of the page. (SPEC.md: Privacy, browser tools; openspec: privacy)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks files, types a password, merges and downloads, while watching every request from the page and its worker
- **THEN** no request has a body, none goes to another origin, none carries a file name or the password in its address, and the test fails the build if any does

#### Scenario: Storage is looked at after a job

- **WHEN** a job has finished
- **THEN** cookies, local storage, session storage and IndexedDB are empty, and the address of the page has not changed

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and questions people really have, 250 to 500 words in all, in `src/content/`, marked as a draft until the owner has reviewed them. The questions SHALL cover what happens to bookmarks and that the merged file has no password. (SPEC.md: Tool page anatomy, 7; How the words should read)

#### Scenario: The text is in the served page

- **WHEN** the page is fetched and no script is run
- **THEN** the how-to steps and the questions are in the response

#### Scenario: The draft is marked

- **WHEN** the text has not been reviewed by the owner
- **THEN** its file says so, and the tool is reported as waiting on the owner
