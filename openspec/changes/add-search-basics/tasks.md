# Tasks: add-search-basics

This change adds no tool, so the usual tool order is followed in spirit: the registry first, then the plain builders and their unit tests in place of an engine, then the pages and their words, then the build check, the end-to-end tests, the no-upload tests, the screenshots and the panel. There is no worker wiring and no engine.

## 1. Registry and settings

- [ ] 1.1 In `src/tools/registry.ts`, give `Group` the fields `slug` (a new `HubSlug` union), `title`, `description` and `sentence`, and fill them for all seven groups with the draft words in design.md decision 4.
  - Mark the words as drafts for the owner, beside the existing comment.
  - Extend the top comment to say why the file must keep only `import type` lines (`check-seo.mjs` imports it in Node).
  - Extend `tests/unit/registry.test.ts` with the checks in `tool-registry` "Seven groups", "The registry test checks the groups" and "A hub's words claim the device". Include a test entry with a server tool to prove the device-claim check fails.

  Verify: `npm test` passes, and a throwaway hub slug of `merge-pdf` or `about` makes it fail (not committed).
- [ ] 1.2 In `src/site.ts`, add `absoluteUrl(origin, base, path)`, `isSiteOrigin(value)` (the two patterns of design.md decision 1) and `unwrittenPages`. In `astro.config.mjs`, read `SITE_ORIGIN` (default `http://localhost:4321`), refuse anything `isSiteOrigin` refuses with a message naming what it takes, and pass it as `site`. Extend `tests/unit/site.test.ts`:
  - for `absoluteUrl` at `/` and under `/pdfkaro`, for the home page and a tool page;
  - for each kind of refused origin in `seo` "A setting that is not a plain origin".

  Verify: `npm test` passes; `SITE_ORIGIN=https://example.org/x npm run build` stops with the message; `npm run build` with no setting succeeds.
- [ ] 1.3 In `package.json`, raise `engines.node` to `>=22.18`. Verify: `node -e "import('./src/tools/registry.ts').then(m => console.log(m.groups.length))"` prints 7, and `npm ci` gives no engine warning on the CI Node.

## 2. Builders (in place of an engine)

- [ ] 2.1 Write `src/tools/seo.ts` with:
  - `toolStructuredData` and `jsonForScript` (decision 3);
  - `sitemapPaths` and `sitemapXml` (decision 7, XML-escaped `loc`);
  - `robotsTxt`.

  Add `hubPages(groups, tools)` and the group `href` in `groupsWithItems` to `src/tools/queries.ts`. Write `tests/unit/seo.test.ts` covering:
  - the exact JSON-LD for `/merge-pdf` and `/unlock-pdf` ("Remove a password", "Protect");
  - no `offers`, `aggregateRating` or `review` key;
  - a hostile test entry whose name and description hold `</script><!--&>`, giving no raw `<`, `>` or `&` and parsing back to the same text;
  - sitemap paths that hold every page of `allPages`, the six hubs and the home page, and no unwritten page or `/404`;
  - XML escaping of an `&` in a test path;
  - `robotsTxt` at `/` and under `/pdfkaro`;
  - `hubPages` leaving out "Read and check".

  Extend `tests/unit/queries.test.ts` for `href`. Verify: `npm test` passes.

## 3. Pages and page words

- [ ] 3.1 Change `src/layouts/Base.astro` as in design.md decision 2: a required `path: string | null`, an optional `structuredData`, the canonical and social tags, and `noindex` for `unwrittenPages` or a sub-path (one tag). Pass `path` from:
  - `index.astro` (`/`);
  - each site page (its own path);
  - `404.astro` (`null`).

  Verify: `npm run check` passes, and `npm run build` then reading `dist/about.html`, `dist/index.html` and `dist/404.html` shows the tags of `seo` "Social tags" and "Canonical tag" (none on 404) and `noindex` on About only.
