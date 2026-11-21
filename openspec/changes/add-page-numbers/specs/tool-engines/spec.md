# tool-engines

## ADDED Requirements

### Requirement: Drawing on the pages of a PDF

A tool that draws on the pages of a PDF (Add page numbers, then Watermark and Sign PDF) SHALL draw with `@cantoo/pdf-lib`. Each drawing SHALL be upright as the page is shown, inside the part of the page a reader shows, and above the page's own content, which SHALL stay in the page's content and SHALL be unable to move the drawing. Nothing else in the file SHALL change. (SPEC.md: Architecture and tech stack; Definition of done)

#### Scenario: A turned page

- **WHEN** a page turned a quarter, half or three quarters by its `/Rotate` is drawn on at the bottom centre
- **THEN** the drawing is upright at the bottom centre of the page as a reader shows it

#### Scenario: Odd turns and boxes

- **WHEN** a page's turn is -90, 450, 45 or inherited from the page tree, its user unit is 2, 0 or negative, its crop box is smaller than its paper, has no area or lies off the paper, its trim box is smaller, or its paper box is offset, reversed or missing
- **THEN** the drawing lands where PDF.js shows that edge of the page, at the same size on screen, and the page's stored turn, boxes and user unit are not changed

#### Scenario: Content that leaves its drawing state unbalanced

- **WHEN** a page's content stream changes the drawing state with more `q` than `Q`, a scaling `cm` and a fill colour
- **THEN** the drawing is still at its place, at its size and in its colour

#### Scenario: Tagged and shared content

- **WHEN** pages whose content is tied to accessibility tags, or that share one content stream, are drawn on
- **THEN** each page's own content streams are still its content, unchanged and still shared, and every piece of marked content the tag tree names for a page is still in that page's content

#### Scenario: Everything else stays

- **WHEN** `rich.pdf`, `form.pdf` and `tagged.pdf` are drawn on
- **THEN** their bookmarks, links, attached files, form fields and values, tags and text are kept, and the result passes `qpdf --check`
