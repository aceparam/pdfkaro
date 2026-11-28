# Spec Delta

## Purpose

What the Repair PDF tool at `/repair-pdf` does: reading one PDF that other tools turn away as damaged, recovering the pages and parts that can still be read into a new file that passes `qpdf --check`, saying honestly what could not be recovered, and every state the page shows, with no file data leaving the browser.

## ADDED Requirements

### Requirement: The page

The tool SHALL be served at `/repair-pdf` with the title, heading and sentence below, and a meta description that says the file stays on the device and is not uploaded. It SHALL be listed under "Make smaller and fix" after Grayscale PDF, and the hub's description SHALL name repairing a damaged PDF. Its words are drafts for the owner. (SPEC.md: Tool catalogue; Tool page anatomy, 1 and 2; SEO, Every tool page and Site-wide)

#### Scenario: The page is opened

- **WHEN** a visitor opens `/repair-pdf`
- **THEN** the title is "Repair a damaged PDF in your browser - PDFkaro", the heading "Repair a damaged PDF", the sentence "Recover what can still be read from a damaged PDF. Your file stays on your device.", the picker reads "Choose a PDF file", and nothing else of the tool is shown

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

When the file needs a password, damaged or not, the page SHALL ask for it in a labelled field naming the file, with the note that the password stays in the browser; a wrong one SHALL be reported and the field kept, and another file can be chosen instead. A file encrypted for certificates SHALL be called saved in a way this tool cannot read, with advice to ask the sender. No password SHALL be guessed. (SPEC.md: States every tool handles, Password needed; Scope notes, Unlock)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses `password.pdf`
- **THEN** a password field naming it is shown with the note, the main button is not, and focus moves to the field

#### Scenario: A protected file that is also damaged

- **WHEN** a visitor chooses a copy of `password.pdf` whose cross-reference table points to the wrong places
- **THEN** the password field is shown; with `open-sesame` the file is read and listed with 3 pages; with `nope` the page says the password did not open the file and keeps the field

#### Scenario: A file with restrictions only

- **WHEN** a visitor chooses a damaged copy of `restricted.pdf`
- **THEN** no password is asked for, and the file is listed with 3 pages

### Requirement: How a file is repaired

A file qpdf can read SHALL be written again by qpdf. Any other SHALL be read object by object from its start, ignoring its cross-reference table and leaving out objects that make no sense, then written by qpdf. Parts of pages that point to nothing SHALL be removed, a damaged Flate stream SHALL keep what still unpacks, other damaged streams SHALL be emptied. The file SHALL pass `qpdf --check` or not be given. (SPEC.md: Architecture and tech stack; Definition of done; owner questions 5, 6)

#### Scenario: The damaged kinds measured for this change

- **WHEN** the engine repairs each of the 36 damaged files the unit tests make from `text.pdf`, `rich.pdf` and `pages-500.pdf` (wrong cross-reference offsets, a wrong or missing `startxref`, a missing table, trailer, tail or `/Root`, files cut off in four places, junk or inserted bytes, a missing header, a wrong or missing stream `/Length`, damaged compressed, object and cross-reference streams, a broken page dictionary, a missing `endobj`, a page tree pointing to a missing object, every line ending changed to CR LF, 4 KB zeroed, a wrong `/Prev`)
- **THEN** every result passes `qpdf --check`, and holds at least the pages, page text, bookmarks, link and attachment recorded for that file in the fixtures README, which are at least what desktop qpdf 12.4.2 recovered when this change was planned

#### Scenario: A file qpdf reads with warnings

- **WHEN** the engine repairs `warning.pdf`
- **THEN** the result is qpdf's own rewrite: 3 pages, no warning from `qpdf --check`, and the same page contents as the input

#### Scenario: A damaged compressed stream

- **WHEN** a page's compressed drawing stream has bytes changed part way through
- **THEN** the page keeps the drawing that unpacks before the damage, the other pages are unchanged, and the result passes `qpdf --check`

#### Scenario: A page whose drawing is missing

- **WHEN** a file is cut off so that a page's drawing stream is gone but the page itself was found
- **THEN** that page is kept as a blank page of its size, and the result passes `qpdf --check`

### Requirement: What the new file keeps

