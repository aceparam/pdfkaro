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

The heading, sentence, how-to steps, FAQ and related links, where any are published, SHALL be present in the served HTML and MUST NOT be injected by JavaScript. (SPEC.md: Every tool page)

#### Scenario: A page is fetched without running scripts

- **WHEN** a tool page is fetched and no script is run
- **THEN** the heading, how-to steps, FAQ and any published related links are in the response

### Requirement: Structured data

Every tool page SHALL carry one JSON-LD data block holding a `WebApplication` (name, description, address, category, free) and a `BreadcrumbList` (the home page, the tool's group hub page, the page), built from the registry and matching the page. It MUST NOT hold a rating, review, price, offer or anything not on the page, and MUST NOT be able to end its script element. Other pages carry none. (SPEC.md: Every tool page; Banned patterns)

#### Scenario: Structured data is checked in the build

- **WHEN** a tool page's JSON-LD is parsed
- **THEN** it is valid JSON holding a `WebApplication` and a `BreadcrumbList` that match the page

#### Scenario: The Rich Results Test is run

- **WHEN** a tool page is run through Google's Rich Results Test before launch
- **THEN** the result is recorded, and anything it asks for that the banned patterns forbid, such as star ratings, goes to the owner

#### Scenario: The fields match the registry

- **WHEN** the JSON-LD of `/unlock-pdf` is read
- **THEN** the `WebApplication`'s name is "Remove a password", its description is the page's meta description, its address is the page's canonical address, its category is `UtilitiesApplication` and it is marked free, and the breadcrumb runs "PDFkaro", "Protect", "Remove a password" with the home, hub and page addresses

#### Scenario: Nothing invented

- **WHEN** any tool page's JSON-LD is searched
- **THEN** it holds no `aggregateRating`, `review`, `offers` or price, and no field other than those listed

#### Scenario: Text that could end the script

- **WHEN** a registry name or description holds `<`, `>` or `&`, as a test entry does
- **THEN** the served block holds each only as a JSON escape, and the parsed value equals the original text

#### Scenario: The Content Security Policy

- **WHEN** the policy check reads a tool page
- **THEN** the JSON-LD block is a data block, has no hash in the policy, and the page passes

### Requirement: Social tags

Every page except the 404 page SHALL carry `og:type` ("website"), `og:title` and `og:description` equal to its title and meta description, `og:url` equal to its canonical address, and `og:image` with its width, height and alt text, pointing at the site's one plain social image. The image SHALL be 1200 by 630 pixels and show only the site name and tagline in the site's colours. No page displays it. (SPEC.md: Every tool page; Look and feel)

#### Scenario: A page is parsed

- **WHEN** a tool page's HTML is parsed
- **THEN** it has `og:title`, `og:description` and `og:image` tags, and the image is plain

#### Scenario: The tags agree with the page

- **WHEN** any page with a canonical tag is parsed
- **THEN** its `og:title` equals its title, its `og:description` its meta description, its `og:url` its canonical address, and its `og:image` the absolute address of the social image under the site's base

#### Scenario: The image is checked

- **WHEN** the built site is checked
- **THEN** the social image exists, is a PNG of 1200 by 630 pixels, and is under 100 KB

#### Scenario: The image is looked at

- **WHEN** the social image is reviewed, and again cropped to a centred square
- **THEN** it shows "PDFkaro" and the tagline as plain text on the site's background, with no picture, icon, shape, gradient or shadow, and both lines are whole in the square

#### Scenario: The tagline stops being true

- **WHEN** the tagline, which is the image's text and alt text, says "browser" or "device" and a published tool does not run in the browser, as a test entry does
- **THEN** a unit test fails, and its message says the change must stop and ask the owner for a new tagline (the owner's text, set in `SPEC.md` "Names"), then make `public/social.png` again with `scripts/social-image.mjs`

#### Scenario: Weight and policy

- **WHEN** any page is loaded
- **THEN** the social image is not fetched, so page weight and the policy's `img-src` are unchanged

### Requirement: Canonical tag

Every page SHALL carry one canonical tag that points to itself, as an absolute address made of the site's origin, its base and the page's path. The 404 page, which is served at any missing address, SHALL carry none. (SPEC.md: Every tool page)

#### Scenario: A page is parsed

- **WHEN** any page's HTML is parsed
- **THEN** its canonical URL equals its own URL

#### Scenario: The page is opened in a browser

- **WHEN** a tool page, a hub page and the home page are opened from the built site in the end-to-end tests
- **THEN** each canonical address equals the address the browser shows

#### Scenario: The preview build

- **WHEN** the site is built for the preview under `/pdfkaro`
- **THEN** every canonical address starts with the preview origin and `/pdfkaro/`, and every page still carries `noindex`

#### Scenario: The 404 page

- **WHEN** the 404 page is parsed
- **THEN** it has no canonical tag and no social tags

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

### Requirement: Absolute addresses come from one build setting

Every absolute address the site writes SHALL come from one build setting, the site's origin, joined with the base path. The setting SHALL be a plain `https` origin, or `http://localhost` with a port, and a build SHALL fail on anything else. With no setting it SHALL be the local preview address. No build SHALL write a domain the owner has not given. (SPEC.md: Every tool page; Open decisions, Domain)

#### Scenario: No setting

- **WHEN** the site is built with no origin set
- **THEN** every absolute address starts with `http://localhost:4321`, the address the end-to-end tests serve

#### Scenario: A setting that is not a plain origin

- **WHEN** the origin is set to an address with a path, a query, a trailing slash, capitals, `http` on a host other than localhost, or another scheme
- **THEN** the build stops and says what it takes

#### Scenario: The preview

- **WHEN** the preview workflow builds the site
- **THEN** the origin is the account's GitHub Pages origin in lower case, and the search check runs on that build

#### Scenario: The domain is not bought

- **WHEN** any build's output is searched
- **THEN** no address on `pdfkaro.com`, `pdfkaro.in` or `pdfkaro.app` appears

### Requirement: Sitemap and robots file

The build SHALL write `sitemap.xml`, listing the absolute address of every page in the sitemap rule of the `tool-registry` capability and nothing else, and `robots.txt`, allowing every crawler and naming the sitemap's absolute address. A preview under a sub-path SHALL keep `noindex` on every page, since crawlers read only a `robots.txt` at an origin's root. (SPEC.md: Site-wide)

#### Scenario: The files are built

- **WHEN** the site is built
- **THEN** `sitemap.xml` is a valid sitemap of unique `loc` entries, each a page of the build, and `robots.txt` allows all and names that sitemap

#### Scenario: A preview under a sub-path

- **WHEN** the site is built under `/pdfkaro`
- **THEN** both files sit under `/pdfkaro/`, every address in them is under the preview origin and `/pdfkaro/`, and every page carries `noindex`

### Requirement: The search check runs on every build

A build check SHALL fail if any page lacks its canonical, social tags or a unique title and description within the lengths of "Title tag" and "Meta description"; if a tool page's JSON-LD is missing, invalid or does not match the registry; if a hub page is missing, extra or lists the wrong tools; or if the sitemap misses or adds a page. It SHALL read the built files and the registry with its own code. CI SHALL run it. (SPEC.md: SEO; Definition of done, The site)

#### Scenario: A page loses a tag

- **WHEN** a built page is edited to remove its canonical, change its `og:url` or drop a JSON-LD field
- **THEN** the check names the page and the problem and fails

#### Scenario: The sitemap drifts

- **WHEN** the sitemap lacks a tool page or a hub page, or lists a placeholder page, the 404 page or an address with no page
- **THEN** the check names the address and fails

#### Scenario: Titles repeat

- **WHEN** two built pages share a title or a description, or one is 60 or 155 characters or longer
- **THEN** the check names them and fails

#### Scenario: Where it runs

- **WHEN** a pull request is opened, or the preview is built
- **THEN** the check runs on the root build, on the sub-path build of `check:base` and on the preview build, and must pass
