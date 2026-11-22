# tool-registry Specification

## Purpose

The single registry file that declares every tool, and everything generated from it: tool pages, navigation, the home page list, group hub pages and the sitemap. Derived from "Tool catalogue", "Architecture and tech stack" and "SEO" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: One registry declares every tool

The site SHALL declare each tool exactly once, in `src/tools/registry.ts`. Each entry MUST carry the slug or slugs it serves, a name, a page title and description for each URL, group, where it runs (browser or server), phase, accepted file types and related tools. A catalogue row with several URLs is declared once, and each URL it serves gets its own page, title and description. (SPEC.md: Rules for the code, 1; SEO, Specific-search pages)

#### Scenario: A tool is added

- **WHEN** a new entry is added to the registry and the site is built
- **THEN** the tool has a page at its slug, appears on the home page list under its group, appears on its group hub page and is listed in the sitemap, with no hand-written list of tools, slugs or titles in any page, the navigation, the home page or the sitemap

#### Scenario: A row has several URLs

- **WHEN** a tool serves several URLs, such as the compress presets
- **THEN** each URL has its own page with its own title, description and text

### Requirement: Pages are generated from the registry

The site SHALL generate one page for each URL the registry serves, from `src/pages/[slug].astro`, and SHALL generate the home page list, the navigation, the group hub pages, `sitemap.xml` and `robots.txt` from the registry at build time. (SPEC.md: Rules for the code, 1; SEO, Site-wide)

#### Scenario: The sitemap matches the registry

- **WHEN** the site is built
- **THEN** `sitemap.xml` lists every tool page, every group hub page and every published site page except the 404 page, and nothing else

### Requirement: Registry entries match the catalogue

Each registry entry SHALL use the name, URL, group, "runs in" value and phase given for that tool in the "Tool catalogue" tables of `SPEC.md`. A tool MUST NOT be added to the registry unless it is in the catalogue. (SPEC.md: Tool catalogue)

#### Scenario: An entry is checked against the catalogue

- **WHEN** a registry entry is reviewed
- **THEN** its slug, group, runs-in value and phase equal the catalogue row for that tool

#### Scenario: A tool is not in the catalogue

- **WHEN** a change proposes a tool that the catalogue does not list
- **THEN** the change is stopped and the owner is asked

### Requirement: Seven groups

The registry SHALL place every tool in exactly one of seven groups: Organise pages, Make smaller and fix, Convert to PDF, Convert from PDF, Edit and sign, Protect, Read and check. Each group SHALL have a hub page that lists its tools, at a URL that does not collide with any tool slug. (SPEC.md: Tool catalogue; SEO, Site-wide)

#### Scenario: A hub page is opened

- **WHEN** a visitor opens a group hub page
- **THEN** the page lists every published tool in that group as a text link with a one-line description

#### Scenario: A hub URL matches a tool slug

- **WHEN** a hub page URL would equal a tool slug
- **THEN** the build is not accepted until one of them is changed

### Requirement: Tool URLs are search phrases and never change

A tool URL SHALL be the search phrase for the job, lowercase with hyphens, at the site root. Once a URL is published it MUST NOT change. (SPEC.md: SEO, Every tool page)

#### Scenario: A published slug is edited

- **WHEN** a change alters the slug of a tool that has shipped
- **THEN** the change is rejected

### Requirement: Related tools are chosen in the registry

Each registry entry SHALL name four to six related tools, chosen from the catalogue. A page SHALL link only to related tools that are published. (SPEC.md: SEO, Every tool page)

#### Scenario: Few tools have shipped

- **WHEN** Merge PDF is the only published tool
- **THEN** its page links to no related tool, and no link points to a page that does not exist

#### Scenario: A related tool is not in the catalogue

- **WHEN** an entry names a related tool that the catalogue does not list
- **THEN** the change is not done until the entry names only catalogue tools

### Requirement: Tools ship in phase and catalogue order

Tools SHALL be built in catalogue order within a phase, and no tool from a phase SHALL be built before the phase before it passes its gate. Merge PDF SHALL be the first tool. (SPEC.md: Build phases)

#### Scenario: A later-phase tool is proposed early

- **WHEN** a change proposes a phase 2 tool before the phase 1 gate has passed
- **THEN** the change is blocked until the gate passes

### Requirement: Images to PDF is one tool with three pages

