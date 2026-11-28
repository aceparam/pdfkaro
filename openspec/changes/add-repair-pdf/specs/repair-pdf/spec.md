# Spec Delta

## Purpose

What the Repair PDF tool at `/repair-pdf` does: reading one PDF that other tools turn away as damaged, recovering the pages and parts that can still be read into a new file that passes `qpdf --check`, saying honestly what could not be recovered, and every state the page shows, with no file data leaving the browser.

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/repair-pdf` with the title, heading and sentence below, and a meta description that says the file stays on the device and is not uploaded. It SHALL be listed under "Make smaller and fix" after Grayscale PDF, and the hub's description SHALL name repairing a damaged PDF. Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page and Site-wide)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/repair-pdf`
- **THEN** the title is "Repair a damaged PDF in your browser - PDFkaro", the description ends "You get it in a new file.", the heading is "Repair a damaged PDF", the sentence "Recover what can still be read from a damaged PDF. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

#### Scenario: The home page and the hub list it

- **WHEN** the site is built
- **THEN** "Repair PDF" is listed under "Make smaller and fix" right after "Grayscale PDF" on the home page and on `/make-smaller-and-fix`, and the hub's description still names upload limits and turning a PDF grey, and now names repairing a damaged file

### Requirement: Choosing one file

The page SHALL take one PDF from the picker, a drop anywhere on the page, or paste. When several files arrive at once the first PDF SHALL be taken and the page SHALL say the others were not added; a new file SHALL take the place of the listed one. A file with no `%PDF-` in its first 1,024 bytes SHALL be refused as not a PDF, with a sentence that names it, as on every PDF tool. (SPEC.md: Tool page anatomy, 3)

#### Scenario: Two files are dropped at once

- **WHEN** a visitor drops `report.pdf` and `notes.pdf` together
- **THEN** `report.pdf` is listed, and the page says "This tool takes one file, so notes.pdf was not added."

#### Scenario: A file is not a PDF

- **WHEN** a visitor chooses `not-a-pdf.pdf`
- **THEN** it is not listed, and the page says "not-a-pdf.pdf is not a PDF, so it was not added."

### Requirement: A file other tools cannot read is read here

When qpdf cannot read the file for any reason but a password, the page SHALL read it the repair way before the job, so a file other tools call damaged is listed with the pages found. While reading, the row SHALL show "Getting ready"; once read, the name, pages found and size, with a thumbnail when one can be drawn, then "Repair and download", which works with nothing else to choose. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles; Definition of done, The test set)

#### Scenario: A file with a broken cross-reference table

- **WHEN** a visitor chooses `damaged-xref.pdf`
- **THEN** its row shows "3 pages" and its size, the main button "Repair and download" is shown, and no damaged notice is shown

#### Scenario: A file cut off part way

- **WHEN** a visitor chooses `damaged-cut.pdf`, the first 40% of a 500-page file
- **THEN** its row shows "198 pages", the pages that could be found, and the main button is shown

#### Scenario: A file being read

- **WHEN** a file has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the main button is shown but cannot be used yet

### Requirement: A file that needs a password

When the file needs a password, damaged or not, the page SHALL ask for it in a labelled field naming the file, with the note that the password stays in the browser; a wrong one SHALL be reported and the field kept. A file encrypted for certificates or in a way the reader does not know SHALL be called saved in a way this tool cannot read, with Remove a password's advice. No password SHALL be guessed. (SPEC.md: States every tool handles; Scope notes, Unlock)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the main button is not, and focus moves to the field

#### Scenario: A protected file that is also damaged

- **WHEN** a visitor chooses a copy of `password.pdf` whose cross-reference table points to the wrong places
- **THEN** the password field is shown; with `open-sesame` the file is read and listed with 3 pages; with `nope` the page says the password did not open the file and keeps the field

#### Scenario: A file with restrictions only

- **WHEN** a visitor chooses a damaged copy of `restricted.pdf`
- **THEN** no password is asked for, and the file is listed with 3 pages

#### Scenario: Certificate or unknown encryption

