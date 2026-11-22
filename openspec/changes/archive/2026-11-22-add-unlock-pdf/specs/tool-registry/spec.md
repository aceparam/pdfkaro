# Spec Delta

## ADDED Requirements

### Requirement: Unlock PDF is named "Remove a password"

The catalogue's Unlock PDF SHALL be the registry entry `unlock-pdf`, at `/unlock-pdf`, in the "Protect" group, run in the browser, phase 1, as the catalogue gives it, and SHALL take the name "Remove a password" in place of the catalogue's name, by the owner's decision of 22 Nov 2026, because "unlock" is a banned word. No page SHALL show "unlock". (CLAUDE.md: Owner decisions; SPEC.md: Tool catalogue; Banned patterns)

#### Scenario: The home page lists it

- **WHEN** the home page is built
- **THEN** "Remove a password" is listed second under "Protect", linking to `/unlock-pdf`

#### Scenario: The entry is checked against the catalogue

- **WHEN** the registry test checks catalogue order and each entry's slug, group, runs-in value and phase
- **THEN** `unlock-pdf` counts at the catalogue place of Unlock PDF, after Protect with a password, and its name is "Remove a password"
