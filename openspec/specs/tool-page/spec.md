# tool-page Specification

## Purpose

What every tool page contains, the order it comes in, and what the visitor sees in each state, built from the shared `ToolShell`, `FilePicker`, `PageGrid` and `Result` components. Derived from "Tool page anatomy" and "What we are building" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: Seven parts in a fixed order

Every tool page SHALL be built from the shared `ToolShell` component and SHALL have these parts in this order: heading, one sentence, file picker, working area, one main button, result, and the text below the tool. (SPEC.md: Tool page anatomy)

#### Scenario: Two tool pages are compared

- **WHEN** any two tool pages are opened side by side
- **THEN** both show the same parts in the same order

### Requirement: Heading and sentence

The heading SHALL state the job in plain words. The sentence under it SHALL say what the tool does and where the file goes. For a browser tool it SHALL say the files stay on the device. For a server tool it SHALL say "Your file is uploaded to convert it and deleted within an hour." (SPEC.md: Tool page anatomy, 1 and 2)

#### Scenario: A browser tool page is opened

- **WHEN** a visitor opens Merge PDF
- **THEN** the heading reads "Merge PDF files" and the sentence says files stay on the device

#### Scenario: A server tool page is opened

- **WHEN** a visitor opens a server tool
- **THEN** the sentence says the file is uploaded and deleted within an hour, and it is shown before any file is chosen

### Requirement: File picker

The page SHALL show one large file picker button, named for what it takes, such as "Choose PDF files". The picker SHALL be visible without scrolling on a 360px wide screen. Dropping a file anywhere on the page SHALL work, and so SHALL paste. (SPEC.md: Tool page anatomy, 3; What we are building, rules 1 and 5)

#### Scenario: A page loads on a phone

- **WHEN** a tool page loads at 360px wide
- **THEN** the file picker button is on screen without scrolling

#### Scenario: A file is dropped

- **WHEN** a visitor drops a PDF anywhere on the page
- **THEN** the file is taken as if it had been chosen with the button

#### Scenario: A file is pasted

- **WHEN** a visitor pastes a file into the page
- **THEN** the file is taken as if it had been chosen with the button

#### Scenario: Keyboard only

- **WHEN** a visitor uses only a keyboard
- **THEN** the picker can be reached with Tab and opened with Enter or Space

### Requirement: Working area

After a file is chosen the page SHALL show the working area: page thumbnails and only the options this tool needs. Defaults SHALL be set so that the main button works without touching any option. (SPEC.md: Tool page anatomy, 4)

#### Scenario: A file is chosen and nothing else is touched

- **WHEN** a visitor chooses a file and presses the main button
- **THEN** the tool produces a sensible result with its defaults

### Requirement: One main button named after the result

The page SHALL have one main button, named after the result, such as "Merge and download". It MUST NOT be named "Submit" or "Process". (SPEC.md: Tool page anatomy, 5)

#### Scenario: The main button is read

- **WHEN** a screen reader reads the main button of Merge PDF
- **THEN** it announces "Merge and download"

### Requirement: Result block

When a job is done the page SHALL show the file name, the new size, a Download button and next steps that carry the file into another tool. A tool that makes files smaller SHALL also show the old size, and a job that ends with no new file SHALL say so with no Download button, as the scenarios set out. Nothing SHALL download until the visitor presses a button. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** a job finishes
- **THEN** the result block appears and no download starts on its own

#### Scenario: The result is announced

- **WHEN** a job finishes while a screen reader is in use
- **THEN** the screen reader announces that the result is ready

#### Scenario: A file is made smaller

- **WHEN** a tool that makes files smaller finishes with a smaller file
- **THEN** the result shows the new size, "was" and the old size

#### Scenario: There is no new file

- **WHEN** a tool's job ends with no new file because the file could not be improved
- **THEN** the page shows the tool's sentence and advice, "Start again" and no Download button, focus moves to the sentence, and the screen reader announces it

### Requirement: Text below the tool

Below the tool the page SHALL show three or four how-to steps, a short FAQ and links to related tools that are published. This text SHALL be 250 to 500 words, held as Markdown in `src/content/`, drafted plainly and marked for the owner to review. (SPEC.md: Tool page anatomy, 7; SEO, Every tool page; Build phases, 6)

#### Scenario: Draft text is added

- **WHEN** a change adds page text for a tool
- **THEN** the text is in `src/content/`, is marked for the owner to review, and is not counted as done until the owner has reviewed it

### Requirement: Empty state

Before a file is chosen the tool SHALL show the file picker and nothing else. (SPEC.md: States every tool handles)

#### Scenario: A page loads

- **WHEN** a tool page loads with no file
- **THEN** the tool widget shows only the file picker

### Requirement: Engine loading state

While the engine loads the page SHALL show "Getting ready" next to the file name. It MUST NOT show a blank screen. (SPEC.md: States every tool handles)

#### Scenario: A file is chosen on a slow connection

- **WHEN** a file is chosen and the engine has not finished loading
- **THEN** the file name is shown with "Getting ready" beside it

### Requirement: Working state

While a job runs the page SHALL show progress in real units, such as "Page 14 of 120" or "Picture 3 of 40", with a Cancel button. While a single file is read before the work starts, the line SHALL say "Reading the file". Cancel SHALL stop the job. (SPEC.md: States every tool handles)

#### Scenario: A long job runs

- **WHEN** a 120-page job is running
- **THEN** the page shows which page of 120 is being worked on and a Cancel button

#### Scenario: Pictures are worked on

- **WHEN** a job works through 40 pictures
- **THEN** the page shows which picture of 40 is being worked on

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the job stops, no result is shown, and the visitor can start again with the same file

### Requirement: Password needed state

When a file needs a password the page SHALL show a password field. In a browser tool the field SHALL carry a note that the password stays in the browser. (SPEC.md: States every tool handles)

#### Scenario: A protected file is chosen

- **WHEN** a visitor chooses a password-protected PDF in a browser tool
- **THEN** a labelled password field appears with the note, and the job continues once the right password is typed

#### Scenario: The password is wrong

- **WHEN** the visitor types a wrong password
- **THEN** the page says the password is wrong and keeps the field for another try

### Requirement: Damaged file state

When a file is damaged the page SHALL say so, name it, and offer to carry on without it. Once Repair PDF is published, the notice on every tool that takes PDFs, Repair aside, SHALL also link to it after that button, saying the file must be chosen again there until files can be handed over in memory, then opening it with the file loaded. The link SHALL be a plain address from the registry with nothing of the file in it. (SPEC.md: States every tool handles; Rules for the code, 5; CLAUDE.md: Owner decisions, 28 Nov 2026)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a PDF that the tool cannot read
- **THEN** the page says "appendix.pdf is damaged and cannot be read.", names it, and offers to carry on without it

#### Scenario: Repair PDF is not published

- **WHEN** a file is damaged and Repair PDF has no registry entry
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF is published

