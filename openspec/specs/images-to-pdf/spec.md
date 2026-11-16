# images-to-pdf Specification

## Purpose
Image to PDF, at `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf`: the visitor lists JPG and PNG pictures in the order they choose and gets one PDF with one A4 page per picture, made in the browser, with each picture turned as its camera recorded, JPG data not compressed again, colours kept, and no picture details copied.

## Requirements

### Requirement: Three pages, one tool

The tool SHALL be served at `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf` from one registry entry, by the owner's decision of 13 Nov 2026, and all three SHALL take JPG and PNG pictures. Each page SHALL have its own title tag, meta description, heading and sentence. The sentence and the description SHALL say the files stay on the device. (CLAUDE.md: Owner decisions; SPEC.md: Tool page anatomy, 1 and 2; SEO, Every tool page)

#### Scenario: The JPG page is opened

- **WHEN** a visitor opens `/jpg-to-pdf`
- **THEN** the title tag is "Convert JPG to PDF in your browser - PDFkaro", the heading "Convert JPG to PDF", and the sentence "Turn one or more JPG photos into one PDF. Files stay on your device."

#### Scenario: The PNG page is opened

- **WHEN** a visitor opens `/png-to-pdf`
- **THEN** the title tag is "Convert PNG to PDF in your browser - PDFkaro", the heading "Convert PNG to PDF", and the sentence "Turn one or more PNG pictures or screenshots into one PDF. Files stay on your device."

#### Scenario: The image page is opened

- **WHEN** a visitor opens `/image-to-pdf`
- **THEN** the title tag is "Convert images to PDF in your browser - PDFkaro", the heading "Convert images to PDF", and the sentence "Turn JPG and PNG pictures into one PDF, in the order you choose. Files stay on your device."

#### Scenario: The descriptions are read

- **WHEN** the three meta descriptions are read
- **THEN** each is under 155 characters, names its kind of picture, and says the files stay on the device and are not uploaded

#### Scenario: A PNG is dropped on the JPG page

- **WHEN** a visitor drops `screenshot.png` on `/jpg-to-pdf`
- **THEN** it is listed and converted like a JPG

### Requirement: Each page has its own text

The text below the tool SHALL be 250 to 500 words on each page, written for that page's search, with steps and questions people ask about that kind of picture. No text SHALL be another with a word swapped. (SPEC.md: SEO, Every tool page and Specific-search pages)

#### Scenario: The texts are compared

- **WHEN** the three texts below the tool are read side by side
- **THEN** each answers questions about its own kind of picture, and none is another with "JPG" swapped for "PNG"

### Requirement: Choosing pictures

The page SHALL take several pictures at once and let more be added, from the picker button, a drop anywhere on the page, and paste. The picker's `accept` attribute SHALL be `image/jpeg,image/png`. A file whose first bytes are not those of a JPG or a PNG SHALL be refused with a sentence that names it and says what to do. (SPEC.md: Tool page anatomy, 3; How the words should read)

#### Scenario: Pictures are chosen

- **WHEN** a visitor chooses three JPG files with the "Choose pictures" button
- **THEN** all three are listed, in the order chosen, and "Add more pictures" and "You can also drop pictures anywhere on this page, or paste them." are shown

#### Scenario: A screenshot is pasted

- **WHEN** a visitor pastes a screenshot from the clipboard
- **THEN** it is listed as if it had been chosen with the button

#### Scenario: A file is not a picture

- **WHEN** a visitor chooses a PDF, or a text file renamed `notes.jpg`
- **THEN** it is not listed, and the page says "notes.jpg is not a JPG or PNG picture, so it was not added. To add a picture of another kind, save it as a JPG or PNG first."

### Requirement: Each picture is read before the job

While the engine loads, each picture SHALL show "Getting ready" beside its name. A picture that has been read SHALL show its size in plain units, with no page count, and a thumbnail drawn as it comes into view, upright as its camera recorded. The summary SHALL say how many files there are and their total size, and "Each picture becomes one page, in this order." (SPEC.md: States every tool handles; Details that apply everywhere)

#### Scenario: The engine is loading

- **WHEN** a picture has been picked and the engine has not finished loading
- **THEN** its name is shown with "Getting ready" beside it, and a Cancel button is shown

#### Scenario: A picture has been read

- **WHEN** `IMG_2041.jpg` of 2.3 MB has been read
- **THEN** its row shows "2.3 MB" and, once in view, its thumbnail, and the summary reads "1 file, 2.3 MB."

#### Scenario: A phone photo taken on its side

- **WHEN** a JPG is stored on its side with a camera turn of a quarter (EXIF orientation 6)
- **THEN** its thumbnail is drawn upright, as the phone's gallery shows it

#### Scenario: A picture cannot be drawn small

- **WHEN** a picture's thumbnail cannot be drawn
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

