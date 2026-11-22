# Proposal: add-search-basics

## Why

`SPEC.md` "Build phases" lists "Sitemap, titles, structured data" as Phase 1 site work, and CLAUDE.md says it is still to do now that every Phase 1 tool is built. Today no page carries a canonical tag, social tags or JSON-LD, there is no `sitemap.xml` or `robots.txt`, and there are no group hub pages. These are rows in "SEO", "Every tool page" and "Site-wide" that the `seo` and `tool-registry` specs already require. "Every page has a unique title and description, and the sitemap lists every page" is also a site check in "Definition of done". Launch, and so the Phase 1 gate, waits on this.

## What Changes

- **One build setting for absolute addresses.** A new `SITE_ORIGIN` setting is used by the canonical tag, `og:url`, `og:image`, the JSON-LD and the sitemap. It is a plain origin such as `https://aceparam.github.io`, checked like `SITE_BASE`. With no setting it is `http://localhost:4321`, the address of `npm run preview` and the end-to-end tests. No build writes an address on a domain the owner does not hold. The preview workflow sets it to the GitHub Pages origin, and the preview keeps its `noindex` tag.
- **Canonical and social tags on every page** except the 404 page, which is served at any missing address and so has no address of its own:
  - a self-referencing `<link rel="canonical">`;
  - `og:type`, `og:title`, `og:description`, `og:url`, `og:image` with its width, height and alt text.

  The tags go on every page, not only tool pages, because one rule in the shared layout is plainer than two.
