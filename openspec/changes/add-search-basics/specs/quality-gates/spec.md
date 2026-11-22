## MODIFIED Requirements

### Requirement: Site checks

The site SHALL meet these checks: the speed and Lighthouse targets of the `seo` capability on the home page and three tool pages; a unique title and description on every page, with every page in the sitemap except the 404 page and pages still showing an owner placeholder; the plain 404 page of the `look-and-feel` capability; and a full pass over every page at 360px and 1280px that finds nothing from the banned patterns list. (SPEC.md: The site)

#### Scenario: The site is checked before launch

- **WHEN** phase 1 is ready to launch
- **THEN** each site check has been run and its result recorded

#### Scenario: Titles, descriptions and the sitemap on every build

- **WHEN** the site is built in CI
- **THEN** the search check of the `seo` capability confirms the unique titles and descriptions and the sitemap's pages, so this part of the site check is never left to launch day
