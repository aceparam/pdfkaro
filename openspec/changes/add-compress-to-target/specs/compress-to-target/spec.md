## ADDED Requirements

### Requirement: Five pages, one target each

The tool SHALL be served at five addresses, `/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb` and `-2mb`, each with its own title, heading, sentence, description and main button, its target set by its preset and never offered as a choice. The pages SHALL be listed after Compress PDF, in size order. Their words are drafts for the owner. (SPEC.md: Tool catalogue; Scope notes; Tool page anatomy, 1, 2 and 5; SEO, Specific-search pages)

#### Scenario: The 200 KB page is opened

- **WHEN** a visitor opens `/compress-pdf-to-200kb`
- **THEN** the title is "Compress a PDF to 200 KB in your browser - PDFkaro", the heading "Compress a PDF to 200 KB", the sentence "Make a PDF 200 KB or smaller. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: Each page names its own target

- **WHEN** each of the five pages is built
- **THEN** its heading, sentence and main button name its own size ("100 KB", "200 KB", "500 KB", "1 MB", "2 MB"), its preset is `{ target: '100kb' }`, `'200kb'`, `'500kb'`, `'1mb'` or `'2mb'`, and no page shows a choice of target

#### Scenario: The home page and the hub list the pages

- **WHEN** the site is built
- **THEN** the five pages are listed in size order right after Compress PDF under "Make smaller and fix" on the home page and on `/make-smaller-and-fix`, and the hub's description names upload limits

### Requirement: A target counts in thousands of bytes

A target SHALL be 100,000, 200,000, 500,000, 1,000,000 or 2,000,000 bytes, written once in `src/widget/option-values.ts` with its label, and read by the engine and the page from there. The engine SHALL refuse a missing or unknown target before it reads the file. (SPEC.md: Details that apply everywhere, sizes; CLAUDE.md: owner decision of 24 Nov 2026)

#### Scenario: A file just over the target in thousands

- **WHEN** a file of 203,000 bytes is listed on the 200 KB page
- **THEN** it is not treated as already under the target, and the main button works

#### Scenario: An unknown target reaches the engine

- **WHEN** the engine is run with no target, or with `'300kb'`, `'__proto__'` or a number
- **THEN** it fails before reading the file, with a fixed error that names no file content

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line, then the main button. There SHALL be no options. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Empty, Engine loading)

#### Scenario: A file is being read

- **WHEN** a visitor picks `scans.pdf` and the engine is still loading
- **THEN** the row shows "scans.pdf" and "Getting ready", never a blank area

#### Scenario: A file is listed

- **WHEN** `compress-scans.pdf` has been read on the 200 KB page
- **THEN** the row shows its first page, name, "3 pages" and size, and "Compress to 200 KB and download" follows it, ready to press

### Requirement: A file already at or under the target

When the listed file's size is at or under the page's target, the main button SHALL be unavailable, with a sentence tied to it that names the file and says there is nothing to do and that it can be used as it is. The engine SHALL also give no file for such an input. (SPEC.md: What we are building, rule 4; Tool page anatomy, 5)

#### Scenario: A small file on the 200 KB page

- **WHEN** `text.pdf` (well under 200,000 bytes) is listed on the 200 KB page
- **THEN** the main button is unavailable and described by "text.pdf is already 200 KB or smaller, so there is nothing to do here. You can use it as it is.", and pressing it starts no job

#### Scenario: A screen reader user meets the held button

- **WHEN** a screen reader user reaches the held main button
- **THEN** it is announced as unavailable, with the sentence as its description

#### Scenario: Another file is chosen

- **WHEN** the visitor then chooses a file over the target
- **THEN** the sentence goes and the main button works

### Requirement: Only pictures are made smaller

The engine SHALL change only the data of the pictures Compress PDF can safely redo, with stated data of at least 4 KB, at most the 10,000 largest. A picture SHALL be replaced only when its new data is smaller. Text, drawings, fonts and content streams SHALL NOT be changed, and no page SHALL be turned into a picture. Everything else SHALL be written again by qpdf without loss, as Compress PDF writes it. (CLAUDE.md: owner decision of 24 Nov 2026, "Pictures only"; SPEC.md: Definition of done)

#### Scenario: Pictures this tool leaves alone

