# tool-page

## MODIFIED Requirements

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
- **THEN** the zip is `report.zip` and holds `report-page-01.jpg` to `report-page-12.jpg`, in order; a one-page file gives `report.jpg`

#### Scenario: A name with characters some systems refuse

- **WHEN** the input is named `a:b*c?.pdf` or `../x.pdf`
- **THEN** the result and every file inside a zip are named without `:`, `*`, `?`, `"`, `<`, `>`, `|`, slashes or a leading dot
