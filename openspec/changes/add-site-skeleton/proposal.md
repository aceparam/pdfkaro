# Proposal

## Why

The repo holds a spec and designs but no site. Phase 0 ("Build phases" in `SPEC.md`) starts with a skeleton that every later tool is built on: the project, the registry, the stylesheet, the page shell and the checks. Nothing else can be built or tested until it exists.

The owner has also asked for the site to be built with React, written as reusable components, so that a phone app could reuse the work later. `SPEC.md` named Preact. This change moves the stack to React and sets the rule that keeps the components reusable.

## What Changes

This is the first of three Phase 0 changes. It covers steps 1, 2, 3, 7, 8 and 9 of the Phase 0 list in `CLAUDE.md`, the static half of `ToolShell` from step 4, and the Merge PDF registry entry and bare page that step 2 names.

- Scaffold the project: Astro with static output, TypeScript, and React for components. No Tailwind, component kit or icon library.
- **Stack change, directed by the owner:** interactive parts are React islands, not Preact islands. On 10 Nov 2026 the owner asked for a React-based app with reusable components and, offered Preact or React, said to pick whichever helps a later phone app. `SPEC.md` is an export of the owner's working doc, so it is not edited; the decision is recorded in `CLAUDE.md` and the owner is asked to update the doc.
- Add `src/tools/registry.ts` with the tool and group types and one entry, Merge PDF. Generate `src/pages/[slug].astro` and the home page list from it.
- Write `src/styles/site.css` from the "Look and feel" table, using `design/design.css` as the guide.
- Add the first reusable components: site header, site footer, tool list, the home page tool directory with its filter, the static part of the tool page shell, and the owner placeholder box.
- Add the home page, the Merge PDF page (heading and sentence only, see below), the 404 page, and marked placeholder pages for About, Privacy, Changes, Known problems and Contact.
- Add lint, type check, Vitest, Playwright and a page weight check, and a CI workflow that runs them with the build.
- Start `LICENSES.md` with every dependency added.
- List the commands in `CLAUDE.md`.

Out of scope, and left for the next two Phase 0 changes:

- The Web Worker plumbing and the interactive shared components (`FilePicker`, `PageGrid`, `Result`, and the interactive part of `ToolShell`).
- The Merge PDF engine, worker, page text and working tool, which ship together in the Merge PDF change. Until then the Merge PDF page shows its heading and sentence, with no file picker and no text below. The site is not deployed, so no visitor sees it in that state.

Out of scope, and left for Phase 1: group pages, sitemap and robots file, canonical and social tags, structured data, the Content Security Policy.

Not done because it needs the owner: preview deploys, which the Phase 0 row of "Build phases" lists. They need a static host. The question for the owner is below, and the Merge PDF change, the last of Phase 0, owns setting them up once it is answered.

Tasks that the project rules ask of a tool change and that do not apply here, because no file is handled: engine unit tests, the no-upload test, and the run against `tests/fixtures/`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-engines`: the "Site stack" requirement changes from Preact islands to React, and says that components with no interaction are rendered to static HTML and ship no script. A new requirement keeps logic apart from views so components can be reused.

## Impact

- **`SPEC.md` sections implemented:** "Architecture and tech stack" (site, interactive parts, styling, tests, repo layout, rule 1), "Look and feel" (what to build, home page, header and footer, pages only the owner can write), "Tool page anatomy" (parts 1, 2 and 7), "Definition of done" (plain 404 page), "Build phases" (phase 0).
- **Phase and order:** Phase 0. No tool is completed by this change. Merge PDF, the first tool in the catalogue, gets its registry entry and page here and its working parts in the next two changes.
- **Where files are processed:** nowhere yet. This change handles no file and adds no network request. Pages make requests only to the site's own origin.
- **Open decisions touched:**
  - Licence and source code: no `LICENSE` file is added and Ghostscript is not added.
  - Analytics: none is added.
  - Domain: not needed yet; nothing in this change needs the site's address.
- **Design questions, decided on 10 Nov 2026.** The owner was asked each of the questions below and replied "answer yourself", so the agent decided them. They are recorded in `CLAUDE.md` and the owner can overturn any of them.
  - Input and button edges are `#5c5c5c`, as the designs draw them. This departs from the `#d9d6cc` that `SPEC.md` gives for borders, because at `#d9d6cc` the edge of a box cannot be seen (1.39 to 1). Dividers and boxes keep `#d9d6cc`.
  - The placeholder box has a solid border and inputs have no fill, as `SPEC.md` has it.
  - The count of matching tools is not shown; it is announced to screen readers only. "No tools match." is shown.
  - The dark colours and the column placed towards the left are built as the designs draw them.
- **Not built from the designs:** group headings on the home page are plain text, not links, because group pages are not part of this change.
- **Also decided the same way:** the tool page budget stays at 100 KB by gzip, and if the widget cannot fit beside React, React gives way on the web through `preact/compat`; preview deploys will use Cloudflare Pages.
- **Still for the owner:** update the working doc ("Interactive parts" is now React), and connect the repo in a Cloudflare account.
- **Dependencies:** Astro, the Astro React integration, React and ReactDOM at run time; TypeScript, ESLint and its plugins, Vitest and Playwright for development. All are listed in `design.md` and `LICENSES.md`.
- **Page weight:** React and ReactDOM are 68.9 KB by gzip, against about 7 KB for Preact with its React layer. Pages with no interaction ship none of it. The home page ships it for the filter. Tool pages will ship it for the widget, which leaves about 30 KB of the 100 KB budget for everything else. A check in CI measures every built page and fails over 100 KB.