- **WHEN** a visitor chooses a file encrypted for certificates, or a damaged file whose encryption method the reader does not know
- **THEN** the page says it is saved in a way this tool cannot read, with "It is protected in a way this tool cannot remove, such as with a certificate. Ask whoever sent it for a copy without this protection."

### Requirement: How a file is repaired

A file qpdf can read SHALL be written again by qpdf; any other SHALL be read object by object from its start, ignoring its cross-reference table and leaving out what makes no sense, then written by qpdf. Parts of pages pointing to nothing SHALL be removed, a damaged Flate stream SHALL keep what still unpacks, other damaged streams SHALL be emptied. The file SHALL pass `qpdf --check` or not be given. (SPEC.md: Architecture; Definition of done; CLAUDE.md: Owner decisions, 28 Nov 2026)

#### Scenario: The damaged kinds measured for this change

- **WHEN** the engine repairs each of the 36 damaged files the unit tests make from `text.pdf`, `rich.pdf` and `pages-500.pdf` (wrong cross-reference offsets, a wrong or missing `startxref`, a missing table, trailer, tail or `/Root`, files cut off in four places, junk or inserted bytes, a missing header, a wrong or missing stream `/Length`, damaged compressed, object and cross-reference streams, a broken page dictionary, a missing `endobj`, a page tree pointing to a missing object, every line ending changed to CR LF, 4 KB zeroed, a wrong `/Prev`)
- **THEN** every result passes `qpdf --check`, holds at least the pages, page text, bookmarks, link and attachment recorded for that file in the fixtures README, which are at least what desktop qpdf 12.4.2 recovered when this change was planned, and has as many pages as the page said before the job

#### Scenario: A file qpdf reads with warnings

- **WHEN** the engine repairs `warning.pdf`
- **THEN** the result is qpdf's own rewrite: 3 pages, no warning from `qpdf --check`, and the same page contents as the input

#### Scenario: A damaged compressed stream

- **WHEN** a page's compressed drawing stream has bytes changed part way through
- **THEN** the page keeps the drawing that unpacks before the damage, the other pages are unchanged, and the result passes `qpdf --check`

#### Scenario: A page whose drawing is missing

- **WHEN** a file is cut off so that a page's drawing stream is gone but the page itself was found
- **THEN** that page is kept as a blank page of its size, and the result passes `qpdf --check`

#### Scenario: A page with too much drawing

- **WHEN** a page's drawing instructions unpack past 64 MiB
- **THEN** the job stops with "Page N has too much drawing on it to repair here. Delete that page, or split the file, and repair the rest.", naming the page

### Requirement: What the new file keeps

The new file SHALL keep every page and object that could be found and is still reached from the document, with undamaged page contents byte for byte: text, links, fields and values, notes, bookmarks, attachments, tags, destinations, threads, language, output intents and details. Only the newest copy of each object found SHALL be kept. It SHALL have no password and no restrictions. (SPEC.md: Definition of done, Each tool; CLAUDE.md: Owner decisions, 28 Nov 2026)

#### Scenario: A rich file with a broken table

- **WHEN** the engine repairs a copy of `rich.pdf` whose cross-reference offsets are all wrong
- **THEN** the result has 2 pages, both bookmarks, the link and `note.txt`, and the same page contents as `rich.pdf`

#### Scenario: Tagged and form files read the repair way

- **WHEN** the engine is made to take the repair route on `tagged.pdf`, `form.pdf` and `multilingual.pdf`
- **THEN** each result holds the same catalog keys, document details, pages, page contents, fields, outline and attachments as qpdf's own rewrite of that file

#### Scenario: A protected damaged file

- **WHEN** the engine repairs a damaged copy of `password.pdf` with `open-sesame`
- **THEN** the result opens with no password, has no restrictions, and its text reads as the original's

#### Scenario: The last save was lost

- **WHEN** a file with an incremental update is cut off inside that update
- **THEN** the result holds the earlier version of the changed objects, and the result note says that parts of an earlier version may show

### Requirement: A file with nothing to repair

