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
- Visible changes are as small as `SPEC.md` allows: one link on each tool page, the new hub pages, and `role="list"` on tool lists, which changes no look. The home page does not change.

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

`src/site.ts` gains, as plain exports with no imports:
- `defaultOrigin` (`http://localhost:4321`);
- `isSiteOrigin(value)`, the two patterns above;
- `isSiteBase(value)`, the pattern `astro.config.mjs` uses for `SITE_BASE` today, moved here;
- `absoluteUrl(origin, base, path)`, which returns `origin + withBase(base, path)`.

They are pure and unit tested. `astro.config.mjs` and `scripts/check-seo.mjs` import them, so the defaults and the patterns are written once. `playwright.config.ts` keeps its literal `baseURL`, with a comment naming `defaultOrigin`, because the two must stay equal. The layout, the JSON-LD, the sitemap and the robots file all use `absoluteUrl`.

- **Why localhost by default.** It is the address `npm run preview` and the end-to-end tests use, so in those tests the canonical address equals the browser's address. A local or CI build can never point a canonical tag at somewhere real.
- **Alternatives considered:**
  - Default to `https://pdfkaro.com`. Rejected: the domain is not bought, and canonical tags pointing at a domain someone else may own would hand them the pages.
  - Fail every build without the setting. Rejected: it breaks `npm run build` for everyone and in CI for no gain.
  - A `.invalid` placeholder. Rejected: it breaks the end-to-end canonical check, and localhost already cannot be real.
- **Preview.** `pages.yml`'s build job sets `SITE_ORIGIN` in a step. The owner name reaches the shell only through `env:` (`OWNER: ${{ github.repository_owner }}`), never by putting the expression into the script. The step writes `SITE_ORIGIN=https://${OWNER,,}.github.io` to `GITHUB_ENV`. The owner name may have capitals; Pages hosts are lower case. The build then refuses the value unless it passes `isSiteOrigin`, and `npm run check:seo` runs after the build. `SITE_BASE` is unchanged.
- **No file this change adds names the owner's origin** (an older test, `tests/unit/start-worker.test.ts`, already uses the public preview address). Unit tests, `check:base` and the checker's tests use `https://example.org`. Only `pages.yml` derives the preview origin, at run time.
- **Launch.** The launch build sets the real origin, once a domain exists. The owner steps below list it.

### 2. Head tags in `Base.astro`

`Base` takes a new required prop, `path: string | null`: the page's path from the site root, such as `/merge-pdf` or `/`. Only `404.astro` passes `null`. Making it required means no page can forget it. `Base` also takes an optional `structuredData` object and calls `jsonForScript` on it itself. Its one `set:html` therefore only ever receives escaped JSON, and no page can hand it raw text.

When `path` is a string, `Base` writes, after the description, in this order:
- `<link rel="canonical">`;
- `og:type` (`website`), `og:title` (the title), `og:description`, `og:url` (the canonical address);
- `og:image` (`absoluteUrl(origin, base, '/social.png')`), `og:image:width` (1200), `og:image:height` (630), `og:image:alt` (`${siteName}. ${tagline}`, from `src/site.ts`, so the alt text always matches the image).

`noindex` is written when the site is under a sub-path, as today, or when `path` belongs to a footer page whose `written` is `false` (decision 6). It is one tag either way.

The JSON-LD, when given, is written as `<script type="application/ld+json" set:html={jsonForScript(structuredData)} />` at the end of the head.

- **On every page, not only tool pages.** One rule in the shared layout is plainer, and a shared link to the home page or a hub page then gets a proper preview too. `SPEC.md` asks for tool pages at least and forbids nothing more.
- **None on the 404 page.** It is served at every missing address, so it has no address of its own to point at.
- **`check:csp` and the canonical link.** Found while building: `scripts/check-csp.mjs` refuses every `<link>` whose address names a scheme or starts with `//`, so the absolute canonical address failed it. A link whose only `rel` is `canonical` is never fetched by a browser, so `check-csp.mjs` now lets that one link carry an absolute address. A link with any other `rel`, including `canonical` with another word added, is still refused. `tests/unit/csp.test.ts` covers each case. The policy itself is unchanged.

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

`jsonForScript(value)` turns it into text, exactly:

```js
JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
```

