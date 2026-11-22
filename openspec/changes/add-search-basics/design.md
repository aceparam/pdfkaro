# Design: add-search-basics

## Context

See proposal.md for why. The facts below come from reading `main` at `746e2f6`.

- **Pages built today: 24.** Seventeen tool pages from 14 registry entries, the home page, 404, and five owner placeholders: About, Privacy, Changes, Known problems and Contact. None carries a canonical tag, social tags or JSON-LD. There is no `public/` folder, `sitemap.xml` or `robots.txt`.
- **`src/layouts/Base.astro`** writes the charset, viewport, title and description. Under a sub-path it also writes `<meta name="robots" content="noindex">`, which `check:base` checks. The CSP integration then inserts the policy straight after the charset tag.
- **Groups.** `registry.ts` declares the seven groups as `{ id, name }`. `groupsWithItems` in `queries.ts` drops groups with no published page, so the home page shows six; "Read and check" has no Phase 1 tool. Published pages by group:

  | Group | Pages |
  | --- | --- |
  | Organise pages | 6 |
  | Make smaller and fix | 1 |
  | Convert to PDF | 3 (JPG, PNG, Image to PDF) |
  | Convert from PDF | 2 |
  | Edit and sign | 3 |
  | Protect | 2 |

- **The base.** The base comes from `SITE_BASE`, checked by a regular expression in `astro.config.mjs`. Every link goes through `withBase(base, path)` in `src/site.ts`. The home page is `withBase(base, '/')`, which is `/` or `/pdfkaro/`.
- **The CSP.** `scripts/csp.mjs` and `scripts/check-csp.mjs` each treat `<script type="application/ld+json">` as a data block, which is not hashed. `tests/unit/csp.test.ts` lines 35, 87 and 120 already prove it for both.
- **End-to-end tests** serve the built site at `http://localhost:4321` (`playwright.config.ts`). Astro's preview serves `merge-pdf.html` at `/merge-pdf`.
- **Node.** Node 22.23 here imports `src/tools/registry.ts` directly: it has only `import type` lines, and type stripping is on by default from Node 22.18. This was checked: `node -e "import('./src/tools/registry.ts')"` gives 14 tools and 7 groups. `queries.ts` cannot be imported this way, because its `../site` import has no extension.
- **The design screens** already draw a group page (`design/screens/group-organise-pages.html`): the `h1` is the group name, then a lede sentence and a tool list. `home.html` draws the group headings as links. `design/README.md` lists both as proposed and notes that a group sentence saying "run in your browser" must follow the registry.

## Goals / Non-Goals

**Goals:**

- Every absolute address comes from one checked setting, and nothing names a domain the owner has not given.
- The tags, JSON-LD, hub pages and sitemap all come from the registry, and one build check proves the built files agree with it.
- Visible changes are as small as `SPEC.md` allows: a link on each group heading, one link on each tool page, and the new hub pages.

**Non-Goals:**

- Making the preview indexable, or choosing the launch host or domain.
- Rich results. A `WebApplication` without a rating is not eligible for one, and ratings are banned.
- JSON-LD on hub, home or site pages, `lastmod` in the sitemap, Twitter/X cards, and `hreflang`.

## Decisions

### 1. `SITE_ORIGIN`, checked like `SITE_BASE`

`astro.config.mjs` reads `SITE_ORIGIN`. It accepts only:
- `^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`, a lower-case https host with no port, path, query, fragment or trailing slash;
- `^http://localhost:[0-9]{1,5}$`.

Anything else throws, with a message saying what it takes. When it is unset, the origin is `http://localhost:4321`. The origin is passed to Astro as `site`, so pages and endpoints read it as `import.meta.env.SITE`.

`src/site.ts` gains `absoluteUrl(origin, base, path)`, which returns `origin + withBase(base, path)`. It is pure, shared by the layout, the JSON-LD, the sitemap and the robots file, and unit tested.

