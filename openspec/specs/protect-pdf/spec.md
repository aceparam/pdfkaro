# protect-pdf Specification

## Purpose
What the Protect with a password tool at `/protect-pdf` does: it writes one PDF again, in the visitor's browser, so that it opens only with a password the visitor sets, and leaves the rest of the file as it was.

## Requirements

### Requirement: The page

The tool SHALL be served at `/protect-pdf`, listed first under "Protect", with the title, heading, sentence and meta description given in the scenario below. Neither the sentence nor the meta description SHALL claim the password stays on the device, since the browser may offer to save it. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/protect-pdf`
- **THEN** the title tag reads "Protect a PDF with a password in your browser - PDFkaro", the heading "Protect a PDF with a password", the sentence "Add a password that is needed to open a PDF. Your file stays on your device. This site does not upload your file or the password.", the meta description reads "Add a password to a PDF so it cannot be opened without it. The file and the password are not uploaded.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page lists it

- **WHEN** the home page is built
- **THEN** "Protect with a password" is the first link under "Protect"

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed with the password fields

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line; the fields "New password" and "Type the new password again" SHALL follow, empty, focus on the first, then the main button, waiting. (SPEC.md: Tool page anatomy, 4; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the password fields are not shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page and "12 pages, 1.4 MB", with no Remove, then the two empty fields, the hint under the first and the shared note under the second, focus in the first, then "Protect and download" with "Type a password first." under it and read with it, and the status region says "report.pdf, 12 pages, 1.4 MB."

### Requirement: The new password

The new password SHALL be typed twice in two hidden fields, as every new password is: up to 127 printable ASCII characters, no space first or last, used exactly as typed. The main button SHALL wait until both fields hold the same password the rule takes. The engine SHALL refuse any password the fields would refuse, before reading the file. (SPEC.md: Tool page anatomy, 4 and 5; Privacy, limits and security, Browser tools)

#### Scenario: Nothing is typed

- **WHEN** the visitor presses "Protect and download" with the first field empty
- **THEN** no job starts, the button reads "Type a password first." to a screen reader, and Enter in either field has the status region say it, on every press

#### Scenario: Typed once only

- **WHEN** the visitor types a password in the first field and nothing, or only its start, in the second
- **THEN** the main button waits with "Type the password again to check it." under it, and no field is marked invalid

#### Scenario: The two passwords differ

- **WHEN** the second field holds a password that is not the first and not its start
- **THEN** the second field is marked invalid with "The two passwords are not the same. Type the password again in this box." between its label and the field, the main button does nothing, and the status region says it once

#### Scenario: Characters the rule does not take

- **WHEN** the visitor types "café", "पासवर्ड" or a password longer than 127 characters
- **THEN** the first field is marked invalid with the shared sentence for that problem, which never names a character, a length or the password, and the main button does nothing

#### Scenario: Enter in the first field

- **WHEN** the first field holds "Kv4 #%@ wq9" and the visitor presses Enter in it
- **THEN** focus moves to "Type the new password again", and no job starts

#### Scenario: Both fields match

- **WHEN** both fields hold "Kv4 #%@ wq9" and the visitor presses Enter in the second field
- **THEN** the job starts, as if the main button had been pressed

#### Scenario: Keyboard only

- **WHEN** a keyboard user reaches the fields with Tab
- **THEN** Tab goes from "New password" to "Type the new password again", then to "Choose another file", then the main button

#### Scenario: Screen reader

- **WHEN** a screen reader user reaches "New password"
- **THEN** it is announced as a password field with its label, the hint saying the password cannot be recovered and a short one is easy to guess, and the note that the password stays in the browser, though the note is shown under the second field

#### Scenario: The engine is sent a password it does not accept

- **WHEN** the engine is sent no password, an empty one, 128 characters, "café", a space at an end, or something that is not a string
- **THEN** it refuses before reading the file, writes nothing, its error does not hold the password, and the page says "The password was not added." and "The password could not be used. Go back to your file and type it again."

### Requirement: The cannot-be-recovered warning

The hint next to the first field SHALL say first that if the password is forgotten the file cannot be opened and no one can get it back, then that a short password is easy to guess, then the length and the rule. (SPEC.md: What we are building, rule 4, "Honest about limits")

#### Scenario: The hint is read

- **WHEN** the file has been read and the fields are shown
- **THEN** the hint under "New password" begins "If you forget this password, no one can open the file or get it back. A short password is easy to guess." and is part of the field's description

### Requirement: Writing the protected file

Pressing the main button SHALL write one PDF encrypted with 256-bit AES (revision 6), opened by the new password and no other, with every permission allowed, the same password used for opening and for permissions. The document's details and XMP details SHALL be encrypted. The result MUST pass `qpdf --check` with the password. (SPEC.md: Architecture and tech stack; Definition of done)

#### Scenario: An ordinary file

- **WHEN** `text.pdf` is protected with "Kv4 #%@ wq9"
- **THEN** the result asks for a password in qpdf and in PDF.js, opens with "Kv4 #%@ wq9" with its three pages and their text as before, refuses "Kv4 #%@ wq", an empty password and no password, and reports R 6, AESv3 for streams, strings and files, and every permission allowed

#### Scenario: The document's details are hidden

- **WHEN** a file whose title and XMP details hold marked words is protected
- **THEN** neither marked word appears in the bytes of the result, and both are read back as before once the file is opened with the password

#### Scenario: The password is not in the file

- **WHEN** any fixture is protected with a marked password
- **THEN** the password does not appear in the bytes of the result

#### Scenario: Encrypted twice

- **WHEN** the same file is protected twice with the same password
- **THEN** the two results differ in their keys and their encrypted bytes

### Requirement: A file that already has a password or restrictions

A file that needs a password SHALL be opened with its own password, as every tool asks for it, and written with the new password only. Restrictions it had SHALL be dropped. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file

- **WHEN** `password.pdf`, opened with `open-sesame`, is protected with a new password
- **THEN** the result opens with the new password, no longer with `open-sesame`, has AES-256 encryption with every permission allowed, and holds neither `open-sesame` nor the new password in its bytes

#### Scenario: A file with restrictions only

- **WHEN** `restricted.pdf` is protected
- **THEN** the result needs the new password to open and has no restrictions

#### Scenario: A file with older encryption

- **WHEN** a file encrypted with 128-bit RC4 is opened with its password and protected
- **THEN** the result uses 256-bit AES only

### Requirement: Nothing else changes

The new file SHALL keep every page and everything on it: text, links, form fields with their values, notes, bookmarks, attached files, the document's details and accessibility tags, all readable once it is opened with the password. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change")

#### Scenario: A file with everything

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are protected and opened with the password
- **THEN** their bookmarks, link, `note.txt`, form fields and values, note, tags, named destination and reading thread are kept, and their text is as before

#### Scenario: Pages turned and of mixed sizes

- **WHEN** `mixed.pdf` is protected and opened with the password
- **THEN** each page has the size and turn it had

#### Scenario: A long file

- **WHEN** `pages-500.pdf` is protected
- **THEN** all 500 pages are there, with their text

### Requirement: What the page says about the new file

The result SHALL say that the file now needs the password and that a forgotten password cannot be recovered, that text, links, form fields, bookmarks and attached files are kept, that earlier saved versions are not and a digital signature will no longer be valid, and that an earlier password or restrictions are replaced. (SPEC.md: What we are building, rule 4; CLAUDE.md: Signed files)

#### Scenario: The result notes

- **WHEN** a job finishes
- **THEN** the result shows these notes, and the questions below the tool cover them, a short password, the browser's offer to save the password, and what a password does not hide

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units with Cancel: "Reading the file", then "Writing the protected file" with a bar that never goes back and moves on during the final checks. Cancel SHALL stop the work and return to the file with both fields as typed. The page MUST stay responsive. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: A job is running

- **WHEN** `pages-500.pdf` is protected
- **THEN** the page shows "Reading the file", then "Writing the protected file" and a bar that fills as qpdf writes and moves on after each check of the result, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor has typed the password twice, starts the job and presses Cancel
- **THEN** the work stops, no result is shown, and the file is listed with both fields still holding the password and the main button ready

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-protected` before `.pdf`. Nothing SHALL download until Download is pressed. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 12 pages of `report.pdf` are protected
- **THEN** the result reads `report-protected.pdf` with "12 pages" and its size, focus moves to the result heading, and nothing has downloaded

