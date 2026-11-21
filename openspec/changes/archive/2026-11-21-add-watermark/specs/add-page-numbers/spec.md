# add-page-numbers

## MODIFIED Requirements

### Requirement: The file is read, then listed with its option

While the engine loads, the file's row SHALL show "Getting ready". Once read, the row SHALL show a thumbnail of the first page, the name, the page count and the size, with no Remove ("Choose another file" replaces it) and no summary line above it; "Where the numbers go" SHALL follow it, then the main button. (SPEC.md: Tool page anatomy, 4; States every tool handles, Engine loading)

#### Scenario: A file is being read

- **WHEN** `report.pdf` has been chosen and the engine has not finished loading
- **THEN** its row shows "Getting ready", and the option is not shown yet

#### Scenario: A file has been read

- **WHEN** `report.pdf`, 12 pages and 1.4 MB, has been read
- **THEN** its row shows its first page, "12 pages, 1.4 MB", with no Remove, then "Where the numbers go" with "Bottom centre" chosen and focused, then "Add numbers and download", and the status region says "report.pdf, 12 pages, 1.4 MB."