The result holds the six characters `\u003c` in place of each `<`, `\u003e` for each `>` and `\u0026` for each `&`. These are JSON string escapes, not HTML entities. The HTML parser does not read the block's text as markup, and a JSON parser turns each escape back into the character, so the parsed value is unchanged. No text in the block can then close the script or start a comment. The three characters can only occur inside JSON strings, so the replacements never touch the JSON's structure. The page name is `page.name` ("Remove a password" for `/unlock-pdf`).

- **No `offers`.** A price needs a currency, which would be a claim the site does not make. `isAccessibleForFree: true` says what is true (SPEC.md rule 3: no account, no watermark, no limit). No `aggregateRating`, `review`, `operatingSystem`, `screenshot` or `author`: each would be a claim, banned, or invented.
- **One block with `@graph`**, so the check finds exactly one block per tool page.
- **`applicationCategory`** is a classification Google lists for this type. It claims nothing about the page.
- **Alternative considered:** two separate blocks. Equal for search engines; one block is simpler to check.

### 4. Hub pages

`Group` in `registry.ts` gains:
- `slug`, typed as a new `HubSlug` union;
- `title`, `description` and `sentence`;
- `claimsDevice: boolean`.

These are draft words for the owner's review. Each sentence uses the tools' own verbs: Merge "combines", Split "cuts", Extract "copies", Delete "removes", Reorder "puts in order", Rotate "turns".

| Group | Address | Title | Sentence | Description | `claimsDevice` |
| --- | --- | --- | --- | --- | --- |
| Organise pages | `/organise-pages` | Organise PDF pages - PDFkaro | Tools that combine, split and reorder the pages of a PDF. | Combine, split, copy out, remove, reorder and turn the pages of a PDF, in your browser. Files stay on your device and are not uploaded. (135) | true |
| Make smaller and fix | `/make-smaller-and-fix` | Make a PDF smaller - PDFkaro | Make a PDF file smaller by shrinking its pictures. | Make a PDF file smaller by shrinking its pictures, in your browser. The file stays on your device and is not uploaded. (118) | true |
| Convert to PDF | `/convert-to-pdf` | Convert pictures to PDF - PDFkaro | Tools that turn JPG and PNG pictures into a PDF. | Turn JPG and PNG pictures into one PDF, in your browser. The pictures stay on your device and are not uploaded. (111) | true |
| Convert from PDF | `/convert-from-pdf` | Convert a PDF to pictures - PDFkaro | Tools that turn the pages of a PDF into JPG or PNG pictures. | Turn each page of a PDF into a JPG or PNG picture, in your browser. The file stays on your device and is not uploaded. (118) | true |
| Edit and sign | `/edit-and-sign` | Edit and sign a PDF - PDFkaro | Tools that add page numbers, a watermark or a signature to a PDF. | Add page numbers, a watermark or a signature to a PDF, in your browser. The file and any signature picture stay on your device and are not uploaded. (148) | true |
| Protect | `/protect` | Add or remove a PDF password - PDFkaro | Tools that add a password to a PDF, or remove a password or restrictions. | Add a password to a PDF, or remove a password or restrictions, in your browser. The file and any password stay on your device and are not uploaded. (147) | true |
| Read and check | `/read-and-check` | Read and check a PDF - PDFkaro | Tools that read a PDF and tell you about it. | Tools that read a PDF and tell you about it. (44) | false |

Numbers in brackets are character counts; each description is under 155. "Read and check" is not built until its first tool, whose change rewrites its words.

- **What the claims cover.** Each device claim names everything its group's tools handle. Edit and sign names the signature picture as well as the file, and Protect names the password. No description says "100%", "never leaves", "secure", or anything about servers. "Stay on your device and are not uploaded" is what each tool page already says.
- **The device-claim guard** (`tool-registry`, "A hub's words claim the device"). The registry test joins each group's title, sentence and description. If they match `/device|browser|upload|never leaves|not sent/i`, the group must declare `claimsDevice: true`. If a group declares it, every published tool in that group must have `runsIn: 'browser'`. Task 1.1 adds a test entry: a server tool in a `claimsDevice` group must trip the guard.
- **Keeping the words accurate.** A later tool whose addition makes its group's words inaccurate updates them in its own change: a server tool in "Convert to PDF" (the guard forces this), or Repair PDF in "Make smaller and fix", whose sentence fits one tool today.

