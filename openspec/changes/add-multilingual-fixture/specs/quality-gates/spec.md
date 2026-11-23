# Spec Delta: quality-gates

## ADDED Requirements

### Requirement: The multilingual test file

The test set's file with text in Hindi, Telugu, Arabic and Chinese SHALL hold real sentences in each script, shaped as a reader shows them, in fonts embedded in the file with mappings back to Unicode, so the text draws and can be selected in any reader. It SHALL have one page per script and one page with all four. A committed script SHALL make it; the fonts SHALL NOT be committed or shipped. (SPEC.md: The test set)

#### Scenario: Every font is embedded

- **WHEN** the fonts of every page of `multilingual.pdf` are listed
- **THEN** each is an embedded subset with a mapping to Unicode, and no page uses a font that is not embedded

#### Scenario: The text can be read back

- **WHEN** PDF.js reads the text of the Chinese page, and the Hindi, Telugu and Arabic pages are looked at
- **THEN** the Chinese sentences come back exactly as written, and each Hindi, Telugu and Arabic page carries actual-text spans for its shaped words, which readers such as Chrome and Adobe Reader use when text is copied

#### Scenario: The file is made again

- **WHEN** the script makes the file again
- **THEN** it fetches each font package at a pinned version from the public npm registry without running any package script, refuses one whose checksum differs before unpacking it, lets the printed page load only font files from its own temporary folder, and writes fixed dates and a fixed file identifier, so the file depends only on the pinned fonts and the browser version the fixtures README names

#### Scenario: Nothing of the build machine is left in the file

- **WHEN** the script has made the file
- **THEN** it refuses to write it if the uncompressed file holds a `file:` address, the temporary folder's path or the home folder's path, or if its document information holds anything but its title, creator, producer and two dates

### Requirement: Tools keep the multilingual text

Each tool that gives back a PDF SHALL keep the text of every page it keeps when run on the multilingual file, as PDF.js reads it before and after; a protected result SHALL read the same with its password. A tool that gives no new file SHALL say why. (SPEC.md: Each tool, "Leaves alone what it was not asked to change")

#### Scenario: A page tool

- **WHEN** Merge, Split, Extract pages, Delete pages, Reorder pages or Rotate PDF runs on `multilingual.pdf`
- **THEN** each kept page reads the same text as it did in the input, in its new place

#### Scenario: A tool that draws on the pages

- **WHEN** Add page numbers, Watermark or Sign PDF runs on `multilingual.pdf`
- **THEN** each page still reads its own text, in order, with only the tool's own text added

#### Scenario: A password is added and taken off

- **WHEN** Protect with a password runs on `multilingual.pdf`, and Remove a password then runs on its result with the same password
- **THEN** the protected file reads the same text with the password, and the unprotected file reads the same text with none

#### Scenario: The page content is unchanged

- **WHEN** any tool that gives back a PDF runs on `multilingual.pdf`
- **THEN** each kept page's own decoded content streams are byte for byte those of the input page, in their place: alone for the page tools and Remove a password, between the added save and restore for the tools that draw on pages, read with the password for Protect, and for Compress when it gives a file

#### Scenario: Nothing to change

- **WHEN** Compress PDF or Remove a password cannot change `multilingual.pdf`
- **THEN** the job gives no new file and the page says why, as for any file it cannot change

### Requirement: The drawing tools draw the multilingual text

PDF to JPG, PDF to PNG and page thumbnails SHALL draw the text of every page of the multilingual file, as its fonts are embedded and need no character map. (SPEC.md: Each tool; owner decision on PDF.js helper data, 11 Nov 2026)

#### Scenario: Pictures of the pages

- **WHEN** PDF to JPG or PDF to PNG runs on `multilingual.pdf`
- **THEN** it gives five pictures, each holds at least the amount of ink measured for its page and written in the test, and on the mixed page each script's line shows ink in its own band, found from where PDF.js places that line

#### Scenario: Thumbnails

- **WHEN** a page tool draws the thumbnails of `multilingual.pdf`
- **THEN** each thumbnail holds at least the amount of ink measured for its page and written in the test

### Requirement: A Chinese file whose font is not embedded

The test set SHALL also hold a file with Chinese text in a font that is not embedded, reached through a named character map. Tools SHALL keep its text as they keep any text. Drawing it SHALL NOT fail and SHALL NOT make a request for the character map; the fixtures README SHALL record whether the Chinese is drawn, as the known gap of the owner's decision of 11 Nov 2026 on PDF.js helper data. (SPEC.md: The test set; CLAUDE.md: Owner decisions)

#### Scenario: Tools keep its text

- **WHEN** a page tool, Protect with a password or a tool that draws on the pages runs on `chinese-unembedded.pdf`
- **THEN** the page's text-drawing instructions and its font reference are kept unchanged in the result

#### Scenario: Drawn without failing

- **WHEN** PDF to JPG or a thumbnail draws `chinese-unembedded.pdf`
- **THEN** it gives a picture without failing, and the fixtures README records whether the Chinese is drawn, as the known gap, until the owner answers the character-map question

#### Scenario: The character map is asked for in memory only

- **WHEN** PDF.js draws `chinese-unembedded.pdf` and `multilingual.pdf` in a unit test whose PDF.js records every call to its data factory
- **THEN** the unembedded file asks the factory for the `cMapUrl` kind with the name `UniGB-UCS2-H`, which is refused, and `multilingual.pdf` asks for no character map

#### Scenario: No request for a character map

- **WHEN** a visitor picks `chinese-unembedded.pdf` or `multilingual.pdf` on `/pdf-to-jpg` and runs the job, which must reach the done heading
- **THEN** the site's own host records the same requests after the pick and after the main button as for `text.pdf`, and no request to another origin is made, as any blocked by the Content Security Policy fails the test
