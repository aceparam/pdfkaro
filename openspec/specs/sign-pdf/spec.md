# sign-pdf Specification

## Purpose
What the Sign PDF tool at `/sign-pdf` does: it places the visitor's signature, typed, drawn or from a picture, on the pages of one PDF they choose, in the visitor's browser, and leaves the rest of the file as it was. It makes no certificate signature.

## Requirements

### Requirement: The page

The tool SHALL be served at `/sign-pdf` with the title tag "Sign a PDF in your browser - PDFkaro", the heading "Sign a PDF" and the sentence "Put your signature on a PDF: type your name, draw it, or use a picture of it. Your file stays on your device." Its meta description SHALL say the file stays on the device and is not uploaded. It SHALL be listed third under "Edit and sign". (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/sign-pdf`
- **THEN** the heading, sentence and title are as above, the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page lists it

- **WHEN** the home page is built
- **THEN** "Sign PDF" is the third link under "Edit and sign", after "Add page numbers" and "Watermark"

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF, a picture included, SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `contract.pdf` and `notes.pdf` together
- **THEN** `contract.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A picture is dropped on the page

- **WHEN** a visitor drops `signature.png` on the page while `contract.pdf` is listed
- **THEN** `contract.pdf` stays listed, and the page says "signature.png is not a PDF, so it was not added."

### Requirement: The file is read, then listed with the options

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show the first page's thumbnail, the name, the page count and the size, with no Remove; then "How to add your signature" with "Type your name" chosen and focused, the field "Your name", "Which pages to sign" and "Where on the page", then the main button, waiting. (SPEC.md: Tool page anatomy, 4; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `contract.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and no option is shown yet

#### Scenario: A file has been read

- **WHEN** `contract.pdf`, 4 pages and 220 KB, has been read
- **THEN** its row shows "4 pages, 220 KB", then the three ways with "Type your name" chosen and focused, the empty field "Your name" with its hint, "Last page" chosen, "Bottom right" chosen, and "Sign and download" with "Type your name first." under it and read with it, and the status region says "contract.pdf, 4 pages, 220 KB."

#### Scenario: A keyboard user goes through the options

- **WHEN** a keyboard user presses Tab from "Type your name"
- **THEN** focus goes to the field "Your name", then the chosen page radio button, then the chosen place, then "Choose another file", then the main button

### Requirement: Three ways to make the signature

"How to add your signature" SHALL offer "Type your name", "Draw it" and "Use a picture of it", with "Type your name" first and chosen. Only the input for the way chosen SHALL be shown, hold the main button and be sent; the others SHALL keep what they hold. The main button SHALL wait until the way chosen has a signature. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4 and 5)

#### Scenario: Changing the way

- **WHEN** the visitor types "Jane Doe", then chooses "Draw it"
- **THEN** the field goes and the drawing pad appears after the choice, focus stays on "Draw it", the main button waits with "Draw your signature first.", and choosing "Type your name" again shows "Jane Doe"

#### Scenario: What the job is sent

- **WHEN** the visitor has typed a name and drawn a signature, chooses "Draw it" and presses the main button
- **THEN** the engine is sent the drawing and not the name, and the result carries the drawing

### Requirement: A typed signature

The field "Your name" SHALL take up to 50 characters on one line, of the standard fonts' characters: letters from English and other Western European languages, numbers and common marks. Other characters, or more than 50, SHALL be refused with a sentence. The name SHALL be drawn in Times Italic. The engine SHALL refuse any name the field would refuse, before reading the file. (SPEC.md: Scope notes, Sign PDF; What we are building, rule 4)

#### Scenario: A name is typed

- **WHEN** the visitor types "Jane Doe" and presses Enter
- **THEN** the job starts, as if the main button had been pressed, and the signed page shows "Jane Doe" in Times Italic

#### Scenario: Accented Western European letters

- **WHEN** the visitor types "Zoë Ångström-Núñez"
- **THEN** it is taken, and the page shows those characters as typed, with no accent, ring or tail cut off

#### Scenario: A name in another script

- **WHEN** the visitor types "सीता"
- **THEN** the field is marked invalid, the page says "Some characters cannot be used. To use other letters, choose “Draw it” or “Use a picture of it” above.", the hint saying which characters work, the main button does nothing, and no question marks are ever drawn

#### Scenario: The engine is sent a name it does not accept