- **Why localhost by default.** It is the address `npm run preview` and the end-to-end tests use, so in those tests the canonical address equals the browser's address. A local or CI build can never point a canonical tag at somewhere real.
- **Alternatives considered:**
  - Default to `https://pdfkaro.com`. Rejected: the domain is not bought, and canonical tags pointing at a domain someone else may own would hand them the pages.
  - Fail every build without the setting. Rejected: it breaks `npm run build` for everyone and in CI for no gain.
  - A `.invalid` placeholder. Rejected: it breaks the end-to-end canonical check, and localhost already cannot be real.
- **Preview.** `pages.yml`'s build job sets `SITE_ORIGIN` in a step: `https://` plus `github.repository_owner` in lower case plus `.github.io`. The owner name may have capitals; Pages hosts are lower case. It then runs `npm run check:seo` after the build. `SITE_BASE` is unchanged.
- **Launch.** The launch build sets the real origin, once a domain exists. The owner steps below list it.

### 2. Head tags in `Base.astro`

`Base` takes a new required prop, `path: string | null`: the page's path from the site root, such as `/merge-pdf` or `/`. Only `404.astro` passes `null`. Making it required means no page can forget it. `Base` also takes an optional `structuredData` string.

When `path` is a string, `Base` writes, after the description, in this order:
- `<link rel="canonical">`;
- `og:type` (`website`), `og:title` (the title), `og:description`, `og:url` (the canonical address);
- `og:image` (`absoluteUrl(origin, base, '/social.png')`), `og:image:width` (1200), `og:image:height` (630), `og:image:alt` ("PDFkaro. Every PDF job, done in your browser.").

`noindex` is written when the site is under a sub-path, as today, or when `path` is in `unwrittenPages` (decision 6). It is one tag either way.

The JSON-LD, when given, is written as `<script type="application/ld+json" set:html={structuredData} />` at the end of the head.

- **On every page, not only tool pages.** One rule in the shared layout is plainer, and a shared link to the home page or a hub page then gets a proper preview too. `SPEC.md` asks for tool pages at least and forbids nothing more.
- **None on the 404 page.** It is served at every missing address, so it has no address of its own to point at.

### 3. JSON-LD

