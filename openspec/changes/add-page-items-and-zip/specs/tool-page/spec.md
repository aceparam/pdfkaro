## ADDED Requirements

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

When a job gives more than one file, the files SHALL be joined into one zip off the page's own thread, and the result block SHALL show the zip's name, its true size and how many files it holds, with one Download button and no next steps into other tools. Nothing SHALL download until the visitor presses it. (SPEC.md: Details that apply everywhere; Tool page anatomy, 6)

#### Scenario: A job gives four files

- **WHEN** a job on `report.pdf` gives four files
- **THEN** the result block shows `report-split.zip`, its size, and "4 files", and Download saves that one zip

#### Scenario: A zip offers no next steps

- **WHEN** the result is a zip
- **THEN** the result block shows no links that carry the result into another tool

#### Scenario: A job gives one file

- **WHEN** a job gives one file
- **THEN** that file is handed back as it is, with no zip

#### Scenario: Nothing is uploaded, and the requests do not depend on the file

- **WHEN** the no-upload test runs a tool that can give several files, on a file that gives one and on one that gives several
- **THEN** both runs request the same files, including the site's own zip script, by exact name, and no request carries file contents, the file name or a password

## MODIFIED Requirements

### Requirement: Output names

Output names SHALL be built from the input name, so that `report.pdf` becomes `report-merged.pdf`. Several outputs SHALL download as one zip, named from the input with the tool's suffix, holding files numbered from the input name. A name SHALL hold no path and no character that common systems refuse in file names. (SPEC.md: Details that apply everywhere)

#### Scenario: One output

- **WHEN** `report.pdf` is rotated
- **THEN** the result is named from `report` with a suffix for the job

#### Scenario: Several outputs

- **WHEN** a split produces five files
- **THEN** Download gives one zip holding the five files

#### Scenario: The files inside a zip

- **WHEN** a split of `report.pdf` produces three files
- **THEN** the zip is `report-split.zip` and holds `report-part-1.pdf`, `report-part-2.pdf` and `report-part-3.pdf`, in order

#### Scenario: A name with characters some systems refuse

- **WHEN** the input is named `a:b*c?.pdf` or `../x.pdf`
- **THEN** the result and every file inside a zip are named without `:`, `*`, `?`, `"`, `<`, `>`, `|`, slashes or a leading dot