The new file SHALL keep every page and object that could be found and is still reached from the document, with undamaged page contents byte for byte: text, links, fields and values, notes, bookmarks, attachments, tags, destinations, threads, language, output intents and details. Only the newest saved version SHALL be kept. It SHALL have no password and no restrictions. (SPEC.md: Definition of done, Each tool; owner question 3, extending the owner's decision of 13 Nov 2026)

#### Scenario: A rich file with a broken table

- **WHEN** the engine repairs a copy of `rich.pdf` whose cross-reference offsets are all wrong
- **THEN** the result has 2 pages, both bookmarks, the link and `note.txt`, and the same page contents as `rich.pdf`

#### Scenario: Tagged and form files read the repair way

- **WHEN** the engine is made to take the repair route on `tagged.pdf`, `form.pdf` and `multilingual.pdf`
- **THEN** each result holds the same catalog keys, document details, pages, page contents, fields, outline and attachments as qpdf's own rewrite of that file

#### Scenario: A protected damaged file

- **WHEN** the engine repairs a damaged copy of `password.pdf` with `open-sesame`
- **THEN** the result opens with no password, has no restrictions, and its text reads as the original's

### Requirement: A file with nothing to repair

When qpdf reads the file with no warning, `qpdf --check` passes, the file starts with `%PDF-` and ends with `%%EOF`, no new file SHALL be made, and the page SHALL say "This file has no damage this tool can find." with "No new file was made. You can use your file as it is. If it still does not open in one program, try another." (CLAUDE.md: owner question 4 of this change)

#### Scenario: A sound file

- **WHEN** a visitor repairs `text.pdf`
- **THEN** the page says "This file has no damage this tool can find." with the advice, shows no Download button, and offers "Start again"

#### Scenario: A sound file with junk before its header

- **WHEN** a visitor repairs a copy of `text.pdf` with 250 bytes of junk before `%PDF-`
- **THEN** a new file is made, starting with `%PDF-`, with the same 3 pages

### Requirement: A file too damaged to repair

When no page can be found in the file, the page SHALL show the damaged notice naming the file, with the advice "No pages could be found in it. If you have another copy of the file, try that one.", and no link to Repair PDF. When the repaired file would still fail `qpdf --check`, the job SHALL give no file and say "This file is too damaged to repair. If you have another copy of it, try that one." (SPEC.md: States every tool handles, Damaged file and Failed; What we are building, rule 4)

#### Scenario: The repaired file would still fail the check

- **WHEN** a stand-in engine fails a job as too damaged
- **THEN** the page says "The file was not repaired." with "This file is too damaged to repair. If you have another copy of it, try that one." and "Go back to your file", and no file is given

#### Scenario: No page can be found

- **WHEN** a visitor chooses a file that starts with `%PDF-` and holds no catalog or page
- **THEN** the page says "<name> is damaged and cannot be read." with the advice, offers "Choose another file", shows no main button and no link to Repair PDF

### Requirement: Working, done and failed

The job SHALL show "Reading the file", then writing progress, with Cancel working throughout. The result SHALL show `<name>-repaired.pdf`, its size, the pages found, Download, "Start again" and two notes. A failed job SHALL say "The file was not repaired." with what happened, one thing to try, and "Go back to your file". (SPEC.md: Tool page anatomy, 6; States every tool handles; Details that apply everywhere)

#### Scenario: A repaired file

- **WHEN** a visitor repairs `damaged-xref.pdf`
- **THEN** the result heading is "Your repaired file is ready", the file is `damaged-xref-repaired.pdf` with its size and "3 pages", and the notes say that what was lost in the damage cannot be brought back and to check the file, and that the file has no password and no restrictions

#### Scenario: Cancel

- **WHEN** the visitor presses Cancel during a job
- **THEN** the job stops, no result is shown, and the file is still listed ready for another go

#### Scenario: Out of memory

- **WHEN** the worker runs out of memory on a large file
- **THEN** the page says "The file was not repaired." with the shared memory sentence and "Try on a computer.", and "Go back to your file"

### Requirement: Bounded work on hostile files

The pass that closes open objects SHALL take time in proportion to the file's size. Each object stream SHALL be unpacked by a capped step, at most 64 MiB each and within the job's budget, before the reader parses it; cross-reference stream entries SHALL NOT be unpacked; every write SHALL be capped. A file past a budget SHALL stop with the shared `output-limit` words, and Cancel SHALL end the work at any point. (SPEC.md: Privacy, limits and security; Definition of done)

#### Scenario: An object-stream bomb

- **WHEN** the engine is given a 1.9 MB file whose one object stream unpacks to 2 GB
- **THEN** it stops with `output-limit` before 64 MiB is unpacked, and memory does not grow past the cap

#### Scenario: Unclosed objects

- **WHEN** the engine is given 200,000 objects that are never closed (4 MB)
- **THEN** it finishes reading in a time that grows in proportion to the file, under the limit set in its unit test, where an unguarded read takes minutes

### Requirement: Large files

A file over 100 MB, or over 20,000 pages, SHALL show the shared notice and still run. (SPEC.md: Privacy, limits and security, Browser tools; CLAUDE.md: Owner decisions, 13 Nov 2026)

#### Scenario: A file over 100 MB

- **WHEN** a visitor chooses a 110 MB PDF whose `startxref` is wrong
- **THEN** the shared notice says the job may be slow or run out of memory on a phone, and the job repairs it

### Requirement: Nothing is uploaded

No request SHALL carry the file's contents, its name or its password, and no page or worker SHALL log them; the reader's own warnings SHALL NOT reach the console. The tool's no-upload test SHALL repair a damaged protected file and damaged copies of fixtures with marked strings and find none of them in any request, header, title, storage, address or console, with an exact allowlist of the site's own files read from the build. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The no-upload test

- **WHEN** the end-to-end test repairs `qz7report.pdf`, a damaged file that needs a password and holds `SECRET-` strings in its text, a link, a destination, a bookmark and a field, and downloads the result
- **THEN** no request, header, title, storage entry, address or console line holds the name, its stem, the password or its fragments, or any `SECRET-` string, plain or URL-encoded, and every request is in the allowlist, with pdf-lib in the read and job sets and no other engine's chunk

### Requirement: The same requests for every file

Which site files the page fetches SHALL depend on the tool only: the read set (qpdf, pdf-lib, `fflate`) and draw set after every pick, whatever the file, and the job set in every job. The qpdf instance count SHALL depend on the file only as named, and following the Repair PDF link from another tool SHALL be named as a difference that follows the visitor's choice. (SPEC.md: Privacy, limits and security; CLAUDE.md: Owner decisions, 22 Nov 2026)

#### Scenario: The uniform-requests test

- **WHEN** `uniform-requests.spec.ts` runs `/repair-pdf` with every pick, `damaged-xref.pdf`, `damaged-cut.pdf`, `text.pdf` (no new file) and a failing job
- **THEN** each phase fetches the same set of files for every input

#### Scenario: The differences are named

- **WHEN** the pull request is opened
- **THEN** it names the qpdf instance count by route and the Repair page request that follows the link, under the uniform-requests owner question, with the facts listed for the Privacy draft

### Requirement: Keyboard and screen reader

The whole flow SHALL work with a keyboard alone and with a screen reader. (SPEC.md: Definition of done, Each tool)

#### Scenario: Keyboard only

- **WHEN** a keyboard user chooses `damaged-xref.pdf` with the picker, tabs to the main button and presses Enter
- **THEN** the job runs and the result is reached without a mouse, with a visible focus outline at each step, and Download is reached by Tab

#### Scenario: Screen reader

- **WHEN** a screen reader user chooses a damaged file and runs a job
- **THEN** the status region says the file's name, pages found and size once read, progress is announced as on every tool, focus moves to the result heading, and the no-new-file and too-damaged words are read as a heading with their advice

### Requirement: Page text and the Privacy draft

The text below the tool SHALL be 250 to 500 words, marked as a draft, answering what damage it can and cannot fix, why pages may be missing or blank, why the file has no password, and why a sound file may still fail in one program. It SHALL NOT promise every file can be repaired or hold anything banned. The Privacy draft SHALL gain this tool's request facts for the owner. (SPEC.md: Tool page anatomy, 7; SEO; Look and feel; Privacy, limits and security)

#### Scenario: The text is checked

- **WHEN** the built page is read with scripts off
- **THEN** the text is there, between 250 and 500 words, marked as a draft, with no banned word, "100%" or exclamation mark, and no sentence saying every file can be repaired
