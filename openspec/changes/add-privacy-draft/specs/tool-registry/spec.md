## MODIFIED Requirements

### Requirement: Pages are generated from the registry

The site SHALL generate one page for each URL the registry serves, from `src/pages/[slug].astro`, and SHALL generate the home page list, the navigation, the group hub pages, `sitemap.xml` and `robots.txt` from the registry at build time. The sitemap SHALL list the home page, every hub page, every tool page and every site page the owner has written or approved, and no placeholder page, no draft waiting for the owner's review and no 404 page. (SPEC.md: Rules for the code, 1; SEO, Site-wide; Definition of done, The site)

#### Scenario: The sitemap matches the registry

- **WHEN** the site is built
- **THEN** `sitemap.xml` lists every tool page, every group hub page and every published site page except the 404 page, pages still showing an owner placeholder and pages still showing a draft line, and nothing else

#### Scenario: The owner writes a placeholder page

- **WHEN** the owner's About page replaces its placeholder and the page is marked as written
- **THEN** the next build lists `/about` in the sitemap and drops its `noindex`

#### Scenario: The owner approves the Privacy draft

- **WHEN** the owner approves the Privacy page, its draft line is removed and the page is marked as written
- **THEN** the next build lists `/privacy` in the sitemap and drops its `noindex`
