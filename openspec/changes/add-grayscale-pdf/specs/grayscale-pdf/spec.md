## Purpose

What the Grayscale PDF tool at `/grayscale-pdf` does: the colours of one PDF shown and printed as grey on screens and office printers, with its text kept searchable and its links and forms working, what is left as it is, how drawing instructions are read safely, what the new file keeps, and every state the page shows (the owner's decisions of 24 Nov 2026, "Everything, kept as text" and "Yes, looks and prints grey").

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/grayscale-pdf` with the title, heading and sentence below, and a meta description that says the file stays on the device and is not uploaded. It SHALL be listed under "Make smaller and fix" after the five Compress to a target size pages, and the hub's description SHALL name turning a PDF grey. Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/grayscale-pdf`
- **THEN** the title is "Convert a PDF to grayscale in your browser - PDFkaro", the heading "Convert a PDF to grayscale", the sentence "Turn the colours in a PDF grey and keep its text. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page and the hub list it

- **WHEN** the site is built
- **THEN** "Grayscale PDF" is listed under "Make smaller and fix" right after "Compress PDF to 2 MB" on the home page and on `/make-smaller-and-fix`, and the hub's description still names upload limits and now names turning a PDF grey

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file that is not a PDF SHALL be refused with a sentence that names it. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses a text file renamed `notes.pdf`
- **THEN** it is not listed, and the page says "notes.pdf is not a PDF, so it was not added."

### Requirement: The file is read, then listed

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove and no summary line, then the main button "Convert to grayscale and download", which works with nothing else to choose. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the main button, as on every tool, is shown but cannot be used yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page and "12 pages, 1.4 MB", then "Convert to grayscale and download", and the status region says "report.pdf, 12 pages, 1.4 MB."

### Requirement: A file that needs a password

When the file needs a password the page SHALL ask for it in a labelled field that names the file, with the note that the password stays in the browser. A wrong password SHALL be reported and the field kept. The visitor SHALL be able to choose another file instead. (SPEC.md: States every tool handles, Password needed)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the main button is not, and focus moves to the field

#### Scenario: The right password is given

- **WHEN** the visitor types `open-sesame` and presses Enter
- **THEN** the file is read and listed, and the job can run

### Requirement: A damaged file, and very large files

A file qpdf cannot read SHALL be named with a sentence saying it seems to be damaged and one thing to try, with no Repair PDF link until Repair PDF is published. A file over 100 MB, or over 20,000 pages, SHALL show the shared notice and still run. (SPEC.md: States every tool handles, Damaged file and Too large; Privacy, limits and security, Browser tools; CLAUDE.md: Owner decisions, 13 Nov 2026)

#### Scenario: A damaged file

- **WHEN** a visitor chooses `damaged-cut.pdf`
- **THEN** the page says the file seems to be damaged, shows no main button, and offers to choose another file

#### Scenario: A file over 100 MB

- **WHEN** a visitor chooses a 110 MB PDF
- **THEN** the shared notice says the job may be slow or run out of memory on a phone, and the main button still works

### Requirement: Colours become grey through a grey stand-in

The tool SHALL show and print as grey every RGB or CMYK colour it can convert (design decision 3), in drawing, pictures and shadings, by pointing each place that names such a space at a shared grey stand-in of the same number of components, and by rewriting only the operators that name their own space into it, numbers kept. No picture SHALL be decoded. (SPEC.md: Tool catalogue; CLAUDE.md: Owner decisions, 24 Nov 2026)

#### Scenario: Which colour spaces

- **WHEN** a colour is in `DeviceRGB`, `DeviceCMYK`, `CalRGB`, or an ICC-based space whose profile says RGB or CMYK with every component ranging 0 to 1, or an indexed or pattern space over one of these
- **THEN** it is shown through the stand-in; any other space is left

#### Scenario: Where colours are reached

- **WHEN** colours are drawn in page content, form XObjects, tiling patterns, Type 3 glyphs and annotation appearance streams
- **THEN** each of them is converted, and no page is drawn as a picture

#### Scenario: The grey formula

- **WHEN** a colour is shown through a stand-in
- **THEN** its grey is 0.3 R + 0.59 G + 0.11 B of its raw components, a CMYK colour first converted by the PDF standard's simple rule (red = 1 − min(1, cyan + black), and so on)

#### Scenario: RGB text and shapes

- **WHEN** a page draws red text with `1 0 0 rg` and a blue line with `0 0 1 RG`
- **THEN** in the result they read `/GreyRGB cs 1 0 0 scn` and `/GreyRGB CS 0 0 1 SCN`, and PDF.js draws them as greys of 0.3 and 0.11

#### Scenario: sc becomes scn

- **WHEN** a stream is edited
- **THEN** every `sc` in it is written `scn` and every `SC` is written `SCN`, and no edited stream holds `sc` or `SC`

#### Scenario: The starting colour after cs

- **WHEN** an edited stream selects `/DeviceRGB` by `cs`, or selects by name an entry that every dictionary in force for it gives as a direct RGB space
- **THEN** the result reads `/GreyRGB cs 0 0 0 scn`, or the name followed by `0 0 0 scn`, so text drawn with no colour set stays black whether or not the entry is repointed

#### Scenario: A left stream selects a name

- **WHEN** a stream left because of doubt does `/CS0 cs` and paints with no colour set, and `/CS0` is an ICC RGB space
- **THEN** `/CS0` is left unchanged in every dictionary that holds it, so that text stays black; edited streams that also select `/CS0` hold a harmless `0 0 0 scn` after it and draw as before; CMYK, indexed and pattern entries in the same dictionaries are still repointed

#### Scenario: A compressed colour profile

- **WHEN** a page fills a shape in an ICC RGB space whose profile, larger than 128 bytes, is Flate-compressed
- **THEN** its header is read from the start of the profile and the shape is drawn grey

#### Scenario: An appearance stream's resources are in force too

- **WHEN** a form with no own resources is drawn from a page whose `/CS0` is ICC RGB and from an appearance stream whose own `/CS0` is a Separation space
- **THEN** `/CS0` is not eligible for the starting black, no `0 0 0 scn` is written after it, and it is left in every dictionary

#### Scenario: Callers disagree on a name

- **WHEN** a form with no resources of its own selects `/CS0` by `cs`, and one page's resources map `/CS0` to an ICC RGB space and another's to a Separation space
- **THEN** every `/CS0` entry is left as it was

#### Scenario: A form that inherits the colour space

- **WHEN** a form with no `cs` of its own draws `0.2 0.4 0.6 scn` and is drawn once after `1 0 0 rg` and once after `/CS0 cs` with an ICC-based RGB space
- **THEN** both drawings come out neutral grey, and the form's own stream is unchanged

#### Scenario: A picture and a shading

- **WHEN** a page shows an RGB JPG, an indexed picture with an RGB palette and an axial RGB shading
- **THEN** each one's colour space points at the RGB stand-in (the palette's base for the indexed one), their data, palette bytes and functions are unchanged, and PDF.js draws every pixel neutral, within 2 of the original pixel's grey on average

