# Tasks: add-search-basics

This change adds no tool, so the usual tool order is followed in spirit: the registry first, then the plain builders and their unit tests in place of an engine, then the pages and their words, then the build check, the end-to-end tests, the no-upload tests, the screenshots and the panel. There is no worker wiring and no engine. The home page does not change (design.md decision 5).

## 1. Registry and settings

- [x] 1.1 In `src/tools/registry.ts`, give `Group` these fields, filled for all seven groups with the draft words and flags in design.md decision 4:
  - `slug`, typed as a new `HubSlug` union;
  - `title`, `description` and `sentence`;
  - `claimsDevice`.

  Mark the words as drafts for the owner, beside the existing comment. Extend the top comment to say why the file must keep only `import type` lines: `check-seo.mjs` imports it in Node.

  Extend `tests/unit/registry.test.ts` with the checks in `tool-registry` "Seven groups":
  - hub addresses against the 54 catalogue slugs and the reserved addresses, which are built from `footerLinks` plus `/404`, `/sitemap.xml` and `/robots.txt`;
  - unique titles and descriptions across tool pages and hub pages;
  - the device-claim guard of decision 4: title, sentence and description joined and matched against `/device|browser|upload|never leaves|not sent/i`, which requires `claimsDevice: true`, and `claimsDevice: true`, which requires `runsIn: 'browser'` for every published tool in the group.

  Add a test entry with a server tool in a `claimsDevice` group, and assert that the guard fails and names the group.

  Verify: `npm test` passes. A throwaway hub slug of `merge-pdf` or `about` makes it fail, and so does a throwaway hub sentence saying "in your browser" with `claimsDevice: false` (neither committed).
- [x] 1.2 In `src/site.ts`, add `defaultOrigin`, `isSiteOrigin`, `isSiteBase` (moved from `astro.config.mjs`) and `absoluteUrl` (design.md decision 1). Give each `footerLinks` entry `written: boolean`, `false` for all five (decision 6).

  In `astro.config.mjs`, import them: read `SITE_ORIGIN` (default `defaultOrigin`), refuse anything `isSiteOrigin` refuses with a message naming what it takes, check `SITE_BASE` with `isSiteBase`, and pass the origin as `site`. Add a comment by `baseURL` in `playwright.config.ts` naming `defaultOrigin`.

  Extend `tests/unit/site.test.ts`:
  - `absoluteUrl` at `/` and under `/pdfkaro`, for the home page and a tool page, using `https://example.org`;
  - each kind of refused origin in `seo` "A setting that is not a plain origin";
  - the tagline guard of decision 9. The test fails while `tagline` contains "browser" or "device" and any published tool has `runsIn !== 'browser'`, with a message saying the change must stop and ask the owner for a new tagline, then run `scripts/social-image.mjs` again. A test entry with a server tool proves it trips.

  Verify:
  - `npm test` passes;
  - `SITE_ORIGIN=https://example.org/x npm run build` stops with the message;
  - `npm run build` with no setting succeeds.
- [x] 1.3 In `package.json`, raise `engines.node` to `>=22.18`. Verify: `node -e "import('./src/tools/registry.ts').then(m => console.log(m.groups.length))"` prints 7, and `npm ci` gives no engine warning on the CI Node.

## 2. Builders (in place of an engine)

- [x] 2.1 Write `src/tools/seo.ts` with:
  - `toolStructuredData`;
  - `jsonForScript`, exactly `JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')` (decision 3);
  - `sitemapPaths` and `sitemapXml` (decision 7, XML-escaped `loc`);
  - `robotsTxt`.

  Add `hubPages(groups, tools, base)` to `src/tools/queries.ts`, built on `groupsWithItems` (decision 4). `GroupWithItems` gains no `href`.

  Write `tests/unit/seo.test.ts` covering:
  - the exact JSON-LD for `/merge-pdf` and `/unlock-pdf` ("Remove a password", "Protect");
  - no `offers`, `aggregateRating` or `review` key;
  - a hostile test entry whose name and description hold `</script><!--&>`. The output must hold no raw `<`, `>` or `&`, must hold the exact escapes `\u003c`, `\u003e` and `\u0026` (JSON escapes, not `&lt;` or other HTML entities), and must parse back to the same text;
  - sitemap paths that hold every page of `allPages`, the six hubs and the home page, and no footer page with `written: false` and no `/404`;
  - XML escaping of an `&` in a test path;
  - `robotsTxt` at `/` and under `/pdfkaro`;
  - `hubPages` giving the same groups as `groupsWithItems` and leaving out "Read and check".

  Extend `tests/unit/queries.test.ts` for `hubPages`. Verify: `npm test` passes.

