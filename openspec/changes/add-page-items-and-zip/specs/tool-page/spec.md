## ADDED Requirements

### Requirement: Tools that work on pages list the pages

A tool that works on the pages of one file SHALL, once the file has been read, list one item per page in order, named "Page 1", "Page 2" and so on, each with a thumbnail of that page drawn as it comes into view. Which controls each page has SHALL be the tool's own. (SPEC.md: Tool page anatomy, 4; Details that apply everywhere)

#### Scenario: A file is chosen in a tool that works on pages

- **WHEN** a visitor chooses a 12-page file in a tool that works on pages
- **THEN** twelve items are listed, "Page 1" to "Page 12", each with a thumbnail of its own page or blank paper until it is drawn

#### Scenario: A 500-page file is chosen

- **WHEN** a visitor chooses a 500-page file in a tool that works on pages
- **THEN** only pages on screen or near it are drawn, the rest as the visitor scrolls, and no task on the page runs longer than 100 ms

#### Scenario: A screen reader user reads the pages

- **WHEN** a screen reader user moves through the list of pages
- **THEN** each item is read by its page number, and nothing is read for its thumbnail

#### Scenario: A keyboard user moves through the pages

- **WHEN** a visitor presses Tab through a list of pages with no controls of the tool's own
- **THEN** focus passes over the list without stopping on any page or thumbnail

### Requirement: Several results come as one zip

When a job gives more than one file, the files SHALL be joined into one zip off the page's own thread, and the result block SHALL show the zip's name, its true size and how many files it holds, with one Download button. Nothing SHALL download until the visitor presses it. (SPEC.md: Details that apply everywhere; Tool page anatomy, 6)

#### Scenario: A job gives four files

- **WHEN** a job on `report.pdf` gives four files
- **THEN** the result block shows `report-split.zip`, its size, and "4 files", and Download saves that one zip

#### Scenario: A job gives one file

- **WHEN** a job gives one file
- **THEN** that file is handed back as it is, with no zip

#### Scenario: Nothing is uploaded

- **WHEN** a job gives several files and the no-upload test watches every request
- **THEN** the only new request is for the site's own zip script, and no request carries file contents, a file name or a password

## MODIFIED Requirements

### Requirement: Output names

Output names SHALL be built from the input name, so that `report.pdf` becomes `report-merged.pdf`. Several outputs SHALL download as one zip, named from the input with the tool's suffix, holding files numbered from the input name. (SPEC.md: Details that apply everywhere)

#### Scenario: One output

- **WHEN** `report.pdf` is rotated
- **THEN** the result is named from `report` with a suffix for the job

#### Scenario: Several outputs

- **WHEN** a split produces five files
- **THEN** Download gives one zip holding the five files

#### Scenario: The files inside a zip

- **WHEN** a split of `report.pdf` produces three files
- **THEN** the zip is `report-split.zip` and holds `report-part-1.pdf`, `report-part-2.pdf` and `report-part-3.pdf`, in order
