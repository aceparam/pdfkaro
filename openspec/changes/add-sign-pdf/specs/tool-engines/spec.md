# tool-engines

## ADDED Requirements

### Requirement: Drawing on some pages only

A tool that draws on pages MAY tell the drawing step which pages to draw on. A page not chosen SHALL be left exactly as it was: no layer, no change to its dictionary, resources or content. A tool that chooses no pages SHALL have every page drawn on, as before. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; Architecture and tech stack)

#### Scenario: Only the last page

- **WHEN** a three-page file is drawn on with only its last page chosen
- **THEN** the last page carries the drawing, the first two pages' objects are as they were in the plain copy, and the result passes `qpdf --check`

#### Scenario: Tools that draw on every page

- **WHEN** Add page numbers or Watermark runs
- **THEN** every page is drawn on, and their tests pass unchanged

#### Scenario: A long file with one page chosen

- **WHEN** the 120,000-page test file is drawn on with only its first page chosen
- **THEN** one layer is drawn, progress counts one page, and the new file is no more than a few kilobytes larger than the plain copy written with object streams
