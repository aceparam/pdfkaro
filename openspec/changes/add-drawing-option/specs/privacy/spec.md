# privacy

## ADDED Requirements

### Requirement: Drawings stay in the browser

What a visitor draws SHALL go only to the tool worker, with the job, as numbers. It MUST NOT be written to browser storage, the page address, the title or the console, and the page MUST NOT turn it into a picture or a data address. A tool that takes a drawing SHALL check in its no-upload test that no request carries anything once something is drawn. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The pad's code

- **WHEN** the pad's source is checked by a unit test
- **THEN** it never makes a picture or a data address of the canvas and never writes to storage

#### Scenario: A tool with a drawing is tested

- **WHEN** the no-upload test of a tool that takes a drawing draws in the box and runs the job
- **THEN** no request has a body or goes to another origin, and storage, the title and the address hold nothing new
