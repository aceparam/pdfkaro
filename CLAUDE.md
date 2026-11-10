# PDFkaro

A free website with one page per PDF job. Most jobs run in the visitor's browser; a small server handles the rest. The full specification is in `SPEC.md`.

## Before any work

Read `SPEC.md` from top to bottom. It is the source of truth for what to build, how it should look and when a tool counts as done. Do not edit `SPEC.md` unless the owner asks; if the spec is wrong or unclear, say so and ask.

## Where the project stands

The repo holds only the spec. Nothing is built yet. The next piece of work is **Phase 0, the skeleton** (see "Build phases" in `SPEC.md`).

Phase 0, in order:

1. Scaffold the Astro project with static output, TypeScript and Preact islands. No Tailwind, no component kit, no icon library.
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

## Commands

OpenSpec (version 1.17.0). If `openspec` is not on the path, install it with `npm install -g @fission-ai/openspec@1.17.0`. When Phase 0 adds `package.json`, add it there as a dev dependency with a line in `LICENSES.md` (MIT).

- `openspec list` shows changes in progress.
- `openspec show <name>` prints a change or a spec.
- `openspec validate --all --strict` checks every change and spec. CI runs this on each pull request.

Nothing else yet. When the project is scaffolded, list the rest here: install, dev server, build, lint, type check, unit tests, end-to-end tests.
