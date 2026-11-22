# unlock-pdf Specification

## Purpose
What the tool at `/unlock-pdf` does: it writes one PDF again, in the visitor's browser, with no password and no print or edit restrictions, using only a password the visitor types, and leaves the rest of the file as it was.

## Requirements

### Requirement: The page

The tool SHALL be served at `/unlock-pdf`, listed second under "Protect" as "Remove a password", with the title, heading, sentence and meta description given below. No page SHALL say "unlock", by the owner's decision of 22 Nov 2026; only the address keeps it. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; Banned patterns; SEO, Every tool page; CLAUDE.md: Owner decisions)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/unlock-pdf`
- **THEN** the title tag reads "Remove a password from a PDF in your browser - PDFkaro", the heading "Remove a password from a PDF", the sentence "Remove print and edit restrictions from a PDF, and its password if you know it. Your file stays on your device. This site does not upload your file or the password.", the meta description "Remove print and edit restrictions from a PDF, and its password if you know it. The file and the password are not uploaded.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page lists it

- **WHEN** the home page is built
- **THEN** "Remove a password" is the second link under "Protect", after "Protect with a password", and Protect's page now links to it

#### Scenario: The banned word

- **WHEN** the text of `/unlock-pdf`, the home page and every page linking to it is searched
- **THEN** its visible text and title do not hold "unlock"; the word appears only in the address `/unlock-pdf`

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line, then the main button, "Remove protection and download", ready with no option to set. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready"

#### Scenario: A file with restrictions only has been read

- **WHEN** `restricted.pdf`, which opens without a password, has been read
- **THEN** no password is asked for, its row shows its first page, "3 pages" and its size, focus is on "Remove protection and download", which works, and the status region says "restricted.pdf, 3 pages," with its size, once

#### Scenario: Keyboard only

- **WHEN** a keyboard user has chosen a file with restrictions only
- **THEN** Tab goes from "Choose another file" to the main button, and Enter or Space on it starts the job

### Requirement: A file that needs a password

When the chosen file needs a password to open, the page SHALL ask for it in the labelled field that names the file, with the note that the password stays in the browser, and the main button SHALL not show until the file is open. Either of the file's passwords SHALL open it. A wrong password SHALL be reported, the field kept, and no other password tried. (SPEC.md: States every tool handles, Password needed; Scope notes, Unlock)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, focus is in it, and once `open-sesame` opens the file, focus moves to "Remove protection and download"

#### Scenario: The password for permissions is typed

- **WHEN** the visitor types the file's password for permissions, `owner-secret`, instead
- **THEN** the file opens as it does with `open-sesame`

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says it is wrong, the field stays for another try, and nothing else is tried

#### Scenario: Screen reader

- **WHEN** a screen reader user reaches the password field
- **THEN** it is announced as a password field labelled with the file's name, with the note that the password stays in the browser

### Requirement: Writing the file without protection

Pressing the main button SHALL write one PDF that is not encrypted, so it opens with no password and carries no print, copy or edit restrictions. Only the password the visitor typed SHALL be used, once. The result MUST pass `qpdf --check`, and MUST be checked to be unencrypted before it is given back. (SPEC.md: Scope notes, Unlock; Architecture and tech stack; Definition of done)

#### Scenario: A file that needs a password

- **WHEN** `password.pdf`, opened with `open-sesame`, is written
- **THEN** the result opens in qpdf and PDF.js with no password, is reported as not encrypted, has its three pages and their text as before, and does not hold `open-sesame` in its bytes

#### Scenario: A file with restrictions only

- **WHEN** `restricted.pdf` is written
- **THEN** the result is not encrypted, and qpdf reports every permission allowed

#### Scenario: Older and other encryption

- **WHEN** files encrypted with 128-bit AES, 128-bit RC4 and 40-bit RC4, each opened with its password, and a file with only a password for permissions, are written
- **THEN** each result is not encrypted and passes `qpdf --check`

### Requirement: A file with nothing to remove

When the chosen file has no password and no restrictions, the job SHALL end with no new file, and the page SHALL say "This file has no password or restrictions." and "There was nothing to remove, so no new file was made. You can use your file as it is.", with "Start again" and no Download. It MUST NOT be called damaged. (SPEC.md: Definition of done, "a clear message saying why it cannot"; What we are building, rule 4)

#### Scenario: An ordinary file

- **WHEN** `text.pdf` is chosen and the main button pressed
- **THEN** the page shows the heading and its advice, focus moves to the first, nothing downloads, and "Start again" empties the page

### Requirement: A file protected another way

When the file is encrypted by a method qpdf cannot open, such as a certificate, the page SHALL say it "is saved in a way this tool cannot read", then "It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection.", and SHALL offer "Choose another file". It MUST NOT call the file damaged. (SPEC.md: Tool page anatomy; What we are building, rule 4, "Honest about limits")

#### Scenario: A file encrypted with a certificate

- **WHEN** a visitor chooses `certified.pdf`, whose encryption names a certificate filter
- **THEN** the page reads "certified.pdf is saved in a way this tool cannot read." and "It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection.", and shows no main button

### Requirement: Nothing else changes

The new file SHALL keep every page and everything on it: text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change")