`toolStructuredData({ tool, page, group, origin, base, siteName })` in `src/tools/seo.ts` returns this object:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "name": "Merge PDF",
      "description": "<the page's meta description>",
      "url": "<canonical>",
      "applicationCategory": "UtilitiesApplication",
      "isAccessibleForFree": true
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "PDFkaro", "item": "<home>" },
        { "@type": "ListItem", "position": 2, "name": "Organise pages", "item": "<hub>" },
        { "@type": "ListItem", "position": 3, "name": "Merge PDF", "item": "<canonical>" }
      ]
    }
  ]
}
```

`jsonForScript(value)` turns it into text: `JSON.stringify`, then `<`, `>` and `&` become `<`, `>` and `&`. No text in the block can then close the script or start a comment, and the parsed value is unchanged. The page name is `page.name` ("Remove a password" for `/unlock-pdf`).

- **No `offers`.** A price needs a currency, which would be a claim the site does not make. `isAccessibleForFree: true` says what is true (SPEC.md rule 3: no account, no watermark, no limit). No `aggregateRating`, `review`, `operatingSystem`, `screenshot` or `author`: each would be a claim, banned, or invented.
- **One block with `@graph`**, so the check finds exactly one block per tool page.
- **`applicationCategory`** is a classification Google lists for this type. It claims nothing about the page.
- **Alternative considered:** two separate blocks. Equal for search engines; one block is simpler to check.

### 4. Hub pages

`Group` in `registry.ts` gains `slug` (typed as a new `HubSlug` union), `title`, `description` and `sentence`. These are draft words for the owner's review:

| Group | Address | Title | Sentence |
| --- | --- | --- | --- |
| Organise pages | `/organise-pages` | Organise PDF pages - PDFkaro | Tools that join, split and rearrange the pages of a PDF. |
| Make smaller and fix | `/make-smaller-and-fix` | Make a PDF smaller - PDFkaro | Tools that make a PDF file smaller. |
| Convert to PDF | `/convert-to-pdf` | Convert pictures to PDF - PDFkaro | Tools that turn pictures into a PDF. |
| Convert from PDF | `/convert-from-pdf` | Convert a PDF to pictures - PDFkaro | Tools that turn the pages of a PDF into pictures. |
| Edit and sign | `/edit-and-sign` | Edit and sign a PDF - PDFkaro | Tools that add page numbers, a watermark or a signature to a PDF. |
| Protect | `/protect` | Add or remove a PDF password - PDFkaro | Tools that add a password to a PDF or remove one. |
| Read and check | `/read-and-check` | Read and check a PDF - PDFkaro | Tools that read a PDF and tell you about it. (Not built until its first tool.) |

Descriptions are drafted in the same plain style and say the files stay on the device and are not uploaded, as each group has browser tools only. A later tool change that makes a sentence untrue, such as Word to PDF in "Convert to PDF", must update its group's words. The registry test enforces the device claim (`tool-registry`, "A hub's words claim the device").

- **Addresses.** The group name, lowercase with hyphens, at the root. That is the plainest rule and matches the design screen's file name. `/protect` is short but follows the rule. The address is declared, not derived, so renaming a group can never move a published address.
- **Collisions.** The registry test refuses a hub address that equals any catalogue slug (all 54, published or not, through `CatalogueSlug`) or a site page path. The site pages are `/about`, `/privacy`, `/changes`, `/known-problems`, `/contact`, `/404`, `/sitemap.xml` and `/robots.txt`.
- **Routing.** `src/pages/[slug].astro`'s `getStaticPaths` returns the tool pages and also `hubPages(groups, tools)` from `queries.ts` (groups with a published page), each with a `kind`. A hub renders `<h1>`, `<p class="lede">` and the existing `ToolList`, so no new component is added. One route means Astro can never be asked to choose between two root dynamic routes.
  - **Alternative considered:** a second root route, `[group].astro`. Rejected: two dynamic routes with one segment at the root compete, and the outcome depends on Astro's route priority rules.
- **Hub pages get no JSON-LD.** `SPEC.md` asks it of tool pages, and a breadcrumb of two steps adds nothing.

### 5. Links to the hubs

- **Home page.** `GroupWithItems` gains `href`, and `ToolDirectory` renders `<h2><a href>{name}</a></h2>`. The `design/screens/home.html` proposal is adopted here. The link gets the same 44px minimum height as other standalone links (`ToolDirectory.module.css`), as the site's 44px test checks every visible link. No word is added. The island's props grow by one short string per group.
- **Tool pages.** `ToolShell` takes `group: { name, href }` and, after "Related tools", renders `<p><a class="tap" href>All tools in {name}</a></p>`.
  - Why a visible link and not JSON-LD alone: Google's structured data guidelines ask that marked-up content be visible to the reader. A breadcrumb whose middle step can be reached nowhere on the page is the kind of mismatch they warn against. Without it, a hub page would also be reachable only from the home page.
  - **Alternative considered:** a visible "Home > Organise pages" line above the `h1`. Rejected: "Tool page anatomy" puts the heading first. The link below the related tools sits inside part 7 ("links to related tools") and adds no part.

### 6. Placeholders and `unwrittenPages`

`src/site.ts` gains `unwrittenPages: string[] = ['/about', '/privacy', '/changes', '/known-problems', '/contact']`, with a comment to remove a path when its page is written. Base writes `noindex` for those paths, and the sitemap leaves them out. One list drives both, so they cannot disagree. The Privacy draft change removes `/privacy` from it. The owner's About page removes `/about`.

The check tests the list both ways at the root build:
- every page with `noindex` is in the list;
- every page in the list still contains the placeholder sentence, "has not been written yet" or "No contact address has been added yet".

So a written page left on the list fails the build.

### 7. Sitemap and robots

- **`src/pages/sitemap.xml.ts`** (a static `GET` endpoint) returns `sitemapXml(urls)`. The URLs come from `sitemapPaths(groups, tools, footerLinks, unwrittenPages)`: home, hubs with tools, every tool page, then written footer pages. Each path goes through `absoluteUrl`. The output is a `urlset` in the sitemaps.org namespace with `<loc>` only, and every `loc` is XML-escaped.
- **`src/pages/robots.txt.ts`** returns:

  ```
  User-agent: *
  Allow: /

  Sitemap: <absolute sitemap address>
  ```

- **The preview.** The same files are built under `/pdfkaro/`. Crawlers read `robots.txt` only at an origin's root (`aceparam.github.io/robots.txt`, which this repo does not serve), so the preview's copy is never read. That is fine: `noindex` on every page is what keeps the preview out. A `Disallow` there would do nothing, and if it were ever read it would hide the `noindex` from crawlers. No crawler is pointed at the preview's sitemap.
- **No `lastmod`.** The build has no honest per-page date. A build date on every page would be noise.

### 8. `npm run check:seo`

`scripts/check-seo.mjs` reads a built folder (default `dist`). It takes the origin and base from `SITE_ORIGIN` and `SITE_BASE`, checked the same way and defaulting the same way. It imports `src/tools/registry.ts` and `src/site.ts` for data only, and computes every expected value with its own code, never `src/tools/seo.ts`, so a mistake in one is caught by the other, as `check-csp` does. It checks:

1. Every `.html` file except `404.html` has exactly one canonical tag, equal to origin + base + its path. `index.html` is `/`; `x.html` is `/x`. `404.html` has no canonical and no `og:` tags.
2. Every page with a canonical tag has the social tags of the `seo` capability, agreeing with its title, description and canonical. The image address is origin + base + `/social.png`.
3. `social.png` exists in the build, starts with the PNG signature, its IHDR says 1200×630, and it is under 100 KB.
4. Titles (entity-decoded) are unique and under 60 characters. Descriptions are unique and under 155.
5. Each tool page has exactly one `application/ld+json` block, with no raw `<`, `>` or `&`. The block parses, and holds exactly the fields of decision 3, with values from the registry and the canonical. Its breadcrumb's middle item is the tool's hub address, which is a built page. No other page has such a block.
6. Each group with a published page has a hub file. It holds links to exactly that group's pages in registry order, and the home page links to it. Groups without one have no file. Each tool page links to its hub.
7. `sitemap.xml`'s `loc` set equals the expected set: home, hubs, tool pages, and footer pages not in `unwrittenPages`. Each `loc` matches a built file. `robots.txt` names the sitemap's absolute address.
8. At the root build (base `/`), `noindex` appears exactly on the pages in `unwrittenPages`, and decision 6's sentence test holds. Under a sub-path, every page has `noindex`; `check:base` checks that too.

It exports pure functions over strings for unit tests (`tests/unit/check-seo.test.ts`), which feed it made-up pages with each problem. `check:base` sets `SITE_ORIGIN=https://example.org` for its sub-path build (a domain reserved for examples) and runs the check on it. CI adds a "Search tags and sitemap" step after "Content Security Policy". `package.json` `engines` becomes `>=22.18`, the first Node 22 that imports TypeScript without a flag. CI's `node-version: 22` already gets a later release.

