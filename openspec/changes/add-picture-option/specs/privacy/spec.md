# privacy

## ADDED Requirements

### Requirement: A chosen picture stays in the browser

A picture chosen for an option SHALL go only to the tool worker. Its bytes MUST NOT be held in the widget's state, and neither they nor its name SHALL be sent in a request or written to browser storage, the page address, the title or the console; the page MUST NOT make an address for it. A tool that takes a picture SHALL treat its name as a secret in its no-upload test. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: A tool with a picture is tested

- **WHEN** the no-upload test of a tool that takes a picture chooses a picture with a marked name and runs the job
- **THEN** no request has a body or goes to another origin, the name is in no request, header, address, title, console message or browser storage, and no `blob:` address is made for the picture

#### Scenario: The field's code

- **WHEN** the source of `PictureField` and of the page's picking code is checked by a unit test
- **THEN** neither calls `URL.createObjectURL` or writes to storage
