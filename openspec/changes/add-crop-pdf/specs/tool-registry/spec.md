## MODIFIED Requirements

### Requirement: Seven groups

The registry SHALL place every tool in exactly one of seven groups: Organise pages, Make smaller and fix, Convert to PDF, Convert from PDF, Edit and sign, Protect, Read and check. Each group SHALL declare its hub page's address, title, description, sentence and whether its words claim the device, and SHALL have a hub page once it has a published tool, at an address that is no tool slug or site page. (SPEC.md: Tool catalogue; SEO, Site-wide)

#### Scenario: A hub page is opened

- **WHEN** a visitor opens a group hub page
- **THEN** the page lists every published tool in that group as a text link with a one-line description

#### Scenario: A hub URL matches a tool slug

- **WHEN** a hub page URL would equal a tool slug
- **THEN** the build is not accepted until one of them is changed

#### Scenario: The hub page's parts

- **WHEN** the "Organise pages" hub page is built
- **THEN** it has one `h1` "Organise pages", the group's sentence, and its seven published tools' pages in registry order (Merge PDF, Split PDF, Extract pages, Delete pages, Reorder pages, Rotate PDF, Crop PDF), each a link with its summary, in the served HTML, with no script, and nothing else between the header and the footer

#### Scenario: A group with no published tool

- **WHEN** the site is built while "Read and check" has no published tool
- **THEN** it has no hub page, no home heading and no sitemap entry, and its first tool's change adds them with no hand-written list

#### Scenario: The hub rules rest on open owner questions

- **WHEN** hub pages are built while owner questions 1 and 3 of `add-search-basics` (hub addresses, no hub page for an empty group) are open
- **THEN** the addresses and the empty-group rule are the agent's defaults, the pull request says so, and the "Definition of done, The site" hub item is reported as not passed until the owner answers

#### Scenario: The registry test checks the groups

- **WHEN** the registry test runs
- **THEN** it fails unless every hub address is lowercase with hyphens, unique, and equal to no catalogue slug, footer page path, `/404`, `/sitemap.xml` or `/robots.txt`, and every hub title is under 60 characters and ends with the brand, every hub description is under 155 characters, and the titles and descriptions of tool pages and hub pages all differ from each other

#### Scenario: A hub's words claim the device

- **WHEN** a group's title, sentence or description matches `/device|browser|upload|never leaves|not sent/i`
- **THEN** the registry test fails unless that group declares that its words claim the device, and fails if a group that declares so has any published tool that does not run in the browser

#### Scenario: A server tool joins a group that claims the device

- **WHEN** a test entry adds a server tool to a group whose words claim the device
- **THEN** the registry test fails and names the group

#### Scenario: Keyboard and screen reader

- **WHEN** a hub page is used with a keyboard and a screen reader
- **THEN** Tab reaches every tool link in order with a visible focus outline, the heading is announced as level 1, and the list is announced as a list with its count

### Requirement: Tools ship in phase and catalogue order

Tools SHALL be built in catalogue order within a phase. Merge PDF SHALL be the first tool. No tool from a phase SHALL be built before the phase before it passes its gate, except that Phase 2 tools MAY be built before the Phase 1 gate passes, by the owner's decision of 23 Nov 2026; Phase 2 browser tools SHALL come first, in catalogue order, and a Phase 2 server tool SHALL wait for the owner's server host and budget decision. Launch still needs the Phase 1 gate. (SPEC.md: Build phases; CLAUDE.md: Owner decisions, "Phase 2 starts before the Phase 1 gate (23 Nov 2026)")

#### Scenario: A later-phase tool is proposed early

- **WHEN** a change proposes a phase 3 tool before the phase 2 gate has passed
- **THEN** the change is blocked until the gate passes

#### Scenario: The first Phase 2 tool

- **WHEN** a change proposes Crop PDF, the first Phase 2 browser tool in catalogue order, while the Phase 1 gate is still open
- **THEN** the change is not blocked by the gate, and the Phase 1 gate's open items stay open

#### Scenario: A Phase 2 server tool

- **WHEN** a change proposes a Phase 2 server tool before the owner has decided the server host and budget
- **THEN** the change is blocked until the owner decides
