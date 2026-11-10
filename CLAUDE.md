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

## Rules

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

None yet. When the project is scaffolded, list the commands here: install, dev server, build, lint, type check, unit tests, end-to-end tests.
