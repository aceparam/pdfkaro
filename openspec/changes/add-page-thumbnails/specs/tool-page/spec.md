## ADDED Requirements

### Requirement: Page thumbnails of the visitor's own file

In the working area, each listed item SHALL show a small picture of a page of the visitor's file: the first page of each file in a tool that lists files, and each page in a tool that lists pages. Thumbnails SHALL be drawn in a worker, never on the page's own thread, and only after a file is picked. (SPEC.md: Tool page anatomy, 4; Look and feel, Images; Rules for the code, 3 and 4)

#### Scenario: Files are listed in a tool that lists files

- **WHEN** a visitor chooses `report.pdf` and `appendix.pdf` in Merge PDF
- **THEN** each file in the list shows a thumbnail of its own first page beside its name

#### Scenario: A page loads and no file is chosen

- **WHEN** a tool page has loaded and no file has been picked
- **THEN** no script or file used to draw thumbnails has been requested

### Requirement: What a thumbnail shows while it loads or when it cannot be drawn

While a thumbnail is being drawn, the item SHALL show a blank paper box of the same size, so the list does not move when the picture arrives. When a page cannot be drawn, the blank box SHALL stay and the tool SHALL work as before. A thumbnail MUST NOT hold up the job. (SPEC.md: States every tool handles; Details that apply everywhere)

#### Scenario: A thumbnail is still being drawn

- **WHEN** a file has been listed and its thumbnail is not ready
- **THEN** a blank paper box of the thumbnail's size is shown in its place, and the main button can be used as soon as every file has been read

#### Scenario: A file needs a password

- **WHEN** a listed file needs a password and none has been given
- **THEN** its blank box stays until the right password is given, and then its thumbnail is drawn

#### Scenario: A file is damaged

- **WHEN** a listed file is damaged
- **THEN** its blank box stays, and the damaged file state is shown as before

#### Scenario: Drawing fails

- **WHEN** a thumbnail cannot be drawn, because the drawing code could not be fetched or the page could not be read
- **THEN** the blank box stays, no error is shown for it, and the job can still be run

#### Scenario: The device is set to dark mode

- **WHEN** thumbnails are shown in dark mode
- **THEN** each is drawn as the page's own colours on white paper with a line around it, as in light mode

### Requirement: Thumbnails are pictures only

A thumbnail SHALL be hidden from screen readers and SHALL NOT take keyboard focus, since the file's name beside it already says what it is. It SHALL NOT be a link or a control. (SPEC.md: Each tool, keyboard and screen reader; Look and feel)

#### Scenario: A screen reader reads the list

- **WHEN** a screen reader user moves through the list of files
- **THEN** each item is read by its name and details, and nothing is read for the thumbnail

#### Scenario: A keyboard user tabs through the list

- **WHEN** a visitor presses Tab through the list
- **THEN** focus moves between the Move up, Move down and Remove buttons and never stops on a thumbnail

### Requirement: Thumbnails stay on the device and are forgotten with the files

Drawing a thumbnail SHALL add no request that carries file contents, a file name or a password. The only new requests SHALL be for the site's own files, after a pick. Thumbnails SHALL be forgotten when their file is removed, on "Start again" and on leaving the page. (SPEC.md: Browser tools; openspec: privacy, The no-upload test)

#### Scenario: The no-upload test runs with thumbnails

- **WHEN** the no-upload test picks files, types a password, merges and downloads, with thumbnails drawn
- **THEN** after the pick only an exact list of the site's own files is requested, and the in-browser `blob:` addresses of the thumbnails are the only other addresses used

#### Scenario: A file is removed

- **WHEN** the visitor removes a file from the list
- **THEN** its thumbnail is forgotten with it

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves the page
- **THEN** no thumbnail of any file is left on the page

## MODIFIED Requirements

### Requirement: Thumbnails load as they come into view

Page thumbnails SHALL load as they scroll into view. A 500-page file MUST NOT freeze the page. (SPEC.md: Details that apply everywhere)

#### Scenario: A 500-page file is chosen

- **WHEN** a 500-page file is chosen
- **THEN** only thumbnails near the visible area are rendered, and the page stays responsive while scrolling

#### Scenario: A long list of files is chosen

- **WHEN** a visitor chooses more files than fit on the screen
- **THEN** thumbnails are drawn for the files on screen and just below it first, the rest as the visitor scrolls to them, and no task on the page runs longer than 100 ms while they are drawn
