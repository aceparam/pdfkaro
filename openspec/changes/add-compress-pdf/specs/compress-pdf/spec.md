# compress-pdf

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/compress-pdf` with the title tag "Compress a PDF file in your browser - PDFkaro", the heading "Compress a PDF file" and the sentence "Make a PDF smaller. Your file stays on your device." Its meta description SHALL say the file stays on the device and is not uploaded. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/compress-pdf`
- **THEN** the heading, sentence and title are as above, and the picker reads "Choose a PDF file"

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop or paste. A second file SHALL replace the first, and a file that is not a PDF SHALL be refused with a sentence naming it. Once read, the file SHALL be listed with a thumbnail of its first page, its page count and its size. (SPEC.md: Tool page anatomy, 3 and 4)

#### Scenario: A file is chosen

- **WHEN** a visitor chooses `report.pdf` of 64 pages and 11.8 MB
- **THEN** it is listed as "64 pages, 11.8 MB" with its first page as a thumbnail, and "Compress and download" is shown

#### Scenario: Two files are dropped

- **WHEN** two PDFs are dropped at once
- **THEN** the first is listed and the page says the tool takes one file

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses `notes.txt`
- **THEN** it is not listed, and the page says "notes.txt is not a PDF, so it was not added."

### Requirement: Pictures are made smaller

Pressing "Compress and download" SHALL make pictures smaller where that saves space, with no option to set. A picture SHALL keep its place and size on the page. (SPEC.md: Tool catalogue; CLAUDE.md: Owner decisions, own recompression)

#### Scenario: A scan of large JPG pages

- **WHEN** an A4 file whose pages are 300 pixels-to-the-inch JPG scans is compressed
- **THEN** each scan is 1754 pixels on its long side or less (1240 by 1754), the file is smaller, and each page shows the same scan in the same place

### Requirement: JPG pictures

A JPG picture (`/DCTDecode`, grey or RGB, 8 bits) larger than 150 pixels to the inch across the file's largest page SHALL be scaled down to that and saved again at JPG quality 75, and SHALL replace the old one only if the new one is smaller. One that is not too large SHALL be saved again at quality 75 only if that makes it at least 10% smaller. (SPEC.md: Tool catalogue)

#### Scenario: A large JPG that saving again would make bigger

- **WHEN** a JPG larger than it needs to be, saved at a low quality, would come out bigger once scaled down and saved at quality 75
- **THEN** it is left as it was, byte for byte

#### Scenario: A JPG that is already small

- **WHEN** a picture is a JPG of the right size that saving again would shrink by only 4%
- **THEN** it is left as it was, byte for byte

### Requirement: Pictures stored without loss

A picture stored without loss (`/FlateDecode`, grey or RGB, 8 bits) larger than 150 pixels to the inch across the largest page SHALL be scaled down and stored without loss again, never as a JPG. (SPEC.md: Definition of done, "Produces a correct result")

#### Scenario: A screenshot stored without loss

- **WHEN** a large picture stored with `/FlateDecode` is compressed
- **THEN** it is scaled down and stored with `/FlateDecode` again, and drawn at the new size it has no JPG artefacts

### Requirement: Pictures that are left alone

Every picture that is not a candidate, as the design's rules define one, SHALL be left as it was: byte for byte when not stored with `/FlateDecode`, and with the same dictionary and decoded data when it is, as the whole file's Flate data is compressed again without loss. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change")

#### Scenario: The kinds left alone

- **WHEN** a file holds pictures in other colour spaces, masks and soft masks, 1-bit scans, JPEG 2000, unusual entries, mismatched JPG headers, more than 50 million pixels, or inline pictures
- **THEN** none of them is scaled or saved again

#### Scenario: A CMYK picture and a 1-bit scan

- **WHEN** a file with a CMYK JPG and a CCITT scan is compressed
- **THEN** both streams are byte for byte as they were

#### Scenario: A soft mask

- **WHEN** a large RGB picture with a soft mask is compressed
- **THEN** the picture is made smaller, and its soft mask keeps its size, its dictionary and its decoded data

#### Scenario: A JPG whose header disagrees

- **WHEN** a picture's dictionary says 100 by 100 RGB but its JPG header says 20,000 by 20,000, or four components
- **THEN** it is never decoded, and it is left as it was

### Requirement: The file is written again without loss

After the pictures, the file SHALL be written by qpdf with object streams, every compressed stream compressed again at the highest level, uncompressed streams compressed, and resources nothing uses removed. Pages, text, links, form fields with their values, bookmarks, attached files, tags and the document's details SHALL stay. The result MUST pass `qpdf --check`. (SPEC.md: Definition of done)

#### Scenario: A file with no pictures

- **WHEN** a text-only file with uncompressed content streams is compressed
- **THEN** the file is smaller, and its text, links and bookmarks are as they were

#### Scenario: A file with everything

- **WHEN** `rich.pdf` and `form.pdf` are compressed
- **THEN** bookmarks, the link, `note.txt`, the form fields and their values, and the document's title are kept

### Requirement: Passwords and restrictions are kept

A file opened with its password SHALL be written with the same password and restrictions, and a file with restrictions but no password to open it SHALL keep its restrictions. The page SHALL say so. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change")

#### Scenario: A protected file

- **WHEN** `password.pdf` is compressed with its password
- **THEN** the result asks for the same password and has the same restrictions

#### Scenario: A file with restrictions

- **WHEN** `restricted.pdf` is compressed
- **THEN** the result opens without a password and keeps its restrictions

### Requirement: The result