- [ ] 3.2 In `src/pages/[slug].astro`, add hub pages from `hubPages` beside the tool pages. Render a hub page as `Base` (its title, description, path), `<h1>` the group name, `<p class="lede">` its sentence and `ToolList` of its pages. Pass each tool page its JSON-LD (`jsonForScript(toolStructuredData(…))`) and its group to `ToolShell`. Verify: `npm run build` makes six hub files and no `read-and-check.html`; `npm run check:csp` passes with no new hash; the hub pages load no script.
- [ ] 3.3 In `ToolShell`, add the `group` prop and the "All tools in {name}" link after the related tools (decision 5, `class="tap"`). In `ToolDirectory`, make each group heading a link (`href` from `GroupWithItems`) at least 44px tall in `ToolDirectory.module.css`. Update `tests/unit/components.test.tsx` for both. Verify: `npm test` passes, and the rendered HTML has one hub link per tool page and one heading link per group.
- [ ] 3.4 Add `src/pages/sitemap.xml.ts` and `src/pages/robots.txt.ts` as static endpoints using `import.meta.env.SITE` and `BASE_URL`. Verify: `npm run build` writes `dist/sitemap.xml` with 24 `loc` entries (home, 6 hubs, 17 tool pages) under `http://localhost:4321/`, and `dist/robots.txt` naming it.
- [ ] 3.5 Write `scripts/social-image.mjs` (decision 9) and run it once to make `public/social.png`. Verify:
  - the file is a 1200×630 PNG under 100 KB;
  - it shows only "PDFkaro" and the tagline on `#fbfaf6`, centred, both lines whole in a centred 630px square crop (look at it, and at the crop);
  - `dist/social.png` exists after a build;
  - `npm run check:worker` and `npm run weigh` still pass (neither counts it).
- [ ] 3.6 Check the changed and new pages against "Banned patterns" and "How the words should read": the home page, a hub page, a tool page, About and 404. Search their visible text and every hub title, sentence and description for the banned words, "unlock" and exclamation marks. Verify: nothing found, recorded in the pull request.

## 4. Build check

- [ ] 4.1 Write `scripts/check-seo.mjs` with the eight checks of design.md decision 8. Use its own code for every expected value; import only data from `registry.ts` and `site.ts`. Export pure functions. Add `"check:seo"` to `package.json`. Write `tests/unit/check-seo.test.ts` feeding made-up pages and files, each with one problem:
  - no canonical, a wrong canonical, two canonicals;
  - a missing `og:url`, an `og:title` unlike the title;
  - an image of the wrong size, a file that is not PNG;
  - a repeated title, a 60-character title, a 155-character description;
  - a JSON-LD block with a raw `<`, a missing breadcrumb step, an extra `offers` key, a wrong name;
  - a JSON-LD block on a hub page;
  - a hub page listing a wrong tool, a missing hub file;
  - a sitemap missing a tool page, a sitemap listing `/about` or `/404`, a `loc` with no page;
  - `noindex` on a written page, a page on the unwritten list without its placeholder sentence.

  Also feed a good page, which passes. Verify: `npm test` passes and `npm run check:seo` passes on the real build.
- [ ] 4.2 Make `scripts/check-base.mjs` build with `SITE_ORIGIN=https://example.org` and run the search check on its sub-path build. Verify: `npm run check:base` passes. Then edit a canonical in `dist-base` by hand and run the check function on it; it fails.
- [ ] 4.3 Add a "Search tags and sitemap" step (`npm run check:seo`) to `.github/workflows/ci.yml` after "Content Security Policy". In `pages.yml`'s build job:
  - set `SITE_ORIGIN` to `https://` plus the lower-cased `github.repository_owner` plus `.github.io`, in a step that writes it to `GITHUB_ENV`;
  - run `npm run check:seo` after "Build for the preview address".

  Verify: both files parse as YAML; the CI step order is build, weigh, check:worker, check:base, check:csp, check:seo; a local build with `SITE_BASE=/pdfkaro SITE_ORIGIN=https://aceparam.github.io` passes `npm run check:seo`.