- **WHEN** a file is damaged on Merge PDF and Repair PDF has a registry entry
- **THEN** after the "Leave this file out" button the notice says, on its own line, "Repair PDF may be able to recover it. On that page, choose the file again." with a link "Go to Repair PDF", at least 44px tall, to Repair's address under the site's base path, holding nothing of the file; following it opens Repair PDF in the same tab with no file listed and no leave-page prompt

#### Scenario: The status announcement

- **WHEN** the damaged notice with the link is shown
- **THEN** the status region announces the heading, the advice and the Repair sentence

#### Scenario: Once files can be handed over

- **WHEN** files can be handed over between tools in memory and a file is damaged on Merge PDF
- **THEN** the link opens Repair PDF with that file already loaded, and the sentence about choosing the file again is no longer shown

#### Scenario: Keyboard and screen reader

- **WHEN** focus moves to the damaged notice's heading and a keyboard user presses Tab
- **THEN** the button to carry on without the file is reached first and the link "Go to Repair PDF" next, both with a visible focus outline, and a screen reader reads the heading, the advice and the sentence about Repair PDF in that order

#### Scenario: A tool that does not take PDFs

- **WHEN** a picture is damaged on Image to PDF
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF's own page

- **WHEN** a file is too damaged for Repair PDF itself
- **THEN** its damaged notice shows no link to Repair PDF

#### Scenario: Nothing of the file goes with the link

- **WHEN** a visitor picks a damaged file with a marked name on Merge PDF, then follows the link, then goes Back
- **THEN** no request for the Repair page is made before the click; the request is a plain `GET` with no query or fragment and no marked string in any header; cookies, storage, `window.name`, the address and `history.state` (null) hold nothing of the file on either page; and after Back the name and the file are gone

### Requirement: Too large state

When a file is too large for a server tool the page SHALL show the limit, the file's size and what to try. Browser tools have no fixed limit. (SPEC.md: States every tool handles; Privacy, limits and security)

#### Scenario: A file over the server limit is chosen

- **WHEN** a visitor chooses a file over the limit in a server tool
- **THEN** the page shows the limit, the file's size and something to try, and no upload starts

### Requirement: Failed state

When a job fails the page SHALL say what happened in one sentence and give one thing to try next. (SPEC.md: States every tool handles)

#### Scenario: A job fails

- **WHEN** an engine reports an error it cannot recover from
- **THEN** the page shows one sentence on what happened and one next step, with no stack trace or error code alone

#### Scenario: A browser tool runs out of memory

- **WHEN** a browser tool runs out of memory on a large file
- **THEN** the page shows the failed state and suggests a smaller file or a computer with more memory

#### Scenario: Going back to one file

- **WHEN** a job fails in a tool that takes one file
- **THEN** the way back reads "Go back to your file"; a tool that takes several files says "Go back to your files"

### Requirement: Output names

Output names SHALL be built from the input name, so that `report.pdf` becomes `report-merged.pdf`. Several outputs SHALL download as one zip, named from the input with the tool's suffix, holding files numbered from the input name. A tool whose outputs are not PDFs SHALL give each its own extension, for a single output and inside a zip. A name SHALL hold no path and no character that common systems refuse in file names. (SPEC.md: Details that apply everywhere)

#### Scenario: One output

- **WHEN** `report.pdf` is rotated
- **THEN** the result is named from `report` with a suffix for the job

#### Scenario: Several outputs

- **WHEN** a split produces five files
- **THEN** Download gives one zip holding the five files

#### Scenario: The files inside a zip

- **WHEN** a split of `report.pdf` produces three files
- **THEN** the zip is `report-split.zip` and holds `report-part-1.pdf`, `report-part-2.pdf` and `report-part-3.pdf`, in order

#### Scenario: Outputs that are pictures

- **WHEN** a 12-page `report.pdf` is turned into JPG pictures
- **THEN** the zip is `report.zip` and holds `report-page-01.jpg` to `report-page-12.jpg`, in order, numbered to the width of the total (500 pages give `report-page-001.jpg`); a one-page file gives `report.jpg`, downloaded as a JPG, not a PDF

#### Scenario: A name with characters some systems refuse

- **WHEN** the input is named `a:b*c?.pdf` or `../x.pdf`
- **THEN** the result and every file inside a zip are named without `:`, `*`, `?`, `"`, `<`, `>`, `|`, slashes or a leading dot

### Requirement: Reordering without drag

Wherever items can be reordered, the page SHALL offer drag and also "move up" and "move down" buttons, so that reordering works with a keyboard and on a small touch screen. (SPEC.md: Details that apply everywhere)

#### Scenario: Keyboard reordering

- **WHEN** a visitor focuses an item and presses its "move down" button
- **THEN** the item moves one place down, focus stays on it, and the new position is announced to a screen reader

### Requirement: Thumbnails load as they come into view

Page thumbnails SHALL load as they scroll into view. A 500-page file MUST NOT freeze the page. (SPEC.md: Details that apply everywhere)

#### Scenario: A 500-page file is chosen

- **WHEN** a 500-page file is chosen
- **THEN** only thumbnails near the visible area are rendered, and the page stays responsive while scrolling

#### Scenario: A long list of files is chosen

- **WHEN** a visitor chooses more files than fit on the screen
- **THEN** thumbnails are drawn for the files on screen and just below it first, the rest as the visitor scrolls to them, and no task on the page runs longer than 100 ms while they are drawn

### Requirement: Real sizes in plain units

Size figures SHALL be real and in plain units, such as "4.2 MB, was 11.8 MB". (SPEC.md: Details that apply everywhere)

#### Scenario: A file is compressed

- **WHEN** a compression job finishes
- **THEN** the result shows the true new size and the true old size in KB or MB

### Requirement: Handover between tools

The next steps in the result block SHALL open the chosen tool with the file already loaded, handed over in memory. (SPEC.md: Tool page anatomy, 6; Rules for the code, 5)

#### Scenario: A next step is chosen

- **WHEN** a visitor finishes a merge and chooses "Compress this file"
- **THEN** Compress PDF opens with the merged file loaded, and the visitor is not asked to choose it again

#### Scenario: The handover is looked for afterwards

- **WHEN** a handover has just happened and the next tool is still open
- **THEN** cookies, local storage, session storage, IndexedDB, `window.name` and the URL hold no part of the file, and after the tab is closed nothing of it remains

### Requirement: One generic tool widget

Every tool page SHALL mount the same island, `ToolWidget`, told which tool it is by the registry. Before a file is picked the island SHALL load only what the file picker needs. The tool's engine, its WebAssembly and the rest of the widget SHALL load after a file is picked. (SPEC.md: Rules for the code, 1 and 4; Tool page anatomy)

#### Scenario: A tool page loads

- **WHEN** a tool page loads and no file has been picked
- **THEN** no engine script, worker script or WebAssembly file has been requested

#### Scenario: A second tool is added

- **WHEN** a second tool is added to the registry
- **THEN** its page uses the same island, and `[slug].astro` gains no branch for it

