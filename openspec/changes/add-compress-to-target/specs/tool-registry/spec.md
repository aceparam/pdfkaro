## ADDED Requirements

### Requirement: Compress to a target size is one tool with five pages

Compress to a target size SHALL be one registry entry, `compress-to-target`, in the "Make smaller and fix" group, with five pages, `/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb` and `-2mb`, each setting its target through its preset, as `SPEC.md`'s "one tool with preset pages" asks. The owner may undo the choice of one entry. (SPEC.md: Tool catalogue; Scope notes for specific tools)

#### Scenario: The home page lists the pages

- **WHEN** the home page is built
- **THEN** "Compress PDF to 100 KB", "Compress PDF to 200 KB", "Compress PDF to 500 KB", "Compress PDF to 1 MB" and "Compress PDF to 2 MB" are listed under "Make smaller and fix", after Compress PDF, each linking to its own page

#### Scenario: The catalogue order is checked

- **WHEN** the registry test checks catalogue order
- **THEN** the test reads the first address of every catalogue row, including the row that lists several, and `compress-to-target` counts after Compress PDF and before PDF to JPG

#### Scenario: Each page links to the other targets

- **WHEN** `/compress-pdf-to-200kb` is built
- **THEN** its related links are the 500 KB and 1 MB pages, Compress PDF, Delete pages and Split PDF, and never itself

### Requirement: Size-target presets are checked

A tool whose widget words declare a size target SHALL have, on every page, a preset whose `target` names one of the targets in `src/widget/option-values.ts`, with that target's label in the page's heading, sentence, title and main button; no other tool's page SHALL set `target`. (SPEC.md: Rules for the code, 1)

#### Scenario: A page without a valid target

- **WHEN** a test entry with a size target has a page whose preset has no target, or `'300kb'`
- **THEN** the registry test fails and names the page

#### Scenario: A heading without its label

- **WHEN** a test entry's 500 KB page has the heading "Compress a PDF"
- **THEN** the registry test fails and names the page
