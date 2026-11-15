# images-to-pdf

## ADDED Requirements

### Requirement: Three pages, one tool

The tool SHALL be served at `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf` from one registry entry, by the owner's decision of 13 Nov 2026. Each page SHALL have its own title tag, meta description, heading, sentence and text below the tool, written for its search, and no two texts SHALL be the same text with a word swapped. All three SHALL take JPG and PNG pictures. (CLAUDE.md: Owner decisions; SPEC.md: SEO, Every tool page and Specific-search pages)

#### Scenario: The JPG page is opened

- **WHEN** a visitor opens `/jpg-to-pdf`
- **THEN** the heading is "Convert JPG to PDF", the title tag is "Convert JPG to PDF in your browser - PDFkaro", and the text below the tool is about JPG pictures

#### Scenario: A PNG is dropped on the JPG page

- **WHEN** a visitor drops `screenshot.png` on `/jpg-to-pdf`
- **THEN** it is listed and converted like a JPG

#### Scenario: The texts are compared

- **WHEN** the three texts below the tool are read side by side
- **THEN** each answers questions about its own kind of picture, and none is another with "JPG" swapped for "PNG"

### Requirement: Choosing pictures

The page SHALL take several pictures at once and let more be added, from the picker button, from a drop anywhere on the page, and from paste. A file whose first bytes are not those of a JPG or a PNG SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Pictures are chosen

- **WHEN** a visitor chooses three JPG files with the "Choose pictures" button
- **THEN** all three are listed, in the order chosen

#### Scenario: A screenshot is pasted

- **WHEN** a visitor pastes a screenshot from the clipboard
- **THEN** it is listed as if it had been chosen with the button

#### Scenario: A file is not a picture

- **WHEN** a visitor chooses `notes.txt`, a PDF, or a text file renamed `notes.jpg`
- **THEN** it is not listed, and the page says "notes.jpg is not a JPG or PNG picture, so it was not added."

### Requirement: Each picture is read before the job

While the engine loads, each picture SHALL show "Getting ready" beside its name. A picture that has been read SHALL show "1 page" and its size in plain units, and a thumbnail drawn as it comes into view, turned upright as its camera recorded. The list SHALL say how many files and pages there are in all, and "Each picture becomes one page, in this order." (SPEC.md: States every tool handles; Details that apply everywhere)

#### Scenario: The engine is loading

- **WHEN** a picture has been picked and the engine has not finished loading
- **THEN** its name is shown with "Getting ready" beside it, and a Cancel button is shown

#### Scenario: A picture has been read

- **WHEN** a JPG of 2.3 MB has been read
- **THEN** it shows "1 page, 2.3 MB" and, once in view, its thumbnail

#### Scenario: A phone photo taken on its side

- **WHEN** a JPG is stored on its side with a camera turn of a quarter (EXIF orientation 6)
- **THEN** its thumbnail is drawn upright, as the phone's gallery shows it

#### Scenario: A picture cannot be drawn small

- **WHEN** a picture's thumbnail cannot be drawn, or the picture has more than 50 million pixels
- **THEN** its blank box stays, and the picture can still be converted

### Requirement: The visitor sets the order

Pictures SHALL become pages in the order listed. Each SHALL have "Move up", "Move down" and "Remove" buttons, and the list SHALL also be reorderable by drag. Each button SHALL name its picture to a screen reader, and a button that cannot be used SHALL stay focusable. (SPEC.md: Details that apply everywhere)

#### Scenario: A picture is moved with the keyboard

- **WHEN** a visitor focuses "Move down" on the first picture and presses Enter
- **THEN** the picture moves to second place, focus stays on a button of that picture, and the new place is announced

#### Scenario: A picture is removed

- **WHEN** a visitor presses "Remove" on a picture
- **THEN** it leaves the list, and when the last picture is removed the page returns to the file picker alone

### Requirement: Converting

