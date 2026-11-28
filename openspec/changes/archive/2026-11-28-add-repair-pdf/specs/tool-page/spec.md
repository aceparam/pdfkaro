# Spec Delta

## MODIFIED Requirements

### Requirement: Damaged file state

When a file is damaged the page SHALL say so, name it, and offer to carry on without it. Once Repair PDF is published, the notice on every tool that takes PDFs, Repair aside, SHALL also link to it after that button, saying the file must be chosen again there until files can be handed over in memory, then opening it with the file loaded. The link SHALL be a plain address from the registry with nothing of the file in it. (SPEC.md: States every tool handles; Rules for the code, 5; CLAUDE.md: Owner decisions, 28 Nov 2026)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a PDF that the tool cannot read
- **THEN** the page says "appendix.pdf is damaged and cannot be read.", names it, and offers to carry on without it

#### Scenario: Repair PDF is not published

- **WHEN** a file is damaged and Repair PDF has no registry entry
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF is published

- **WHEN** a file is damaged on Merge PDF and Repair PDF has a registry entry
- **THEN** after the "Leave this file out" button the notice says, on its own line, "Repair PDF may be able to recover it. On that page, choose the file again." with a link "Go to Repair PDF", at least 44px tall, to Repair's address under the site's base path, holding nothing of the file; following it opens Repair PDF in the same tab with no file listed and no leave-page prompt

#### Scenario: The status announcement

- **WHEN** the damaged notice with the link is shown
- **THEN** the status region announces the heading, the advice and the Repair sentence

#### Scenario: Once files can be handed over

- **WHEN** files can be handed over between tools in memory and a file is damaged on Merge PDF
- **THEN** the link opens Repair PDF with that file already loaded, and the sentence about choosing the file again is no longer shown

#### Scenario: Keyboard and screen reader

- **WHEN** focus moves to the damaged notice's heading and a keyboard user presses Tab
- **THEN** the button to carry on without the file is reached first and the link "Go to Repair PDF" next, both with a visible focus outline, and a screen reader reads the heading, the advice and the sentence about Repair PDF in that order

#### Scenario: A tool that does not take PDFs

- **WHEN** a picture is damaged on Image to PDF
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF's own page

- **WHEN** a file is too damaged for Repair PDF itself
- **THEN** its damaged notice shows no link to Repair PDF

#### Scenario: Nothing of the file goes with the link

- **WHEN** a visitor picks a damaged file with a marked name on Merge PDF, then follows the link, then goes Back
- **THEN** no request for the Repair page is made before the click; the request is a plain `GET` with no query or fragment and no marked string in any header; cookies, storage, `window.name`, the address and `history.state` (null) hold nothing of the file on either page; and after Back the name and the file are gone