When the engine gives a file, which it does only when the file is at least 1% smaller, the result SHALL show its name (`report-compressed.pdf`), its size beside the old size and its pages, a Download button, "Start again", and notes that say pictures may be slightly less sharp up close and that a digital signature stops being valid. Nothing SHALL download until the visitor presses Download. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A file is made smaller

- **WHEN** `report.pdf` of 11.8 MB is compressed to 4.2 MB
- **THEN** the result reads "report-compressed.pdf" and "4.2 MB, was 11.8 MB, 64 pages", and no download has started

#### Scenario: A change too small to show in the usual unit

- **WHEN** a file of 5.02 MB (5,140 KB) comes out at 4.97 MB (5,089 KB), which both read as "5.0 MB"
- **THEN** the result reads "5,089 KB, was 5,140 KB", both sizes one unit finer: bytes for a size in KB, KB for MB, MB for GB

### Requirement: A file that cannot be made smaller

When the engine gives no file, the page SHALL say "This file could not be made smaller." and "It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more.", with "Start again" and no Download button. (SPEC.md: How the words should read; Definition of done, "a clear message saying why it cannot")

#### Scenario: A file cannot be made smaller

- **WHEN** a file is already as small as this tool can make it
- **THEN** the page says "This file could not be made smaller." and "It may already be compressed, or its pictures are of a kind this tool leaves alone. The questions below say more.", offers "Start again" and shows no Download button, and the screen reader announces both sentences

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units with a Cancel button: "Reading the file", then "Picture 3 of 40" while pictures are made smaller, then "Writing the compressed file", with the bar short of full until the file is written. Cancel SHALL stop the work and return to the file. The page MUST stay responsive. (SPEC.md: States every tool handles; Rules for the code, 3)

#### Scenario: A job is running

- **WHEN** a file with 40 pictures is compressed
- **THEN** the page shows "Reading the file", "Picture 3 of 40", then "Writing the compressed file", a bar that never goes back and is not full while writing, and Cancel

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel
- **THEN** the work stops, no result is shown, and the file is listed as before

### Requirement: A file that needs a password

A protected file SHALL show a password field with a note that the password stays in the browser; a wrong password SHALL say so; "Choose another file" replaces it. (SPEC.md: States every tool handles)

#### Scenario: The password is right

- **WHEN** the visitor types the right password for `password.pdf`
- **THEN** the field goes away and the main button works

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says it is wrong and the field stays

### Requirement: A damaged file

A file qpdf cannot read SHALL be shown as damaged, naming it, with "Choose another file". (SPEC.md: States every tool handles)

#### Scenario: A damaged file is chosen

- **WHEN** `damaged-xref.pdf` is chosen
- **THEN** the page says it is damaged and cannot be read, and offers "Choose another file"

### Requirement: A job that fails

When the engine fails, cannot be fetched or runs out of memory, the page SHALL say what happened in one sentence and one thing to try, keeping the file. (SPEC.md: States every tool handles)

#### Scenario: Out of memory

- **WHEN** the engine runs out of memory
- **THEN** the page says the browser ran out of memory and what to try, and the file stays listed

### Requirement: Large files

A file over 100 MB, or over 20,000 pages, SHALL show the notice the other tools show, and the job SHALL still run. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 20,000 pages)

#### Scenario: The file passes 100 MB

- **WHEN** a 110 MB file is listed
- **THEN** the notice "This file is more than 100 MB" is shown and the main button works

### Requirement: Nothing is uploaded

No request that leaves the page SHALL carry the file's contents, its name or its password. After a pick the page SHALL fetch only the site's own files the tool needs. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the no-upload test picks `rich.pdf` under a telling name, and `password.pdf` with its password, compresses and downloads
- **THEN** every request is to the site's own files on an exact list taken from the build, which includes the engine, `qpdf-json`, `picture`, `resample` and `fflate` and no pdf-lib; no request, header, console line or page title holds the file name, its stem, the password, a bookmark title, the attachment's name or the document's title

#### Scenario: The picture path is watched

- **WHEN** the no-upload test compresses, under a telling name, a file where a JPG picture carrying the camera and place markers of `pictures/details.jpg` and a lossless picture are both made smaller, and downloads the result
- **THEN** a download happened, the engine, `picture`, `resample` and `fflate` were fetched, and no request, header, console line or page title holds the file name, its stem or the markers

#### Scenario: Hidden text and form values

- **WHEN** the no-upload test compresses and downloads `tagged.pdf` and `form.pdf`, then compresses `compress-packed.pdf`, which ends in "could not be made smaller"
- **THEN** no request, header, console line or page title holds `tagged.pdf`'s `SECRET-` markers, either document's title or `form.pdf`'s field values

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves
- **THEN** nothing about the file is kept in storage, and the address has no query and no hash

### Requirement: The words on the page

The heading, sentence and text below the tool SHALL be in the served HTML; the text SHALL be 250 to 500 words, marked as a draft, answer real questions such as "Why is my file still large after compressing?", and use nothing from "Banned patterns". (SPEC.md: SEO, Every tool page; How the words should read)

#### Scenario: The text is in the served page

- **WHEN** the page is fetched without running scripts
- **THEN** its heading, sentence and text below the tool are in the HTML

### Requirement: Keyboard and screen reader use

Every part of the tool SHALL work with a keyboard alone and with a screen reader: the picker, the password field, the main button, Cancel, Download and Start again; progress and the result are announced. (SPEC.md: Definition of done)

#### Scenario: The job is done by keyboard

- **WHEN** a visitor uses only Tab, Enter and Space
- **THEN** they can choose a file, compress it and download the result, and the result's sizes are read out
