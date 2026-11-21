# tool-registry

## ADDED Requirements

### Requirement: Pictures are declared in the registry

A picture SHALL be declared in its tool's registry entry by its words only: a key, a label, the button's words, a hint, the words for what it takes and its sentences. Each tool's types, most bytes and most pixels SHALL be written once, in the plain module the page and its engine read. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test checks a picture

- **WHEN** the registry test checks a tool with a picture
- **THEN** it fails unless the words are plain and not empty, the module has a line for that tool and key with JPG, PNG or both as types and most bytes and pixels within their bounds, every picture line in the module belongs to a picture the registry shows, a hint that names a size names that most bytes, and the tool's engine can read a picture before the job

#### Scenario: The engine is sent something that is not an accepted picture

- **WHEN** an engine is sent, for a picture, something that is not bytes, bytes over the most size, a picture of another type, damaged, saved in a way it cannot read, or over the most pixels
- **THEN** it refuses before it reads the PDF with the refused-picture error, and writes nothing
