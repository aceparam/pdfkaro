# Spec Delta

## MODIFIED Requirements

### Requirement: A damaged file

When the file cannot be read the page SHALL say it is damaged and cannot be read, name it, and offer "Choose another file". It MUST NOT link to a tool that is not published; once Repair PDF is published it SHALL link to it as the shared damaged notice does. (SPEC.md: States every tool handles, Damaged file; openspec: tool-page, Damaged file state; CLAUDE.md: Owner decisions, 28 Nov 2026)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses `damaged-cut.pdf`
- **THEN** the page says "damaged-cut.pdf is damaged and cannot be read.", offers "Choose another file", and after it the shared sentence and the link "Go to Repair PDF"
