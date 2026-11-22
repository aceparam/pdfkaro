## MODIFIED Requirements

### Requirement: Pages only the owner writes

Agents SHALL leave a clearly marked placeholder for the About, Changes and Known problems pages and MUST NOT write them. The Contact page SHALL be a marked placeholder with no invented address. Agents MUST NOT invent a person, a backstory or a motive for the site. A page that still shows a placeholder SHALL carry `noindex` and stay out of the sitemap. (SPEC.md: Pages only the owner can write; What to build; SEO, Site-wide)

#### Scenario: A placeholder page is built

- **WHEN** the About page is built before the owner has written it
- **THEN** it says plainly that the owner has yet to write it and holds no made-up content

#### Scenario: The Contact page is built

- **WHEN** the Contact page is built before the owner has given an address
- **THEN** it says plainly that the owner has yet to add one, and shows no email address

#### Scenario: Until the owner answers

- **WHEN** the owner has not yet answered whether placeholder pages belong in the sitemap (owner question 2 of `add-search-basics`)
- **THEN** placeholders carry `noindex` and are left out as the agent's default, and this can be undone by marking them written

#### Scenario: A placeholder is built at the site's root

- **WHEN** the site is built at its root and a page shows a placeholder
- **THEN** that page carries `noindex`, keeps its canonical and social tags, and is not in the sitemap, and no page without a placeholder carries `noindex`