- **WHEN** the engine is sent, with "Type your name" chosen, no name, an empty name, 51 characters, "सीता", a tab or something that is not a string
- **THEN** it refuses before reading the file, its error does not hold the name, and the page says "The signature was not added." and "Your name could not be used. Check it and try again."

### Requirement: A drawn signature

With "Draw it" chosen, the drawing pad SHALL be shown with the label "Draw your signature", a hint that names typing as the keyboard way, and "Clear the drawing". What is drawn SHALL be drawn on the page as lines in black, keeping its shape, trimmed to what was drawn. The engine SHALL refuse anything that is not a drawing within the tool's limits, before reading the file. (SPEC.md: Scope notes, Sign PDF; Works on a phone)

#### Scenario: A signature is drawn with a finger

- **WHEN** the visitor draws two lines in the pad with a finger on a phone at 360px
- **THEN** the page does not scroll, the lines show as drawn, and the main button works

#### Scenario: The drawing on the page

- **WHEN** the visitor draws a loop in the left half of the pad and signs the last page at the bottom right
- **THEN** the loop is drawn in black at the bottom right of the last page, the empty right half of the pad left out, its width and height in the same proportion as drawn

#### Scenario: A small drawing

- **WHEN** the visitor draws a small scribble in one corner of the pad
- **THEN** it is drawn as large as the size rule allows, and its lines are no thicker on the page than those of a drawing that fills the pad

#### Scenario: A dot

- **WHEN** the drawing holds a line of one point
- **THEN** it is drawn as a round dot the width of a full drawing's line, not grown to fill the signature's box

#### Scenario: The engine is sent a drawing it does not accept

- **WHEN** the engine is sent, with "Draw it" chosen, no drawing, an empty one, a point outside the pad, a number that is not whole, or more lines or points than the tool takes
- **THEN** it refuses before reading the file, and the page says "The signature was not added." and "The drawing could not be used. Clear it and draw again."

### Requirement: A picture of the signature

With "Use a picture of it" chosen, the field "Picture of your signature" SHALL take one JPG or PNG, read in the worker, with no size limit and a notice over 8 MB or 16 million pixels. It SHALL be drawn with its own colours and see-through parts, upright by its camera turn, keeping its shape. None of its details SHALL be copied into the file. (SPEC.md: Scope notes, Sign PDF; Privacy, limits and security)

#### Scenario: A PNG with a see-through background

- **WHEN** the visitor chooses `alpha.png` and signs the last page
- **THEN** the picture is drawn at the place chosen with the page showing through its see-through parts

#### Scenario: A photo taken on its side

- **WHEN** the visitor chooses a JPG whose camera turn says it was taken on its side
- **THEN** it is drawn upright, as a photo viewer shows it

#### Scenario: A picture with details

- **WHEN** the visitor chooses `details.jpg` or `details.png`, which carry a camera, a date, a place and text marked `SECRET-`
- **THEN** none of those markers is anywhere in the new file

#### Scenario: A picture that cannot be used

- **WHEN** the visitor chooses a damaged picture or a JPG with arithmetic coding
- **THEN** the field says so in one sentence naming the picture and what to do, and the main button does nothing

#### Scenario: A very large picture

- **WHEN** the visitor chooses `photo.jpg`, 12.4 MB and 24 million pixels
- **THEN** a notice names its size and pixels and says "A picture this large makes the signed file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.", the main button works, and the new file holds the picture once, compressed

#### Scenario: A picture too large for the file

- **WHEN** a picture whose data alone passes the size budget of a small PDF is placed
- **THEN** the job stops before anything is drawn, and the page says "The signature was not added." and "photo.jpg (24.6 MB) is too large to place on these pages. Crop it to the signature, or save a smaller copy."

#### Scenario: The engine is sent a picture it does not accept

- **WHEN** the engine is sent, with "Use a picture of it" chosen, no picture or bytes that are not an accepted picture
- **THEN** it refuses before reading the file, and the page says "The signature was not added." and "The picture could not be used. Choose another picture."

### Requirement: Which pages and where

"Which pages to sign" SHALL offer "Last page" (chosen at first), "First page" and "Every page". "Where on the page" SHALL offer bottom left, centre and right and top left, centre and right, with "Bottom right" chosen at first. The engine SHALL refuse a value it does not accept, before reading the file. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4)

#### Scenario: Pressing the main button untouched but for the signature

