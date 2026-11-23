# quality-gates Specification

## Purpose

When a tool, the site and a phase count as done: the shared test set, the checks each tool must pass on it, the site-wide checks and the gate at the end of each phase. Derived from "Definition of done" and "Build phases" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: The shared test set

`tests/fixtures/` SHALL hold one PDF of each kind listed under "The test set" in `SPEC.md`, except the file over 100 MB, which a script generates and which MUST NOT be committed to the repo. Every tool SHALL be run against all of them. (SPEC.md: The test set)

#### Scenario: The fixtures are listed

- **WHEN** `tests/fixtures/` is listed
- **THEN** it holds an ordinary text document of a few pages, a 500-page document, a scanned document with no text layer, a password-protected file, a file with print and edit restrictions, a damaged file with a broken cross-reference table, a fillable form, a file with text in Hindi, Telugu, Arabic and Chinese, a file with mixed page sizes and mixed rotation, and a file with bookmarks, links and attachments

#### Scenario: The large file is needed

- **WHEN** a test needs the file over 100 MB
- **THEN** a script generates it, and the file is not in the repo

### Requirement: Every tool runs against every fixture

Each tool SHALL produce a correct result for every file in the test set, or a clear message saying why it cannot. (SPEC.md: Each tool)

#### Scenario: A tool meets a file it cannot handle

- **WHEN** a tool is given the damaged fixture and cannot read it
- **THEN** it shows the damaged file state and does not crash or hand back a broken file

### Requirement: Output is valid

A tool's PDF output SHALL pass `qpdf --check` and SHALL open without warnings in Chrome, Firefox, Adobe Reader and macOS Preview. (SPEC.md: Each tool)

#### Scenario: Output is checked by qpdf

- **WHEN** a tool's output for each fixture is run through `qpdf --check`
- **THEN** the check passes for each

#### Scenario: Output is opened in the four viewers

- **WHEN** a tool is called done
- **THEN** its output has been opened by hand in Chrome, Firefox, Adobe Reader and macOS Preview, and the result is recorded in the pull request

### Requirement: Untouched content stays intact

A tool SHALL leave alone what it was not asked to change: links, bookmarks, form fields and text. (SPEC.md: Each tool)

#### Scenario: A file with bookmarks is rotated

- **WHEN** the fixture with bookmarks, links and attachments is rotated
- **THEN** the bookmarks and links in the result still work

#### Scenario: A form and a text file are processed

- **WHEN** a tool that does not touch forms or text processes the fillable form and the text fixtures
- **THEN** the form fields still work and the text is unchanged

### Requirement: The page stays responsive

A tool MUST NOT block the page for more than 100 ms. Progress SHALL be visible and Cancel SHALL work. (SPEC.md: Each tool)

#### Scenario: The 500-page fixture is processed

- **WHEN** a tool processes the 500-page fixture
- **THEN** progress updates are shown, Cancel stops the job, and no task on the page runs longer than 100 ms

### Requirement: Browser support

A tool SHALL work in current Chrome, Firefox, Safari and Edge, and on Android Chrome and iOS Safari. (SPEC.md: Each tool)

#### Scenario: End-to-end tests run

- **WHEN** a tool's end-to-end test runs
- **THEN** it passes in each browser engine the test setup covers, at desktop and phone sizes, and any listed browser not covered is checked by hand and recorded

### Requirement: Keyboard and screen reader use

A tool SHALL be usable with a keyboard alone and with a screen reader, and its text SHALL meet the contrast rule of the `look-and-feel` capability. (SPEC.md: Each tool)

#### Scenario: A job is done with the keyboard only

- **WHEN** a visitor uses only the keyboard
- **THEN** they can choose a file, set options, run the job and download the result, with focus always visible

#### Scenario: A job is done with a screen reader

- **WHEN** a visitor uses a screen reader
- **THEN** every control has a name, and progress, errors and the result are announced

### Requirement: Tests exist and pass

A tool SHALL have unit tests for its engine in Vitest and one end-to-end test in Playwright, and a browser tool SHALL pass the no-upload test. Work MUST NOT be marked finished with failing or skipped tests. (SPEC.md: Architecture and tech stack; Each tool; CLAUDE.md: Rules)