### 9. The social image

`scripts/social-image.mjs` uses Playwright's Chromium, a dev dependency already installed for the end-to-end tests. It sets a 1200×630 viewport and a tiny inline page:
- background `#fbfaf6`;
- "PDFkaro" in bold, about 112px, `#1b1b1b`;
- the tagline below it at about 44px, broken after "Every PDF job," so both lines fit inside a centred 630px square;
- the site's system font stack;
- centred on both axes.

It saves a PNG screenshot to `public/social.png`. The script is run by hand when the image should change, and the PNG is committed. It is not rebuilt in CI, because a different machine's fonts would change its bytes.

- **No picture, icon, border, shadow or gradient,** following "Look and feel" and "Banned patterns". Light colours only: a link preview is not on the visitor's device setting.
- **Centred, not left-aligned like the pages,** because several apps crop link images to a centred square and would cut a left-aligned name.
- **Alternative considered:** drawing it at build time with a rasteriser library (resvg, sharp, satori). Rejected: that is a new dependency for one fixed picture.
- **Alternative considered:** an SVG. Rejected: link previews mostly do not show SVG.

## Effect on page weight and late loading

- No script or stylesheet is added, and `weigh` counts HTML, CSS and JavaScript only. Each page gains its head tags: about 0.4 KB raw, under 0.2 KB by gzip. Tool pages also gain the JSON-LD, about 0.6 KB raw and under 0.3 KB by gzip, plus the hub link. The home page island's props gain about 150 bytes raw.
- The social image is not fetched by any page.
- The task measures the largest page before and after against the 100 KB budget.
- WebAssembly is still fetched only after a file is picked; nothing here touches the worker.