- **One plain social image.** `public/social.png` is 1200×630 and shows only the site name and the tagline in the site's own colours and system font: no picture, icon or shape. It is made once by a small script with Playwright, which is already a dev dependency, and committed. No page loads it, so page weight and the Content Security Policy are not affected.
- **JSON-LD on every tool page,** built from the registry: one `application/ld+json` data block holding a `WebApplication` and a `BreadcrumbList` (Home, the tool's group, the tool).
  - It has no rating, review, price or offer, and nothing that is not on the page. "Free" is said as `isAccessibleForFree: true`.
  - `<`, `>` and `&` are escaped, so nothing in the text can end the script.
  - It stays a data block, so the CSP build step does not hash it and `check:csp` accepts it, as both already test.
- **Group hub pages.** Each group that has at least one published tool gets a hub page. Its address comes from the registry, at the root, and never equals a tool slug or a site page. Each hub page has the group name as its `h1`, one sentence, and the group's tools as text links with their one-line summary, built from the registry. "Read and check" has no published tool yet, so its hub page waits for its first tool. Hub words are drafts for the owner.
- **Links to the hubs.** On the home page each group heading becomes a link to its hub page; nothing else is added. Each tool page gains one link below its related tools, "All tools in Organise pages", for example. So the breadcrumb's middle step is visible and can be reached.
- **`sitemap.xml` and `robots.txt`,** built from the registry at build time.
  - The sitemap lists the home page, every hub page, every tool page and every site page the owner has written.
  - Pages still showing an owner placeholder (About, Privacy, Changes, Known problems, Contact today) and the 404 page are left out. The placeholders also carry `noindex` until written.
  - `robots.txt` allows everything and names the sitemap.
  - On the preview both files sit under `/pdfkaro/`, where crawlers never read a `robots.txt`. The preview is kept out of search by its `noindex` tag, not by these files.
- **A build check, `npm run check:seo`.** It reads the built site and the registry, with its own code. It fails on:
  - a missing or wrong canonical;
  - missing or wrong social tags, or a missing or wrong social image;
  - JSON-LD that is invalid or does not match the page;
  - a hub page that is missing or lists the wrong tools;
  - a sitemap that misses a published page or lists an unpublished one;
  - a title or description that repeats, or is over 60 or 155 characters.

  It runs in CI, in the preview build, and on `check:base`'s sub-path build. The builders get unit tests.

### Out of scope

- The Privacy page draft (a separate change), translations and `hreflang`, specific-search pages, analytics, and any tool.
- Twitter/X card tags, `lastmod` dates in the sitemap, and JSON-LD on pages other than tool pages. `SPEC.md` asks for none of these. A visible breadcrumb line above the heading is also out, because "Tool page anatomy" puts the heading first.
- Registering in Google Search Console and Bing Webmaster Tools, submitting the sitemap, and running Google's Rich Results Test on the live site. These are the owner's steps at launch (`seo`: "Search consoles are the owner's task"). design.md lists them. No agent registers or posts anything.
- Choosing a domain or a launch host.

## SPEC.md sections

- "SEO", "Every tool page": title tag, meta description, structured data, social tags, canonical, links.
- "SEO", "Site-wide": sitemap and robots file from the registry, hub pages for the groups, the home page linking every tool. The page budget is unchanged.
- "Architecture and tech stack", "Rules for the code", 1: the registry drives pages, navigation, the home page list and the sitemap.
- "Look and feel": "Images: none" (the social image is not shown on any page), the home page, header and footer, and banned patterns.
- "Definition of done", "The site": a unique title and description on every page, and the sitemap listing every page.
- "Build phases", Phase 1: "Sitemap, titles, structured data". This change is site work, not a tool, so it has no catalogue position. It comes after the last Phase 1 tool (`add-unlock-pdf`), and the Privacy page draft follows separately.

## Where files are processed, and requests

No file processing changes, and no network request is added. The social image, the sitemap and `robots.txt` are fetched only by crawlers and link previews, never by a page. The JSON-LD is inert data in the served HTML.

## Open decisions and owner questions touched

- **Domain** (Open decisions, assumed "Not bought yet"): touched, not decided. No build writes `pdfkaro.com` or any other domain. The address comes from `SITE_ORIGIN`, which the launch build sets once a domain exists.
- **"Pages for previews only, or for launch too?"** (CLAUDE.md): touched, not decided. The preview sets `SITE_ORIGIN` to its own GitHub Pages origin and keeps `noindex`, so nothing on the preview asks to be indexed.
- **Analytics** (assumed cookieless page counts): untouched. Nothing is added.
- **Money** (assumed a donation link only): the JSON-LD says the tools are free and names no price.
- **Image to PDF's group** (CLAUDE.md): the "Convert to PDF" hub page lists JPG, PNG and Image to PDF, following the registry as built.
- **Star ratings** (`seo`, "Structured data"): the Rich Results Test will say a `WebApplication` without a rating cannot show as a rich result. That is expected. Ratings are banned, and the result goes to the owner as that scenario already says.

New questions for the owner, each with the default this change builds:

1. **Hub addresses.** These stay fixed once launched. Default: the group name at the root, `/organise-pages`, `/make-smaller-and-fix`, `/convert-to-pdf`, `/convert-from-pdf`, `/edit-and-sign`, `/protect`, and later `/read-and-check`.
2. **Placeholder pages and the sitemap.** "The sitemap lists every page" read literally would list "This page has not been written yet" pages. Default: placeholders carry `noindex` and stay out of the sitemap until the owner writes them. The 404 page is never listed.
3. **"Read and check" hub page.** `SPEC.md` gives each of the seven groups a hub page, but this group has no Phase 1 tool. Default: no hub page until its first tool ships, as the home page already hides the empty group.
4. **The social image.** Default: "PDFkaro" and the tagline, dark text on `#fbfaf6`, centred so a square crop keeps them. The tagline says "done in your browser", which stops being true for every tool once server tools ship in Phase 2.
5. **Hub links' words**, "All tools in Organise pages" on tool pages, and every hub's title, sentence and description: drafts for the owner's page text review.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `seo`:
  - "Structured data", "Social tags" and "Canonical tag" are refined: what each holds, every page except 404, built from the registry, and no ratings or prices.
  - Added: one build setting for absolute addresses; the sitemap and robots file; the search check in the build.
- `tool-registry`:
  - "Seven groups" is refined: hub addresses and words come from the registry, and a hub page is built only for a group with a published tool.
  - "Pages are generated from the registry" is refined: the sitemap leaves out owner placeholders.
- `look-and-feel`:
  - "Home page": group headings link to their hub pages.
  - "Pages only the owner writes": placeholders carry `noindex` and stay out of the sitemap.
- `tool-page`: added, a tool page links to its group's hub page below its related tools.
- `quality-gates`: "Site checks" says which pages the sitemap must list.

## Impact

- **New files:**
  - `src/tools/seo.ts`: plain builders for the canonical address, JSON-LD, sitemap, robots text and hub pages.
  - `src/pages/sitemap.xml.ts` and `src/pages/robots.txt.ts`: static endpoints.
  - `scripts/check-seo.mjs` and `npm run check:seo`.
  - `scripts/social-image.mjs`, and the image it made, `public/social.png`.
  - `tests/unit/seo.test.ts` and `tests/unit/check-seo.test.ts`.
- **Changed files:**
  - `src/site.ts`: `absoluteUrl`, the origin check, and the list of unwritten pages.
  - `astro.config.mjs`: reads and checks `SITE_ORIGIN`, and sets `site`.
  - `src/layouts/Base.astro`: canonical, social tags, the JSON-LD slot, and `noindex` for placeholders.
  - `src/tools/registry.ts`: `Group` gains `slug`, `title`, `description` and `sentence`.
  - `src/tools/queries.ts`: groups carry their hub link.
  - `src/pages/[slug].astro`: also builds hub pages.
  - Every page in `src/pages/`: passes its own path.
  - `ToolDirectory`: heading links. `ToolShell`: the hub link.
  - `scripts/check-base.mjs`: runs the search check on its build.
  - `.github/workflows/ci.yml` and `pages.yml`.
  - `package.json`: the script, and `engines` raised to Node 22.18 so the check can import the registry's TypeScript.
  - `tests/e2e/pages.ts`, `site.spec.ts` and `home.spec.ts`.
  - CLAUDE.md's commands list (after merge, by the coordinator).
- **Dependencies:** none new.
- **Page weight:** a few hundred bytes of HTML by gzip on each page for the head tags, and under 1 KB on tool pages with the JSON-LD. The home page's island data grows by one link per group. No script or stylesheet is added. Measured in tasks against the 100 KB budget.
- **When WebAssembly is fetched:** unchanged, after a file is picked.
- **Review note:** pages change visibly (home headings, a link on tool pages, the new hub pages), so the ux-designer reads both stages. The security reviewer reads the JSON-LD escaping and the origin check.
