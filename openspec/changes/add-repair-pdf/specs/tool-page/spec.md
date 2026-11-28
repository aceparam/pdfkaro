# Spec Delta

## MODIFIED Requirements

### Requirement: Damaged file state

When a file is damaged the page SHALL say that the file is damaged and cannot be read, name it, and offer to carry on without it. While Repair PDF has no registry entry, no link to it SHALL be shown. Once Repair PDF is published, the damaged notice on every tool that accepts PDFs, other than Repair PDF itself, SHALL also link to Repair PDF. Until files can be handed over between tools in memory, as "Handover between tools" requires, the link SHALL carry nothing and the notice SHALL say that the file must be chosen again on that page; once the handover exists, the link SHALL open Repair PDF with the file already loaded. The link SHALL be a plain link to the page's address, with nothing of the file in it. (SPEC.md: States every tool handles, Damaged file; Rules for the code, 5; Build phases, 3; openspec: tool-registry, related tools link only to published tools; CLAUDE.md: owner question 1 of `add-repair-pdf`, default A)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a PDF that the tool cannot read
- **THEN** the page says "appendix.pdf is damaged and cannot be read.", names it, and offers to carry on without it

#### Scenario: Repair PDF is not published

- **WHEN** a file is damaged and Repair PDF has no registry entry
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF is published

- **WHEN** a file is damaged on Merge PDF and Repair PDF has a registry entry
- **THEN** the notice also says "Repair PDF may be able to recover it. On that page, choose the file again." with a link "Go to Repair PDF" to `/repair-pdf` under the site's base path, whose address holds nothing of the file, and following it opens Repair PDF in the same tab with no file listed

#### Scenario: Once files can be handed over

- **WHEN** files can be handed over between tools in memory and a file is damaged on Merge PDF
- **THEN** the link opens Repair PDF with that file already loaded, and the sentence about choosing the file again is no longer shown

#### Scenario: Keyboard and screen reader

- **WHEN** focus moves to the damaged notice's heading and a keyboard user presses Tab
- **THEN** the link "Go to Repair PDF" is reached before the button to carry on without the file, both with a visible focus outline, and a screen reader reads the heading, the advice and the sentence about Repair PDF in that order

#### Scenario: A tool that does not take PDFs

- **WHEN** a picture is damaged on Image to PDF
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF's own page

- **WHEN** a file is too damaged for Repair PDF itself
- **THEN** its damaged notice shows no link to Repair PDF

#### Scenario: Nothing of the file is stored for the link

- **WHEN** a visitor follows the link from a damaged notice
- **THEN** cookies, local storage, session storage, IndexedDB, `window.name` and the address hold no part of the file or its name, on the page left and on Repair PDF