### Requirement: The file picker works without the mouse and before the script

The file picker SHALL be a real file input with a visible label styled as the main button. It SHALL open with Enter or Space, show where focus is, and take files chosen before the page's script has loaded. (SPEC.md: Tool page anatomy, 3; Definition of done, keyboard use)

#### Scenario: The picker is used with the keyboard

- **WHEN** a visitor reaches the file picker with Tab and presses Enter or Space
- **THEN** the file chooser opens

#### Scenario: Files are chosen before the script loads

- **WHEN** a visitor chooses files before the page's script has finished loading
- **THEN** the files are taken as soon as it has

### Requirement: Focus goes where the visitor needs it

When a part of the widget appears or goes, focus SHALL move to the next thing the visitor needs, as the table in the `add-tool-widget` design sets out. A change SHALL be announced to a screen reader once: by moving focus to it, or by a status message, not both. (SPEC.md: Definition of done, keyboard and screen reader use)

#### Scenario: The main button is pressed

- **WHEN** a visitor presses the main button with the keyboard
- **THEN** focus moves to Cancel, and progress is read from a status region

#### Scenario: The result appears

- **WHEN** a job finishes
- **THEN** focus moves to the result's heading, and no separate status message repeats it

#### Scenario: The last file is removed

- **WHEN** a visitor removes the only file in the list
- **THEN** the page returns to the file picker alone and focus moves to it

#### Scenario: A one-file tool lists its file as a row

- **WHEN** a visitor chooses a file in a tool that takes one file and lists it as a row, with no summary line above it (Compress PDF)
- **THEN** focus moves to the main button, and once the file has been read the status region says its name, pages and size once, such as "report.pdf, 64 pages, 11.8 MB."

### Requirement: Page thumbnails of the visitor's own file

In the working area, each listed item SHALL show a small picture of a page of the visitor's file: the first page of each file in a tool that lists files, and each page in a tool that lists pages. A page SHALL keep its own shape. Thumbnails SHALL be drawn in a worker, never on the page's own thread, and only after a file is picked. (SPEC.md: Tool page anatomy, 4; Look and feel, Images and Dark mode; Rules for the code, 3 and 4)

#### Scenario: Files are listed in a tool that lists files

- **WHEN** a visitor chooses `report.pdf` and `appendix.pdf` in Merge PDF
- **THEN** each file in the list shows a thumbnail of its own first page beside its name

#### Scenario: A wide page is shown

- **WHEN** a listed file's first page is wider than it is tall
- **THEN** its thumbnail is drawn wide, inside the same space as the others, so the list does not move

#### Scenario: The device is set to dark mode

- **WHEN** thumbnails are shown in dark mode
- **THEN** each page is drawn in its own colours on white paper with a line around it, as in light mode

#### Scenario: A page loads and no file is chosen

- **WHEN** a tool page has loaded and no file has been picked
- **THEN** no script or data used to draw thumbnails has been requested

### Requirement: A thumbnail never holds up the job

While a thumbnail is being drawn, the item SHALL show a blank paper box of the same size. When a page cannot be drawn, the blank box SHALL stay and the tool SHALL work as before. Pressing the main button SHALL stop any thumbnail being drawn, so the job starts at once. (SPEC.md: States every tool handles; Each tool, never blocks the page and Cancel works)

#### Scenario: A thumbnail is still being drawn

- **WHEN** a file has been listed and its thumbnail is not ready
- **THEN** a blank paper box of the thumbnail's size is shown in its place, and the main button can be used as soon as every file has been read

#### Scenario: The main button is pressed while a thumbnail is drawn

- **WHEN** a thumbnail is still being drawn and the visitor presses the main button
- **THEN** the drawing stops, the job starts at once, and the job's progress is shown

#### Scenario: A file needs a password

- **WHEN** a listed file needs a password and none has been given
- **THEN** its blank box stays until the right password is given, and then its thumbnail is drawn

#### Scenario: A file is damaged

- **WHEN** a listed file is damaged
- **THEN** its blank box stays, and the damaged file state is shown as before

#### Scenario: Drawing fails or takes too long

- **WHEN** a thumbnail cannot be drawn, because the drawing code could not be fetched, the page could not be read, or drawing took too long
- **THEN** the blank box stays, no error is shown or announced for it, and the job can still be run

#### Scenario: The files are over 100 MB

- **WHEN** the listed files add up to more than 100 MB
- **THEN** the large-file warning is shown as before, thumbnails are drawn one at a time, and the main button can be used whether or not they are done

### Requirement: Thumbnails are pictures only

A thumbnail SHALL be hidden from screen readers and SHALL NOT take keyboard focus, since the file's name beside it already says what it is. It SHALL NOT be a link or a control, and SHALL NOT be dragged on its own. (SPEC.md: Each tool, keyboard and screen reader; Look and feel)

#### Scenario: A screen reader reads the list

- **WHEN** a screen reader user moves through the list of files
- **THEN** each item is read by its name and details, and nothing is read for the thumbnail

#### Scenario: A keyboard user tabs through the list

- **WHEN** a visitor presses Tab through the list
- **THEN** focus moves between the Move up, Move down and Remove buttons and never stops on a thumbnail

#### Scenario: An item is dragged by its thumbnail

- **WHEN** a visitor with a mouse drags an item by its thumbnail
- **THEN** the item is moved as when dragged anywhere else on it, and the picture itself is not dragged

### Requirement: Thumbnails stay on the device and are forgotten with the files

Drawing a thumbnail SHALL add no request that carries file contents, a file name, a password, or anything that depends on the file. The only new requests SHALL be for a fixed set of the site's own files, the same for every file, after a pick. Thumbnails SHALL be forgotten when their file is removed, on "Start again" and on leaving the page. (SPEC.md: Browser tools; openspec: privacy, The no-upload test; owner's decision of 11 Nov 2026)

#### Scenario: The no-upload test runs with thumbnails

- **WHEN** the no-upload test picks files, types a password, waits for every thumbnail, merges and downloads
- **THEN** after the pick only an exact list of the site's own files is requested, the same whichever files were picked, and the in-browser `blob:` addresses of the thumbnails are the only other addresses used

#### Scenario: A file is removed

- **WHEN** the visitor removes a file from the list, even while its thumbnail is being drawn
- **THEN** its thumbnail is forgotten, and a picture that arrives later is thrown away

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves the page
- **THEN** no thumbnail of any file is left on the page or can still be opened from its address

### Requirement: Tools that work on pages list the pages

A tool that works on the pages of one file SHALL, once the file has been read, show one line naming the file with its page count and size, then its pages in order as a wrapping grid, each a thumbnail drawn as it comes into view with "Page N" under it. Pages SHALL be moved only by the tool's own controls, never by drag alone. (SPEC.md: Tool page anatomy, 4; Details that apply everywhere; Works on a phone)

#### Scenario: A file is chosen in a tool that works on pages

