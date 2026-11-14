## ADDED Requirements

### Requirement: Pages that a tool lets move

When a tool lets the pages of one file move, each page SHALL have "Earlier" and "Later" buttons, named "Move page N earlier" and "Move page N later", no Remove, and mouse drag. The file's first "Earlier" and last "Later" SHALL be unavailable but focusable. A move SHALL be announced with the new place in the whole file, and focus SHALL stay on a usable move button. (SPEC.md: Details that apply everywhere, reordering; Tool page anatomy, 4)

#### Scenario: A page is moved with the keyboard

- **WHEN** a keyboard user presses "Move page 3 earlier" in a 12-page file
- **THEN** page 3 takes place 2, the status region says "Page 3 moved to place 2 of 12.", and focus stays on "Move page 3 earlier"

#### Scenario: The buttons at phone width

- **WHEN** the pages are shown at 360px, at 1280px, or with text at 200%
- **THEN** each page's two buttons are stacked, each as wide as the page's cell and at least 2.75rem tall, and nothing overflows sideways

#### Scenario: A page at the end of a batch

- **WHEN** a 900-page file shows its first 500 pages
- **THEN** the "Later" of the page at place 500 can be used, and pressing it shows the next batch with the page at place 501 and announces "of 900"

#### Scenario: A file list keeps its own moves

- **WHEN** a tool lists files, as Merge PDF does
- **THEN** each file still has "Move up", "Move down" and "Remove", as before