#### Scenario: CMYK

- **WHEN** a page fills a rectangle with `0 1 0 0 k`
- **THEN** it reads `/GreyCMYK cs 0 1 0 0 scn` and is drawn as the grey 0.41

#### Scenario: A CMYK picture

- **WHEN** a page shows a CMYK picture, once as stored and once with `/Decode [1 0 1 0 1 0 1 0]`
- **THEN** both are drawn neutral and within about 15 on average of the original's drawing through the luminosity formula, so an inverted picture fails the test

#### Scenario: The stand-in name is already used

- **WHEN** a `/ColorSpace` dictionary in the file already has a key `GreyRGB`
- **THEN** the tool uses `GreyRGB1`, and the existing entry is unchanged

### Requirement: Colours of notes, fields and bookmarks

The colours a reader draws notes, form fields and bookmarks with (`/C`, `/IC`, a widget's `/MK` `/BG` and `/BC`, a bookmark's `/C`) SHALL be written as neutral values with the same count of numbers, clamped to 0 to 1. A `/DA` string's `rg` or `k`, inherited ones in the AcroForm `/Fields` tree included, SHALL become a `g` with the grey. `/DS` and `/RC` styles SHALL be left as they are. (SPEC.md: Definition of done, Each tool; CLAUDE.md: Owner decisions, 24 Nov 2026)

#### Scenario: Counts are kept