When qpdf reads the file with no warning, `qpdf --check` passes, the file starts with `%PDF-` and ends with `%%EOF`, no new file SHALL be made, and the page SHALL say "This file has no damage this tool can find." with "No new file was made. You can use your file as it is. If it does not open in one program, try opening it in another." This is found only after the main button. (CLAUDE.md: owner question 4 of this change)

#### Scenario: A sound file

- **WHEN** a visitor repairs `text.pdf`
- **THEN** the page says "This file has no damage this tool can find." with the advice, shows no Download button, and offers "Start again"

#### Scenario: A sound file with junk before its header

- **WHEN** a visitor repairs a copy of `text.pdf` with 250 bytes of junk before `%PDF-`
- **THEN** a new file is made, starting with `%PDF-`, with the same 3 pages

### Requirement: A file too damaged to repair

When no page can be found, the page SHALL show the damaged notice naming the file, with "No pages could be found in it. If you have another copy of the file, try that one." and no Repair link. When the repaired file would still fail `qpdf --check`, the job SHALL give no file, say "This file is too damaged to repair. If you have another copy of the file, try that one." and offer "Choose another file". (SPEC.md: States every tool handles; What we are building, 4)

#### Scenario: The repaired file would still fail the check

- **WHEN** a stand-in engine fails a job as too damaged
- **THEN** the page says "The file was not repaired." with "This file is too damaged to repair. If you have another copy of the file, try that one." and a "Choose another file" button, which removes the file and moves focus to the picker, and no file is given

#### Scenario: No page can be found

- **WHEN** a visitor chooses a file that starts with `%PDF-` and holds no catalog or page
- **THEN** the page says "<name> is damaged and cannot be read." with the advice, offers "Choose another file", shows no main button and no link to Repair PDF

### Requirement: Working, done and failed

The job SHALL show "Reading the file", then a bar whose writes fill it to half and whose final check moves it from 55 to 95, with Cancel working throughout. The result SHALL show `<name>-repaired.pdf`, its size, the pages found, Download, "Start again" and two notes. Other failures SHALL say "The file was not repaired." with what happened, one thing to try, and "Go back to your file". (SPEC.md: Tool page anatomy, 6; States every tool handles; Details that apply everywhere)

#### Scenario: A repaired file

- **WHEN** a visitor repairs `damaged-xref.pdf`
- **THEN** the bar never goes back, reaches 50 when the last write ends, shows 55 while the file is checked and 95 after, and the result heading is "Your repaired file is ready", the file `damaged-xref-repaired.pdf` with its size and "3 pages", and the notes say that what was lost cannot be brought back, that parts of an earlier version may show, to check the file, and that it has no password and no restrictions

#### Scenario: Cancel

- **WHEN** the visitor presses Cancel during a job
- **THEN** the job stops, no result is shown, and the file is still listed ready for another go

#### Scenario: Out of memory

- **WHEN** the worker runs out of memory on a large file
- **THEN** the page says "The file was not repaired." with the shared memory sentence and "Try on a computer.", and "Go back to your file"

### Requirement: Bounded work on hostile files

The pre-pass SHALL decode nothing and take linear time. In every repair `load` and `save`, what pdf-lib reads or copies SHALL share one work budget (a multiple of input plus decoded object-stream bytes) and its decoders a byte budget (64 MiB a stream, every stage counted); cross-reference stream entries SHALL NOT be read; writes, qpdf instances and copies SHALL be capped, the last two growing with the file; past a budget, the `output-limit` words. (SPEC.md: Privacy, limits and security)

#### Scenario: An object-stream bomb

- **WHEN** the engine is given a 1.9 MB file whose one object stream unpacks to 2 GB
- **THEN** it stops with `output-limit` before 64 MiB is unpacked, and memory does not grow past the cap

#### Scenario: Unclosed objects, streams and strings

- **WHEN** the engine is given a 1 to 4 MB file of objects, streams, literal strings or hex strings that never close
- **THEN** it finishes reading within the fixed time of its unit test, in time that grows in proportion to the file

#### Scenario: Runs of junk and extra stream words