- **Addresses.** The group name, lowercase with hyphens, at the root. That is the plainest rule and matches the design screen's file name. `/protect` is short but follows the rule. The address is declared, not derived, so renaming a group can never move a published address.
- **Collisions.** The registry test refuses a hub address that equals any catalogue slug (all 54, published or not, through `CatalogueSlug`) or a reserved address. The reserved addresses are built from `footerLinks` plus `/404`, `/sitemap.xml` and `/robots.txt`, so a new footer page is covered with no second list.
- **Uniqueness.** The registry test checks that titles and descriptions differ across tool pages and hub pages, the pages it holds. `check:seo` covers every built page, site pages included (decision 8, check 4).
- **Routing.** `hubPages(groups, tools, base)` in `queries.ts` is built on `groupsWithItems`, so the home page, the routes and the sitemap all take "which groups show" from one function. It returns each group's page words and hub `href` with its items. `src/pages/[slug].astro`'s `getStaticPaths` returns the tool pages and also `hubPages`, each with a `kind`. A hub renders `<h1>`, `<p class="lede">` and the existing `ToolList`, so no new component is added. One route means Astro can never be asked to choose between two root dynamic routes.
  - **Alternative considered:** a second root route, `[group].astro`. Rejected: two dynamic routes with one segment at the root compete, and the outcome depends on Astro's route priority rules.
- **Hub pages get no JSON-LD.** `SPEC.md` asks it of tool pages, and a breadcrumb of two steps adds nothing.

### 5. Links to the hubs

- **Home page: unchanged.** Its group headings stay plain text. `design/README.md` proposes linking them, but lists that as still waiting for the owner, and CLAUDE.md says to choose the plainer option when a design question is open. The UX designer also noted that a linked heading can look like one more tool link in the list beneath it. Owner question 6 asks. `GroupWithItems` gains no `href`; hub links come from `hubPages`.
- **Tool pages.** `ToolShell` takes `group: { name, href }` and, after "Related tools", renders `<p><a class="tap" href>All tools in {name}</a></p>`. The paragraph has a clear gap above it, from `ToolShell.module.css`, with no heading and no border, so it reads as separate from the related list. `hasBelow` becomes `Boolean(below) || related.length > 0 || Boolean(group)`, so the link shows even on a page with no related tools.
- **Lists are announced as lists.** `ToolList`'s `ul` has `list-style: none`, which makes VoiceOver in Safari stop announcing it as a list. The `ul` gains `role="list"`, so the hub page, the related tools and the home page are announced as lists with a count. This changes no look. A VoiceOver check joins the hand checks in issue #7.
  - Why a visible link and not JSON-LD alone: Google's structured data guidelines ask that marked-up content be visible to the reader. A breadcrumb whose middle step can be reached nowhere on the page is the kind of mismatch they warn against. Without it, no visible link on the site would reach a hub page.
  - **Alternative considered:** a visible "Home > Organise pages" line above the `h1`. Rejected: "Tool page anatomy" puts the heading first. The link below the related tools sits inside part 7 ("links to related tools") and adds no part.

### 6. Placeholders and `written`

Each entry in `footerLinks` in `src/site.ts` gains `written: boolean`, `false` for all five today. Each site page takes its `path` from its own `footerLinks` entry. `Base` writes `noindex` for a footer page that is not written, and the sitemap leaves it out. One flag drives both, so they cannot disagree. The Privacy draft change sets `/privacy` to written, and the owner's About page sets `/about`.

The check tests the flag both ways at the root build:
- every page with `noindex` is a footer page with `written: false`;
- every footer page with `written: false` still contains the placeholder sentence, "has not been written yet" or "No contact address has been added yet".

So a written page left marked as unwritten fails the build.

This rule rests on owner question 2, still open. Until the owner answers, the pull request says the "Definition of done, The site" item "the sitemap lists every page" is not passed. Undoing it means marking the placeholders written.

### 7. Sitemap and robots

