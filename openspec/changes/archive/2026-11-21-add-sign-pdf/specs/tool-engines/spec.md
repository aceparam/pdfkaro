# tool-engines

## ADDED Requirements

### Requirement: Drawing on some pages only

A tool that draws on pages MAY tell the drawing step which pages to draw on. A page not chosen SHALL be left exactly as it was: no layer, no change to its dictionary, resources or content. A tool that does not say which pages to draw on SHALL have every page drawn on, as before. A tool that says but chooses no page SHALL be refused before anything is written. (SPEC.md: Definition of done, "Leaves alone what it was not asked to change"; Architecture and tech stack)

#### Scenario: Only the last page

- **WHEN** a three-page file is drawn on with only its last page chosen
- **THEN** the last page carries the drawing, the first two pages' objects are as they were in the plain copy, and the result passes `qpdf --check`

#### Scenario: Tools that draw on every page

- **WHEN** Add page numbers or Watermark runs
- **THEN** every page is drawn on, and their tests pass unchanged

#### Scenario: No page chosen

- **WHEN** a tool tells the drawing step which pages to draw on and chooses none
- **THEN** the job fails as the engine's failure before any layer is drawn or anything is written, and the plain copy is never handed back as if drawn on

#### Scenario: A long file with one page chosen

- **WHEN** the 120,000-page test file is drawn on with only its first page chosen
- **THEN** one layer is drawn, progress counts one page, and the new file is no more than a few kilobytes larger than the plain copy written with object streams

### Requirement: What every page shares, counted once

A tool MAY tell the drawing step the encoded size of what every run makes and the new file holds once (`sharedBytes`, such as Sign PDF's picture). It SHALL be counted once against the size budget, before anything is drawn. When the chosen pages alone fit the budget and the shared bytes would pass it, the job SHALL stop with the size-limit failure marked `'shared'`; when the chosen pages alone pass it, with the plain size-limit failure. (SPEC.md: Definition of done)

#### Scenario: Shared bytes that fit

- **WHEN** a 12 MB stream shared by every run is drawn on a small file
- **THEN** the new file holds it once and is inside the budget

#### Scenario: Shared bytes that pass the budget

- **WHEN** the shared bytes are as large as the budget itself and the chosen pages alone fit
- **THEN** the job stops with the size-limit failure marked `'shared'` before any run is prepared or drawn

#### Scenario: Pages that pass the budget on their own

- **WHEN** the chosen pages alone pass the budget, whatever the shared bytes
- **THEN** the job stops with the plain size-limit failure, not marked `'shared'`, so a tool never blames what is shared