### Requirement: The password is held no longer than needed

The page SHALL forget the new password when the job finishes, on "Start again", when the only file is left out, and when the page is left, and SHALL empty both fields then. It SHALL keep it through Cancel, a failure and "Choose another file". No field SHALL ever carry the password in a `value` attribute. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: After the result

- **WHEN** a job finishes and the visitor presses "Start again" and chooses another file
- **THEN** once it is read, both fields are empty and the main button waits

#### Scenario: The only file is left out

- **WHEN** the visitor has typed the password twice, chooses another file that needs its own password, and presses "Choose another file" at its password field
- **THEN** once a new file is read, both fields are empty

#### Scenario: Leaving the page

- **WHEN** the visitor has typed the password twice and the page receives the `pagehide` event a browser sends when it keeps a page for the Back button
- **THEN** straight after it, no password field remains on the page or each holds nothing, and the page's HTML does not hold the password

#### Scenario: Back to the page

- **WHEN** the visitor leaves the page and comes back with the browser's Back button
- **THEN** the page shows no file

#### Scenario: The markup

- **WHEN** the password has been typed in both fields in a real browser, and again after Cancel and after "Go back to your file"
- **THEN** neither input has a `value` attribute, and the page's HTML does not hold the password

### Requirement: A file that needs a password