- **WHEN** a colour array has three numbers, or four
- **THEN** three become three equal numbers, four become `0 0 0` and the black of the grey, each written with at most 4 decimals, and arrays of one or no number, or already neutral, are unchanged

#### Scenario: A highlight and a field

- **WHEN** a highlight has `/C [1 1 0]` and a field has `/MK << /BG [1 0 0] >>` and `/DA (/Helv 12 Tf 1 0 0 rg)`
- **THEN** the result has `/C [0.89 0.89 0.89]`, `/BG [0.3 0.3 0.3]` and `/DA (/Helv 12 Tf 0.3 g)`, and typing into the field in a reader shows grey text

#### Scenario: An inherited /DA

- **WHEN** a radio group's parent field holds `/DA (/ZaDb 0 Tf 0 0 1 rg)` and its kids have none
- **THEN** the parent's `/DA` reads `/ZaDb 0 Tf 0.11 g`

### Requirement: What is left as it is

The tool SHALL leave exactly as they were the kinds of colour it cannot convert safely and every drawing stream read with doubt. The result notes SHALL name the main kinds and say others are named below the tool, and the text below the tool SHALL name every kind in plain words. (SPEC.md: What we are building, honest about limits; CLAUDE.md: Owner decisions, 24 Nov 2026)

#### Scenario: The kinds left

- **WHEN** a file holds `Separation` or `DeviceN` colours (other than already grey ones), Lab colours, ICC-based colours with other ranges or profiles, JPEG 2000 pictures, inline pictures, a form named only as a soft mask's group (its own resources included), an appearance stream or tiling pattern with no resources of its own, rich-text styles or colours set by scripts
- **THEN** each of them is left byte for byte as it was

#### Scenario: What colour descriptions are left

- **WHEN** a file holds a page or form `/Group /CS /DeviceRGB`, a soft mask's `/BC`, `/DefaultRGB` and `/DefaultCMYK` keys in a resources `/ColorSpace`, and `/OutputIntents`
- **THEN** each is byte for byte as before

#### Scenario: A stream left, its pictures still grey

- **WHEN** a stream is left because of doubt and it draws an RGB picture
- **THEN** the stream is byte for byte as before, and the picture's own colour space still points at the stand-in

#### Scenario: A spot colour

- **WHEN** a page fills a shape in a `Separation` colour with a CMYK alternate
- **THEN** that operator, its colour space and its drawing are byte for byte as before, and the rest of the page is grey

#### Scenario: The text below the tool names every kind

- **WHEN** the result notes and the text below the tool are read
- **THEN** the first note names spot colours, Lab colours and JPEG 2000 pictures and says a few other kinds named below the tool stay in colour, and the text below the tool names every kind in the scenarios above in plain words, with colour glyphs in fonts, XFA drawing and attached files

### Requirement: Drawing instructions are decoded within limits

Drawing streams SHALL be decoded by the engine from raw data qpdf read with no decoding, for exactly the filters that reach it after `plainCopy`. A stream reached from a page, or a page's content, decoding past 64 MiB SHALL stop the job with `page-too-large`; one no page reaches SHALL be left; decoded and edited bytes past the job's content budget SHALL stop it with the shared `output-limit` failure. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: A filter the reader does not decode

- **WHEN** a drawing stream reaches the reader with a filter outside the measured set
- **THEN** that stream is left as it is

#### Scenario: A decode bomb

- **WHEN** one content stream inflates to 1 GB
- **THEN** decoding stops at 64 MiB and, if that stream is on page 14, the job stops under "The file was not converted.", with "Page 14 has too much drawing on it to convert here. Delete that page, or split the file, and convert the rest." and "Go back to your file", before qpdf writes or checks a file; the sentence holds the page number and nothing else from the file

#### Scenario: A large stream that no page draws

- **WHEN** an appearance stream whose widget is on no page, or an unused form in the AcroForm `/DR`, decodes past 64 MiB
- **THEN** it is left exactly as it was and the job goes on, the colour space entries it can draw with are not repointed, and its decoded bytes count against the content budget

#### Scenario: A page of several large streams

- **WHEN** a page's content is two streams of 40 MiB each
- **THEN** the job stops the same way

#### Scenario: Many streams under the cap

