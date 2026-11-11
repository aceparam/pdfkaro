# Spec Delta

## MODIFIED Requirements

### Requirement: Colours

In light mode the background SHALL be `#fbfaf6`, text `#1b1b1b`, secondary text `#5c5c5c` and links `#0b4fa8`. Links SHALL always be underlined. The main button SHALL have a `#1b1b1b` background, white text and 4px corners. Lines and borders SHALL be 1px solid `#d9d6cc` with a corner radius of 4px at most, except the edge of an input or a secondary button, which SHALL be 1px solid `#5c5c5c` so that the edge of the control can be seen. Dark mode colours SHALL be defined in `src/styles/site.css`. (SPEC.md: What to build; the control edge and the dark colours by the decisions of 10 Nov 2026 recorded in CLAUDE.md)

#### Scenario: Light mode styles are checked

- **WHEN** the stylesheet is reviewed
- **THEN** every light mode colour on a page is one of the listed values, and no corner radius exceeds 4px

#### Scenario: The edge of a control is checked

- **WHEN** the edge of an input or a secondary button is measured against the page background
- **THEN** the contrast is at least 3 to 1 in light and dark mode, and dividers and boxes still use the line colour

#### Scenario: Dark mode styles are checked

- **WHEN** the dark mode colours are reviewed
- **THEN** the main button is still clearly set apart from the background, and the owner is shown the palette to review