## 3. Pages and page words

- [x] 3.1 Change `src/layouts/Base.astro` as in design.md decision 2:
  - a required `path: string | null`;
  - an optional `structuredData` object, which `Base` passes through `jsonForScript` itself into its one `set:html`;
  - the canonical and social tags, with `og:image:alt` built from `siteName` and `tagline`;
  - `noindex` for a footer page with `written: false` or under a sub-path (one tag).

  Pass `path` from `index.astro` (`/`), from each site page (taken from its `footerLinks` entry) and from `404.astro` (`null`).

  Added while building: `footerPage(href)` in `src/site.ts`, which each site page uses to take its path from its `footerLinks` entry and which throws for a path with no entry (tested with `/nope`).

  Added while building: `scripts/check-csp.mjs` refused the absolute canonical address as "a <link> points to another site". Let a link whose only `rel` is `canonical` carry an absolute address there, keep refusing every other link (including `rel="canonical stylesheet"`), and cover each case in `tests/unit/csp.test.ts` (design.md decision 2).

  Verify: `npm run check` passes. After `npm run build`, `dist/about.html`, `dist/index.html` and `dist/404.html` show the tags of `seo` "Social tags" and "Canonical tag" (none on 404), and only About carries `noindex`.
- [x] 3.2 In `src/pages/[slug].astro`, add hub pages from `hubPages` beside the tool pages. A hub page renders as `Base` (its title, description and path), then `<h1>` the group name, `<p class="lede">` its sentence and a `ToolList` of its pages. Pass each tool page its structured-data object (`toolStructuredData(…)`, not text) and its group to `ToolShell`.

  Verify: `npm run build` makes six hub files and no `read-and-check.html`; `npm run check:csp` passes with no new hash; the hub pages load no script.
- [x] 3.3 In `ToolShell`, add the `group` prop and the "All tools in {name}" link after the related tools (decision 5):
  - `class="tap"`;
  - a clear gap above it in `ToolShell.module.css`, with no heading and no border;
  - `hasBelow` gains `|| Boolean(group)`.

  Added while building: `groupOf(groups, tool)` (throws for a group not in the registry) and `hubLink(group, base)` in `queries.ts`; `[slug].astro` looks the group up once and passes it to `toolStructuredData` and `hubLink`. `toolStructuredData` takes no `tool` (stage 2 review).

  In `ToolList`, add `role="list"` to its `ul`. `ToolDirectory` and the home page are not changed. Update `tests/unit/components.test.tsx` and `tests/unit/ToolList.test.tsx`.

  Verify: `npm test` passes. The rendered HTML has one hub link per tool page, a tool page with no related tools still shows it, and every `ToolList` has `role="list"`.