- **WHEN** a file holds enough streams of 60 MiB each, worked out from its plain copy's real length, to pass its content budget, `min(2 GiB, 512 MiB + 200 × the plain copy's length)`
- **THEN** the job stops when the decoded bytes pass the budget, with the shared `output-limit` words "The new file would be far larger than expected, so it was not made. The file may be damaged. Try another copy of it."

### Requirement: Drawing instructions are read with certainty or left

Streams SHALL be read in two bounded passes by strict rules, building no token list, with an edited copy whose length is known before it is allocated. Any doubt SHALL leave the whole stream, or for a page's contents every stream of that page, byte for byte as it was, in every context it is used. Every byte outside an edit SHALL be unchanged. (SPEC.md: Privacy, limits and security; Definition of done, Each tool)

#### Scenario: What is doubt

- **WHEN** a stream holds a glued token such as `0.5 0.5 0.5rg`, a control or non-ASCII byte outside a string or name, braces, an unbalanced string, array or dictionary, an operator inside an array or dictionary, `ID` or `EI` outside `BI`, unbalanced `BX` and `EX`, or a wrong operand count for an edited operator
- **THEN** that stream is byte for byte as before

#### Scenario: Streams in sequence

- **WHEN** a page's content streams split a token, a string or a comment between two streams, or a stream ends with operands waiting
- **THEN** every content stream of that page is byte for byte as before

#### Scenario: An inline picture with an unclear end

- **WHEN** a stream holds an inline picture whose data contains `EI` followed by whitespace, a delimiter or its end before its real end (such as `xEI `), or ASCII85 data with a stray `~`
- **THEN** that stream is byte for byte as before

#### Scenario: Only the edits change

- **WHEN** any result is compared with its input
- **THEN** every decoded drawing stream holds the same tokens in the same order outside the edited operators, PDF.js's operator list for every page is the same once every colour-setting operation is removed, and PDF.js reads the same text at the same places on every page

### Requirement: What the new file keeps

The new file SHALL keep every page, its searchable text, links, form fields and their values, notes, bookmarks, attached files, tags and the document's details; remove each page's `/Thumb`; have no password and no restrictions; and pass `qpdf --check`. The page SHALL say what is not kept, that the colours stay stored underneath, and that the file stays about the same size. (SPEC.md: Definition of done, Each tool; CLAUDE.md: Owner decisions, 13 and 24 Nov 2026)

#### Scenario: What the page says

- **WHEN** the result or the text below the tool is read
- **THEN** it says that earlier saved versions are not kept, that a digital signature stops being valid, that the original colours stay stored in the file so programs that take pictures out or check a file for colour may still find colour, and that the file stays about the same size and this tool does not make it smaller (Compress PDF does)

#### Scenario: Print shops

- **WHEN** the result notes or the text below the tool speak of printing
- **THEN** they claim grey on screens and office printers only (the first note reads "Text, shapes and pictures now show in grey, and print in grey on office printers. The text can still be searched.…"), and the text below the tool says a print shop's tools may list three or four extra inks

#### Scenario: A file with bookmarks, a link and an attachment

- **WHEN** `rich.pdf` is converted
- **THEN** its two bookmarks, its link and `note.txt` are kept, and the result passes `qpdf --check`

#### Scenario: A protected file

- **WHEN** `password.pdf` is converted with its password
- **THEN** the result opens with no password and has no restrictions, and the page has said so

### Requirement: A file with nothing to turn grey

When nothing in the file would be turned grey (a `/Thumb`, a picture reached only through one, and a stream whose only edit is an inserted starting black do not count), the engine SHALL give no file and the page SHALL show the heading "Nothing in this file was turned grey." with advice naming the kinds of colour left alone, focus on the heading, no Download and "Start again". Black set as RGB counts as a change. (SPEC.md: States every tool handles, Done)

#### Scenario: The grey-only test file

- **WHEN** `grey-only.pdf`, drawn only in grey with a page `/Group /CS /DeviceRGB`, an RGB output intent and a page whose stored thumbnail is an RGB picture, is converted
- **THEN** no file is made and the page shows "Nothing in this file was turned grey." and "No new file was made. Its pages already use only grey, or their colours are kinds this tool leaves as they are, such as spot colours, Lab colours or JPEG 2000 pictures."

### Requirement: Working, done and failed

While the job runs the page SHALL show progress in real units with a bar that never goes back and a Cancel button. When done, the result SHALL show the new file with a Download button and the three notes; nothing downloads on its own. A failure SHALL show one sentence and "Go back to your file". (SPEC.md: States every tool handles, Working, Done and Failed; Details that apply everywhere)

#### Scenario: A job runs to the end

- **WHEN** a visitor converts `report.pdf` of 12 pages
- **THEN** the page shows "Reading the file", "Page 1 of 12" to "Page 12 of 12", then "Writing the grayscale file", then "Your grayscale file is ready" with `report-grayscale.pdf`, its size and Download, and focus moves to the result heading

#### Scenario: Cancel

- **WHEN** the visitor presses Cancel during the job
- **THEN** the worker is ended, and the row and the main button are shown again, with no password asked again

#### Scenario: A failure

- **WHEN** a job fails
- **THEN** the page shows "The file was not converted." with one sentence and "Go back to your file"

#### Scenario: Out of memory

- **WHEN** the browser runs out of memory during the job
- **THEN** the page says so with "Try on a computer, or split the file first and convert the parts."

### Requirement: Nothing is uploaded

No request SHALL carry the file's contents, its name or its password, and no page or worker SHALL log them. The tool's no-upload test SHALL convert a protected coloured file and three fixtures with marked strings and find none of them in any request, header, title, storage, address or console, with an exact allowlist of the site's own files read from the build. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test converts `qz7report.pdf`, which needs a password and holds `SECRET-` strings in its text, a link, a destination, a bookmark and a field, and downloads the result
- **THEN** no request, header, title, storage entry, address or console line holds the name, its stem, the password or its fragments, or any `SECRET-` string, plain or URL-encoded, and every request is in the allowlist, with no PDF.js, pdf-lib, `shrink`, `picture` or other engine chunk in the job

### Requirement: The same requests for every file

Which of the site's own files the page fetches SHALL depend on the tool only: the read and draw sets after every pick, and qpdf, `fflate` and the engine's chunks in every job. The number of qpdf instances a job makes SHALL depend on the file only as named: one per raw batch of drawing streams, and a writer only when a file is written. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 22 Nov 2026)

#### Scenario: The uniform-requests test

- **WHEN** `uniform-requests.spec.ts` runs `/grayscale-pdf` with every pick, a coloured file, `grey-only.pdf` and a failing job
- **THEN** each phase fetches the same set of files for every input

#### Scenario: The qpdf instance count is named

- **WHEN** the pull request is opened
- **THEN** it says that a job makes one qpdf instance per raw batch (at most 2,000 drawing streams and colour profiles, or 32 MB of their data) besides a fixed few, and a writer only when a file is written, so under the no-cache exception the number of WebAssembly requests depends on the file, with the count measured on the 20,000-page file

### Requirement: Keyboard and screen reader

The whole flow SHALL work with a keyboard alone and with a screen reader. (SPEC.md: Definition of done, Each tool)

#### Scenario: Keyboard only

- **WHEN** a keyboard user chooses a file with the picker, tabs to the main button and presses Enter
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step, and Download is reached by Tab

#### Scenario: Screen reader

- **WHEN** a screen reader user runs a job
- **THEN** the row is announced once read, progress is read in real units ("Page 3 of 12"), and the result heading is announced when focus moves to it

### Requirement: Page text and the Privacy draft

The text below the tool SHALL be 250 to 500 words of steps and real questions, marked as a draft for the owner, with nothing from "Banned patterns". The Privacy page draft SHALL say that Grayscale PDF keeps the original colours in the new file. (SPEC.md: SEO, Every tool page; Look and feel; Privacy, limits and security, Whole site)

#### Scenario: The text is built

- **WHEN** the page is built with scripts off
- **THEN** the steps and questions are in the served HTML, including "Will this make my file smaller?" and "What stays in colour?", saying what stays in colour, that the colours stay stored underneath, that the file stays about the same size, that the text stays searchable, and, in a question of its own, that a page with very large drawing instructions cannot be converted and shows an error naming the page

#### Scenario: The Privacy draft

- **WHEN** `/privacy` is built
- **THEN** it says Grayscale PDF shows colours in grey but keeps the original colours in the new file, and the privacy page test checks that sentence