Image to PDF, JPG to PDF and PNG to PDF SHALL be one registry entry, `images-to-pdf`, in the "Convert to PDF" group, with three pages: `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf`, by the owner's decision of 13 Nov 2026. `/image2pdf` SHALL NOT be published. (CLAUDE.md: Owner decisions; SPEC.md: Tool catalogue)

#### Scenario: The home page lists the pages

- **WHEN** the home page is built
- **THEN** "JPG to PDF", "PNG to PDF" and "Image to PDF" are listed under "Convert to PDF", each linking to its own page

#### Scenario: The catalogue test runs

- **WHEN** the catalogue test compares `catalogue.ts` with `SPEC.md`
- **THEN** it passes with `image-to-pdf` added and `image2pdf` dropped, and fails on any other difference, until the next export of `SPEC.md` carries both

#### Scenario: The catalogue order is checked

- **WHEN** the registry test checks that tools are declared in catalogue order
- **THEN** `images-to-pdf` counts at the catalogue place of Image to PDF, after Rotate PDF

### Requirement: PDF to JPG and PDF to PNG are one tool with two pages

PDF to JPG and PDF to PNG SHALL be one registry entry, `pdf-to-images`, in the "Convert from PDF" group, with the pages `/pdf-to-jpg` and `/pdf-to-png`, each setting its picture format through its preset. This is the agent's choice, after the owner's Image to PDF decision and `SPEC.md`'s own one tool with preset pages for target sizes; the owner may undo it. (SPEC.md: Tool catalogue; Scope notes for specific tools)

#### Scenario: The home page lists the pages

- **WHEN** the home page is built
- **THEN** "PDF to JPG" and "PDF to PNG" are listed under "Convert from PDF", each linking to its own page

#### Scenario: The catalogue order is checked

- **WHEN** the registry test checks catalogue order
- **THEN** `pdf-to-images` counts at the place of PDF to JPG, after Compress PDF

### Requirement: A tool with several pages links its pages to each other

A tool with several pages MAY name its own other pages among its related tools. Each page SHALL link to the others it names and never to itself, and SHALL show four to six related links. (SPEC.md: SEO, Every tool page)

#### Scenario: The related links of PDF to JPG

- **WHEN** `/pdf-to-jpg` is built
- **THEN** its related links include "PDF to PNG" and do not include "PDF to JPG"

### Requirement: Options are declared in the registry

A tool's options SHALL be declared in its registry entry: for a choice, a key, a legend, the values with their labels and the value chosen at first; for a text, a key, a label, a hint and its sentences. What each tool accepts, a choice's values or a text's limit and character rule, SHALL be written once, in a plain module its engine reads to check what it is sent. No page preset SHALL use an option's key. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test runs

- **WHEN** the registry test checks a tool with options
- **THEN** it fails unless the option keys are unique, each value is listed once with a label, the starting value is among them, and the values are exactly those the accepted-values module gives for that tool and key

#### Scenario: The registry test checks a text

- **WHEN** the registry test checks a tool with a text
- **THEN** it fails unless the label, hint and sentences are plain and not empty, the accepted-values module has a line for that tool and key with a most characters from 1 to 200 and a known character rule, every text line in that module belongs to a text the registry shows, a hint that names a number of characters names that most characters, and the hint ends with what its character rule takes, in the rule's own words

#### Scenario: A preset uses an option's key

- **WHEN** a page's preset has a key that is also one of its tool's option keys
- **THEN** the registry test fails

#### Scenario: The engine is sent a value it does not accept

- **WHEN** an engine is sent a value for an option that is not among the accepted values, or no value
- **THEN** it refuses before it reads the file, and writes nothing

#### Scenario: The engine is sent a text it does not accept

- **WHEN** an engine is sent, for a text, something that is not a string, is empty or only spaces once trimmed, is longer than its limit, or has a character its rule does not take
- **THEN** it refuses before it reads the file with the refused-text error, writes nothing, and its error does not hold the text

#### Scenario: The character rule matches the fonts

- **WHEN** the unit tests check the standard fonts' character rule
- **THEN** every character it takes is drawn by pdf-lib's standard Helvetica, Helvetica Bold, Times and Courier as itself and not as a question mark, and a sample of characters it refuses (Devanagari, Telugu, Arabic, Chinese, Polish, an emoji, a tab, a soft hyphen) is refused