- **WHEN** a visitor chooses `report.pdf`, 12 pages, in a tool that works on pages
- **THEN** a line reads "report.pdf, 12 pages" and its size, with a way to remove it, and below it twelve pages, "Page 1" to "Page 12", each with a thumbnail or blank paper until it is drawn

#### Scenario: A 500-page file is chosen

- **WHEN** a visitor chooses a 500-page file in a tool that works on pages
- **THEN** only pages on screen or near it are drawn, the rest as the visitor scrolls, no task on the page runs longer than 100 ms, and a "Skip to the main button" link above the pages takes focus straight past them

#### Scenario: The file is still being read, needs a password, is damaged or is large

- **WHEN** the file in a tool that works on pages is being read, needs a password, is damaged, or is over 100 MB
- **THEN** the page shows that state as for a list of files, with "Getting ready", the password field, the damaged file notice or the large file warning, and lists no pages until the file has been read

#### Scenario: A page is dragged in a tool with no controls of its own

- **WHEN** a visitor drags a page in a tool whose pages have no controls
- **THEN** nothing moves

#### Scenario: A screen reader user reads the pages

- **WHEN** a screen reader user moves through the list of pages
- **THEN** each item is read by its page number, and nothing is read for its thumbnail

#### Scenario: A keyboard user moves through the pages

- **WHEN** a visitor presses Tab through a list of pages with no controls of the tool's own
- **THEN** focus passes over the pages without stopping on any page or thumbnail

#### Scenario: The file is removed

- **WHEN** the visitor removes the file
- **THEN** its pages, thumbnails and the copy kept open to draw them are all forgotten, and the page returns to the file picker

### Requirement: Several results come as one zip

When a job gives more than one file, the files SHALL be joined into one zip off the page's own thread, and the result block SHALL show the zip's name, its true size and how many files it holds, with one Download button. Nothing SHALL download until the visitor presses it. (SPEC.md: Details that apply everywhere; Tool page anatomy, 6)

#### Scenario: A job gives four files

- **WHEN** a job on `report.pdf` gives four files
- **THEN** the result block shows `report-split.zip`, its size, and "4 files", and Download saves that one zip

#### Scenario: A job gives one file

- **WHEN** a job gives one file
- **THEN** that file is handed back as it is, with no zip

#### Scenario: Nothing is uploaded, and the requests do not depend on the file

- **WHEN** the no-upload test runs a tool that can give several files, on a file that gives one and on one that gives several
- **THEN** both runs request the same files, including the site's own zip script, by exact name, and no request carries file contents, the file name or a password

### Requirement: Very long lists of pages are shown in batches

A list of pages SHALL show at most 500 pages at first, then a button naming the next pages in real units, "Show pages 501 to 1,000", which shows up to 500 more each time. There SHALL be no limit on the number of pages a file may have. After a press, focus SHALL move to the first new page and the page SHALL announce how many pages are shown. (SPEC.md: Details that apply everywhere, "A 500-page file must not freeze the page"; Privacy, limits and security, "There is no fixed size limit")

#### Scenario: A 500-page file

- **WHEN** a file of 500 pages is listed
- **THEN** all 500 pages are shown and there is no button to show more

#### Scenario: A file with very many pages

- **WHEN** a file of 120,000 pages is listed
- **THEN** pages 1 to 500 are shown, followed by "Show pages 501 to 1,000", the page never blocks for more than 100 ms, and every page can still be reached

#### Scenario: More pages are shown with the keyboard

- **WHEN** a keyboard user presses "Show pages 501 to 1,000"
- **THEN** pages 501 to 1,000 appear, focus moves to page 501's first control, which sits where the button was, and "Showing 1,000 of 120,000 pages" is announced

#### Scenario: The last batch is short

- **WHEN** a 1,200-page file shows 1,000 pages
- **THEN** the button reads "Show pages 1,001 to 1,200"

### Requirement: Files of very many pages are warned about

