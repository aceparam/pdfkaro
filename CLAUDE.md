# PDFkaro

A free website with one page per PDF job. Most jobs run in the visitor's browser; a small server handles the rest. The full specification is in `SPEC.md`.

## Before any work

Read `SPEC.md` from top to bottom. It is the source of truth for what to build, how it should look and when a tool counts as done. Do not edit `SPEC.md` unless the owner asks; if the spec is wrong or unclear, say so and ask.

## Design reference

`design/` holds static screens, a reference stylesheet and screenshots that show how pages should look in each state. Read `design/README.md` before building a page or a component. The screens are a guide: `SPEC.md` and `openspec/specs/` win if they differ, and the README lists what in them is only proposed and still waiting for the owner.

## Where the project stands

**Phase 0, the skeleton**, is under way (see "Build phases" in `SPEC.md`). It is built in these changes:

1. `add-site-skeleton`: the project, registry, stylesheet, first components, home page, placeholder pages and checks. Merged and archived; steps 1, 2, 3, 7, 8 and 9 below.
2. `add-tool-widget`: the Web Worker plumbing and the interactive shared components (`FilePicker`, `PageGrid`, `Result`, and one generic `ToolWidget` island). Steps 4 and 5. Built; not yet mounted on any page.
3. `add-merge-pdf`: Merge PDF end to end, with its page text. Step 6. Proposed; depends on 2.
4. Then: page thumbnails, which Merge PDF needs to pass "Tool page anatomy" in full.

A preview of the site is live at https://aceparam.github.io/pdfkaro/, published by `.github/workflows/pages.yml`. It is public, carries `noindex`, and shows the last push to `main` or a `claude/` branch that passed the checks.

Phase 0, in order:

1. Scaffold the Astro project with static output, TypeScript and React. No Tailwind, no component kit, no icon library.
2. Add `src/tools/registry.ts` with the tool type and the entry for Merge PDF. Generate `pages/[slug].astro` and the home page list from it.
3. Write `src/styles/site.css` from the "Look and feel" table. System fonts, one column, 44rem wide.
4. Build the shared components: `ToolShell`, `FilePicker`, `PageGrid`, `Result`.
5. Set up the Web Worker plumbing: typed messages, progress, cancel, late loading of engines.
6. Build Merge PDF end to end as the first tool: engine, worker, page, tests.
7. Add placeholder About, Privacy, Changes and Known problems pages, clearly marked for the owner to write.
8. Add lint, type check, Vitest and Playwright, and a CI workflow that runs them.
9. Start `LICENSES.md` and list every dependency added so far.

Phase 0 is finished when Merge PDF works end to end on a phone-sized screen and the page passes the look-and-feel test. Do not start Phase 1 before that.

Update this section when a phase gate is passed.

## Owner decisions since the last SPEC.md export

`SPEC.md` is an export of the owner's working doc and is not edited here. Where the owner has decided something since the export, it is listed below and it wins over `SPEC.md` until the export is refreshed.

- **Preview on GitHub Pages (10 Nov 2026).** The owner asked to try the site before signing off the pull request, asked for it to be deployed on GitHub Pages, and chose to deploy the pull request's branch, having been told the preview is public even though the repo is private. This replaces the agent's earlier choice of Cloudflare Pages. How it is done is the agent's choice; see the next section.
- **Merge PDF keeps bookmarks and attachments from the first file only (11 Nov 2026).** The owner chose this over keeping every file's, accepting the gap against "Definition of done". The page says so. Keeping all of them can come later.
- **A merged file has no password or restrictions (11 Nov 2026),** even when an input had them. The page says so.
- **React, not Preact (10 Nov 2026).** The owner asked for a React-based app with reusable components and, offered Preact or React, said to pick whichever helps a later phone app. The interface is written as React components. Astro renders them to static HTML; only interactive parts ship script. `SPEC.md` still says "Preact islands".

## Decisions the agent made for the owner

These are not the owner's own decisions. On 10 Nov 2026 the agent put five questions to the owner, and the owner replied "answer yourself". The agent decided them as below. The owner can overturn any of them, and each is small to undo.

The five that were asked:

- **Control edges.** Inputs and secondary buttons have a `#5c5c5c` edge (`#a8a59c` in dark mode), not the `#d9d6cc` that `SPEC.md` gives for lines and borders. At `#d9d6cc` the edge of a box is faint (1.39 to 1 against the background). Dividers and boxes keep `#d9d6cc`. The change `add-site-skeleton` carries the spec delta for this.
- **Home page filter.** The count of matching tools is read to screen readers and not shown. The words for no match are shown to everyone.
- **Dark colours.** `SPEC.md` gives none. The palette in `src/styles/site.css` is the one to use. The owner is shown it in the pull request.
- **Page budget.** A tool page stays under 100 KB, measured by gzip. React takes about 67 KB of it. If the tool widget cannot fit in the rest, stop and ask the owner: the choice is between a larger budget and swapping React for `preact/compat` on the web, and the second would go against the owner's React decision.
- **Preview deploys.** The agent chose Cloudflare Pages. The owner has since chosen GitHub Pages; see above.

Decided by the agent on 10 Nov 2026 while setting up the GitHub Pages preview, without asking:

- **Which pushes publish.** The owner asked for the pull request's branch. The workflow publishes on every push to `main` or to a `claude/` branch that passes the checks, so the preview keeps following the work. Anyone who can push to those branches can change what the public preview shows. The owner may want this narrowed.
- **Preview pages carry `noindex`,** so the preview address is not indexed in place of the real one.
- **The base path.** A Pages project site sits under the repo name. The build takes the base from `SITE_BASE`, which must be a plain path, and every link the site writes goes through `withBase` in `src/site.ts`.
- **The repo stays private and no domain is used.** Making the repo public to get Pages would settle "Source code" in `SPEC.md`, which is the owner's decision; do not suggest it as a fix.

Three more that the agent decided at the same time without asking, because they go with the ones above:

- **Column position.** The column sits towards the left of a wide screen, as the designs draw it.
- **No white fill for inputs.** The designs proposed one; `SPEC.md` names none.
- **A solid border on placeholder boxes.** The designs proposed a dashed one; `SPEC.md` gives solid lines only.

## How the code is laid out

- `src/tools/registry.ts` is the one place a tool is declared. `catalogue.ts` beside it is a type only.
- `src/tools/queries.ts` and `filter.ts` hold rules as plain functions. `src/hooks/` holds hooks. None of them render.
- `src/components/` holds React components, one folder each, with a CSS Module beside it when it needs styles. Components get what they show through props. From `src/tools/` they may import only `filter` and types, and they never import an engine or a worker; lint enforces this.
- `src/widget/` holds the tool widget's rules as plain functions: the steps a tool goes through (`state.ts`), shared words and numbers (`format.ts`), and the accepted-type check (`accept.ts`).
- `src/engines/` holds engines: pure functions from bytes to bytes, one file per tool under `src/engines/tools/`, named by the tool's id. They use no page and no network; lint enforces this. `types.ts` is the contract.
- `src/workers/` holds the one tool worker, its typed messages, the logic it runs (`worker-core.ts`, tested in Node) and the page's client. The worker is ended after every job.
- `src/pages/` and `src/layouts/` hold thin `.astro` files that read the registry and pass props to components. A component with no `client:` directive ships no script.
- `src/styles/site.css` is the one global stylesheet.

## How work flows

Every change goes through OpenSpec and the review agents. The steps, in order:

1. **Propose.** Run `/opsx:propose` with what you want to build. It writes `proposal.md`, spec deltas, `design.md` and `tasks.md` under `openspec/changes/<name>/`, following the rules in `openspec/config.yaml`. It writes no code.
2. **Review the proposal.** Run the `review-panel` skill, stage 1. Settle every finding in the change artifacts. If an agent says the change is blocked on the owner, stop and ask.
3. **Build.** Run `/opsx:apply`. Build only what `tasks.md` lists; if the work needs something else, update the change first.
4. **Review the work.** Run the `review-panel` skill, stage 2, before opening or updating a pull request. Fix every must-fix finding. Put the panel's verdicts in the pull request description, using `.github/pull_request_template.md`.
5. **Archive.** After the pull request is merged, run `/opsx:archive` so the spec deltas join `openspec/specs/`.