- **WHEN** the visitor types a name and presses the main button
- **THEN** the signature is on the last page at the bottom right, and on no other page

#### Scenario: Every page at the top left

- **WHEN** the visitor chooses "Every page" and "Top left"
- **THEN** every page carries the signature at its top left as shown

#### Scenario: A one-page file

- **WHEN** a one-page file is signed with any of the three page choices
- **THEN** its one page carries the signature once

### Requirement: Drawing the signature

The signature SHALL be drawn once on each chosen page, upright as the page is shown whatever its turn, size or boxes, inside the part shown, a twentieth of the shorter side from the chosen edges. It SHALL be at most three tenths of the shorter side wide and a tenth tall (a typed name a twentieth), keeping its shape, above the page's own content. The result MUST pass `qpdf --check`. (SPEC.md: Scope notes, Sign PDF; Definition of done)

#### Scenario: Pages turned and of mixed sizes

- **WHEN** `mixed.pdf` (A4, Letter on its side, A5 turned a quarter, A4 upside down) is signed on every page at the bottom right
- **THEN** each page, as a reader shows it, has the signature upright at its bottom right, inside its margin

#### Scenario: How large it is

- **WHEN** a wide drawing and then a tall picture are put on an A4 page
- **THEN** the drawing is about 179 points wide and no more than 60 tall, the picture about 60 points tall and narrower, each in its own proportions, and a typed "Jane Doe" is no more than 30 points tall

#### Scenario: A page whose shown part is smaller than its paper

- **WHEN** a page's crop box shows only part of its paper
- **THEN** the signature is placed inside the part shown

#### Scenario: A page of pictures

- **WHEN** `scanned.pdf`, whose pages are whole-page pictures, is signed
- **THEN** the signature shows over the picture

#### Scenario: Content that leaves its own drawing state

- **WHEN** a page's content sets a low opacity, a scaling `cm` and a fill colour and does not restore them
- **THEN** the signature is still at its place, its size and in its colours

#### Scenario: Every page of a long file

- **WHEN** `pages-500.pdf` is signed on every page with a picture
- **THEN** all 500 pages show it, and the new file holds the picture once

### Requirement: Nothing else changes

The new file SHALL keep every page and everything on it: text, links, form fields and values, notes, bookmarks, attached files, the document's details and tags. Pages not chosen SHALL be as they were, and a chosen page's own content SHALL stay in its content. The file SHALL have no password, no restrictions and no certificate signature. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; Scope notes; owner, 13 Nov 2026)

#### Scenario: A file with everything

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are signed on their last page
- **THEN** their bookmarks, link, `note.txt`, form fields and values, note, tags, named destination and reading thread are kept, their text is as before, and their other pages' objects are unchanged

#### Scenario: A protected file

- **WHEN** `password.pdf` opened with its password, or `restricted.pdf`, is signed
- **THEN** the result opens with no password and has no restrictions

#### Scenario: Pages that share one content stream

- **WHEN** a file whose pages all draw the same content stream is signed on every page
- **THEN** that stream is still one stream, shared, and unchanged

### Requirement: What the page says about the new file

The result SHALL say that the signature is drawn on the page and is not a digital signature; that text, links, form fields, bookmarks and attached files are kept; that earlier saved versions are not and a digital signature already in the file will no longer be valid; and that the new file has no password and no restrictions. (SPEC.md: What we are building, rule 4; Scope notes; CLAUDE.md: Signed files)

#### Scenario: The result notes

- **WHEN** a job finishes
- **THEN** the result shows the three notes, and the questions below the tool cover what this signature is and is not, signatures already in the file, PDF/A and passwords

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units with a Cancel button: "Reading the file", "Page 14 of 120" while every page is signed, then "Writing the signed file", with the bar not full until the file is written. Cancel SHALL stop the work and return to the file with the signature and choices kept. The page MUST stay responsive. (SPEC.md: States every tool handles, Working; Definition of done)

#### Scenario: Every page of a long file

- **WHEN** a 120-page file is signed on every page
- **THEN** the page shows "Reading the file", "Page 14 of 120" as it goes, then "Writing the signed file", a bar that never goes back, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor has drawn a signature, starts the job and presses Cancel
- **THEN** the work stops, no result is shown, and the file is listed with "Draw it" chosen and the drawing still in the pad

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button and "Start again". The name SHALL be the input's name with `-signed` before `.pdf`. Nothing SHALL download until Download is pressed. "Start again" SHALL forget the signature and set every choice to its start. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** the 4 pages of `contract.pdf` are signed
- **THEN** the result reads `contract-signed.pdf` with "4 pages" and its size, focus moves to the result heading, and nothing has downloaded