The main button SHALL read "Convert and download" and SHALL work with one picture listed. Pressing it SHALL give one PDF with one page per picture, in order. The result MUST pass `qpdf --check`. (SPEC.md: Tool page anatomy, 4 and 5; Definition of done)

#### Scenario: One picture is converted

- **WHEN** one JPG is listed and the visitor presses "Convert and download"
- **THEN** the result has one page

### Requirement: How a picture sits on its page

Each page SHALL be A4 (595.28 by 841.89 points): upright when its picture, as shown, is taller than wide or square, and on its side when wider. The picture SHALL be centred, as large as fits, but no larger than its own size at 96 pixels to the inch. It SHALL be turned and mirrored by its camera turn (EXIF orientation 1 to 8), so the page matches the thumbnail. (SPEC.md: Tool page anatomy, 4)

#### Scenario: Pictures of both shapes

- **WHEN** a tall photo and a wide screenshot are converted
- **THEN** the first page is A4 upright and the second A4 on its side, each picture centred and touching two edges of its page

#### Scenario: A small picture

- **WHEN** a 300 by 200 pixel PNG is converted
- **THEN** it is drawn 225 by 150 points, centred on an A4 page on its side, and not enlarged

#### Scenario: Every camera turn

- **WHEN** a picture is converted with each EXIF orientation from 1 to 8
- **THEN** each page, drawn by PDF.js, shows the picture as a browser shows it

#### Scenario: The order is changed first

- **WHEN** the visitor moves the second picture above the first and converts
- **THEN** the first page holds the picture that is now first

### Requirement: Pictures are kept as they are

A JPG SHALL be stored as its own compressed picture data, not compressed again. A PNG SHALL be stored without loss, with see-through parts showing the white page; a 16-bit PNG at 8 bits per colour, and an animated PNG as its first picture, which the result notes SHALL say. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change")

#### Scenario: A JPG goes in unchanged

- **WHEN** a JPG is converted
- **THEN** the PDF holds a `/DCTDecode` image stream whose bytes equal the JPG's with its details segments taken out, and its picture data (from the start of the frame to the end) is unchanged

#### Scenario: A PNG with see-through parts

- **WHEN** a PNG with a see-through background is converted
- **THEN** the page shows the picture on white, and its pixels are kept exactly

#### Scenario: A CMYK JPG

- **WHEN** a JPG in CMYK colours, as some print programs save, is converted
- **THEN** its colours on the page match the browser's thumbnail

### Requirement: Picture details are not copied

The PDF SHALL NOT carry the pictures' details: a JPG's EXIF, XMP, IPTC, colour profile and comment segments SHALL be left out of its data, and no title, author, producer or dates SHALL be written. The result notes SHALL say the details are not copied. (SPEC.md: Privacy, limits and security)

#### Scenario: A photo with a place in its details

- **WHEN** a photo whose details hold a GPS place and a camera name is converted
- **THEN** neither appears anywhere in the PDF

### Requirement: Progress and cancel

While the job runs the page SHALL show progress in real units, with a Cancel button. Cancel SHALL stop the work and return to the list. The page MUST stay responsive while a job runs. (SPEC.md: States every tool handles; Rules for the code, 3)

#### Scenario: A job is running

- **WHEN** twelve pictures are being converted
- **THEN** the page shows "File 3 of 12", then "Writing the PDF", a bar that never goes back, and a Cancel button

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the work stops, no result is shown, and the list is back as it was, in the same order

#### Scenario: Progress is announced

- **WHEN** a job is running and a screen reader is in use
- **THEN** progress is in a status region, and is not announced more than once a second

### Requirement: The result

When the job is done the page SHALL show the result's name, size and page count, a Download button, "Start again", and the result notes. The name SHALL be the first picture's name with its extension replaced by `.pdf`. Nothing SHALL download until the visitor presses Download. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** `IMG_2041.jpg` and `IMG_2042.jpg` are converted in that order
- **THEN** the result is named `IMG_2041.pdf`, shows its true size and "2 pages", and no download has started