`SPEC.md` stays the source of truth. OpenSpec changes refine it into buildable pieces and never override it. Small fixes with no change in behaviour (a typo, a broken link) can skip steps 1, 2 and 5, but not step 4.

The agents, in `.claude/agents/`:

| Agent | Job |
| --- | --- |
| `program-manager` | Scope, phase, catalogue order, owner decisions, Definition of done |
| `ux-designer` | Page anatomy, states, look and feel, banned patterns, wording, phone use, access |
| `developer` | Builds the tasks of an approved change and fixes review findings |
| `software-architect` | Registry, engine and worker boundaries, late loading, page weight, dependencies |
| `security-reviewer` | Hostile files, Content Security Policy, supply chain, server limits and isolation |
| `privacy-reviewer` | That no browser tool sends file data, and that the words on the page match the code |
| `code-reviewer` | Bugs, missing tests, work that does not match its change |

All but `developer` are read-only.

## Rules

- No code without an OpenSpec change behind it, and no pull request without the review panel. See "How work flows".
- One tool per pull request, with its engine, tests, page text and registry entry together.
- Build tools in catalogue order within a phase.
- Engines are pure functions with no DOM access, run in a Web Worker and load only after a file is picked.
- Before adding a library, check that it is still maintained, then add a line to `LICENSES.md`.
- Anything under "Open decisions" in `SPEC.md` belongs to the owner. Use the assumed default from that table, and ask before going beyond it.
- Never write the About, Changes or Known problems pages. Never invent a person, a backstory or a motive for the site.
- Check every page you touch against "Banned patterns" in `SPEC.md` before you call it done. When a design question is not answered, choose the plainer option.
- A tool is done only when it passes "Definition of done" in `SPEC.md`. Do not mark work finished with failing or skipped tests.
- Include screenshots at 360px and 1280px wide in every pull request that changes a page.

## Questions waiting for the owner

- **Image to PDF (`/image2pdf`).** The owner added this tool to the catalogue. It overlaps JPG to PDF and PNG to PDF, and its URL does not follow the hyphenated pattern the SEO section sets (`/image-to-pdf` would). Ask the owner how the three should relate, and which URL to use, before building it.
- **Licence.** The assumed default is AGPL-3.0 with a public repo, because compression uses Ghostscript. Confirm with the owner before adding Ghostscript or a `LICENSE` file.
- **Working doc.** Ask the owner to change "Preact islands" to React in the working doc, so the next export of `SPEC.md` matches the code.
- **Which pushes publish to the preview.** The owner switched Pages on, on 10 Nov 2026. Should every push to `main` or a `claude/` branch publish, as built, or only chosen branches? The branch rule is under Settings > Environments > github-pages.
- **Pages for previews only, or for launch too?** Hosting on GitHub Pages means GitHub serves every page and logs each visitor's IP address, and the address shows the owner's account name. The Privacy page will have to say so if the site launches there.

## Commands

- `npm ci` installs everything from the lockfile. Do not use `--force` or `--legacy-peer-deps`.
- `npm run dev` starts the dev server.
- `npm run build` builds the static site into `dist/`.
- `npm run preview` serves `dist/`.
- `npm run lint` runs ESLint.
- `npm run check` runs the type check.
- `npm test` runs the unit tests (Vitest).
- `npm run weigh` adds up the compressed size of each built page and fails over 100 KB. Run it after a build.
- `npm run check:base` builds the site as a preview under a sub-path and fails if any link, stylesheet or script would break there. Never write a link as a bare `/path`; pass it through `withBase`.
- `npm run e2e` runs the end-to-end tests (Playwright) against the built site, at 360px and 1280px. Run it after a build, and add `-- --trace off` unless a trace is wanted.
- Astro sends anonymous usage figures to its makers unless `ASTRO_TELEMETRY_DISABLED=1` is set. CI and agent sessions set it. On your own machine, run `npx astro telemetry disable` once.
- `npm run spec` runs `openspec validate --all --strict`. `npx openspec list` shows changes in progress and `npx openspec show <name>` prints a change or a spec.

CI runs all of these on every pull request.