#### Scenario: A test is skipped

- **WHEN** a change skips or disables a test to make the suite pass
- **THEN** the change is not done

### Requirement: Page text is reviewed by the owner

A tool SHALL have page text reviewed by the owner, with nothing from the banned patterns list. (SPEC.md: Each tool)

#### Scenario: Draft text awaits review

- **WHEN** a tool's code is finished and its page text is still marked for the owner
- **THEN** the tool is reported as waiting on the owner, not as done

### Requirement: Site checks

The site SHALL meet these checks: the speed and Lighthouse targets of the `seo` capability on the home page and three tool pages; a unique title and description on every page, with every page in the sitemap except the 404 page and pages still showing an owner placeholder; the plain 404 page of the `look-and-feel` capability; and a full pass over every page at 360px and 1280px that finds nothing from the banned patterns list. (SPEC.md: The site)

#### Scenario: The site is checked before launch

- **WHEN** phase 1 is ready to launch
- **THEN** each site check has been run and its result recorded

#### Scenario: Titles, descriptions and the sitemap on every build

- **WHEN** the site is built in CI
- **THEN** the search check of the `seo` capability confirms the unique titles and descriptions and the sitemap's pages, so this part of the site check is never left to launch day

#### Scenario: The sitemap item rests on an open owner question

- **WHEN** the site checks are reported while owner question 2 of `add-search-basics` (placeholders out of the sitemap) is open
- **THEN** the "Definition of done, The site" item "the sitemap lists every page" is reported as not passed, because the rule that leaves placeholders out is the agent's default, not the owner's

### Requirement: Continuous checks

CI SHALL run lint, type check, unit tests and end-to-end tests on every pull request. A preview of the site SHALL be published from the main branch and from the branches the owner allows, and only after the same checks pass on that push. There is one preview; it shows the latest such push. (SPEC.md: Build phases, phase 0; one shared preview on GitHub Pages by the owner's choice of 10 Nov 2026, recorded in CLAUDE.md)

#### Scenario: A pull request is opened

- **WHEN** a pull request is opened or updated
- **THEN** lint, type check, unit tests and end-to-end tests run and must pass

#### Scenario: A branch the owner allows is pushed

- **WHEN** a push is made to the main branch or to a branch the owner has allowed to deploy
- **THEN** the checks run, and if they pass the preview is replaced with a build of that push

#### Scenario: The checks fail on a push

- **WHEN** a check fails on a push to a branch that can deploy
- **THEN** nothing is published and the preview keeps showing the last good build

#### Scenario: A pull request comes from a fork

- **WHEN** a pull request is opened from a fork
- **THEN** the checks run and nothing is published

### Requirement: Pull request contents

Each pull request SHALL cover one tool, with its engine, tests, page text and registry entry together, and SHALL include screenshots of each changed page at 360px and 1280px wide. (SPEC.md: Build phases, How agents work)

#### Scenario: A page is changed

- **WHEN** a pull request changes a page
- **THEN** its description holds screenshots of that page at 360px and 1280px

### Requirement: Phase gates

No phase SHALL start until the one before it passes its gate. Phase 0 passes when Merge PDF works end to end on a phone and the page passes the look-and-feel test. Phase 1 passes when every phase 1 tool passes the Definition of done and the owner has written the About page. Phase 2 passes when server limits and deletion are tested and the Privacy page matches the code. (SPEC.md: Build phases)

#### Scenario: A gate is passed

- **WHEN** a phase gate is passed
- **THEN** "Where the project stands" in `CLAUDE.md` is updated before work on the next phase begins

### Requirement: Owner decisions are not guessed

Anything listed under "Open decisions" in `SPEC.md` SHALL be treated as the owner's choice. Agents SHALL use the assumed default from that table and MUST ask before going beyond it. (SPEC.md: Build phases, How agents work, 5; Open decisions)

#### Scenario: Work touches an open decision

- **WHEN** a change needs more than the assumed default for an open decision
- **THEN** work on that part stops and the owner is asked

#### Scenario: The defaults are looked up

- **WHEN** an agent needs the assumed default
- **THEN** it uses the one in the "Open decisions" table of `SPEC.md`, except that Ghostscript and a `LICENSE` file still wait for the owner to confirm the licence

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
