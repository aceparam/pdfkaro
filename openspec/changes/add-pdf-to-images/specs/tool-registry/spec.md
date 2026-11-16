# tool-registry

## ADDED Requirements

### Requirement: PDF to JPG and PDF to PNG are one tool with two pages

PDF to JPG and PDF to PNG SHALL be one registry entry, `pdf-to-images`, in the "Convert from PDF" group, with the pages `/pdf-to-jpg` and `/pdf-to-png`, each setting its picture format through its preset. This is the agent's choice, after the owner's Image to PDF decision and `SPEC.md`'s own one tool with preset pages for target sizes; the owner may undo it. (SPEC.md: Tool catalogue; Scope notes for specific tools)

#### Scenario: The home page lists the pages

- **WHEN** the home page is built
- **THEN** "PDF to JPG" and "PDF to PNG" are listed under "Convert from PDF", each linking to its own page

#### Scenario: The catalogue order is checked

- **WHEN** the registry test checks catalogue order
- **THEN** `pdf-to-images` counts at the place of PDF to JPG, after Compress PDF