- **WHEN** the engine is given a 1 to 4 MB file of junk or digit runs between and inside objects, or of streams with missing, wrong or indirect `/Length` and many `stream` words in their data
- **THEN** it finishes within the fixed time of its unit test

#### Scenario: A cross-reference stream bomb

- **WHEN** the engine is given a cross-reference stream with an indirect `/Type`, `/W [0 0 0]` and `/Size 50000000`
- **THEN** its entries are never read, only its `/Root`, `/Info`, `/Encrypt` and `/ID` are used, and the read finishes within its fixed time

#### Scenario: Object-stream offsets

- **WHEN** an object stream lists 2,000 entries all at offset 0, or more entries than a quarter of its unpacked length
- **THEN** that object stream is refused, and the read finishes within its fixed time and memory

#### Scenario: A page-tree bomb or loop

- **WHEN** a 1.7 KB file's `/Kids` would multiply into millions of pages, or a `/Kids` entry points back to its parent
- **THEN** each page object is counted once, the read finishes within its fixed time, and nothing overflows

#### Scenario: Bombs in drawing and picture streams

- **WHEN** a drawing stream or a picture unpacks to 2 GB, on the qpdf route and on the pdf-lib route
- **THEN** nothing decoded is collected from qpdf's output, the sweep's own decoding stops at 64 MiB, and the job ends with a file or a named failure within its memory bound

#### Scenario: A metadata bomb and filter chains

- **WHEN** a 1 MB file's `/Metadata` unpacks to 1 GB, or a stream has six Flate stages turning 82 KB into 513 MB
- **THEN** the guard refuses it during `save` or `load`, the refusal is seen after the call although pdf-lib swallowed it, and the job stops with `output-limit`

#### Scenario: Dense object streams

- **WHEN** an object stream holds 16 MiB of `0 `
- **THEN** the per-call decode budget, set from a Chromium measurement, stops it before the worker passes the memory ceiling

#### Scenario: Two reads at once

- **WHEN** a wrong password and then the right one are typed quickly for a damaged protected file holding an object-stream bomb, so two reads overlap
- **THEN** each read is refused by its own budget, neither resets the other's, a first read that throws leaves the second still guarded, and the page shows the outcome of the latest read

#### Scenario: Reading past the pre-pass

- **WHEN** the engine is given `1 0 obj ] (` then `endobj` then a long unclosed hex string, unclosed literal strings, or long space runs that reach pdf-lib's own scans
- **THEN** the work budget stops the read within its fixed time with the shared `output-limit` words, although pdf-lib catches errors inside its own scans

#### Scenario: Overlapping object-stream parses

- **WHEN** an object stream holds `((((…))))` with offsets 0, 1, 2…
- **THEN** the work budget stops it within its fixed time

#### Scenario: Copies without reads

- **WHEN** an object stream holds many entries each `<< /Length L >> stream` reaching one shared `endstream` near its end, or the same objects stand at the top level of the file
- **THEN** an object-stream entry that parses as a stream is refused, the bytes pdf-lib copies are counted against the work budget, and each file stops within its fixed time and memory with the shared `output-limit` words

#### Scenario: Genuine files fit the work budget

- **WHEN** every damaged kind and every fixture is read the repair way
- **THEN** none passes the work budget, whose multiple is set above the highest ratio measured, with a margin

#### Scenario: Qpdf instances and copies

- **WHEN** the 120,000-page file and the 20,000-page file are repaired through the sweep
- **THEN** they pass within the copy bound, the real limit (the instance bound is only a backstop that the copy bound always reaches first), with 2,000 stream ids a batch

#### Scenario: Many tiny streams

- **WHEN** a crafted file of many tiny streams would make the bytes copied into qpdf instances grow past the copy bound
- **THEN** the job stops with the shared `output-limit` words

#### Scenario: The guards in the built worker

- **WHEN** the built site repairs the 2 GB object-stream bomb, the cross-reference-stream file and the object-stream copy file in Chromium
- **THEN** both are refused within their bounds, so the guards reach the bundled pdf-lib

### Requirement: Large files