### Requirement: An option's condition is declared in the registry

An option MAY name, in its registry entry, a condition: an earlier choice of the same tool and one of that choice's values. The first option SHALL have no condition, and an option named by a condition SHALL itself have none. (SPEC.md: Rules for the code, 1; Tool page anatomy, 4)

#### Scenario: The registry test checks a condition

- **WHEN** the registry test checks a tool whose options name conditions
- **THEN** it fails unless each condition names a choice listed earlier in the same tool, one of that choice's values, and a choice with no condition of its own, and unless the tool's first option has no condition

#### Scenario: A condition that cannot hold

- **WHEN** a test entry names a condition on a key that is not an earlier choice, on a value the choice does not have, or on its own first option
- **THEN** the registry test fails for each

### Requirement: Drawings are declared in the registry

A drawing SHALL be declared in its tool's registry entry by its words only: a key, a label, a hint, the Clear button's words and its sentences. The pad's units and each tool's most lines and points SHALL be written once, in the plain module its engine reads. The engine SHALL refuse, before it reads the file, anything that is not a drawing within them. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test checks a drawing

- **WHEN** the registry test checks a tool with a drawing
- **THEN** it fails unless the words are plain and not empty, the module has a line for that tool and key with most lines and most points within their bounds, every drawing line in the module belongs to a drawing the registry shows, and the tool's first option is not a drawing

#### Scenario: The engine is sent something that is not a drawing

- **WHEN** an engine is sent, for a drawing, something that is not a list of lines, no lines, a line with an odd count or no points, a value that is not a whole number (such as NaN, Infinity, text or null) or lies outside the pad, a line that is not a plain list, or more lines or points than its limits
- **THEN** it refuses before it reads the file with the refused-drawing error, and writes nothing

### Requirement: Pictures are declared in the registry

A picture SHALL be declared in its tool's registry entry by its words only: a key, a label, the button's words, a hint, the words for what it takes and its sentences. Each tool's types and notice sizes in bytes and pixels SHALL be written once, in the plain module the page and its engine read. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test checks a picture

- **WHEN** the registry test checks a tool with a picture
- **THEN** it fails unless the words are plain and not empty, the module has a line for that tool and key with JPG, PNG or both as types and notice sizes within their bounds, every picture line in the module belongs to a picture the registry shows, a hint that names a size names that notice size, and the tool's engine can read a picture before the job

#### Scenario: The engine is sent something that is not an accepted picture

- **WHEN** an engine is sent, for a picture, something that is not bytes, a picture of another type, damaged, or saved in a way it cannot read
- **THEN** it refuses before it reads the PDF with the refused-picture error, and writes nothing

### Requirement: New passwords are declared in the registry

A new password SHALL be declared in its tool's registry entry by its words only. Each tool's most characters, from 1 to 127, and its character rule SHALL be written once, in the plain module its engine reads. The one rule for now SHALL be printable ASCII (U+0020 to U+007E) with no space first or last. The engine SHALL refuse anything else before it reads the file, and use an accepted password exactly as sent. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test checks a new password

- **WHEN** the registry test checks a tool with a new password
- **THEN** it fails unless the key is a plain word not used by another option, a preset, the page's items or the worker (`passwords`), the words are plain and not empty with no exclamation mark, the module has a line for that tool and key with a most characters from 1 to 127 and a known character rule, every password line in the module belongs to a new password the registry shows, a hint that names a number of characters names that most characters, and the hint ends with what its character rule takes, in the rule's own words

#### Scenario: A test entry breaks a check

- **WHEN** a test entry has a new password whose key is `passwords`, whose words are empty, whose line is missing or whose limit is 0 or 128, or the module has a line no registry entry shows
- **THEN** the registry test fails for each

#### Scenario: The engine is sent a password it does not accept

- **WHEN** an engine is sent, for a new password, something that is not a string, is empty, starts or ends with a space, is longer than its limit, or has a character its rule does not take
- **THEN** it refuses before it reads the file with the refused-password error, writes nothing, and its error does not hold the password

#### Scenario: The rule matches the readers

- **WHEN** the unit tests encrypt a small PDF with this repo's qpdf at 256-bit AES, using a password made of every character the rule takes (spaces inside only), and also passwords that start with "--" or "@"
- **THEN** each file opens with its password, and with no other, in qpdf and in PDF.js
