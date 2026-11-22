# Spec Delta

## MODIFIED Requirements

### Requirement: Banned patterns

Nothing on the "Banned patterns" list in `SPEC.md` SHALL appear on any page. The list in `SPEC.md` is the one to check against; it is not copied here so that the two cannot drift apart. By the owner's decision of 22 Nov 2026, the word "unlock" stays banned on every page: only the address `/unlock-pdf` and the registry id keep it, and the tool is named "Remove a password". (SPEC.md: Banned patterns; Tool catalogue; CLAUDE.md: Owner decisions)

#### Scenario: A page is checked before it is called done

- **WHEN** a page is added or changed
- **THEN** it is checked against each item on the list at 360px and 1280px, and its text is searched for the banned words

#### Scenario: A banned styling tool is added

- **WHEN** a change adds the Inter font, shadcn/ui, Tailwind, Lucide or Heroicons
- **THEN** the change is rejected

#### Scenario: A banned visual pattern is added

- **WHEN** a page gains a hero section, a row of feature cards, a purple or indigo gradient, a drop shadow, a pill badge, an entrance animation, a testimonial or a pop-up
- **THEN** the page fails the check

#### Scenario: Unlock PDF is built

- **WHEN** the tool at `/unlock-pdf` is built, and the visible text and title of every built page, the home page and `/unlock-pdf` among them, are searched
- **THEN** none holds "unlock"; the word appears only in the address `/unlock-pdf` (in links, the canonical tag, `og:url`, structured data and the sitemap), and the tool is listed and headed as "Remove a password" and "Remove a password from a PDF"
