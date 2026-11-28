# Spec Delta

## Purpose

What the Flatten PDF tool at `/flatten-pdf` does: drawing a PDF's form fields and comments into its pages as they would print and removing them, keeping links, bookmarks, attachments and text, turning away files whose fields it cannot draw as a reader shows them, and every state the page shows, with no file data leaving the browser. Its scope follows the owner's answers to questions 1 and 2 of `add-flatten-pdf`.

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/flatten-pdf` with the title, heading and sentence below, and a meta description that says the file stays on the device and is not uploaded. It SHALL be listed under "Make smaller and fix" after Repair PDF, and the hub's description SHALL name flattening. Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page and Site-wide)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/flatten-pdf`
- **THEN** the title is "Flatten a PDF in your browser - PDFkaro", the heading "Flatten a PDF", the sentence "Turn form fields and comments into part of the page. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page and the hub list it

- **WHEN** the site is built
- **THEN** "Flatten PDF" is listed under "Make smaller and fix" right after "Repair PDF" on the home page and on `/make-smaller-and-fix`, and the hub's description and sentence still name what they named and now name flattening forms and comments

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `form.pdf` and `rich.pdf` together
- **THEN** `form.pdf` is listed, and the page says "This tool takes one file, so rich.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses `not-a-pdf.pdf`
- **THEN** it is not listed, and the page says "not-a-pdf.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed

While the engine loads and reads the file, its row SHALL show "Getting ready"; once read, the name, page count and size, with the first page's thumbnail, and "Flatten and download", which works with nothing else to choose. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Engine loading)

#### Scenario: A file being read

- **WHEN** a file has been chosen and the engine has not finished loading or reading it
- **THEN** its row shows "Getting ready", and the main button is shown but cannot be used yet

#### Scenario: A file has been read

- **WHEN** `form.pdf` has been read
- **THEN** its row shows "1 page" and its size, and "Flatten and download" can be used

### Requirement: A file that needs a password

When the file needs a password, the page SHALL ask for it in a labelled field naming the file, with the note that the password stays in the browser; a wrong one SHALL be reported and the field kept. A file with restrictions only SHALL ask for no password. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the main button is not, and focus moves to the field

#### Scenario: The right and a wrong password

- **WHEN** the visitor types `nope`, then `open-sesame`
- **THEN** the page first says the password did not open the file and keeps the field, then lists the file with 3 pages

### Requirement: A damaged file, and very large files

A damaged file SHALL show the shared damaged notice with its link to Repair PDF. A file over 100 MB SHALL show the shared notice that the job may be slow or run out of memory on a phone, and a file over 20,000 pages the shared page-count notice; neither stops the job. (SPEC.md: States every tool handles, Damaged file and Too large; Privacy, limits and security, Browser tools)

#### Scenario: A damaged file

- **WHEN** a visitor chooses `damaged-xref.pdf`
- **THEN** the page says "damaged-xref.pdf is damaged and cannot be read.", with "Leave this file out" and the sentence and link to Repair PDF

#### Scenario: A file over 100 MB

- **WHEN** a visitor chooses the 110 MB file made by `make-large.mjs`
- **THEN** the large-file notice is shown and the main button can be used

### Requirement: What is flattened

Every form field and every annotation of a flattened kind that has its own drawing and is set to print SHALL be drawn into its page where and as it prints, in its layer if it has one, and then removed, with the form itself; one set not to print, or hidden, SHALL be removed with nothing drawn. A comment's written text SHALL NOT be drawn or kept. Drawn text SHALL stay searchable. (Owner question 1 of `add-flatten-pdf`; SPEC.md: Tool catalogue; What we are building, rule 4)

#### Scenario: The flattened kinds

- **WHEN** the engine decides which annotations to flatten
- **THEN** the flattened kinds are form fields (text, choice, check box, radio button, push button and signature), highlights, underlines, squiggly underlines, strike-outs, carets, notes' icons, free text, lines, squares, circles, polygons, polylines, ink, stamps and watermark annotations, and no other

#### Scenario: The fillable form

- **WHEN** `form.pdf` is flattened
- **THEN** the new file has no form, no field and no annotation, its page shows "Sample text" in the field's place and the empty check box's look, and "Sample text" can be found by searching

#### Scenario: Every kind and flag

- **WHEN** `flatten-kinds.pdf` is flattened
- **THEN** each annotation of a flattened kind set to print is drawn at its place and removed; one set not to print, one hidden and one marked invisible are removed and not drawn; one set to print but not to show on screen is drawn; and the words of the note, its popup and the comment on the highlight are found nowhere in the new file

#### Scenario: An annotation in a hidden layer

- **WHEN** `flatten-kinds.pdf`, which holds a square annotation in a layer that is off, is flattened
- **THEN** the square is drawn into the page inside that same layer, so it is not shown while the layer is off and is shown when it is turned on

#### Scenario: Signature fields

