## ADDED Requirements

### Requirement: Files of very many pages are warned about

A tool that works on pages SHALL show a notice when its file has more than 20,000 pages: "This file has more than 20,000 pages. The job may take a long time." The job SHALL still be allowed to run, with progress and Cancel. (SPEC.md: What we are building, rule 4, "Honest about limits"; the owner's decision of 13 Nov 2026)

#### Scenario: A file of 120,000 pages

- **WHEN** a file of 120,000 pages is listed in a tool that works on pages
- **THEN** the notice is shown, and the main button can still be used

#### Scenario: A file of 500 pages

- **WHEN** a file of 500 pages is listed
- **THEN** no such notice is shown
