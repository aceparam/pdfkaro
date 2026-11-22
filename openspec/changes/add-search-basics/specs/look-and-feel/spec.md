## MODIFIED Requirements

### Requirement: Home page

The home page SHALL hold the site name, one sentence, a plain text box that filters the list ("What do you need to do?"), and every tool as a text link under the seven group headings, each with a one-line description. Each group heading SHALL be a link to that group's hub page. It SHALL hold nothing else. (SPEC.md: What to build; SEO, Site-wide)

#### Scenario: A visitor filters the list

- **WHEN** a visitor types "merge" in the box
- **THEN** only tools matching "merge" remain listed

#### Scenario: The served page is read

- **WHEN** the home page is fetched and no script is run
- **THEN** every tool is listed as a link in the response

#### Scenario: A group heading is followed

- **WHEN** a visitor activates the "Organise pages" heading, by mouse, by touch or by Enter after reaching it with Tab
- **THEN** the "Organise pages" hub page opens

#### Scenario: A screen reader reads a heading

- **WHEN** a screen reader reaches a group heading
- **THEN** it is announced as a level 2 heading and as a link named with the group name only

#### Scenario: A filter hides a group

- **WHEN** a typed phrase matches no tool in a group
- **THEN** that group's heading link is hidden with its list, and no hidden link can take focus

### Requirement: Pages only the owner writes

Agents SHALL leave a clearly marked placeholder for the About, Changes and Known problems pages and MUST NOT write them. The Contact page SHALL be a marked placeholder with no invented address. Agents MUST NOT invent a person, a backstory or a motive for the site. A page that still shows a placeholder SHALL carry `noindex` and stay out of the sitemap. (SPEC.md: Pages only the owner can write; What to build; SEO, Site-wide)

#### Scenario: A placeholder page is built

- **WHEN** the About page is built before the owner has written it
- **THEN** it says plainly that the owner has yet to write it and holds no made-up content

#### Scenario: The Contact page is built

- **WHEN** the Contact page is built before the owner has given an address
- **THEN** it says plainly that the owner has yet to add one, and shows no email address

#### Scenario: A placeholder is built at the site's root

- **WHEN** the site is built at its root and a page shows a placeholder
- **THEN** that page carries `noindex`, keeps its canonical and social tags, and is not in the sitemap, and no page without a placeholder carries `noindex`