A tool that works on pages SHALL show a notice when its file has more than 20,000 pages: "This file has more than 20,000 pages. The job may take a long time." The job SHALL still be allowed to run, with progress and Cancel. (SPEC.md: What we are building, rule 4, "Honest about limits"; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages is listed in a tool that works on pages
- **THEN** the notice is shown, and the main button can still be used

#### Scenario: A file of 500 pages

- **WHEN** a file of 500 pages is listed
- **THEN** no such notice is shown

### Requirement: Pages that a tool lets move

When a tool lets the pages of one file move, each page SHALL have "Earlier" and "Later" buttons, named "Move page N earlier" and "Move page N later", no Remove, and mouse drag. The file's first "Earlier" and last "Later" SHALL be unavailable but focusable. A move SHALL be announced with the new place in the whole file, and focus SHALL stay on a usable move button. (SPEC.md: Details that apply everywhere, reordering; Tool page anatomy, 4)

#### Scenario: A page is moved with the keyboard

- **WHEN** a keyboard user presses "Move page 3 earlier" in a 12-page file
- **THEN** page 3 takes place 2, the status region says "Page 3 moved to place 2 of 12.", and focus stays on "Move page 3 earlier"

#### Scenario: The buttons at phone width

- **WHEN** the pages are shown at 360px, at 1280px, or with text at 200%
- **THEN** each page's two buttons are stacked, each as wide as the page's cell and at least 2.75rem tall, and nothing overflows sideways

#### Scenario: A page at the end of a batch

- **WHEN** a 900-page file shows its first 500 pages
- **THEN** the "Later" of the page at place 500 can be used, and pressing it shows the next batch with the page at place 501 and announces "of 900"

#### Scenario: A file list keeps its own moves

- **WHEN** a tool lists files, as Merge PDF does
- **THEN** each file still has "Move up", "Move down" and "Remove", as before

### Requirement: Pages that a tool lets turn

When a tool lets the pages of one file turn, each page SHALL have "Turn left" and "Turn right" buttons, stacked and named "Turn page N left" and "Turn page N right", and no Remove; its thumbnail SHALL be drawn turned within its slot, and its caption SHALL say how far it is turned from how it was. Focus SHALL stay on the button pressed. (SPEC.md: Tool page anatomy, 4; Works on a phone)

#### Scenario: A page is turned

- **WHEN** a keyboard user presses "Turn page 3 right"
- **THEN** page 3's thumbnail is drawn a quarter turned to the right within its slot, its caption reads "Page 3, turned right", the turn is announced, and focus stays on the button

#### Scenario: The buttons at phone width

- **WHEN** the pages are shown at 360px, at 1280px, or with text at 200%
- **THEN** each page's two buttons are stacked, each as wide as the page's cell and at least 2.75rem tall, and nothing overflows sideways

### Requirement: Options a tool needs

A tool with options SHALL show them once its file has been read, below the file and above the main button. A choice SHALL start at a value with which the main button works and be a group of radio buttons, one per line, named by a visible legend. A text or a new password SHALL start empty, as their own requirements say. Focus SHALL then move to the first option. What each option holds SHALL be kept and reset as the scenarios below say. (SPEC.md: Tool page anatomy, 4; Definition of done)

#### Scenario: A file is read in a tool with options

- **WHEN** a file has been read in a tool with one choice
- **THEN** the group is shown below the file with its starting value chosen, focus moves to that radio button, and pressing the main button without touching it gives a sensible result

#### Scenario: A keyboard user goes through the options

- **WHEN** a keyboard user is on the chosen radio button and presses the arrow keys, then Tab
- **THEN** the arrow keys change the choice within the group, and Tab leaves the group, which takes one Tab stop, for the next option, then the rest of the working area in page order and the main button

#### Scenario: A screen reader user reaches a group

- **WHEN** focus moves into a group of radio buttons with a screen reader running
- **THEN** the legend is read, then the button's label, its state and its place in the group, and nothing is announced twice

#### Scenario: How a group looks

- **WHEN** a group is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** it has no border of its own other than, at most, a 1px line in the colour for lines, no extra padding, a legend that looks like the other field labels, each radio button and its label a target at least 2.75rem tall, and nothing overflows sideways

#### Scenario: Cancel and Start again

- **WHEN** the visitor changes a choice, starts the job and presses Cancel, then later gets a result and presses "Start again"
- **THEN** after Cancel the choice is as the visitor left it, and after "Start again" the next file shows every option at its starting value

#### Scenario: Another file

- **WHEN** the visitor changes a choice, then picks another file with "Choose another file" while the file is listed
- **THEN** the new file shows the choice as the visitor left it; but when the only file is removed, including a damaged or password-protected file left out from its notice, the next file shows every option at its starting value

#### Scenario: A tool with no options

- **WHEN** a tool lists no options
- **THEN** its working area and where focus goes are as before

### Requirement: A text a tool needs

A text SHALL be a one-line field with a visible label and a hint read with it. It is the job's input, so it SHALL start empty and the main button SHALL wait while it holds no text, with the tool's sentence tied to it. Enter in the field while the main button waits SHALL have the status region say why, on every press. (SPEC.md: Tool page anatomy, 4 and 5; Definition of done)

#### Scenario: A file is read in a tool with a text

- **WHEN** a file has been read in a tool whose first option is a text
- **THEN** the empty field is shown below the file with its label and hint, focus moves to the field, and the main button waits with the tool's sentence shown under it and read with it

#### Scenario: Text is typed

- **WHEN** the visitor types " Draft copy " into the field
- **THEN** the sentence under the main button goes, the main button works, and the job is sent "Draft copy", trimmed at both ends

#### Scenario: Only spaces are typed

- **WHEN** the field holds only spaces
- **THEN** it counts as empty, and the main button still waits with the tool's sentence

#### Scenario: The text is too long

- **WHEN** the visitor types or pastes 63 characters into a field that takes 50
- **THEN** nothing typed is cut off, the field is marked invalid, and "This text has 63 characters. Use 50 or fewer." is shown between the label and the field, read with the field and tied to the main button, which does nothing when pressed

#### Scenario: A few Western characters the rule does not take

- **WHEN** the visitor types "Łódź" into a field whose rule is the standard fonts' characters
- **THEN** the field is marked invalid, and "Ł and ź cannot be used." is shown, with the rule left to the hint under the field, read with the field and tied to the main button, which does nothing when pressed

#### Scenario: Text in another script

- **WHEN** the visitor types "नमस्ते" or "مرحبا" into such a field
- **THEN** the field is marked invalid, and "Some characters cannot be used." is shown, with the rule left to the hint under the field, with no list of characters, tied to the main button; nothing is ever drawn as question marks

#### Scenario: Accented letters in composed or separate form

- **WHEN** the visitor types "Café", with the accent typed as its own mark after the "e"
- **THEN** it is taken as "Café", counted as four characters, and the main button works

#### Scenario: A phone keyboard is open

- **WHEN** the visitor types on a phone at 360px and the on-screen keyboard covers the lower half of the screen
- **THEN** a sentence about the text is shown above the field, where the keyboard does not cover it, and the keyboard's Enter key is labelled as "Go"

#### Scenario: A keyboard user uses the field

- **WHEN** a keyboard user is in the field and presses Tab, or presses Enter
- **THEN** Tab moves on to the next option, then the rest of the working area in page order and the main button; Enter does what pressing the main button does, so it starts the job only when the main button works, and while the button waits the status region says why on every press ("Type the watermark text first.", or the field's sentence); the Enter that confirms a word in an input method or a phone keyboard's suggestion does not press it

#### Scenario: A screen reader user reaches the field

- **WHEN** focus moves into the field with a screen reader running
- **THEN** the label is read, then that it is an edit field, its text, the hint, and, when something is wrong, that it is invalid and the sentence; the sentence is said once by the status region when it first appears or changes, and nothing is announced twice

#### Scenario: How the field looks

- **WHEN** the field is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** it has the site's field style, a label that looks like the other field labels, a height of at least 2.75rem, the sentence between the label and the field, bold in the text colour as a wrong password's is, the hint under the field, and nothing overflows sideways

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor types a text, starts the job and presses Cancel, or the job fails, or the visitor picks another file with "Choose another file" while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another file the text is as typed; after "Start again" or removing the only file the field is empty again

### Requirement: A typed text that cannot be used

Text that is too long, or has a character the tool's rule does not take, SHALL get one sentence tied to the field and to the main button, which stays focusable and does nothing. A sentence about refused characters SHALL say only which characters cannot be used, since the hint states the rule. (SPEC.md: Tool page anatomy, 4; What we are building, rule 4)

#### Scenario: A text with a problem

- **WHEN** the typed text is too long or has a character the tool's rule does not take
- **THEN** one sentence saying what is wrong is tied to the field and to the main button, which stays focusable, and a press does nothing

### Requirement: A text the engine refuses

When a tool's engine refuses the text it was sent, the page SHALL say "The text could not be used. Check it and try again.", or the tool's own words for its text, under the tool's heading for a failed job, and offer "Go back to your file" with the text as typed. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a text

- **WHEN** a test entry's engine is sent a text it refuses
- **THEN** the page shows the failed heading and "The text could not be used. Check it and try again.", and "Go back to your file" lists the file with the text still in the field

### Requirement: Options shown for one choice

An option that names a condition SHALL be shown only while the earlier choice it names holds the value it names, after the options before it. While hidden it SHALL NOT hold the main button back and SHALL NOT be sent to the engine, and what it holds SHALL be kept for when it is shown again. Changing the choice SHALL NOT move focus. (SPEC.md: Tool page anatomy, 4; Scope notes, Sign PDF; Definition of done)

#### Scenario: The file is read

- **WHEN** a file has been read in a test entry whose first option is a choice of "a" or "b", starting at "a", followed by a text shown for "a" and a text shown for "b"
- **THEN** the choice and the text for "a" are shown, the text for "b" is not in the page, and only the text for "a" can hold the main button back

#### Scenario: The choice is changed

- **WHEN** the visitor types in the text for "a", then chooses "b" with the arrow keys
- **THEN** the text for "a" goes and the text for "b" appears after the choice, focus stays on the radio button for "b", Tab moves next to the text for "b", and the main button waits only for the text for "b"

#### Scenario: Switching back

- **WHEN** the visitor chooses "a" again
- **THEN** the text for "a" is shown as the visitor typed it

#### Scenario: What the engine is sent

- **WHEN** the job starts with "b" chosen
- **THEN** the engine is sent the choice and the text for "b" only, and nothing under the key of the text for "a"

#### Scenario: A screen reader user changes the choice

- **WHEN** a screen reader user moves through the radio buttons and chooses "b"
- **THEN** the radio button's label, state and place are read as for any choice, nothing else is announced, and the next Tab reaches the field now shown, read with its label and hint

#### Scenario: Start again and the last file removed

- **WHEN** the visitor has chosen "b" and typed in both texts, then presses "Start again", or removes the only file, and picks another file
- **THEN** once it is read the choice is at "a" again and both texts are empty

#### Scenario: A tool with no conditions

- **WHEN** a tool's options name no condition
- **THEN** every option is shown, held and sent as before

### Requirement: A drawing a tool needs

A drawing SHALL be a box the width of the column with a visible label, a hint and a Clear button, drawn on with a finger, mouse or pen without moving the page. It is the job's input, so it SHALL start empty and the main button SHALL wait while nothing is drawn, with the tool's sentence tied to it. It SHALL never be a tool's first option, and the tool's hint SHALL name a way to do the job without drawing. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4 and 5; Works on a phone)

#### Scenario: A drawing is shown

- **WHEN** a file has been read in a test entry whose options include a drawing
- **THEN** the drawing's label, an empty box, its hint and its Clear button are shown in registry order, and the main button waits with the tool's sentence under it and read with it

#### Scenario: Drawing with a mouse or a pen

- **WHEN** the visitor presses in the box, moves and lets go, twice
- **THEN** two lines show where the pointer went, in the text colour, the sentence under the main button goes, and the main button works

#### Scenario: Drawing with a finger on a phone

- **WHEN** the visitor draws in the box with a finger at 360px
- **THEN** the line follows the finger, the page does not scroll or zoom, no text is selected and no menu opens

#### Scenario: A second finger

- **WHEN** a second finger touches the box while the first is drawing
- **THEN** only the first finger draws

#### Scenario: Clear

- **WHEN** the visitor presses Clear
- **THEN** the box is empty, the status region says the drawing is cleared, and the main button waits again with the tool's sentence

#### Scenario: A full drawing

- **WHEN** a drawing reaches its most lines or points
- **THEN** it takes no more, what was drawn stays, and the status region says once that the drawing is full and to clear it to start again

#### Scenario: A keyboard user reaches the drawing

- **WHEN** a keyboard user presses Tab through the working area
- **THEN** the box takes no Tab stop, Clear does, and Clear is read with the drawing's hint, which names the tool's way to do the job without drawing

#### Scenario: A screen reader user reaches the drawing

- **WHEN** a screen reader user moves through the working area
- **THEN** the box is read as a picture named by the drawing's label and described by its hint, and Clear as a button with its words, described by the same hint

#### Scenario: How the drawing looks

- **WHEN** the drawing is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** the box is 5 wide to 2 tall, the column's width, with a 1px edge in the control colour and corners of 4px, lines stay sharp, and nothing overflows sideways

#### Scenario: The window changes size

- **WHEN** the window is resized or the phone is turned after something is drawn
- **THEN** the drawing is shown again whole, at the new size, in the same place in the box

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor draws, starts the job and presses Cancel, or the job fails, or the visitor picks another file while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another file the drawing is as it was; after "Start again" or removing the only file the box is empty

#### Scenario: Drawing never blocks the page

- **WHEN** the visitor draws quickly on a phone whose processor is slowed four times
- **THEN** no task blocks the page for more than 100 ms

### Requirement: A drawing the engine refuses

When a tool's engine refuses the drawing it was sent, the page SHALL say "The drawing could not be used. Clear it and draw again.", or the tool's own words, under the tool's heading for a failed job, and offer "Go back to your file" with the drawing kept. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a drawing

- **WHEN** a test entry's engine is sent a drawing it refuses
- **THEN** the page shows the failed heading and "The drawing could not be used. Clear it and draw again.", and "Go back to your file" lists the file with the drawing still in the box

### Requirement: A picture a tool needs

A picture SHALL be a field with a label, a button to choose one picture of the tool's types, and a hint. A chosen picture SHALL be named with its size, not shown. The main button SHALL wait until one is read. A wrong, damaged or unreadable picture SHALL get one sentence naming it and what to do, tied to the field and the main button; a large one, a notice, and still be used. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4 and 5; States every tool handles; Look and feel)

#### Scenario: The field is shown

- **WHEN** a file has been read in a test entry whose options include a picture
- **THEN** the picture's label, a "Choose a picture" button and its hint are shown in registry order, and the main button waits with the tool's sentence under it and read with it

#### Scenario: A picture is chosen

- **WHEN** the visitor chooses `signature.png`, 120 KB, and it is read
- **THEN** a line reads "signature.png, 120 KB.", the button reads "Choose another picture", the status region says "signature.png, 120 KB.", no picture is shown, and the main button works

#### Scenario: Not a picture of the tool's types

- **WHEN** the visitor chooses `notes.txt` renamed `notes.png`, with or without a picture chosen before
- **THEN** no picture is chosen, any earlier one is forgotten, and "notes.png is not a JPG or PNG picture, so it was not used. No picture is chosen." is shown between the label and the button, read with the button and tied to the main button, which does nothing when pressed, and the button reads "Choose a picture" again

#### Scenario: A damaged picture

- **WHEN** the visitor chooses a PNG whose data is cut short
- **THEN** "broken.png is damaged and cannot be read. Choose another picture." is shown by the field and tied to the main button

#### Scenario: A picture saved in a way the tool cannot read

- **WHEN** the visitor chooses a JPG with arithmetic coding
- **THEN** "arithmetic.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy." is shown by the field and tied to the main button

#### Scenario: A very large picture

- **WHEN** the visitor chooses `photo.jpg`, 12.4 MB and 24 million pixels, in a tool whose notice sizes are 8 MB and 16 million pixels
- **THEN** it is read and used, its line reads "photo.jpg, 12.4 MB.", a notice says "photo.jpg is 12.4 MB, with 24 million pixels." and "A picture this large makes the new file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.", the notice is tied to the main button, and the main button works

#### Scenario: The worker is ended while a picture is read

- **WHEN** the worker is ended while a picture is being read, because a thumbnail ran out of time
- **THEN** the picture is read again while it is still chosen and the files are listed, and never stays "Getting ready"

#### Scenario: The job ends while a hidden picture is being read

- **WHEN** a picture hidden by a choice is still being read when the job starts, and the job's end cancels the read
- **THEN** it is not read again during the job or on its result, and no worker is started for it

#### Scenario: Cancel while a hidden picture is being read

- **WHEN** a picture hidden by a choice is still being read when the visitor starts the job and presses Cancel
- **THEN** the file is listed again and the picture is read again, so it never stays "Getting ready" and thumbnails are not held back

#### Scenario: A picture is picked again while the last is still being read

- **WHEN** the visitor picks another picture while the last one is still being read
- **THEN** the worker reading the last one is ended, the new one is read on a fresh worker, and the last one is never read again

#### Scenario: Another picture

- **WHEN** the visitor chooses another picture after one was read
- **THEN** the new one takes its place, and the old one is forgotten

#### Scenario: A keyboard user chooses a picture

- **WHEN** a keyboard user tabs to the button and presses Enter or Space
- **THEN** the system's file chooser opens, the chosen picture is named in the line, and focus stays on the button

#### Scenario: A screen reader user reaches the field

- **WHEN** a screen reader user reaches the button
- **THEN** its words are read, then the field's label, the line naming the picture if one is chosen, the sentence about a problem if there is one, and the hint, and nothing is announced twice

#### Scenario: How the field looks

- **WHEN** the field is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** the label looks like the other field labels, the button has the site's secondary style, the sentence is bold in the text colour between the label and the button, a long file name wraps, and nothing overflows sideways

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor chooses a picture, starts the job and presses Cancel, or the job fails, or the visitor picks another PDF while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another PDF the picture is still chosen; after "Start again" or removing the only file no picture is chosen and its bytes are forgotten

### Requirement: A picture too large for the file

When a tool's engine finds that the chosen picture alone would make the new file pass its size budget, the page SHALL say "photo.jpg (24.6 MB) is too large to place on these pages. Crop it to the signature, or save a smaller copy.", with the picture's name and size and the tool's own step where it gives one, under the failed heading, and offer "Go back to your file". (SPEC.md: States every tool handles, Too large and Failed)

#### Scenario: The engine finds the picture too large

- **WHEN** a test entry's engine throws the picture-too-large error for a chosen `photo.jpg` of 24.6 MB
- **THEN** the page shows the failed heading and that sentence, and "Go back to your file" lists the file with the picture still chosen

### Requirement: A picture the engine refuses

When a tool's engine refuses the picture it was sent, the page SHALL say "The picture could not be used. Choose another picture.", or the tool's own words, under the tool's heading for a failed job, and offer "Go back to your file" with the picture still chosen. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a picture

- **WHEN** a test entry's engine is sent a picture it refuses
- **THEN** the page shows the failed heading and "The picture could not be used. Choose another picture.", and "Go back to your file" lists the file with the picture still named in its line

### Requirement: A new password a tool needs

A new password SHALL be two hidden labelled fields, one under the other: the password, then the same again. The tool's hint SHALL sit under the first and a shared note on where the password goes under the second; both SHALL be read with the first. Both SHALL start empty, and the main button SHALL wait until both hold the same password the tool's rule takes. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Password needed; Definition of done)

