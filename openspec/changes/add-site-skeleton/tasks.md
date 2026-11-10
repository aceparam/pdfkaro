# Tasks

This change handles no file, so the engine, no-upload and fixtures tasks that a tool change carries do not apply.

## 1. Project

- [x] 1.1 Add `package.json`, `astro.config.mjs` and `tsconfig.json` for Astro with static output, TypeScript 6 and React
- [x] 1.2 Add `.gitignore` for build output, dependencies and test results
- [x] 1.3 Record the owner's React decision in `CLAUDE.md` and update step 1 of Phase 0 there. Do not edit `SPEC.md`. Add the preview deploy host and page budget questions to "Questions waiting for the owner"

## 2. Registry and logic

- [x] 2.1 Add `src/tools/catalogue.ts` with the catalogue slugs as a type
- [x] 2.2 Add `src/tools/registry.ts` with the types, the seven groups and the Merge PDF entry
- [x] 2.3 Add `src/tools/queries.ts` and `src/tools/filter.ts`
- [x] 2.4 Add unit tests for the catalogue, the registry, the queries (with a made-up tool that has three pages) and the filter

## 3. Styles and components

- [x] 3.1 Write `src/styles/site.css` from the "Look and feel" table, with `SPEC.md` values where the designs differ and proposed values marked
- [x] 3.2 Add `SiteHeader`, `SiteFooter`, `ToolList`, `ToolShell` and `OwnerPlaceholder`, each with its scoped styles where it needs them
- [x] 3.3 Add `ToolDirectory` with the filter behaviour in design decision 6

## 4. Pages

- [x] 4.1 Add `src/layouts/Base.astro`
- [x] 4.2 Add the home page with the `ToolDirectory` island
- [x] 4.3 Add `src/pages/[slug].astro`, with the widget slot and the text slot empty
- [x] 4.4 Add the 404 page and the placeholder pages for About, Privacy, Changes, Known problems and Contact, each with its own wording

## 5. Checks

- [x] 5.1 Add ESLint with the rule that components import only `filter` and types from `src/tools/`
- [x] 5.2 Add the type check command
- [x] 5.3 Add the page weight script
- [x] 5.4 Add Playwright and the end-to-end tests listed in design decision 8
- [x] 5.5 Add the CI workflow, and run OpenSpec in CI from the lockfile

## 6. Housekeeping

- [x] 6.1 Start `LICENSES.md` with every dependency added
- [x] 6.2 List the commands in `CLAUDE.md` and add `@fission-ai/openspec` as a dev dependency
- [x] 6.3 Run the page weight script and record the numbers for the home page, the Merge PDF page and a placeholder page. By gzip: home 72.2 KB, Merge PDF 1.7 KB, About 1.6 KB. By brotli: 62.3, 1.3, 1.3
- [x] 6.4 Run `npm audit`, apply `npm audit fix`, and record the result. `npm audit fix` could not fix the `minimatch` advisory without downgrading ESLint, so `minimatch` is pinned to the patched 11.0.5 under `overrides`. `npm audit` now finds 0 vulnerabilities and lint still runs
- [x] 6.5 Take screenshots of each page at 360px and 1280px, in light and dark mode, check each against "Banned patterns", and show the owner the dark palette (first done for five pages before the control edge changed; redone in 7.10)
- [x] 6.6 Run `openspec validate --all --strict`
- [x] 6.7 Run the review panel (see the review-panel skill) and resolve its findings

## 7. Decisions and review fixes

- [x] 7.1 Apply the decisions of 10 Nov 2026: control edges at `#5c5c5c`, and record all eight decisions in `CLAUDE.md` as the agent's, not the owner's
- [x] 7.2 Add the `look-and-feel` spec delta for the control edge
- [x] 7.3 Move the marking and counting of filtered tools into `filterGroups` and unit test it with several tools and groups
- [x] 7.4 Add the catalogue test that compares `catalogue.ts` with the tables in `SPEC.md`
- [x] 7.5 Build the end-to-end page lists from the registry and the footer links
- [x] 7.6 Put `site.css` in a cascade layer so stylesheet order cannot change the result
- [x] 7.7 Make the page weight script fail on an empty build and on files no page is seen to load
- [x] 7.8 Block `import()` of `src/tools/` from components, scope the `minimatch` override, and fold OpenSpec into the one CI workflow
- [x] 7.9 Say what to try when no tool matches; size body text in rem; reword the home page description; check that typing in the filter sends and stores nothing
- [x] 7.10 Retake screenshots of all eight pages at 360px and 1280px, in light and dark mode, keep both widths of every page in `screenshots/`, and put the dark ones in the pull request for the owner
- [x] 7.11 Turn off Astro's usage reporting for agent sessions by adding `ASTRO_TELEMETRY_DISABLED` to `.claude/settings.json`, say how to turn it off on a person's own machine in `CLAUDE.md`, and name the settings change in the pull request
- [x] 7.12 Add a test that renders `ToolList` and checks that only a hidden item is marked hidden

## 8. Preview on GitHub Pages

- [x] 8.1 Take the site's base path from `SITE_BASE`, and pass every link the site writes through `withBase`
- [x] 8.2 Add `noindex` to pages built under a sub-path, and check the root build does not carry it
- [x] 8.3 Add `npm run check:base`, unit tests for `withBase` and the list links, and run the check in CI
- [x] 8.4 Add `.github/workflows/pages.yml` to publish the preview on pushes to `main` and `claude/**`
- [x] 8.5 Record the owner's choice of GitHub Pages in `CLAUDE.md`, with the two settings the owner has to change
- [ ] 8.6 Run the review panel on these changes and resolve its findings
- [ ] 8.7 Confirm on the first deploy that the preview opens, that `/merge-pdf` and a missing page work, and give the owner the address