#### Scenario: The order is changed first

- **WHEN** the visitor moves the second picture above the first and converts
- **THEN** the first page holds the picture that is now first

### Requirement: How a picture sits on its page

Each page SHALL be A4 (595.28 by 841.89 points): upright when its picture, as shown, is taller than wide or square, and on its side when wider. The picture SHALL be centred, as large as fits, but no larger than its own size at 96 pixels to the inch. It SHALL be turned and mirrored by its camera turn (EXIF orientation 1 to 8), so the page matches the thumbnail. (SPEC.md: Tool page anatomy, 4)

#### Scenario: Pictures of both shapes

- **WHEN** a tall photo and a wide screenshot are converted
- **THEN** the first page is A4 upright and the second A4 on its side, each picture centred and touching two edges of its page

#### Scenario: A small picture

- **WHEN** a 300 by 200 pixel PNG is converted
- **THEN** it is drawn 225 by 150 points, centred on an A4 page on its side, and not enlarged

#### Scenario: Every camera turn

- **WHEN** a picture with four coloured corners is converted with each EXIF orientation from 1 to 8
- **THEN** each page, drawn by PDF.js, has its corners where a browser draws them for that orientation

### Requirement: Pictures are kept as they are

A JPG SHALL be stored as its own compressed picture data, not compressed again. A PNG SHALL be stored without loss, with see-through parts showing the white page. The colour data of a picture's colour profile SHALL be kept, so its colours on the page match the thumbnail. (SPEC.md: Definition of done, "Produces a correct result" and "Leaves alone what it was not asked to change")

#### Scenario: A JPG is not compressed again

- **WHEN** a JPG is converted
- **THEN** the PDF holds a `/DCTDecode` image stream whose frame and scan data are the JPG's own bytes, up to its end-of-image marker

#### Scenario: A PNG with see-through parts

- **WHEN** a PNG with a see-through background is converted
- **THEN** the page shows the picture on white, and its pixels are kept exactly

#### Scenario: A photo in Display P3

- **WHEN** a JPG that carries a Display P3 colour profile is converted
- **THEN** its image uses that profile's colour data as an `/ICCBased` colour space

#### Scenario: A CMYK JPG

- **WHEN** a JPG in CMYK colours with an Adobe segment is converted
- **THEN** its image is CMYK with its colour values read the way the Adobe segment says, and drawn by PDF.js it is close to the browser's own drawing

### Requirement: Only what draws a PNG reaches pdf-lib

A PNG SHALL be given to pdf-lib rebuilt from its IHDR, PLTE, tRNS, IDAT and IEND chunks only, so pdf-lib never reads a text chunk, an animation chunk or a colour profile. (SPEC.md: Privacy, limits and security)

#### Scenario: A bomb in a text chunk

- **WHEN** a 1 by 1 PNG whose `zTXt` chunk inflates to 20 MB is converted
- **THEN** pdf-lib is given the picture without that chunk, and the PDF passes `qpdf --check`

### Requirement: Picture details are not copied

The PDF SHALL NOT carry the pictures' details. From a JPG, only the parts needed to draw it SHALL be kept; every other segment, wherever it appears, and everything after the first end-of-image marker SHALL be left out. From a PNG, only the decoded pixels SHALL be kept. No document information, XMP or `/Metadata` SHALL be written. The result note SHALL say the details are not copied. (SPEC.md: Privacy, limits and security)

#### Scenario: Details in every place they hide

- **WHEN** JPGs are converted with a marker text in each of: EXIF, XMP and extended XMP, IPTC, a comment, APP0 with a JFIF or JFXX thumbnail, APP15 and another APPn, an APPn between progressive scans, a second JPG after the end marker with GPS in its EXIF, and plain bytes after the end marker; PNGs with a marker text in `tEXt`, `iTXt`, `zTXt` and `eXIf`; and a colour profile with a marker text in its description, copyright and device name tags and a creation date in its header
- **THEN** no marker text, no profile date and no GPS value appears in the PDF, read with its streams decoded and object streams undone, and the PDF has no `/Info`, no `/Metadata` and no XMP

### Requirement: Only a profile's colour data is copied

From a picture's colour profile, only its colour data SHALL be kept: its date, device, creator and profile ID fields SHALL be cleared and its text tags (description, copyright, device names) left out. A profile that does not fit the image as stored SHALL be left out. (SPEC.md: Privacy, limits and security; Definition of done)

#### Scenario: A profile with text and a date

- **WHEN** a JPG whose colour profile has a marker text in its description, copyright and device name tags and a creation date is converted
- **THEN** the PDF's profile has none of them, and draws the same colours

#### Scenario: A grey PNG with a grey profile

- **WHEN** a greyscale PNG with a grey `iCCP` profile is converted
- **THEN** its image, stored as RGB, has no profile and passes `qpdf --check`