- [ ] 4.4 Grep the root build, the sub-path build and the preview-style build for `pdfkaro.com`, `pdfkaro.in` and `pdfkaro.app`. Verify: no match (`seo`, "The domain is not bought").

## 5. End-to-end tests

- [ ] 5.1 Add the hub pages to `tests/e2e/pages.ts`, so `site.spec.ts`'s look, title, 44px and no-script tests cover them. In `site.spec.ts`, add a test that opens the home page, a hub page and a tool page and checks each canonical equals `page.url()`. Also check that the 404 page has none. Verify: `npm run e2e -- site.spec.ts --trace off` passes at 360px and 1280px.
- [ ] 5.2 In `home.spec.ts`, add tests that:
  - each group heading is a link to its hub page, reached by Tab and opened by Enter;
  - filtering to no match in a group hides its heading link from focus.

  Add a hub page test: Tab reaches every tool link in order. Add a tool page test: the "All tools in …" link follows the related links and opens the hub page. Verify: `npm run e2e -- home.spec.ts site.spec.ts --trace off` passes at both widths.
- [ ] 5.3 Run the full `npm run e2e -- --trace off`. This change touches no engine, so instead of running each tool against every file in `tests/fixtures/`, this confirms that every tool's existing fixture runs and thumbnails still pass with the new head tags and the changed `ToolShell`. Verify: all pass, with no policy violation recorded; the pull request says that tool behaviour is unchanged and that the fixture runs were the existing ones.

## 6. No-upload, weight, licences and screenshots

- [ ] 6.1 Run `no-upload.spec.ts` and every tool's no-upload test with `tests/e2e/no-upload.ts` unchanged. Confirm in a test run that no page requests `social.png`, `sitemap.xml` or `robots.txt`. Verify: they pass, and `git diff main -- tests/e2e/no-upload.ts` is empty.
- [ ] 6.2 Run `npm run weigh` before (on `main`) and after, and record each page's size in the pull request. Verify: every page stays under 100 KB, and no page grows by more than 1 KB by gzip.
- [ ] 6.3 Confirm no dependency was added, so `LICENSES.md` needs no new line. Verify: `git diff main -- package-lock.json` is empty and `package.json` changes only the script and `engines`.
- [ ] 6.4 Take screenshots at 360px and 1280px, light, of:
  - the home page;
  - the "Organise pages" and "Protect" hub pages;
  - `/merge-pdf` scrolled to its related tools and hub link;
  - the social image itself.

  Also take one at 360px in dark of a hub page. Put them in `.github/pr-screenshots/search/`, with the same home and Merge PDF views from `main` beside them. Verify by looking at each against "Banned patterns" and the 44rem column.

## 7. Review

- [ ] 7.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run weigh`, `npm run check:worker`, `npm run check:base`, `npm run check:csp`, `npm run check:seo`, `npm run e2e -- --trace off` and `npm run spec`. Verify: all pass and none are skipped.
- [ ] 7.2 Run the review panel, stage 2 (the `review-panel` skill), including the ux-designer, the security reviewer (JSON-LD escaping, the origin check) and the program manager (owner questions). Settle every must-fix finding. In the pull request description, put:
  - the verdicts;
  - the evidence from 3.6, 4.4, 6.2 and 6.4;
  - the owner questions from proposal.md;
  - the owner's launch steps from design.md "Migration Plan".

  Verify: every panel agent approves.

## Workflow follow-up

- Before 1.1: run the review panel, stage 1, on these artifacts and settle its findings here.
- After the pull request is merged:
  - Run `/opsx:archive` so the deltas join `openspec/specs/`. Add this change to "Where the project stands" in CLAUDE.md, add `npm run check:seo` and `SITE_ORIGIN` to its Commands, and add the new owner questions under "Questions waiting for the owner".
  - Add the hub and hub-link words to the page text review in issue #7.
- The Privacy page draft change removes `/privacy` from `unwrittenPages`.
- A later tool that makes its group's hub words untrue, such as the first server tool in "Convert to PDF", updates them in its own change. The first "Read and check" tool's change gets that group's hub page with no extra work.
