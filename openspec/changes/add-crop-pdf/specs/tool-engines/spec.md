## ADDED Requirements

### Requirement: Finding where a page's content is

The shared drawing step SHALL also say, for one page of an open PDF, where its content is in the page's own unturned units, or that it is blank, or that it cannot be measured safely. It SHALL draw the page in the worker as a reader shows it, at a bounded number of pixels, read the pixels and add the annotation boxes a reader shows, making no request. Thumbnails and pictures of pages SHALL be drawn as before. (SPEC.md: Architecture and tech stack; Rules for the code, 2 and 3)

#### Scenario: A page is measured in Node

- **WHEN** the unit test measures a page of `text.pdf` with the Node canvas maker
- **THEN** it gets a box in the page's units that holds every line of text, with no request made

#### Scenario: A turned page with a user unit

- **WHEN** a page with `/Rotate 90`, an offset paper box and `/UserUnit 2` is measured
- **THEN** the box is in the page's own unturned units, and drawing the page clipped to that box shows all of its ink

#### Scenario: A refused character map

- **WHEN** a page needs a character map the fixed helper data does not hold
- **THEN** that page and every later page of the same open document are called unsafe to measure

#### Scenario: Pixels are bounded

- **WHEN** a poster-sized page or a page with a user unit of 1000 is measured
- **THEN** it is drawn at no more than the fixed number of pixels, and the canvas budget of the drawing step applies as for every drawing

#### Scenario: A page too thin to draw whole

- **WHEN** a page of 1 by 100,000,000 points is measured, so its drawing at the pixel cap cannot cover the whole page
- **THEN** it is called unsafe to measure

#### Scenario: A drawing that fails

- **WHEN** drawing a page throws an error other than PDF.js stopping
- **THEN** that page is called unsafe to measure, and the next page is measured

#### Scenario: Other drawings are unchanged

- **WHEN** thumbnails, PDF to JPG and PDF to PNG run after this step is added
- **THEN** their unit and end-to-end tests pass unchanged
