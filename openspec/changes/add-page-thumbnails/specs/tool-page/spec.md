## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Thumbnails load as they come into view

Page thumbnails SHALL load as they scroll into view. A 500-page file MUST NOT freeze the page. (SPEC.md: Details that apply everywhere)

#### Scenario: A 500-page file is chosen

- **WHEN** a 500-page file is chosen
- **THEN** only thumbnails near the visible area are rendered, and the page stays responsive while scrolling

#### Scenario: A long list of files is chosen

- **WHEN** a visitor chooses more files than fit on the screen
- **THEN** thumbnails are drawn for the files on screen and just below it first, the rest as the visitor scrolls to them, and no task on the page runs longer than 100 ms while they are drawn