### Requirement: Pictures that cannot be converted

A picture SHALL be refused, naming the file, with a way to leave it out or choose another, when it is damaged or coded in an unusual way, found from its bytes before anything is decoded. A PNG whose image data inflates to more than its header implies SHALL be damaged, found before the main button by counting the inflated data without keeping it. (SPEC.md: States every tool handles, "Damaged file"; Definition of done, "a clear message saying why it cannot")

#### Scenario: A damaged picture is chosen with others

- **WHEN** a PNG with a broken chunk, or a picture whose width or height is 0, is listed with two good pictures
- **THEN** the page says "broken.png is damaged and cannot be read." and "Open it in a photo app, save a copy, and add the copy.", and offers "Leave this file out"

#### Scenario: A small PNG whose data would fill memory

- **WHEN** a 1 by 1 PNG of 20 KB whose image data inflates to 20 MB is listed
- **THEN** the page says it is damaged before the main button, and nothing of it reaches pdf-lib

#### Scenario: A damaged picture is chosen on its own

- **WHEN** a broken JPG is the only picture
- **THEN** the page says it is damaged and offers "Choose another file"

#### Scenario: A JPG coded in an unusual way

- **WHEN** a JPG with arithmetic coding, 12-bit samples, lossless or hierarchical coding is listed
- **THEN** the page says "odd.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy as a JPG, and add the copy."

### Requirement: Very large pictures

A PNG of more than 50 million pixels SHALL be listed with a notice that names it, gives its pixels, and says the job may be slow or run out of memory, and the job SHALL still run, as `SPEC.md` sets no fixed size limit for browser tools. Its thumbnail SHALL NOT be drawn. A failure then SHALL get the out-of-memory sentence. (SPEC.md: Privacy, limits and security, Browser tools; CLAUDE.md: the owner's decision of 13 Nov 2026 to warn, not limit, above 20,000 pages)

#### Scenario: A PNG with very many pixels

- **WHEN** a 1 MB PNG that claims 16,000 by 16,000 pixels is listed
- **THEN** nothing is decoded on listing, its blank box stays, the notice "huge.png has 256 million pixels" says "Converting it may be slow, and a phone may run out of memory. You can still go ahead.", and the main button works

#### Scenario: It runs out of memory

- **WHEN** that PNG is converted and the worker runs out of memory
- **THEN** the page says "Your browser ran out of memory. Try fewer pictures, or smaller ones." and the list is as it was

### Requirement: No thumbnail of a very large picture

No picture of more than 50 million pixels, JPG or PNG, SHALL be decoded for its thumbnail. Only a PNG gets the notice, as the job never decodes a JPG. (SPEC.md: Privacy, limits and security)

#### Scenario: A JPG of very many pixels

- **WHEN** a JPG that claims 16,000 by 16,000 pixels is listed
- **THEN** it keeps its blank box, nothing is decoded for it, and no notice is shown

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

When the job is done the page SHALL show the result's name, size and page count, a Download button, "Start again", and the result note. The name SHALL be the first picture's name with its extension replaced by `.pdf`. Nothing SHALL download until the visitor presses Download. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** `IMG_2041.jpg` and `IMG_2042.jpg` are converted in that order
- **THEN** the result is named `IMG_2041.pdf`, shows its true size and "2 pages", and no download has started

#### Scenario: The result is announced

- **WHEN** the job finishes while a screen reader is in use
- **THEN** the screen reader announces that the file is ready, and focus moves to the result

#### Scenario: Start again

- **WHEN** the visitor presses "Start again"
- **THEN** the page returns to the file picker alone and the pictures are forgotten

### Requirement: A job that fails

When the engine fails, cannot be fetched, or runs out of memory, the page SHALL say what happened in one sentence and one thing to try, keeping the list as it was. (SPEC.md: States every tool handles)

#### Scenario: Out of memory

- **WHEN** the engine runs out of memory
- **THEN** the page says "Your browser ran out of memory. Try fewer pictures, or smaller ones."

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
- **THEN** every request is to the site's own files on an exact list taken from the build (the worker, the workspace chunk, the engine, the shared picture files, pdf-lib's file and `fflate`'s file, with no qpdf or PDF.js), no request has a header the browser does not send itself, no request, console line or page title holds either file name, its stem, the camera name or the place, and the downloaded PDF holds neither the camera name nor the place

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves the page
- **THEN** nothing about the pictures is kept in storage, and the address has no query and no hash

### Requirement: The words on the page

Each page's heading, sentence and text below the tool SHALL be in the served HTML, and the text below each tool SHALL be marked as a draft for the owner, with nothing from "Banned patterns". (SPEC.md: SEO, Every tool page; How the words should read; Banned patterns)

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
- **THEN** it hears the picture's name and size and buttons such as "Move IMG_2041.jpg down", and no thumbnail