#### Scenario: A file is read in a tool with a new password

- **WHEN** a file has been read in a tool whose first option is a new password
- **THEN** both empty fields are shown below the file with their labels, the hint under the first and the shared note under the second, focus moves to the first field, and the main button waits with the tool's first sentence ("Type a password first.") shown under it and read with it

#### Scenario: The password is typed in the first field only

- **WHEN** the visitor types a password the rule takes in the first field and nothing in the second
- **THEN** the main button still waits, with the tool's second sentence ("Type the password again to check it.") under it and read with it

#### Scenario: The second field is being typed

- **WHEN** the second field holds the start of the first field's password, but not all of it
- **THEN** no sentence is shown by either field, the second field is not marked invalid, and the main button waits with the tool's second sentence

#### Scenario: Both fields hold the same password

- **WHEN** both fields hold "open  Sesame-9", with two spaces inside
- **THEN** the sentence under the main button goes, the main button works, and the job is sent "open  Sesame-9" exactly as typed, and nothing from the second field

#### Scenario: A space first

- **WHEN** the first field holds " open sesame"
- **THEN** the first field is marked invalid at once, "A password cannot start or end with a space." is shown between its label and the field, read with it and tied to the main button, which does nothing when pressed

#### Scenario: A space last

- **WHEN** the first field holds "open sesame " and focus is still in it
- **THEN** no sentence is shown by the field and nothing is announced, and the main button waits with the tool's second sentence ("Type the password again to check it.") under it; once focus leaves the first field, or Enter is pressed, or the main button is pressed, the field is marked invalid and "A password cannot start or end with a space." is shown between its label and the field, tied to the main button