- **WHEN** a file with a signed signature field with its own look, and an empty signature field with none, is flattened
- **THEN** the signed field's look is drawn and the field removed, the empty one is removed with nothing drawn, and the result note says a digital signature is no longer valid

#### Scenario: Fields a reader is asked to draw

- **WHEN** a form whose fields have no drawing of their own and which asks readers to draw them holds a one-line text field "Filled value Café", a drop-down showing "Beta" and a list with "Two" chosen, all in Helvetica with Western European characters
- **THEN** each value is drawn in its field's place, font, size and colour, and can be found by searching

### Requirement: What is kept

Annotations not of a flattened kind, or with no drawing of their own, SHALL be kept as they are, in their order; a popup SHALL stay only with its annotation. Bookmarks, destinations, threads, attachments, details, layers, text and tags SHALL be kept, the tags' pointers to removed annotations taken out. The new file SHALL have no password or restrictions. (Owner questions 1 and 4 of `add-flatten-pdf`; SPEC.md: Definition of done, Each tool)

#### Scenario: The kinds kept

- **WHEN** a file holds links, attached-file annotations with their files, redaction marks not yet applied, sound, video, screen, rich-media or 3D annotations, an annotation of an unknown kind, or a note with no drawing of its own
- **THEN** each is kept as it was, with its own look, and nothing of it is drawn into the page

#### Scenario: A file with bookmarks, a link and an attachment

- **WHEN** a copy of `rich.pdf` with a highlight added is flattened
- **THEN** the highlight is drawn, and the two bookmarks, the working link and the attached `note.txt` are kept

#### Scenario: A link with its own look

- **WHEN** `flatten-kinds.pdf`, which holds a link with its own drawing, is flattened
- **THEN** the link is still an annotation with its address and its own drawing, and nothing of it is drawn into the page

#### Scenario: Tags

- **WHEN** `tagged.pdf` is flattened
- **THEN** the tags are kept, no tag points to a removed field or note, the removed fields' names and values are not in the new file except as drawn text, and the link and its tag are kept

#### Scenario: A protected file

- **WHEN** `password.pdf`, opened with its password, or `restricted.pdf` is given a highlight and flattened
- **THEN** the new file opens with no password and has no restrictions

### Requirement: Fields this tool cannot draw as a reader shows them

When the tool would have to draw a field itself (the form asks readers to draw its fields, or a field with a value has no drawing), the file SHALL be turned away before the job, with the tool's notice and no main button, if any such field cannot be drawn as a reader shows it, or the form is drawn by XFA alone. The engine SHALL check again before writing. (Owner question 2 of `add-flatten-pdf`; SPEC.md: What we are building, rule 4)

#### Scenario: What cannot be drawn

- **WHEN** a text or choice field the tool would draw holds a character outside the shared standard-font set or outside what its font's encoding shows, has several lines, is centred or right-aligned, is a comb field, is a password field with a value, holds rich text, is formatted by a script, or names a font the form does not hold or one that is not a simple font with a standard encoding; or a check box or radio button is on with no drawing for its state
- **THEN** that field cannot be drawn as a reader shows it, the file is turned away, and no new file ever holds `?` in place of a field's letters or a password field's value

#### Scenario: Letters in other scripts

- **WHEN** a visitor chooses `flatten-cannot-draw.pdf`, a form that asks readers to draw its fields and holds Hindi, Telugu, Arabic and Chinese values
- **THEN** the page says "flatten-cannot-draw.pdf has form fields or notes this tool cannot flatten." with the tool's advice, offers "Leave this file out", and shows no main button

#### Scenario: Each other reason

- **WHEN** a form that asks readers to draw its fields holds, in turn, a value "Zażółć", a field of several lines, a centred field, a comb field, a password field holding `SECRET-PASSWORD`, rich text, a field formatted by a script, a font missing from the form, or a check box that is on with no drawing for its state; or the file is a form drawn by XFA alone
- **THEN** each is turned away with the same notice

#### Scenario: Fields that already carry their drawing

- **WHEN** a form that does not ask readers to draw its fields holds a Hindi value in a field whose own drawing shows it
- **THEN** the file is not turned away, and the field's own drawing is drawn as it is

### Requirement: A file with nothing to flatten

A file with no form field and no annotation this tool would draw or remove SHALL give no new file, with "There is nothing to flatten in this file." and "No new file was made. It has no form fields or comments this tool flattens. Links, bookmarks and attached files are left as they are." and "Start again". (Owner question 6 of `add-flatten-pdf`; SPEC.md: What we are building, rule 4)

#### Scenario: Plain text and links only

- **WHEN** `text.pdf`, `rich.pdf` or `multilingual.pdf` is flattened
- **THEN** no file is given and the no-new-file words are shown as a heading with their advice

### Requirement: Bounded work on hostile files

