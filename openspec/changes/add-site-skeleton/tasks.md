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
- [x] 6.5 Take screenshots of each page at 360px and 1280px, in light and dark mode, check each against "Banned patterns", and show the owner the dark palette
- [x] 6.6 Run `openspec validate --all --strict`
- [ ] 6.7 Run the review panel (see the review-panel skill) and resolve its findings
