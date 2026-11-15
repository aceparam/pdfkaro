# tool-registry

## ADDED Requirements

### Requirement: Images to PDF is one tool with three pages

Image to PDF, JPG to PDF and PNG to PDF SHALL be one registry entry, `images-to-pdf`, in the "Convert to PDF" group, with three pages: `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf`, by the owner's decision of 13 Nov 2026. `/image2pdf` SHALL NOT be published. (CLAUDE.md: Owner decisions; SPEC.md: Tool catalogue)

#### Scenario: The home page lists the pages

- **WHEN** the home page is built
- **THEN** "JPG to PDF", "PNG to PDF" and "Images to PDF" are listed under "Convert to PDF", each linking to its own page

#### Scenario: The catalogue test runs

- **WHEN** the catalogue test compares `catalogue.ts` with `SPEC.md`
- **THEN** it passes with `image-to-pdf` added and `image2pdf` dropped, and fails on any other difference, until the next export of `SPEC.md` carries both

#### Scenario: The catalogue order is checked

- **WHEN** the registry test checks that tools are declared in catalogue order
- **THEN** `images-to-pdf` counts at the catalogue place of Image to PDF, after Rotate PDF

## REMOVED Requirements

### Requirement: Image to PDF waits for the owner

**Reason**: The owner answered on 13 Nov 2026: one tool with three pages, `/image2pdf` dropped.

**Migration**: Replaced by "Images to PDF is one tool with three pages".
