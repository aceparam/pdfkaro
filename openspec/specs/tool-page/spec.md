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

When a job is done the page SHALL show the file name, the new size, a Download button and a short list of next steps that carry the file into another tool. Nothing SHALL download until the visitor presses a button. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A job finishes

- **WHEN** a job finishes
- **THEN** the result block appears and no download starts on its own

#### Scenario: The result is announced

- **WHEN** a job finishes while a screen reader is in use
- **THEN** the screen reader announces that the result is ready

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

While a job runs the page SHALL show progress in real units, such as "Page 14 of 120", with a Cancel button. Cancel SHALL stop the job. (SPEC.md: States every tool handles)

#### Scenario: A long job runs

- **WHEN** a 120-page job is running
- **THEN** the page shows which page of 120 is being worked on and a Cancel button

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

When a file is damaged the page SHALL say that the file is damaged and cannot be read, name it, and offer to carry on without it. When Repair PDF is published, the page SHALL also show a link that opens the file in Repair PDF. Until then no such link SHALL be shown. (SPEC.md: States every tool handles; openspec: tool-registry, related tools link only to published tools)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a PDF that the tool cannot read
- **THEN** the page says "appendix.pdf is damaged and cannot be read.", names it, and offers to carry on without it

#### Scenario: Repair PDF is not published

- **WHEN** a file is damaged and Repair PDF has no registry entry
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF is published

- **WHEN** a file is damaged and Repair PDF has a registry entry
- **THEN** the page also links to Repair PDF with the file carried over

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

### Requirement: Output names

Output names SHALL be built from the input name, so that `report.pdf` becomes `report-merged.pdf`. Several outputs SHALL download as one zip. (SPEC.md: Details that apply everywhere)

#### Scenario: One output

- **WHEN** `report.pdf` is rotated
- **THEN** the result is named from `report` with a suffix for the job

#### Scenario: Several outputs

- **WHEN** a split produces five files
- **THEN** Download gives one zip holding the five files

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
