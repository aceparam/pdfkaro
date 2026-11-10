# PDFkaro

A free website with one page per PDF job. Most jobs run in the visitor's browser; a small server handles the rest. The full specification is in `SPEC.md`.

## Before any work

Read `SPEC.md` from top to bottom. It is the source of truth for what to build, how it should look and when a tool counts as done. Do not edit `SPEC.md` unless the owner asks; if the spec is wrong or unclear, say so and ask.

## Design reference

`design/` holds static screens, a reference stylesheet and screenshots that show how pages should look in each state. Read `design/README.md` before building a page or a component. The screens are a guide: `SPEC.md` and `openspec/specs/` win if they differ, and the README lists what in them is only proposed and still waiting for the owner.

## Where the project stands

**Phase 0, the skeleton**, is under way (see "Build phases" in `SPEC.md`). It is built in three changes:

1. `add-site-skeleton`: the project, registry, stylesheet, first components, home page, placeholder pages and checks. Built; steps 1, 2, 3, 7, 8 and 9 below.
2. Next: the Web Worker plumbing and the interactive shared components (`FilePicker`, `PageGrid`, `Result`, and one generic `ToolWidget` island). Steps 4 and 5.
3. Then: Merge PDF end to end, with its page text. Step 6. Preview deploys are set up here once the owner names a host.

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

- **React, not Preact (10 Nov 2026).** The owner asked for a React-based app with reusable components and, offered Preact or React, said to pick whichever helps a later phone app. The interface is written as React components. Astro renders them to static HTML; only interactive parts ship script. `SPEC.md` still says "Preact islands".

## How the code is laid out

- `src/tools/registry.ts` is the one place a tool is declared. `catalogue.ts` beside it is a type only.
- `src/tools/queries.ts` and `filter.ts` hold rules as plain functions. `src/hooks/` holds hooks. None of them render.
- `src/components/` holds React components, one folder each, with a CSS Module beside it when it needs styles. Components get what they show through props. From `src/tools/` they may import only `filter` and types; lint enforces this.
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
- **Page budget.** React takes 68.9 KB of the 100 KB tool page budget by gzip (59.4 KB by brotli). Which compression should the budget be measured with? If the tool widget does not fit in the rest, does the budget or React give way?
- **Preview deploys.** Phase 0 lists them. Which static host should they use?
- **Where the designs differ from `SPEC.md`.** The site is built to `SPEC.md`. The designs propose otherwise, and the owner decides each: input and button edges at `#5c5c5c` in place of `#d9d6cc` (at `#d9d6cc` the edge of a box is faint, 1.39 to 1); showing the count of matching tools under the home page filter; a white fill for inputs; a dashed border on placeholder boxes. Each is one line in `src/styles/site.css` or a component.
- **Dark colours.** `SPEC.md` gives none. The proposed palette in `src/styles/site.css` is built and waits for the owner's approval.

## Commands

- `npm ci` installs everything from the lockfile. Do not use `--force` or `--legacy-peer-deps`.
- `npm run dev` starts the dev server.
- `npm run build` builds the static site into `dist/`.
- `npm run preview` serves `dist/`.
- `npm run lint` runs ESLint.
- `npm run check` runs the type check.
- `npm test` runs the unit tests (Vitest).
- `npm run weigh` adds up the compressed size of each built page and fails over 100 KB. Run it after a build.
- `npm run e2e` runs the end-to-end tests (Playwright) against the built site, at 360px and 1280px. Run it after a build, and add `-- --trace off` unless a trace is wanted.
- `npm run spec` runs `openspec validate --all --strict`. `npx openspec list` shows changes in progress and `npx openspec show <name>` prints a change or a spec.

CI runs all of these on every pull request.