#### Scenario: Typing a password with a space inside, one key at a time

- **WHEN** the visitor types "open sesame" into the first field one key at a time, passing through "open "
- **THEN** no sentence is shown by either field at any point, the field is never marked invalid, and the status region announces nothing

#### Scenario: The two passwords differ

- **WHEN** the second field holds something that is not the start of the first field's password, or is longer than it
- **THEN** the second field is marked invalid, "The two passwords are not the same. Type the password again in this box." is shown between its label and the field, read with it and tied to the main button, which stays focusable and does nothing when pressed

#### Scenario: Characters the rule does not take

- **WHEN** the visitor types "café", "पासवर्ड", a tab, a no-break space or "£" into the first field of a field whose rule is printable ASCII
- **THEN** the first field is marked invalid and "Some characters cannot be used. Use only the characters listed under the box." is shown between its label and the field, naming no character, read with the field and tied to the main button, which does nothing when pressed; the hint under the field says which characters can be used

#### Scenario: The password is too long

- **WHEN** the visitor types or pastes 130 characters into the first field of a field that takes 127
- **THEN** nothing typed is cut off, the first field is marked invalid, and "This password is too long. Use 127 characters or fewer." is shown between its label and the field, tied to the main button, which does nothing when pressed; the sentence does not say how many characters were typed

#### Scenario: A phone keyboard is open

- **WHEN** the visitor types on a phone at 360px and the on-screen keyboard covers the lower half of the screen
- **THEN** a sentence about either field is shown above that field, where the keyboard does not cover it, the keyboard's Enter key is labelled as "Next" in the first field and "Go" in the second, the second field's label starts close under the first field (within about 200px at 360px wide), and the fields stay hidden, so the keyboard offers no corrections, suggestions or capitals

#### Scenario: A keyboard user uses the fields

- **WHEN** a keyboard user is in the first field and presses Tab, or presses Enter in either field
- **THEN** Tab moves to the second field, then to the next option, then the rest of the working area in page order and the main button; Enter in the first field moves focus to the second field once the first holds a password the rule takes, and otherwise shows the first field's sentence or has the status region say the sentence that holds the main button, on every press; Enter in the second field does what pressing the main button does, so it starts the job only when the main button works, and while the button waits the status region says why on every press, in the words of the sentence that holds it; the Enter that confirms a word in an input method does neither

#### Scenario: A screen reader user reaches the fields