The read and the job SHALL take time and memory proportional to the file: dictionaries read within the shared caps, walks iterative and linear with shared parts visited once, and the new file held to its size budget. Past a bound the file SHALL be turned away before the job, or the job SHALL stop with the shared sentence for that limit. (SPEC.md: Definition of done, Each tool; Privacy, limits and security)

#### Scenario: The annotation bounds

- **WHEN** a file has more than 1,000 annotations of a flattened kind on one page, or more than 100,000 in all, counted on each page where one appears
- **THEN** it is turned away before the job

#### Scenario: Many annotations on one page

- **WHEN** a visitor chooses a 400 KB file with 10,000 annotations on one page
- **THEN** it is turned away with the tool's notice within the time of reading the file, and qpdf is never asked to flatten it

#### Scenario: One annotation list shared by many pages

- **WHEN** a file of 2,000 pages shares one list of 500 annotations
- **THEN** it is counted as 1,000,000 annotations and turned away

#### Scenario: A result past its size budget

- **WHEN** a crafted file's flattened result would pass its size budget
- **THEN** the job stops with the shared output-limit sentence and no file

### Requirement: Working, done and failed

While the job runs the page SHALL show "Reading the file", then the writing progress, with Cancel. When done it SHALL show the result block with `report-flattened.pdf`, its size, Download and the result notes. A failure SHALL say what happened in one sentence with "Go back to your file". (SPEC.md: Tool page anatomy, 6; States every tool handles; Details that apply everywhere)

#### Scenario: A job runs to the end

- **WHEN** a visitor flattens `form.pdf`
- **THEN** progress is shown with Cancel, then "Your flattened file is ready", `form-flattened.pdf` with its size, Download, and notes saying what was drawn, what was removed, what was kept and that the file has no password

#### Scenario: Cancel

- **WHEN** the visitor presses Cancel while the job runs
- **THEN** the job stops, the file stays listed, and the main button can be used again

#### Scenario: Out of memory

- **WHEN** the worker runs out of memory
- **THEN** the page says so with "Try on a computer."

### Requirement: Nothing is uploaded

No request SHALL carry the file's contents, its name, a field's name or value, a comment's text or a password, and no page or worker SHALL log them. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test flattens `qz7form.pdf`, a protected form holding `SECRET-` strings in its field names and values, a note, a link and a bookmark, opened with its password, and also picks a file that is turned away and one with nothing to flatten
- **THEN** no request, header, title, storage entry, address or console line holds the name, its stem, the password or any `SECRET-` string, plain or URL-encoded, and every request is in the allowlist read from the build

### Requirement: The same requests for every file

Which site files the page fetches SHALL depend on the tool only: the read set (qpdf) and the draw set after every pick, whatever the file, and the job set in every job. That the qpdf instance count depends on the file SHALL be named. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 22 Nov 2026)

#### Scenario: The uniform-requests test

- **WHEN** `uniform-requests.spec.ts` runs `/flatten-pdf` with every pick, `form.pdf`, `flatten-kinds.pdf`, `text.pdf` (no new file), `flatten-cannot-draw.pdf` (turned away) and a failing job
- **THEN** each phase fetches the same set of files for every input

#### Scenario: The difference is named

- **WHEN** the pull request is opened
- **THEN** it says the qpdf instance count can tell whether the file had anything to flatten, under the uniform-requests owner question

### Requirement: Keyboard and screen reader

The whole flow SHALL work with a keyboard alone and with a screen reader. (SPEC.md: Definition of done, Each tool)

#### Scenario: Keyboard only

- **WHEN** a keyboard user chooses `form.pdf` with the picker, tabs to the main button and presses Enter
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step, and Download is reached by Tab

#### Scenario: Screen reader

- **WHEN** a screen reader user chooses `form.pdf` and runs a job, and then chooses `flatten-cannot-draw.pdf`
- **THEN** the status region says the file's name, page count and size once read, progress is announced as on every tool, focus moves to the result heading, and the turned-away notice is read with its heading and advice

### Requirement: Page text and the Privacy draft

The text below the tool SHALL be 250 to 500 words, marked as a draft for the owner, plain, with nothing from the banned patterns. The Privacy draft SHALL gain one visible draft sentence on what the qpdf instance count can tell. (SPEC.md: Tool page anatomy, 7; How the words should read; Banned patterns; Privacy, limits and security, Whole site)

#### Scenario: What the text says

- **WHEN** the text is written
- **THEN** it says what is drawn and what is removed, as printed; that links, attached files and layers are left as they are; that comments' written text is removed; which fields cannot be flattened yet and what to try; that a screen reader may not read the drawn values in a tagged file; that a digital signature stops being valid; and that the file has no password

#### Scenario: The text is built

- **WHEN** the site is built
- **THEN** `/flatten-pdf` holds the text as plain HTML with the draft mark, a question "Why can my form not be flattened?", no banned word or pattern, and the Privacy page holds the new draft sentence
