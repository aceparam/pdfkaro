## ADDED Requirements

### Requirement: Very long lists of pages are shown in batches

A list of pages SHALL show at most 500 pages at first, then a button naming the next pages in real units, "Show pages 501 to 1,000", which shows up to 500 more each time. There SHALL be no limit on the number of pages a file may have. After a press, focus SHALL move to the first new page and the page SHALL announce how many pages are shown. (SPEC.md: Details that apply everywhere, "A 500-page file must not freeze the page"; Privacy, limits and security, "There is no fixed size limit")

#### Scenario: A 500-page file

- **WHEN** a file of 500 pages is listed
- **THEN** all 500 pages are shown and there is no button to show more

#### Scenario: A file with very many pages

- **WHEN** a file of 120,000 pages is listed
- **THEN** pages 1 to 500 are shown, followed by "Show pages 501 to 1,000", the page never blocks for more than 100 ms, and every page can still be reached

#### Scenario: More pages are shown with the keyboard

- **WHEN** a keyboard user presses "Show pages 501 to 1,000"
- **THEN** pages 501 to 1,000 appear, focus moves to page 501's first control, which sits where the button was, and "Showing 1,000 of 120,000 pages" is announced

#### Scenario: The last batch is short

- **WHEN** a 1,200-page file shows 1,000 pages
- **THEN** the button reads "Show pages 1,001 to 1,200"