#### Scenario: The result is announced

- **WHEN** the job finishes while a screen reader is in use
- **THEN** the screen reader announces that the file is ready, and focus moves to the result

#### Scenario: Start again

- **WHEN** the visitor presses "Start again"
- **THEN** the page returns to the file picker alone and the pictures are forgotten

### Requirement: A damaged picture

A file that starts like a JPG or PNG but whose structure is broken, or whose size cannot be read, SHALL be shown as damaged, naming the file, with a way to leave it out or choose another. (SPEC.md: States every tool handles)

#### Scenario: A damaged picture is chosen with others

- **WHEN** a broken PNG is listed with two good pictures
- **THEN** the page says "broken.png is damaged and cannot be read." and offers "Leave this file out"

#### Scenario: A damaged picture is chosen on its own

- **WHEN** a broken JPG is the only picture
- **THEN** the page says it is damaged and offers "Choose another file"

### Requirement: A job that fails

When the engine fails, cannot be fetched, or runs out of memory, the page SHALL say what happened in one sentence and one thing to try, keeping the list as it was. (SPEC.md: States every tool handles)

#### Scenario: Out of memory

- **WHEN** the engine runs out of memory, such as on a PNG that claims to be 50,000 pixels square
- **THEN** the page says the device ran out of memory and to try fewer pictures or smaller ones

#### Scenario: The engine cannot be fetched

- **WHEN** the engine's file cannot be fetched
- **THEN** the page says the tool could not be loaded and to check the connection and try again

### Requirement: Large files

When the pictures add up to more than 100 MB, the page SHALL warn that the job may be slow or run out of memory on a phone, and SHALL still let it run. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The pictures pass 100 MB

- **WHEN** pictures adding up to 120 MB are listed
- **THEN** the notice "These files add up to more than 100 MB" is shown and the main button works

### Requirement: Nothing is uploaded

No request that leaves the page SHALL carry a picture's contents, its name or its details. After a pick the page SHALL fetch only the site's own files the tool needs. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the no-upload test picks two pictures, one with a camera name and a GPS place in its details, reorders them, converts them and downloads the result
- **THEN** every request is to the site's own files on an exact list (the worker, the workspace chunk, the engine and the shared picture files, with no qpdf, PDF.js or `fflate`), and no request, console line or page title holds either file name, its stem, the camera name or the place

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves the page
- **THEN** nothing about the pictures is kept in storage, and the address has no query and no hash

### Requirement: The words on the page

Each page's heading, sentence, picker, list words, main button, result notes and text below the tool SHALL be in the served HTML or the widget's own words, and the text below each tool SHALL be 250 to 500 words, marked as a draft for the owner, with nothing from "Banned patterns". (SPEC.md: SEO, Every tool page; How the words should read; Banned patterns)

#### Scenario: The text is in the served page

- **WHEN** a page is fetched without running scripts
- **THEN** its heading, sentence and text below the tool are in the HTML

#### Scenario: The draft is marked

- **WHEN** a text below the tool is rendered
- **THEN** it is marked as a draft waiting for the owner's review

### Requirement: Keyboard and screen reader use

Every part of the tool SHALL work with a keyboard alone and with a screen reader: the picker, each picture's buttons, the main button, Cancel, Download and Start again. Each thumbnail SHALL be hidden from screen readers, because the name beside it says what it is. (SPEC.md: Definition of done)

#### Scenario: The job is done by keyboard

- **WHEN** a visitor uses only Tab, Enter and Space
- **THEN** they can choose pictures, reorder them, convert and download

#### Scenario: A screen reader reads the list

- **WHEN** a screen reader reads a listed picture
- **THEN** it hears the picture's name, "1 page" and its size, and buttons such as "Move IMG_2041.jpg down", and no thumbnail
