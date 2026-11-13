## MODIFIED Requirements

### Requirement: Document details and accessibility tags come over whole

The new file SHALL keep the document's details, accessibility tags, named destinations and reading threads whole, with the form fields (and their values) and annotations the tags point to; the page SHALL say these can carry text and fields from pages that were not taken. Other content of those pages SHALL be gone. (SPEC.md: Privacy, limits and security; the owner's decision of 13 Nov 2026)

#### Scenario: A tagged file

- **WHEN** page 1 of `tagged.pdf`, whose page 2 has a tag with alternative text, an untagged field, and a filled field, a note and a web link that the tags point to, is extracted
- **THEN** the result has one page; page 2's text and its untagged field are gone; its tag text, the tagged field with its value, the note and the link are still in the file; and the page text says such things can remain

#### Scenario: A file with bookmarks and an attachment

- **WHEN** page 2 of `rich.pdf` is extracted
- **THEN** the result keeps "Chapter two" and not "Chapter one", keeps `note.txt`, and no bookmark points nowhere
