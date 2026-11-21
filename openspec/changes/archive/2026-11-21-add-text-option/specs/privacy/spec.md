# privacy

## ADDED Requirements

### Requirement: Typed text stays in the browser

Text a visitor types into a tool's field SHALL go only to the tool worker, with the job. It MUST NOT be written to browser storage, the page address, the title or the console, be sent with a form, be kept by the browser's form memory, or be offered to an online spell checker. The status line MAY name up to three refused characters, never the text. A tool that takes a text SHALL treat it as a secret in its no-upload test. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The field's markup

- **WHEN** the field of a test entry's text is drawn
- **THEN** it has no name, sits in no form, and has `autocomplete="off"` and `spellcheck="false"`

#### Scenario: A tool with a text is tested

- **WHEN** the no-upload test of a tool that takes a text types a marked text and runs the job
- **THEN** the text, and each word of it, is in no request, header, address, title, console message or browser storage
