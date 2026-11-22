## MODIFIED Requirements

### Requirement: Pages are generated from the registry

The site SHALL generate one page for each URL the registry serves, from `src/pages/[slug].astro`, and SHALL generate the home page list, the navigation, the group hub pages, `sitemap.xml` and `robots.txt` from the registry at build time. The sitemap SHALL list the home page, every hub page, every tool page and every site page the owner has written, and no placeholder page and no 404 page. (SPEC.md: Rules for the code, 1; SEO, Site-wide; Definition of done, The site)

#### Scenario: The sitemap matches the registry

- **WHEN** the site is built
- **THEN** `sitemap.xml` lists every tool page, every group hub page and every published site page except the 404 page and pages still showing an owner placeholder, and nothing else

#### Scenario: The owner writes a placeholder page

- **WHEN** the owner's About page replaces its placeholder and the page is marked as written
- **THEN** the next build lists `/about` in the sitemap and drops its `noindex`

### Requirement: Seven groups

The registry SHALL place every tool in exactly one of seven groups: Organise pages, Make smaller and fix, Convert to PDF, Convert from PDF, Edit and sign, Protect, Read and check. Each group SHALL declare its hub page's address, title, description and sentence, and SHALL have a hub page once it has a published tool, at an address that is no tool slug or site page. (SPEC.md: Tool catalogue; SEO, Site-wide)

#### Scenario: A hub page is opened

- **WHEN** a visitor opens a group hub page
- **THEN** the page lists every published tool in that group as a text link with a one-line description

#### Scenario: A hub URL matches a tool slug

- **WHEN** a hub page URL would equal a tool slug
- **THEN** the build is not accepted until one of them is changed

#### Scenario: The hub page's parts

- **WHEN** the "Organise pages" hub page is built
- **THEN** it has one `h1` "Organise pages", the group's sentence, and its six published tools' pages in registry order, each a link with its summary, in the served HTML, with no script, and nothing else between the header and the footer

#### Scenario: A group with no published tool

- **WHEN** the site is built while "Read and check" has no published tool
- **THEN** it has no hub page, no home heading and no sitemap entry, and its first tool's change adds them with no hand-written list

#### Scenario: The registry test checks the groups

- **WHEN** the registry test runs
- **THEN** it fails unless every hub address is lowercase with hyphens, unique, and equal to no catalogue slug and no site page path, and every hub title is under 60 characters and ends with the brand, every hub description is under 155 characters, and titles and descriptions differ from every other page's

#### Scenario: A hub's words claim the device

- **WHEN** a group's sentence or description says files stay on the device or that its tools run in the browser
- **THEN** the registry test fails if any published tool in that group runs on the server

#### Scenario: Keyboard and screen reader

- **WHEN** a hub page is used with a keyboard and a screen reader
- **THEN** Tab reaches every tool link in order with a visible focus outline, the heading is announced as level 1, and the list is announced as a list with its count