- **WHEN** focus moves into the first field, then the second, with a screen reader running
- **THEN** the first is read with its label, as a password field, then the hint and the shared note (the note, though shown under the second field, is part of the first field's description), and, when something is wrong with it, that it is invalid and the sentence; the second with its label, as a password field, and, when the two differ, that it is invalid and its sentence; a sentence is said once by the status region when it first appears or changes kind, never holds the password, and nothing is announced twice

#### Scenario: How the fields look

- **WHEN** the fields are shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** each has the site's field style, a label that looks like the other field labels and a height of at least 2.75rem, a sentence sits between its field's label and the field, bold in the text colour as a wrong password's is, the hint sits under the first field and the note under the second, and nothing overflows sideways

#### Scenario: The note under the first field

- **WHEN** a new password's fields are drawn
- **THEN** the note is no longer under the first field but its own paragraph under the second, still read with the first field, and it reads, in draft words for the owner, "The password stays in your browser. This site does not send it anywhere. Your browser may offer to save it or to suggest one. A saved password is kept by your browser and may be copied to your browser account."; it never claims the password goes nowhere at all

#### Scenario: Cancel, a failure and another file

- **WHEN** the visitor types the password in both fields, starts the job and presses Cancel, or the job fails and the visitor presses "Go back to your file", or the visitor picks another file with "Choose another file" while listing
- **THEN** both fields hold what was typed, and the main button works without typing it again

#### Scenario: The password is forgotten

- **WHEN** a job with the password finishes, or the visitor presses "Start again", removes the only file, or leaves the page
- **THEN** the page holds the password no longer, and the next file read shows both fields empty

#### Scenario: A new password shown for one choice

- **WHEN** a test entry shows a new password only while an earlier choice holds one value, and the visitor types it, then changes the choice
- **THEN** the fields go, the password is not sent and does not hold the main button, and changing the choice back shows both fields as typed

### Requirement: A new password is used as typed and never said back

A new password SHALL be sent exactly as typed: never trimmed, composed or cut. No sentence or status message on the page SHALL hold the password, a part of it, a refused character or its length. (SPEC.md: What we are building, rule 4; Privacy, limits and security, Browser tools)

#### Scenario: What is sent

- **WHEN** both fields hold "Open  Sesame-9 ", with two spaces inside and one at the end
- **THEN** the job is not started, because of the space at the end; and once both hold "Open  Sesame-9", the job is sent "Open  Sesame-9", byte for byte

#### Scenario: A sentence about a password

- **WHEN** any sentence about a new password is shown or said, for refused characters, a space at an end, a password too long, two passwords that differ, or a password the engine refused
- **THEN** it is one of the fixed sentences, naming no character and no number of characters typed

### Requirement: A new password the engine refuses

When a tool's engine refuses the new password it was sent, the page SHALL say "The password could not be used. Go back to your file and type it again.", or the tool's own words for its password, under the tool's heading for a failed job, and offer "Go back to your file" with both fields as typed. The sentence SHALL NOT hold the password. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a password

- **WHEN** a test entry's engine is sent a new password it refuses
- **THEN** the page shows the failed heading and "The password could not be used. Go back to your file and type it again.", and "Go back to your file" lists the file with both fields as typed

### Requirement: A tool page links to its group

Below its related tools, every tool page SHALL show one text link to its group's hub page, worded "All tools in" and the group name, in the served HTML. It is part of the text below the tool and adds no new part. (SPEC.md: Tool page anatomy, 7; SEO, Site-wide; SEO, Every tool page, Structured data)

#### Scenario: A tool page is fetched

- **WHEN** `/merge-pdf` is fetched and no script is run
- **THEN** after its related tools it holds a link "All tools in Organise pages" to the "Organise pages" hub page, and the link matches the middle step of its breadcrumb

#### Scenario: Keyboard and screen reader

- **WHEN** a visitor tabs past the related tools
- **THEN** the hub link takes focus next with a visible outline, is at least 44px tall, and a screen reader reads its words as they are shown

#### Scenario: A phone-sized screen

- **WHEN** a tool page is shown 360px wide
- **THEN** the link wraps within the column and nothing scrolls sideways

### Requirement: A target size a page sets

A tool whose pages each set a target size SHALL take the target's bytes and label from `src/widget/option-values.ts`, never from words typed in the registry, and its words SHALL be written once, as plain functions. When a picked file's size is at or under the target, the main button SHALL be unavailable with a sentence tied to it that names the file, decided at the pick, and no password SHALL be asked for that file. (SPEC.md: Tool page anatomy, 5; What we are building, rule 4)

#### Scenario: A file already under the target

- **WHEN** a file of 84 KB is listed on a page whose target is 200 KB
- **THEN** the main button is unavailable, described by "<name> is already 200 KB or smaller, so there is nothing to do here. You can use it as it is.", and the sentence is announced with the status line

#### Scenario: A file name with markup

- **WHEN** a file named `<b>x</b>.pdf` is held as already under the target
- **THEN** the sentence shows the name as text

### Requirement: A result measured against the page's target

A result at or under the page's target SHALL say so in its heading. A result over it SHALL say so in its heading and in a sentence naming its size and the target, then the tool's advice, and SHALL still offer Download. (SPEC.md: Tool page anatomy, 6)

#### Scenario: A result under the target

- **WHEN** a job on a 200 KB page gives a file of 184 KB
- **THEN** the result heading is "Your file is now 200 KB or smaller", followed by the shared "was" line

#### Scenario: A result over the target

- **WHEN** a job on a 200 KB page gives a file of 312 KB
- **THEN** the heading is "Your file is still over 200 KB", then "The smallest file this tool could make is 312 KB, which is over 200 KB.", the tool's advice, and Download

### Requirement: One byte rule for sizes over a target

A size over the target SHALL be shown in bytes, with a thousands separator, whenever the size the shared format shows, taken back to bytes in 1024s, is at most the label in 1024s. The over-target sentence and the "was" line SHALL use the same form. (SPEC.md: Details that apply everywhere)

#### Scenario: Sizes that would read the same

- **WHEN** a job on a 200 KB page gives a file of 203,000 bytes
- **THEN** the sentence and the "was" line both name "203,000 bytes", never "198 KB"

#### Scenario: The byte rule's edges

- **WHEN** the rule is given 1,000,001, 1,040,000, 1,048,576, 1,101,000 and 1,101,004 bytes against 1 MB, 2,050,000 against 2 MB, and 102,400 and 102,911 against 100 KB
- **THEN** each is shown in bytes; 1,101,005 and 1,110,000 against 1 MB show "1.1 MB", 2,150,000 against 2 MB shows "2.1 MB", and 102,912 against 100 KB shows "101 KB"

#### Scenario: Keyboard and screen reader

- **WHEN** a keyboard or screen reader user meets the held main button or the over-target result
- **THEN** the button is reachable and announced as unavailable with its sentence, and focus moves to the result heading, which is announced with its sentence