A file over 100 MB, or over 20,000 pages, SHALL show the shared notice and still run. (SPEC.md: Privacy, limits and security, Browser tools; CLAUDE.md: Owner decisions, 13 Nov 2026)

#### Scenario: A file over 100 MB

- **WHEN** a visitor chooses a 110 MB PDF whose `startxref` is wrong
- **THEN** the shared notice says the job may be slow or run out of memory on a phone, and the job repairs it

### Requirement: Nothing is uploaded

No request SHALL carry the file's contents, its name or its password, and no page or worker SHALL log them; every console method SHALL be silent while pdf-lib runs. The no-upload test SHALL cover every route with marked strings and find none of them in any request, header, title, storage, address or console, with an exact allowlist of the site's own files read from the build. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The pdf-lib route with a password

- **WHEN** the end-to-end test repairs `qz7report.pdf`, a damaged file that needs a password and holds `SECRET-` strings in its text, a link, a destination, a bookmark and a field, and downloads the result
- **THEN** no request, header, title, storage entry, address or console line holds the name, its stem, the password or its fragments, or any `SECRET-` string, plain or URL-encoded, and every request is in the allowlist

#### Scenario: The qpdf route, the sweep and no new file

- **WHEN** the test repairs a marked file with junk before `%PDF-`, a marked file with a damaged Flate drawing stream, and a sound marked file that gives no new file
- **THEN** the same holds for each

### Requirement: The same requests for every file

Which site files the page fetches SHALL depend on the tool only: the read set (qpdf, pdf-lib, `fflate`) and draw set after every pick, whatever the file, and the job set in every job. What the qpdf instance count can reveal SHALL be named, and following the Repair PDF link from another tool SHALL be named as a difference that follows the visitor's choice. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 22 Nov 2026)

#### Scenario: The uniform-requests test

- **WHEN** `uniform-requests.spec.ts` runs `/repair-pdf` with every pick, `damaged-xref.pdf`, `damaged-cut.pdf`, `text.pdf` (no new file) and a failing job
- **THEN** each phase fetches the same set of files for every input

#### Scenario: The differences are named

- **WHEN** the pull request is opened
- **THEN** it says the qpdf instance count can tell whether the file could be read normally and roughly how many streams it holds, but not whether the sweep changed anything, and that following the link asks for the Repair page, under the uniform-requests owner question

### Requirement: Keyboard and screen reader

The whole flow SHALL work with a keyboard alone and with a screen reader. (SPEC.md: Definition of done, Each tool)

#### Scenario: Keyboard only

- **WHEN** a keyboard user chooses `damaged-xref.pdf` with the picker, tabs to the main button and presses Enter
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step, and Download is reached by Tab

#### Scenario: Screen reader

- **WHEN** a screen reader user chooses a damaged file and runs a job
- **THEN** the status region says the file's name, pages found and size once read, progress is announced as on every tool, focus moves to the result heading, and the no-new-file and too-damaged words are read as a heading with their advice

### Requirement: Page text and the Privacy draft

The text below the tool SHALL be 250 to 500 words, marked as a draft, answering what damage it can fix, why pages may be missing or blank or look older, why the file has no password, and why it may still not open in one program. It SHALL NOT promise every file can be repaired. The Privacy page SHALL gain visible draft sentences on the Repair link and this tool's requests. (SPEC.md: Tool page anatomy, 7; SEO; Look and feel; Privacy, limits and security)

#### Scenario: The text is checked

- **WHEN** the built page is read with scripts off
- **THEN** the text is there, between 250 and 500 words, marked as a draft, with a question "My file still does not open in one program", no banned word, "100%" or exclamation mark, and no sentence saying every file can be repaired

#### Scenario: The Privacy draft

- **WHEN** the built Privacy page is read
- **THEN** it says, as draft sentences, that the damaged notice links to Repair PDF, that following it asks GitHub for that page, which tells GitHub a damaged file was picked and on which tool page, that nothing of the file, its name or its password goes with it, that the file must be chosen again, what the number of qpdf requests can tell, and that a repaired file can hold parts of an earlier saved version
