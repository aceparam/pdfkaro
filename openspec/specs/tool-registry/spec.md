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

A tool's options SHALL be declared in its registry entry: for each, a key, a legend, the values with their labels and the value chosen at first. The values each tool accepts SHALL be written once, in a plain module its engine reads to check what it is sent. No page preset SHALL use a key that is also an option's key. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test runs

- **WHEN** the registry test checks a tool with options
- **THEN** it fails unless the option keys are unique, each value is listed once with a label, the starting value is among them, and the values are exactly those the accepted-values module gives for that tool and key

#### Scenario: A preset uses an option's key

- **WHEN** a page's preset has a key that is also one of its tool's option keys
- **THEN** the registry test fails

#### Scenario: The engine is sent a value it does not accept

- **WHEN** an engine is sent a value for an option that is not among the accepted values, or no value
- **THEN** it refuses before it reads the file, and writes nothing