## Dependencies

None new. Playwright (Apache-2.0, already pinned at 1.63.0) runs the social-image script. `LICENSES.md` needs no new line. If the committed image counts as a project asset, it is made only from the site's own words and colours, with a system font rendered by the machine that made it.

## Threats considered

- **Text that escapes the JSON-LD block.**
  - The threat: a registry name or description holding `</script>` or `<!--` would end or confuse the block, and a later page could carry runnable script.
  - Handling: decision 3's escaping, a unit test with a hostile test entry, and check 5's raw-character test on every built page. The block keeps `type="application/ld+json"`, so even if it were mangled it would not run. The CSP's hash list stays the gate for anything runnable, and `check:csp` still reads every page.
- **A hostile or mistyped `SITE_ORIGIN`.**
  - The threat: it ends up in attributes, XML and the robots file. A value with quotes, spaces, a path or a newline could break out of them or point canonicals elsewhere.
  - Handling: decision 1's strict pattern stops the build. Astro also escapes attribute values, and the sitemap escapes XML.
- **Canonical tags that give the pages away.** No default domain is written (decision 1), and the "domain is not bought" scenario greps every build for the three candidate domains.
- **The preview indexed instead of the real site.** `noindex` stays on every preview page (checked by `check:base` and `check:seo`). The preview's canonical tags point at the preview itself, never at a real domain. When a real domain exists, the preview still says `noindex`.
- **Data about visitors.** None. Nothing here runs in the browser, sends a request or reads a file. The no-upload tests are untouched.
- **The committed image.** A binary in the repo could hide anything. It is made by a script in the repo from fixed text, under 100 KB, checked to be a 1200×630 PNG, and reviewed by eye in the pull request.
- **Malicious PDF, oversized file, hostile file name.** Not touched: no file handling changes.

## Risks / Trade-offs

- [The Rich Results Test reports the `WebApplication` as not eligible for a rich result, because it has no rating.] → Expected and recorded. Ratings are banned, and the existing scenario sends that result to the owner.
- [The registry import in `check-seo.mjs` breaks if `registry.ts` ever imports a value without a `.ts` extension, or uses syntax type stripping refuses, such as `enum`.] → The check fails loudly with Node's error, never silently. A comment at the top of `registry.ts` already says "Data and types only"; it will name this reason.
- [Hub addresses become permanent at launch.] → Before launch they can still change, since the preview is `noindex`. Owner question 1 asks for confirmation.
- [The social image's font comes from the machine that made it.] → It is committed, so every build ships the same bytes. Changing it means re-running the script by hand and reviewing it.
- [A visible "All tools in …" link on 17 pages and links in the home headings change pages the owner has not reviewed.] → The words are drafts for the page text review in issue #7, with screenshots at 360px and 1280px in the pull request.
- [Leaving placeholders out of the sitemap reads against "the sitemap lists every page".] → They are pages saying "not written yet". Owner question 2 asks, and the default is easy to undo: empty `unwrittenPages`.
- [GitHub Pages also serves `/merge-pdf.html` beside `/merge-pdf`.] → The canonical tag names the address without `.html`, which is what canonical tags are for.

## Migration Plan

No data or address changes. Nothing published moves. Rollback is a revert.

Owner steps at launch, recorded here and repeated in the pull request. These are not agent actions:
1. Choose the domain and host (Open decisions). The launch build then sets `SITE_ORIGIN` to that origin with `SITE_BASE=/`.
2. Register the site in Google Search Console and Bing Webmaster Tools on launch day, and submit `https://<domain>/sitemap.xml` in each.
3. Run two or three tool pages through Google's Rich Results Test, and record the result. "Not eligible: missing rating" is expected; see Risks.
4. Check a link preview of the home page and one tool page in one or two apps the owner uses.

## Open Questions

None that change the approach. The owner questions in proposal.md each have a default this design builds, and each is a one-line change to undo.
