# tool-engines

## ADDED Requirements

### Requirement: Drawing on the pages of a PDF

A tool that draws on the pages of a PDF (Add page numbers, then Watermark and Sign PDF) SHALL draw one layer page per page with `@cantoo/pdf-lib`, sized to that page as it is shown, and have qpdf place each layer page on its page. The drawing SHALL be upright as the page is shown, inside the part a reader shows, above the page's own content, which nothing drawn can move. All else in the file SHALL stay. (SPEC.md: Architecture and tech stack; Definition of done)

#### Scenario: A turned page

- **WHEN** a page turned a quarter, half or three quarters by its `/Rotate` is drawn on at the bottom centre
- **THEN** the drawing is upright at the bottom centre of the page as a reader shows it

#### Scenario: Odd turns and boxes

- **WHEN** a page's turn is -90, 450, 45 or inherited from the page tree, its user unit is 0 or negative, its trim box or crop box has no area or lies off the part shown, or its paper box is reversed or missing
- **THEN** the drawing lands where a reader that follows PDF.js's rules shows that edge, and only the page's turn, trim box and user unit are written the way such a reader already reads them, so the page looks as it did

#### Scenario: A page with a user unit

- **WHEN** a page has a `/UserUnit` of 2
- **THEN** the drawing has the same size on screen as on a page of the same shown size without one

#### Scenario: Content that leaves its drawing state unbalanced

- **WHEN** a page's content stream changes the drawing state and never restores it
- **THEN** the drawing is still at its place, at its size and in its colour

#### Scenario: Everything else stays

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are drawn on
- **THEN** their bookmarks, links, attached files, form fields and values, tags and text are kept, and the result passes `qpdf --check`