- **WHEN** `compress-kinds.pdf` is compressed toward a target below its size (the engine's step called with a target in bytes, as every fixture under 100 KB is in the unit test)
- **THEN** its CMYK JPG, CCITT scan, image mask, colour-key picture, grey ICC picture and `/Matte` pair are as Compress PDF leaves them

#### Scenario: Text and drawings are kept

- **WHEN** `multilingual.pdf` and `rich.pdf` are compressed toward a target below their size
- **THEN** every page's decoded content streams are byte for byte as before, and the text PDF.js reads is the same

#### Scenario: Many tiny pictures

- **WHEN** a file made in the test holds 20,000 pictures of under 4 KB and 12,000 larger ones
- **THEN** the tiny pictures are left alone and only the 10,000 largest are measured

### Requirement: The mildest step that fits

The engine SHALL lower picture resolution and JPG quality along the design's ladder, from 150 pixels to the inch across the largest page at quality 75 to the floor of 72 pixels to the inch at quality 40, and SHALL use the mildest step whose file fits the target. Nothing SHALL go below the floor. (CLAUDE.md: owner decision of 24 Nov 2026; design decision 4)

#### Scenario: The first step fits

- **WHEN** a file whose pictures at Compress PDF's own setting bring it under the target is compressed
- **THEN** every picture is at most 150 pixels to the inch and saved at quality 75 where that was smaller, and no stronger step is used

#### Scenario: A stronger step is needed

- **WHEN** a file that fits only at step 4 is compressed
- **THEN** its pictures are at most 100 pixels to the inch at quality 50, the file is at or under the target, and step 3's file would have been over it

### Requirement: Lossless pictures stay lossless until nothing else fits

Pictures stored without loss SHALL be scaled down and stay lossless in steps 1 to 7. Only in steps 8 to 14 SHALL they be saved as JPGs, and never one with a soft mask. A soft mask SHALL never be changed. (design decision 3; owner question 2)

#### Scenario: A lossless screenshot

- **WHEN** a file whose only large picture is a lossless screenshot reaches the target by step 7
- **THEN** the screenshot is scaled down and still stored without loss

#### Scenario: A lossless picture with a soft mask

- **WHEN** a file needs steps 8 to 14 and holds a lossless picture with a soft mask
- **THEN** that picture is never saved as a JPG, and its soft mask is byte for byte as it was

### Requirement: Few full writes

The engine SHALL measure every picture's size at every step in one pass over the pictures, keeping only the sizes, choose the step from those sizes, then write and check the file, and SHALL write the whole file at most three times. The answer SHALL be judged by the written file's real size, never by an estimate. (SPEC.md: Definition of done, "Never blocks the page"; design decision 5)

#### Scenario: The estimate is right

- **WHEN** a file whose estimate picks a step that fits, with no milder step estimated to fit, is compressed
- **THEN** qpdf writes the whole file once

#### Scenario: The estimate is off

- **WHEN** the first written file is over the target
- **THEN** a stronger step is written, and no more than three whole-file writes happen in the job

#### Scenario: A file with no picture to redo

- **WHEN** `compress-text.pdf` is compressed toward a target below its size
- **THEN** no picture is measured and qpdf writes the file once

### Requirement: The result under the target

When the file is made at or under the target, the result SHALL say so in its heading and show the name, the new size beside the old, the page count and Download. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A scan reaches 200 KB

- **WHEN** `compress-scans.pdf` is compressed on the 200 KB page and the result is 184 KB
- **THEN** the heading is "Your file is now 200 KB or smaller", the line reads like "184 KB, was 620 KB, 3 pages", the download is `compress-scans-compressed.pdf`, and nothing downloads until Download is pressed

### Requirement: The smallest file, over the target

When no step brings the file to the target, the page SHALL offer the smallest file made, when it is at least 1% smaller than the file chosen, with a heading saying it is still over the target, a sentence naming its size and the target, and advice. A size that would read as the target's number or less SHALL be given in bytes. (CLAUDE.md: owner decision of 24 Nov 2026, "Give the smallest, say so"; SPEC.md: What we are building, rule 4)

#### Scenario: A long scan on the 100 KB page

- **WHEN** a file whose floor step gives 312 KB is compressed on the 100 KB page
- **THEN** the heading is "Your file is still over 100 KB", the page says "The smallest file this tool could make is 312 KB, which is over 100 KB.", the advice names removing pages or splitting the file, and Download gives that file

#### Scenario: Just over the target

- **WHEN** the smallest file is 203,000 bytes on the 200 KB page
- **THEN** the sentence reads "The smallest file this tool could make is 203,000 bytes, which is over 200 KB."

#### Scenario: The result is announced

- **WHEN** the over-target result appears while a screen reader is in use
- **THEN** focus moves to its heading and the screen reader announces the heading and the sentence

### Requirement: No smaller file

When the smallest file made is not at least 1% smaller than the file chosen, the engine SHALL give no file, and the page SHALL say "This file could not be made smaller." with this tool's advice, "Start again" and no Download button. (SPEC.md: What we are building, rule 4; tool-page "Result block")

#### Scenario: A packed file with no pictures

- **WHEN** a text-only file over 100 KB, already written by qpdf with Compress PDF's options, is compressed on the 100 KB page
- **THEN** the page says "This file could not be made smaller.", gives the advice, shows "Start again", focus moves to the sentence, and there is no Download button

### Requirement: What the file keeps

The new file SHALL keep its pages, text, drawings, fonts, links, form fields with their values, bookmarks, attached files, tags and the document's details. The result notes SHALL say that pictures can look less sharp, that earlier saved versions are not kept and a digital signature stops being valid, and that a password or restrictions are kept. (SPEC.md: Definition of done)

#### Scenario: A file with links, bookmarks and a form

- **WHEN** `rich.pdf` and `form.pdf` are compressed
- **THEN** their links, bookmarks, attachments, fields and field values are as before

### Requirement: Passwords and restrictions are kept

A file opened with its password SHALL be written with the same password and restrictions, and a file with restrictions SHALL keep them, as Compress PDF does. (CLAUDE.md: open question "Compress PDF keeps passwords")

#### Scenario: A protected file

- **WHEN** `compress-password.pdf` is compressed with its password toward a target below its size, and a protected scans file over 100 KB made in the test is compressed on the 100 KB page
- **THEN** each result asks for the same password, with the same encryption and restrictions, and passes `qpdf --check` with it

### Requirement: Progress and Cancel

While working, the page SHALL show "Reading the file", then "Picture N of M" while pictures are measured, then "Writing the compressed file", with a Cancel button; the bar SHALL never go back. Cancel SHALL return to the listed file without asking for its password again. (SPEC.md: States every tool handles, Working)

#### Scenario: Progress on a scan

- **WHEN** `compress-scans.pdf` is compressed on the 200 KB page
- **THEN** the status reads "Reading the file", "Picture 1 of 3" to "Picture 3 of 3", then "Writing the compressed file", and the bar's width never falls

#### Scenario: Cancel

- **WHEN** the visitor presses Cancel while pictures are measured
- **THEN** the job stops, the file is listed again with the main button ready, and its password is not asked again

### Requirement: Password, damaged, too large and failed

A protected file SHALL ask for its password with the shared note that it stays in the browser. A damaged file SHALL say what is wrong, with the shared words. A file over 100 MB, or over 20,000 pages, SHALL show the shared notice and still run. A failed job SHALL say what happened in one sentence, "The compression did not finish.", with one thing to try and "Go back to your file". (SPEC.md: States every tool handles)

#### Scenario: A protected file

- **WHEN** `password.pdf` is picked
- **THEN** a password field appears with the note that the password stays in the browser, and once the right password is typed the file is listed

#### Scenario: A damaged file

- **WHEN** `damaged-xref.pdf` is picked
- **THEN** the page says it is damaged and cannot be read, and offers to leave it out

#### Scenario: A very large file

- **WHEN** a file over 100 MB is listed
- **THEN** the shared notice says the job may be slow or run out of memory on a phone, and the main button still works

#### Scenario: The worker runs out of memory

- **WHEN** a job fails for lack of memory
- **THEN** the page says "The compression did not finish." with "Try on a computer, or split the file first and compress the parts." and "Go back to your file"

### Requirement: Keyboard and screen reader

Every part of each page SHALL work with a keyboard alone and with a screen reader. (SPEC.md: Definition of done)

#### Scenario: Keyboard only

- **WHEN** a visitor uses only the keyboard on the 500 KB page
- **THEN** they can choose a file, reach and press the main button, Cancel, reach Download and "Start again", all with a visible focus outline and in reading order

#### Scenario: Screen reader

- **WHEN** a screen reader user compresses a file
- **THEN** the file's row, the progress in real units and the result heading are announced, and nothing is conveyed by colour alone

### Requirement: Nothing is uploaded

No request SHALL carry the file's contents, its name or its password, and the requests the page makes SHALL not depend on the file or the page's target. The engine SHALL declare `loads: { read: ['qpdf'], job: ['qpdf', 'fflate'] }`. (SPEC.md: Privacy, limits and security, Browser tools; CLAUDE.md: owner decision of 22 Nov 2026, "Requests must not depend on the file")

#### Scenario: The no-upload test

- **WHEN** the no-upload test compresses a protected file named `qz7report.pdf` holding `SECRET-` strings on the 200 KB page and downloads the result
- **THEN** no request, header, title, storage, address or console message holds the name, its stem, the password, the page text or any `SECRET-` string, plain or URL-encoded, and every request is in the allowlist read from the build

#### Scenario: The same requests on every page and for every file

- **WHEN** `uniform-requests.spec.ts` picks and compresses the shared PDF list on each of the five pages
- **THEN** the files fetched after a pick and in a job are the same for every file and on every page

### Requirement: Text below each page written for its size

Each of the five pages SHALL have its own text below the tool, 250 to 500 words of how-to steps and real questions, written for that size, marked as a draft for the owner. No sentence of eight words or more SHALL appear in two of the five texts. (SPEC.md: SEO, Specific-search pages; Every tool page; How the words should read)

#### Scenario: The texts are checked

- **WHEN** the unit tests run
- **THEN** each text is 250 to 500 words, no sentence of eight words or more is shared by two texts, and none holds a banned word, "100%", capitals for emphasis or an exclamation mark

#### Scenario: Scripts are off

- **WHEN** a page is opened with scripts off
- **THEN** its heading, sentence, steps and questions are in the served HTML