- [x] 3.4 Add `src/pages/sitemap.xml.ts` and `src/pages/robots.txt.ts` as static endpoints using `import.meta.env.SITE` and `BASE_URL`. Verify: `npm run build` writes `dist/sitemap.xml` with 24 `loc` entries (home, 6 hubs, 17 tool pages) under `http://localhost:4321/`, and `dist/robots.txt` naming it.
- [x] 3.5 Write `scripts/social-image.mjs` (decision 9): `setContent`, every route aborted, the text from `siteName` and `tagline` in `src/site.ts`, and no file written if Chromium drew the text in Inter (added while building: the build machine's `system-ui` is Inter). Run it once to make `public/social.png`. Verify:
  - the file is a 1200×630 PNG under 100 KB, with only the chunk types on check:seo's allow-list;
  - it shows only "PDFkaro" and the tagline on `#fbfaf6`, centred, with both lines whole in a centred 630px square crop (look at it, and at the crop);
  - `dist/social.png` exists after a build;
  - `npm run check:worker` and `npm run weigh` still pass (neither counts it).
- [x] 3.6 Check the changed and new pages against "Banned patterns" and "How the words should read": a hub page, a tool page, About and 404. Search their visible text, and every hub title, sentence and description, for the banned words, "unlock", exclamation marks, "100%", "never leaves", "secure" and anything about servers. Verify: nothing is found, and this is recorded in the pull request.

- [x] 3.7 Added at stage 2 (privacy): each hub description claims no more than its tools' own pages. Edit and sign: "The file stays on your device and is not uploaded." Protect: "The file stays on your device. This site does not upload the file or the password." (the browser may save and sync a new password). "Make smaller and fix" sentence: "Tools that make a PDF file smaller." The design table follows. Verify: `npm test` and `npm run check:seo` pass.

## 4. Build check

- [x] 4.1 Write `scripts/check-seo.mjs` with the eight checks of design.md decision 8. Use its own code for every expected value. Import only data and the setting checks (`defaultOrigin`, `isSiteOrigin`, `isSiteBase`, `footerLinks`, `siteName`) from `site.ts`, and data from `registry.ts`. Export pure functions. Add `"check:seo"` to `package.json`.

  Write `tests/unit/check-seo.test.ts`, using `https://example.org` as the origin, that feeds made-up pages and files, each with one problem:
  - no canonical, a wrong canonical, two canonicals;
  - a missing `og:url`, an `og:title` unlike the title;
  - an image of the wrong size, a file that is not PNG, a PNG with a `tEXt` chunk;
  - a repeated title, a 60-character title, a 155-character description;
  - a JSON-LD block with a raw `<`, a missing breadcrumb step, an extra `offers` key, a wrong name;
  - a JSON-LD block on a hub page;
  - a hub page listing a wrong tool, a missing hub file;
  - a sitemap missing a tool page, a sitemap listing `/about` or `/404`, a `loc` with no page;
  - `noindex` on a written page, an unwritten page without its placeholder sentence.

  Also feed a good page, which passes. Verify: `npm test` passes and `npm run check:seo` passes on the real build.
- [x] 4.2 Make `scripts/check-base.mjs` build with `SITE_ORIGIN=https://example.org` and run the search check on its sub-path build. Verify: `npm run check:base` passes. Then edit a canonical in `dist-base` by hand and run the check function on it; it fails.
- [x] 4.3 Add a "Search tags and sitemap" step (`npm run check:seo`) to `.github/workflows/ci.yml` after "Content Security Policy". In `pages.yml`'s build job:
  - add a step with `env: OWNER: ${{ github.repository_owner }}` that runs `echo "SITE_ORIGIN=https://${OWNER,,}.github.io" >> "$GITHUB_ENV"`, so the expression is never put into the script;
  - run `npm run check:seo` after "Build for the preview address".

  Verify:
  - both files parse as YAML;
  - the CI step order is build, weigh, check:worker, check:base, check:csp, check:seo;
  - a local build with `SITE_BASE=/pdfkaro` and the preview's origin passes `npm run check:seo`. This is a local run only; no committed file names the owner's origin.
- [x] 4.4 Grep the root build, the sub-path build and the preview-style build for `pdfkaro.com`, `pdfkaro.in` and `pdfkaro.app`. Grep `tests/` and `scripts/` for the owner's GitHub Pages origin. Verify: no match (`seo`, "The domain is not bought"; design.md decision 1).

## 5. End-to-end tests

- [x] 5.1 Add the hub pages to `tests/e2e/pages.ts`, so `site.spec.ts`'s look, title, 44px and no-script tests cover them. In `site.spec.ts`, add a test that opens the home page, a hub page and a tool page and checks each canonical equals `page.url()`, and that the 404 page has none. Verify: `npm run e2e -- site.spec.ts --trace off` passes at 360px and 1280px.
- [x] 5.2 In `site.spec.ts`, add tests that:
  - on a hub page, Tab reaches every tool link in order, and the list has `role="list"`;
  - on a tool page, the "All tools in …" link follows the related links, is at least 44px tall, and opens the hub page;
  - the home page's group headings hold no link (unchanged).

  Verify: `npm run e2e -- site.spec.ts home.spec.ts --trace off` passes at both widths, with `home.spec.ts` unchanged.
- [x] 5.3 Run the full `npm run e2e -- --trace off`. This change touches no engine, so instead of running each tool against every file in `tests/fixtures/`, this confirms that every tool's existing fixture runs and thumbnails still pass with the new head tags and the changed `ToolShell` and `ToolList`. Verify: all pass, with no policy violation recorded. The pull request says tool behaviour is unchanged and the fixture runs were the existing ones.

## 6. No-upload, weight, licences, hand checks and screenshots

- [x] 6.1 Run `no-upload.spec.ts` and every tool's no-upload test with `tests/e2e/no-upload.ts` unchanged. Confirm in a test run that no page requests `social.png`, `sitemap.xml` or `robots.txt`. Verify: they pass, and `git diff main -- tests/e2e/no-upload.ts` is empty.
- [x] 6.2 Run `npm run weigh` before (on `main`) and after, and record each page's size in the pull request. Verify: every page stays under 100 KB, no page grows by more than 1 KB by gzip, and the home page's size is unchanged apart from its head tags.
- [x] 6.3 Confirm no dependency was added, so `LICENSES.md` needs no new line. Verify: `git diff main -- package-lock.json` is empty and `package.json` changes only the script and `engines`.
- [ ] 6.4 Add to the hand checks in issue #7: with VoiceOver in Safari (macOS and iOS), a hub page and a tool page's related tools are announced as a list with a count, and the "All tools in …" link reads as shown. Verify: the issue lists it.
- [x] 6.5 Take screenshots and put them in `.github/pr-screenshots/search/`:
  - the "Organise pages" and "Protect" hub pages at 360px and 1280px in light, and the "Organise pages" hub page at 360px in dark;
  - `/merge-pdf` scrolled to its related tools and hub link, at 360px and 1280px, beside the same view from `main`;
  - the social image itself.

  The home page is not shot, because it does not change. Verify by looking at each against "Banned patterns" and the 44rem column.

## 7. Review

- [x] 7.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass and none are skipped.
- [ ] 7.2 Run the review panel, stage 2 (the `review-panel` skill), including the ux-designer, the security reviewer (JSON-LD escaping, the origin check, the image script) and the program manager (owner questions). Settle every must-fix finding. In the pull request description, put:
  - the verdicts;
  - the evidence from 3.6, 4.4, 6.2 and 6.5;
  - the six owner questions from proposal.md, with questions 1 to 3 marked as needing an answer before launch;
  - a statement that the "Definition of done, The site" sitemap and hub items are not passed until the owner answers questions 2 and 3;
  - the owner's launch steps from design.md "Migration Plan".

  Verify: every panel agent approves.

## Workflow follow-up

- Stage 1 findings are settled in these artifacts (proposal, design, tasks and the deltas).
- After the pull request is merged:
  - Run `/opsx:archive` so the deltas join `openspec/specs/`.
  - Add this change to "Where the project stands" in CLAUDE.md, and add `npm run check:seo` and `SITE_ORIGIN` to its Commands.
  - Add the six owner questions under "Questions waiting for the owner". Mark questions 1 to 3 as needing an answer before launch, and say so beside the Phase 1 gate note in "Where the project stands", because they decide whether the "Definition of done, The site" sitemap and hub items pass.
  - Add the hub and hub-link words to the page text review in issue #7.
- The Privacy page draft change sets `/privacy` to `written: true` in `footerLinks`.
- A tool that joins a group with a hub page updates that group's description prose in its own change, matching its own page's words about where files go (also said in the comment above `groups` in `registry.ts`). Any later tool whose addition makes its group's hub words inaccurate updates them in its own change. The device-claim guard forces this for a server tool; Repair PDF must update "Make smaller and fix". The first server tool trips the tagline guard: its change stops and asks the owner for a new tagline, then makes the social image again. The first "Read and check" tool's change writes that group's words, and gets its hub page with no extra work.