- **`src/pages/sitemap.xml.ts`** (a static `GET` endpoint) returns `sitemapXml(urls)`. The URLs come from `sitemapPaths(hubPages(...), tools, footerLinks)`: home, hubs with tools, every tool page, then written footer pages. Each path goes through `absoluteUrl`. The output is a `urlset` in the sitemaps.org namespace with `<loc>` only, and every `loc` is XML-escaped.
- **`src/pages/robots.txt.ts`** returns:

  ```
  User-agent: *
  Allow: /

  Sitemap: <absolute sitemap address>
  ```

- **The preview.** The same files are built under `/pdfkaro/`. Crawlers read `robots.txt` only at an origin's root (`aceparam.github.io/robots.txt`, which this repo does not serve), so the preview's copy is never read. That is fine: `noindex` on every page is what keeps the preview out. A `Disallow` there would do nothing, and if it were ever read it would hide the `noindex` from crawlers. No crawler is pointed at the preview's sitemap.
- **No `lastmod`.** The build has no honest per-page date. A build date on every page would be noise.

### 8. `npm run check:seo`

`scripts/check-seo.mjs` reads a built folder (default `dist`). It takes the origin and base from `SITE_ORIGIN` and `SITE_BASE`, checked with `isSiteOrigin` and `isSiteBase` and defaulting to `defaultOrigin` and `/`, all imported from `src/site.ts`. It imports `src/tools/registry.ts` and `src/site.ts` for data only, and computes every expected value with its own code, never `src/tools/seo.ts`, so a mistake in one is caught by the other, as `check-csp` does. It checks:

1. Every `.html` file except `404.html` has exactly one canonical tag, equal to origin + base + its path. `index.html` is `/`; `x.html` is `/x`. `404.html` has no canonical and no `og:` tags.
2. Every page with a canonical tag has the social tags of the `seo` capability, agreeing with its title, description and canonical. The image address is origin + base + `/social.png`.
3. `social.png` exists in the build and is under 100 KB. It starts with the PNG signature, its IHDR says 1200×630, and every chunk type is on an allow-list: `IHDR`, `IDAT`, `IEND`, and `sRGB`, `gAMA` and `pHYs` if Chromium writes them. So no text, metadata or other chunk can ride along in the committed file.
4. Titles (entity-decoded) are unique and under 60 characters. Descriptions are unique and under 155.
5. Each tool page has exactly one `application/ld+json` block, with no raw `<`, `>` or `&`. The block parses, and holds exactly the fields of decision 3, with values from the registry and the canonical. Its breadcrumb's middle item is the tool's hub address, which is a built page. No other page has such a block.
6. Each group with a published page has a hub file. It holds links to exactly that group's pages in registry order. Groups without one have no file. Each tool page links to its hub.
7. `sitemap.xml`'s `loc` set equals the expected set: home, hubs, tool pages, and footer pages with `written: true`. Each `loc` matches a built file. `robots.txt` names the sitemap's absolute address.
8. At the root build (base `/`), `noindex` appears exactly on the footer pages with `written: false`, and decision 6's sentence test holds. Under a sub-path, every page has `noindex`; `check:base` checks that too.

It exports pure functions over strings for unit tests (`tests/unit/check-seo.test.ts`), which feed it made-up pages with each problem. `check:base` sets `SITE_ORIGIN=https://example.org` for its sub-path build (a domain reserved for examples) and runs the check on it. CI adds a "Search tags and sitemap" step after "Content Security Policy". `package.json` `engines` becomes `>=22.18`, the first Node 22 that imports TypeScript without a flag. CI's `node-version: 22` already gets a later release.

### 9. The social image

`scripts/social-image.mjs` uses Playwright's Chromium, a dev dependency already installed for the end-to-end tests. It sets a 1200×630 viewport and loads a tiny page with `page.setContent`, after `page.route('**', (route) => route.abort())`. Every request is refused, so the page can fetch nothing. The page contains:
- background `#fbfaf6`;
- `siteName` in bold, about 112px, `#1b1b1b`;
- `tagline` below it at about 44px, both imported from `src/site.ts` (as `og:image:alt` is), broken after "Every PDF job," so both lines fit inside a centred 630px square;
- the site's system font stack;
- centred on both axes.

