## ADDED Requirements

### Requirement: Very long lists of pages are shown in batches

A list of pages SHALL show at most 500 pages at first, then a "Show the next 500 pages" button after them, which shows 500 more each time it is pressed. There SHALL be no limit on the number of pages a file may have. Pressing the button SHALL keep focus in place and announce how many pages are shown. (SPEC.md: Details that apply everywhere, "A 500-page file must not freeze the page"; Privacy, limits and security, "There is no fixed size limit")

#### Scenario: A 500-page file

- **WHEN** a file of 500 pages is listed
- **THEN** all 500 pages are shown and there is no "Show the next 500 pages" button

#### Scenario: A file with very many pages

- **WHEN** a file of 120,000 pages is listed
- **THEN** pages 1 to 500 are shown, followed by "Show the next 500 pages", the page never blocks for more than 100 ms, and the tool can still run on the whole file

#### Scenario: More pages are shown with the keyboard

- **WHEN** a keyboard user presses "Show the next 500 pages"
- **THEN** pages 501 to 1,000 appear, focus stays on the button, which now sits after page 1,000, and "Showing 1,000 of 120,000 pages" is announced
