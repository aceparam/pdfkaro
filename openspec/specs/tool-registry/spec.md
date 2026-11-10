# tool-registry Specification

## Purpose

The single registry file that declares every tool, and everything generated from it: tool pages, navigation, the home page list, group hub pages and the sitemap. Derived from "Tool catalogue", "Architecture and tech stack" and "SEO" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: One registry declares every tool

The site SHALL declare each tool exactly once, in `src/tools/registry.ts`. Each entry MUST carry the slug, name, page title, description, group, where it runs (browser or server), phase, accepted file types and related tools. A catalogue row with several URLs is declared once, and each URL it serves gets its own page, title and description. (SPEC.md: Rules for the code, 1; SEO, Specific-search pages)

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

### Requirement: Image to PDF waits for the owner

Image to PDF (`/image2pdf`) SHALL NOT be added to the registry until the owner says how it relates to JPG to PDF and PNG to PDF, and which URL it uses. Its catalogue URL does not follow the hyphen rule in the SEO section. (CLAUDE.md: Questions waiting for the owner; SPEC.md: SEO, Every tool page)

#### Scenario: Image to PDF is proposed

- **WHEN** a change proposes Image to PDF before the owner has answered
- **THEN** the change is blocked and the owner is asked how the three tools relate and which URL to use
