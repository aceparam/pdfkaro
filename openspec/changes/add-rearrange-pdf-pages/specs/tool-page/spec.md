## ADDED Requirements

### Requirement: Pages that a tool lets move

When a tool lets the pages of one file move, each page SHALL have "Up" and "Down" buttons named "Move page N up" and "Move page N down", no Remove, and mouse drag. The file's first "Up" and last "Down" SHALL be unavailable but focusable. A move SHALL be announced with the new place in the whole file, focus SHALL stay on a usable move button, and a page moved past those shown SHALL bring the next batch into view. (SPEC.md: Details that apply everywhere, reordering; Tool page anatomy, 4)

#### Scenario: A page is moved with the keyboard

- **WHEN** a keyboard user presses "Move page 3 up" in a 12-page file
- **THEN** page 3 takes place 2, the status region says "Page 3 moved to place 2 of 12.", and focus stays on "Move page 3 up"

#### Scenario: A page at the end of a batch

- **WHEN** a 900-page file shows its first 500 pages
- **THEN** the "Down" of the page at place 500 can be used, and pressing it shows the next batch with the page at place 501

#### Scenario: A file list keeps its own moves

- **WHEN** a tool lists files, as Merge PDF does
- **THEN** each file still has "Move up", "Move down" and "Remove", as before