When the chosen file needs its own password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and show no new password fields until it is opened. A wrong password SHALL be reported and the field kept. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no new password field is shown, and focus is in it; once the right password opens the file, focus moves to "New password"

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says it is wrong and the password field stays

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-xref.pdf` or `damaged-cut.pdf`
- **THEN** the page says it is damaged and cannot be read, shows no password fields, and offers "Choose another file"

### Requirement: A job that fails

When the job fails, its code cannot be fetched, the browser runs out of memory, or the file being written passes its size limit, the page SHALL say "The password was not added." with what happened in one sentence and one thing to try, and offer "Go back to your file" with the file and both fields kept. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The password was not added." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says the browser ran out of memory and to try on a computer

#### Scenario: The new file would be far too large

- **WHEN** the file being written passes twice the input's size plus 16 MB
- **THEN** writing stops at the limit, and the page says the new file would be far larger than expected, so it was not made, and that the file may be damaged and to try another copy of it

#### Scenario: Going back after a failure

- **WHEN** the visitor presses "Go back to your file"
- **THEN** the file is listed with both fields as typed, and focus is on the main button

### Requirement: Large files

There SHALL be no fixed size limit. A file over 100 MB SHALL show "This file is more than 100 MB", a file of more than 20,000 pages SHALL show "This file has more than 20,000 pages", and the job SHALL still run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read
- **THEN** the 20,000-page notice is shown, typing in the fields blocks the page for no more than 100 ms a key, and the job runs once both fields match

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, the file name, the input password or the new password, and none SHALL go to another origin. None of them SHALL be written to browser storage, the page address, the title, the page's console or the worker's console. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7report.pdf`, types its password, types "Qz7 pw#%@ Kv4" in both fields, protects the file and downloads it, while watching every request, page error and console message from the page and its worker
- **THEN** after the pick only an exact list of the site's own files is requested, including the engine and no other tool's engine; no request has a body or another origin; none carries `qz7report.pdf`, `qz7report`, either password or the new password's parts, plain or URL-encoded; storage, the title, the address and both consoles (the text and the arguments of each message, the worker's watched from before the page opens) hold none of them; no page error occurred; and the downloaded file does not hold the new password

#### Scenario: No hidden text reaches a request

- **WHEN** `rich.pdf`, `tagged.pdf` and `form.pdf` are protected while every request and the console are watched
- **THEN** their bookmark titles, attachment name, document titles, `SECRET-` markers and field values are in no request and not in the console, and the address has no query and no hash

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft for the owner, with nothing from "Banned patterns" and no question that restates the title. The questions SHALL cover uploading, a forgotten password, a short password, the browser's offer to save it, signatures, an earlier password, and what a password does and does not hide. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page; How the words should read)

#### Scenario: The text is in the served page

- **WHEN** the built `/protect-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML, they include "A short password can be guessed by anyone who has the file.", and they say that without the password the file's name (ending `-protected`), whether it holds bookmarks, attached files or a form, roughly how large its parts are, each picture's pixel size and format, each attached file's type and size, font names, the size of some drawn parts, such as form-field boxes, and, in a file that already has page numbers, a watermark or a signature added on this site, each page's size, and some other names inside it stay visible, while its pages, its text, what its pictures show and the names and contents of its attached files do not; they never say pictures or attached files are hidden as a whole
