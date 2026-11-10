# seo Specification

## Purpose

What each page must carry so that people searching for a PDF job can find it: URL, title, description, heading, served text, structured data, and the speed and size budgets. Also the rules for specific-search pages and translations. Derived from "SEO" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: Title tag

Every tool page SHALL have a title tag with the job first, then the brand, under 60 characters, such as "Merge PDF files in your browser - PDFkaro". Every page on the site SHALL have a unique title. (SPEC.md: Every tool page; Definition of done, The site)

#### Scenario: Titles are checked at build

- **WHEN** the site is built
- **THEN** every title is under 60 characters and no two pages share a title

### Requirement: Meta description

Every tool page SHALL have a meta description under 155 characters that states the job and that files stay on the device, or for server tools that files are deleted within an hour. Every page on the site SHALL have a unique description. (SPEC.md: Every tool page; Definition of done, The site)

#### Scenario: A browser tool description is read

- **WHEN** the description of a browser tool page is read
- **THEN** it says the files stay on the device

#### Scenario: A server tool description is read

- **WHEN** the description of a server tool page is read
- **THEN** it says the file is deleted within an hour and does not say the file stays on the device

### Requirement: One heading

Every tool page SHALL have exactly one `h1`, stating the job in plain words. (SPEC.md: Every tool page)

#### Scenario: A page is parsed

- **WHEN** a tool page's HTML is parsed
- **THEN** it has exactly one `h1`

### Requirement: Body text is in the served HTML

The heading, sentence, how-to steps, FAQ and related links SHALL be present in the served HTML and MUST NOT be injected by JavaScript. (SPEC.md: Every tool page)

#### Scenario: A page is fetched without running scripts

- **WHEN** a tool page is fetched and no script is run
- **THEN** the heading, how-to steps, FAQ and related links are in the response

### Requirement: Structured data

Every tool page SHALL carry `WebApplication` and `BreadcrumbList` JSON-LD, checked with Google's Rich Results Test. (SPEC.md: Every tool page)

#### Scenario: Structured data is checked in the build

- **WHEN** a tool page's JSON-LD is parsed
- **THEN** it is valid JSON holding a `WebApplication` and a `BreadcrumbList` that match the page

#### Scenario: The Rich Results Test is run

- **WHEN** a tool page is run through Google's Rich Results Test before launch
- **THEN** the result is recorded, and anything it asks for that the banned patterns forbid, such as star ratings, goes to the owner

### Requirement: Social tags

Every tool page SHALL carry an Open Graph title, description and one plain image. (SPEC.md: Every tool page)

#### Scenario: A page is parsed

- **WHEN** a tool page's HTML is parsed
- **THEN** it has `og:title`, `og:description` and `og:image` tags, and the image is plain

### Requirement: Canonical tag

Every page SHALL carry a canonical tag that points to itself. (SPEC.md: Every tool page)

#### Scenario: A page is parsed

- **WHEN** any page's HTML is parsed
- **THEN** its canonical URL equals its own URL

### Requirement: Home page links to every tool

The home page SHALL link to every published tool. (SPEC.md: Site-wide)

#### Scenario: A tool is published

- **WHEN** a tool ships
- **THEN** the home page has a link to it

### Requirement: Speed targets

On a mid-range Android phone, pages SHALL meet: Largest Contentful Paint under 2.5 s, Interaction to Next Paint under 200 ms, and layout shift under 0.1. Lighthouse on a phone profile SHALL score 90 or more for performance and 95 or more for accessibility. The targets SHALL be met on the home page and on three tool pages. (SPEC.md: Site-wide; Definition of done, The site)

#### Scenario: Lighthouse is run

- **WHEN** Lighthouse runs on the home page and three tool pages with a phone profile
- **THEN** each scores 90 or more for performance and 95 or more for accessibility, with Largest Contentful Paint under 2.5 s and layout shift under 0.1

#### Scenario: Interaction is measured

- **WHEN** the same pages are used by hand on a mid-range Android phone
- **THEN** Interaction to Next Paint is under 200 ms, and the figure is recorded, because a lab run cannot measure it

### Requirement: Page weight

A tool page SHALL ship under 100 KB of compressed HTML, CSS and JavaScript before a file is chosen. (SPEC.md: Site-wide)

#### Scenario: A page's weight is measured

- **WHEN** a built tool page is loaded and no file is chosen
- **THEN** the compressed HTML, CSS and JavaScript fetched total under 100 KB

### Requirement: Specific-search pages are real pages

A specific-search page (a target size, a format pair or a specific job) SHALL be the working tool with that setting already chosen, plus text written for that exact case. A page that is the same text with one word swapped MUST NOT be published. Pages for specific jobs that the catalogue does not list ship in phase 3. (SPEC.md: Specific-search pages; Build phases)

#### Scenario: A target-size page is proposed

- **WHEN** `/compress-pdf-to-200kb` is added
- **THEN** it opens the compressor with 200 KB selected and its text is written for the 200 KB case, not copied from another preset

### Requirement: The device line is used only where true

"Your file never leaves your device" SHALL be used in titles and descriptions only where it is true. It MUST NOT appear on a server tool page. (SPEC.md: After launch)

#### Scenario: A server tool page is checked

- **WHEN** the title, description and text of a server tool page are read
- **THEN** none of them says the file stays on or never leaves the device

### Requirement: Translations are reviewed and marked

From phase 3, translations SHALL start with Hindi. Each translation SHALL be reviewed by a fluent reader and marked with `hreflang` tags. (SPEC.md: After launch)

#### Scenario: A Hindi page is published

- **WHEN** a Hindi page is published
- **THEN** a fluent reader has reviewed it and both language versions carry `hreflang` tags pointing at each other

### Requirement: Search consoles are the owner's task

Registering the site in Google Search Console and Bing Webmaster Tools on launch day, and posting about the site, SHALL be left to the owner. Agents MUST NOT post about the site. (SPEC.md: Site-wide; After launch)

#### Scenario: Launch day

- **WHEN** phase 1 is ready to launch
- **THEN** the owner is reminded to register the site, and no agent registers or posts for them