#### Scenario: Start again

- **WHEN** the visitor presses "Start again" and chooses another file
- **THEN** once it is read, "Type your name" is chosen, the field and the pad are empty, no picture is chosen, "Last page" and "Bottom right" are chosen, and the main button waits

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with a note that the password stays in the browser, and show no option until it is opened. A wrong password SHALL be reported and the field kept; "Choose another file" SHALL replace the file. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, no option is shown, and focus moves to the password field; once the right password opens the file, focus moves to "Type your name"

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says it is wrong and the password field stays

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published. (SPEC.md: States every tool handles, Damaged file)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-xref.pdf` or `damaged-cut.pdf`
- **THEN** the page says it is damaged and cannot be read, shows no option, and offers "Choose another file"

### Requirement: A job that fails

When the job fails, its code cannot be fetched, the browser runs out of memory, or the new file would grow far past what a signature adds, the page SHALL say "The signature was not added." with what happened in one sentence and one thing to try, and offer "Go back to your file" with the file, the signature and the choices kept. (SPEC.md: States every tool handles, Failed)

#### Scenario: The engine cannot be fetched

- **WHEN** the engine cannot be fetched because the connection has dropped
- **THEN** the page says "The signature was not added." and that the tool could not be loaded, and to check the connection and try again

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says the browser ran out of memory and to try on a computer, or to sign the last page only

#### Scenario: The new file would be far too large

- **WHEN** the file being written passes its size limit
- **THEN** writing stops at the limit, and the page says the new file would be far larger than expected, so it was not made, and that the file may be damaged and to try another copy of it

#### Scenario: Going back after a failure

- **WHEN** the visitor presses "Go back to your file"
- **THEN** the file is listed with the signature and choices as they were, and focus is on the main button

### Requirement: Large files

There SHALL be no fixed size limit for the PDF. A file over 100 MB SHALL show "This file is more than 100 MB", and a file of more than 20,000 pages SHALL show "This file has more than 20,000 pages", and the job SHALL still run. (SPEC.md: States every tool handles, Too large; Privacy, limits and security; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages has been read
- **THEN** the 20,000-page notice is shown, typing a name and drawing block the page for no more than 100 ms at a time, and signing the last page finishes

### Requirement: Nothing is uploaded

From the moment a file is picked until the result is downloaded, no request SHALL carry file contents, the file name, a password, the typed name, the drawing, or the picture or its name, and none SHALL go to another origin. None of them SHALL be written to browser storage, the page address, the title or the console. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test picks a protected file named `qz7contract.pdf`, types its password, types "Jq5name Vx2sig", signs, then does it again with a drawing and with a picture named `qz7sig.png`, and downloads each result, while watching every request from the page and its workers
- **THEN** after the pick only an exact list of the site's own files is requested, the same for the three ways, including the engine and pdf-lib's file and no other tool's engine; no request has a body or another origin; none carries `qz7contract`, the password, `Jq5name`, `Vx2sig` or `qz7sig`; no `blob:` address is made for the picture (each Blob given to `URL.createObjectURL` is a thumbnail or the result, never `image/*` or the picture's size), a marker inside the picture's bytes is in no request; and storage, the title, the address and the console hold none of them

#### Scenario: No hidden text reaches a request

- **WHEN** `rich.pdf`, `tagged.pdf` and `form.pdf` are signed while every request and the console are watched
- **THEN** their bookmark titles, attachment name, document titles, `SECRET-` markers and field values are in no request and not in the console, and the address has no query and no hash

### Requirement: The words on the page

The page SHALL carry three or four how-to steps and real questions, 250 to 500 words, in `src/content/`, marked as a draft, with no banned pattern and no question restating the title. They SHALL cover uploading, the three ways, where it can go (an edge of the first, last or every page, not a line mid-page), a typed name's characters, what this signature is not, pictures with a background, what is kept, passwords, and forgetting the file. (SPEC.md: Tool page anatomy, 7; SEO)

#### Scenario: The text is in the served page

- **WHEN** the built `/sign-pdf` page is fetched without running scripts
- **THEN** its heading, sentence, steps and questions are in the HTML