#### Scenario: A protected file with everything

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf`, each first protected in the test with a password, are written with that password
- **THEN** their bookmarks, link, `note.txt`, form fields and values, note, tags, named destination and reading thread are kept, and their text is as before

#### Scenario: Pages turned and of mixed sizes

- **WHEN** `mixed.pdf`, first protected in the test, is written
- **THEN** each page has the size and turn it had

#### Scenario: A long file

- **WHEN** `pages-500.pdf`, first protected in the test, is written
- **THEN** all 500 pages are there, with their text

### Requirement: What the page says about the new file

The result SHALL say that the file now opens with no password and its print, copy and edit restrictions are removed, that anyone who has this copy can open it, that text, links, form fields, bookmarks and attached files are kept, and that earlier saved versions are not and a digital signature will no longer be valid. (SPEC.md: What we are building, rule 4; CLAUDE.md: Signed files)

#### Scenario: The result notes

- **WHEN** a job finishes with a file
- **THEN** the result shows these notes, and the questions below the tool cover them

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units with Cancel: "Reading the file", then "Writing the unprotected file" with a bar that never goes back and moves on during the final checks. Cancel SHALL stop the work and return to the listed file, already open. The page MUST stay responsive. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A job is running

- **WHEN** `pages-500.pdf`, first protected in the test, is written
- **THEN** the page shows "Reading the file", then "Writing the unprotected file" and a bar that fills as qpdf writes and moves on after each check, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor has opened `password.pdf` with its password, starts the job and presses Cancel
- **THEN** the work stops, no result is shown, and the file is listed with the main button ready, without asking for the password again

### Requirement: The result

When the job gives a file the page SHALL show its name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-unprotected` before `.pdf`, by the owner's decision of 22 Nov 2026. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 3 pages of `password.pdf` are written
- **THEN** the result reads `password-unprotected.pdf` with "3 pages" and its size, focus moves to the result heading, and nothing has downloaded

### Requirement: The typed password is held no longer than needed

The page SHALL keep the typed password while that file is listed, through Cancel and a failure, and SHALL forget it when a job ends with a file or with no new file, when the file is replaced or left out, on "Start again" and when the page is left. No field SHALL carry it in a `value` attribute. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: After a result

- **WHEN** `password.pdf` has been written and the result is shown
- **THEN** the page holds the password no longer, and after "Start again" choosing `password.pdf` again asks for its password again

#### Scenario: After a failure

- **WHEN** a job on `password.pdf` fails and the visitor presses "Go back to your file"
- **THEN** the file is listed, open, and the main button works without the password being typed again

#### Scenario: Leaving the page

- **WHEN** the visitor has typed the password and the page receives the `pagehide` event a browser sends when it keeps a page for the Back button
- **THEN** straight after it, no file is listed and the page's HTML does not hold the password

#### Scenario: The markup

- **WHEN** the password has been typed in a real browser, and again after a wrong password
- **THEN** the input has no `value` attribute, and the page's HTML does not hold the password

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-xref.pdf` or `damaged-cut.pdf`
- **THEN** the page says it is damaged and cannot be read, shows no main button, and offers "Choose another file"

### Requirement: A job that fails

When the job fails, its code cannot be fetched, the browser runs out of memory, or the file being written passes its size limit, the page SHALL say "The protection was not removed." with what happened in one sentence and one thing to try, and offer "Go back to your file" with the file kept open. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The protection was not removed." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says the browser ran out of memory and to try on a computer

#### Scenario: The new file would be far too large

- **WHEN** the file being written passes twice the input's size plus 16 MB
- **THEN** writing stops at the limit, and the page says the new file would be far larger than expected, so it was not made, and that the file may be damaged and to try another copy of it

#### Scenario: Going back after a failure

- **WHEN** the visitor presses "Go back to your file"
- **THEN** the file is listed, open, with focus on the main button

### Requirement: Large files

There SHALL be no fixed size limit. A file over 100 MB SHALL show "This file is more than 100 MB", a file of more than 20,000 pages SHALL show "This file has more than 20,000 pages", and the job SHALL still run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read
- **THEN** the 20,000-page notice is shown and the job runs

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, the file name or the password, and none SHALL go to another origin. None of them SHALL be written to browser storage, the page address, the title, the page's console or the worker's console. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf` whose password is "Qz7 pw#%@ Kv4", types it, writes the file and downloads it, while watching every request, page error and console message from the page and its worker
- **THEN** after the pick only an exact list of the site's own files is requested, including the engine and no other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report`, the password or its parts, plain or URL-encoded, or the file's page text; storage, the title, the address and both consoles hold none of them; no page error or policy violation occurred; and the downloaded file does not hold the password

#### Scenario: A file with restrictions only

- **WHEN** `restricted.pdf` is written with no password typed, while every request and the console are watched
- **THEN** its page text is in no request and not in the console

#### Scenario: No hidden text reaches a request

- **WHEN** `rich.pdf`, `tagged.pdf` and `form.pdf`, protected with a marked password, are written while every request and the console are watched
- **THEN** their bookmark titles, attachment name, document titles, `SECRET-` markers and field values are in no request and not in the console, and the address has no query and no hash

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft for the owner, with nothing from "Banned patterns" and no question that restates the title. The questions SHALL cover what the scenario lists. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page; How the words should read)

#### Scenario: The text is in the served page

- **WHEN** the built `/unlock-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML, and they say the tool does not guess or recover a forgotten password, that a file with restrictions only needs no password, that restrictions should be removed only from a file the visitor is allowed to change, that a file with nothing to remove can be used as it is, that whoever sent a file protected another way can be asked for a copy without it, and that a digital signature stops being valid