Before it saves anything, it asks Chromium through the DevTools protocol (`CSS.getPlatformFontsForNode`) which fonts it really drew, and writes nothing if one is Inter, a banned font. Found while building: on the agent's Linux machine `system-ui` resolves to Inter, so the committed image was made with a `FONTCONFIG_FILE` that rejects Inter, and the site's stack fell through to Liberation Sans (Arial's metrics). The stack in the script is unchanged. It saves a PNG screenshot to `public/social.png`. The script is run by hand when the image should change, and the PNG is committed. It is not rebuilt in CI, because a different machine's fonts would change its bytes.

- **No picture, icon, border, shadow or gradient,** following "Look and feel" and "Banned patterns". Light colours only: a link preview is not on the visitor's device setting.
- **The tagline guard.** The image and its alt text say "done in your browser", which stops being true once a server tool ships. A unit test in `tests/unit/site.test.ts` fails while `tagline` contains "browser" or "device" and any published tool has `runsIn !== 'browser'`. Its message says the change must stop and ask the owner for a new tagline (the owner's text, set in `SPEC.md` "Names"), then make `public/social.png` again with `scripts/social-image.mjs`. A test entry with a server tool proves it trips.
- **Centred, not left-aligned like the pages,** because several apps crop link images to a centred square and would cut a left-aligned name.
- **Alternative considered:** drawing it at build time with a rasteriser library (resvg, sharp, satori). Rejected: that is a new dependency for one fixed picture.
- **Alternative considered:** an SVG. Rejected: link previews mostly do not show SVG.

## Effect on page weight and late loading

- No script or stylesheet is added, and `weigh` counts HTML, CSS and JavaScript only. Each page gains its head tags: about 0.4 KB raw, under 0.2 KB by gzip. Tool pages also gain the JSON-LD, about 0.6 KB raw and under 0.3 KB by gzip, plus the hub link. The home page does not change.
- The social image is not fetched by any page.
- The task measures the largest page before and after against the 100 KB budget.
- WebAssembly is still fetched only after a file is picked; nothing here touches the worker.

## Dependencies

None new. Playwright (Apache-2.0, already pinned at 1.63.0) runs the social-image script. `LICENSES.md` needs no new line. If the committed image counts as a project asset, it is made only from the site's own words and colours, with a system font rendered by the machine that made it.

## Threats considered

- **Text that escapes the JSON-LD block.**
  - The threat: a registry name or description holding `</script>` or `<!--` would end or confuse the block, and a later page could carry runnable script.
  - Handling: decision 3's escaping, a unit test with a hostile test entry, and check 5's raw-character test on every built page. `Base` takes the object, not text, and escapes it itself, so its one `set:html` cannot receive raw text. The escaping and check:seo's raw-character check are the gate. The CSP is not a gate against injection at build time: the CSP step hashes every runnable inline block it finds in the built page. Text that broke out of the block into a runnable script would be hashed and allowed. `check:csp` would only catch it if it fell outside the rules it checks.
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
- [A visible "All tools in …" link on 17 pages and six new hub pages are pages the owner has not reviewed.] → The words are drafts for the page text review in issue #7, with screenshots at 360px and 1280px in the pull request.
- [Leaving placeholders out of the sitemap reads against "the sitemap lists every page".] → They are pages saying "not written yet". Owner question 2 asks, and the default is easy to undo: mark the footer pages written. Until then the pull request reports that "Definition of done" item as not passed.
- [GitHub Pages also serves `/merge-pdf.html` beside `/merge-pdf`.] → The canonical tag names the address without `.html`, which is what canonical tags are for.

## Migration Plan

No data or address changes. Nothing published moves. Rollback is a revert.

Owner steps at launch, recorded here and repeated in the pull request. These are not agent actions:
1. Choose the domain and host (Open decisions). The launch build then sets `SITE_ORIGIN` to that origin with `SITE_BASE=/`.
2. Register the site in Google Search Console and Bing Webmaster Tools on launch day, and submit `https://<domain>/sitemap.xml` in each. Verify ownership by a DNS record, an HTML file or a meta tag, never through Google Analytics or Google Tag Manager, which would add a third-party script. A file or meta tag is added in its own small change.
3. Run two or three tool pages through Google's Rich Results Test, and record the result. "Not eligible: missing rating" is expected; see Risks.
4. Check a link preview of the home page and one tool page in one or two apps the owner uses.

## Open Questions

None that change the approach. The owner questions in proposal.md each have a default this design builds, and each is a one-line change to undo. Questions 1 to 3 must be answered before launch.
