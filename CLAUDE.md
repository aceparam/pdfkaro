# PDFkaro

A free website with one page per PDF job. Most jobs run in the visitor's browser; a small server handles the rest. The full specification is in `SPEC.md`.

## Before any work

Read `SPEC.md` from top to bottom. It is the source of truth for what to build, how it should look and when a tool counts as done. Do not edit `SPEC.md` unless the owner asks; if the spec is wrong or unclear, say so and ask.

## Design reference

`design/` holds static screens, a reference stylesheet and screenshots that show how pages should look in each state. Read `design/README.md` before building a page or a component. The screens are a guide: `SPEC.md` and `openspec/specs/` win if they differ, and the README lists what in them is only proposed and still waiting for the owner.

## Where the project stands

**Phase 0, the skeleton**, is done (see "Build phases" in `SPEC.md`). It is built in these changes:

1. `add-site-skeleton`: the project, registry, stylesheet, first components, home page, placeholder pages and checks. Merged and archived; steps 1, 2, 3, 7, 8 and 9 below.
2. `add-tool-widget`: the Web Worker plumbing and the interactive shared components (`FilePicker`, `PageGrid`, `Result`, and one generic `ToolWidget` island). Steps 4 and 5. Merged and archived.
3. `add-merge-pdf`: Merge PDF end to end, with its page text. Step 6. Merged and archived, in the same pull request as 2, which the owner merged on 11 Nov 2026. Its page text waits for the owner's review.
4. `add-page-thumbnails`: page thumbnails in `PageGrid`, drawn by PDF.js in the tool worker, so Merge PDF meets "Tool page anatomy" in full. Merged and archived.

All Phase 0 code is built. **The owner accepted the Phase 0 gate on 12 Nov 2026** ("things are fine, we can fix later") and asked to start Phase 1. The hand checks still owed for Merge PDF's "Definition of done" are tracked in issue #7:
- the owner's review of the Merge PDF page text;
- opening the merged file by hand in Chrome, Firefox, Adobe Reader and macOS Preview;
- trying the page in Firefox, Safari and Edge, and on Android Chrome and iOS Safari, at phone size.

The multilingual test file is also still missing.

**Phase 1, launch,** has started. Its tools are built in catalogue order. Its gate: every phase 1 tool passes "Definition of done", and the owner has written the About page. Built so far:

1. `add-page-items-and-zip`: page items for tools that work on one file's pages, one PDF.js document kept open across thumbnails, and several outputs zipped in the worker with `fflate`. Merged and archived (PR #8).
2. `add-split-pdf`: Split PDF end to end. Merged and archived (PR #8, merged by the agent at the owner's request on 13 Nov 2026). Not yet done: its hand checks and page text review are in issue #7. PR #8's questions are answered (13 Nov 2026) except whether to keep the 65,535-file, 4 GB zip limit, which stays until the owner says otherwise.

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
- **PDF.js's helper data is one fixed set (11 Nov 2026).** Thumbnails need PDF.js's standard fonts and image decoders. The owner chose to load them as one fixed set, the same for every file, so no request depends on what a PDF needs, and to ship no character maps, so Chinese, Japanese and Korean text in fonts a PDF does not embed is missing from its thumbnail. The owner was quoted about 670 KB; as built the set is 760 KB by gzip, because it is bundled as a script so that no `fetch` is written in our worker code.
- **The Liberation Sans fonts are shipped (11 Nov 2026),** though they are GPL v2 with a font exception, as unchanged data PDF.js reads. Without them, text in Helvetica-like fonts that a PDF does not embed may be drawn with a fallback font or not at all.
- **Split PDF splits at points the visitor picks (12 Nov 2026).** Every page is shown as a thumbnail, and the visitor marks where to cut. With no cuts marked, the main button gives one file per page. Typed ranges can come later.
- **Several outputs download as one zip, made with `fflate` (12 Nov 2026),** chosen over a zip written in our own code.
- **The Phase 0 gate was accepted (12 Nov 2026),** with the hand checks moved to issue #7.
- **Split PDF: each part keeps only its own bookmarks (12 Nov 2026).** A bookmark that points to a page in another part is dropped, and a kept bookmark whose parent was dropped moves up.
- **Split PDF: attached files go with the first part only (12 Nov 2026).** The page says so.
- **Split PDF: parts have no password and no restrictions (12 Nov 2026),** as for Merge PDF. The page says so.
- **A zip result shows no next steps for now (12 Nov 2026).** No tool opens a zip, so "Tool page anatomy" part 6 cannot be met for a zip until one does.
- **Compress PDF uses our own recompression, not Ghostscript (13 Nov 2026).** The owner chose this over adding Ghostscript under AGPL-3.0. Compression is written on top of qpdf and PDF.js; no Ghostscript and no `LICENSE` file are added for it.
- **Image to PDF is one tool with three pages (13 Nov 2026):** one images-to-PDF tool that takes JPG and PNG, served at `/jpg-to-pdf`, `/png-to-pdf` and `/image-to-pdf`, each page worded for its search. `/image2pdf` is dropped.
- **The agent may merge each tool's pull request (13 Nov 2026)** once CI is green and all six reviewers approve. Owner questions still wait for the owner, and hand checks stay in issue #7.
- **The Privacy page is drafted by the agent (13 Nov 2026)** from what the code does, marked as a draft for the owner's review.
- **Page tools drop passwords and restrictions (13 Nov 2026).** Extract pages, Delete pages, Reorder pages, Rotate PDF, Add page numbers, Watermark and Sign PDF give back a file with no password and no restrictions, as Merge and Split do, and each page says so.
- **Tools that give back one file with fewer pages keep what still applies (13 Nov 2026).** Extract pages and Delete pages keep the bookmarks that point to a kept page and drop the rest; files attached to the document are kept.
- **Extract pages starts with no pages chosen (13 Nov 2026).** The main button is unavailable until a page is chosen, with a sentence tied to it, as Merge PDF does with too few files. (The agent's reading, not the owner's words: the pages chosen are the job's input, not an option, so this does not break "Defaults are set so the main button works".)
- **New files keep accessibility tags, named destinations and reading threads whole, and the page says so (13 Nov 2026).** This answers PR #8's first question for Split, Extract and Delete: a file with fewer pages can still carry descriptive text from pages left out, with the document's title and author, and each page tells the visitor.
- **Warn above 20,000 pages (13 Nov 2026).** Page tools show a notice when a file has more than 20,000 pages, because qpdf selects pages slowly from very large files. No limit; the job still runs. The owner may list it on Known problems.
- **Attachments drawn on a page go with that page (13 Nov 2026).** The owner confirmed the agent's reading of "attached files go with the first part only".
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

Decided by the agent on 12 Nov 2026 while planning Split PDF, accepted by the review panel, and named in its pull request:

- **Attachments drawn on a page stay with that page** (confirmed by the owner on 13 Nov 2026). The owner's "attached files go with the first part only" is read as files attached to the document as a whole (the `/EmbeddedFiles` name tree and the catalog's `/AF`). A file-attachment annotation on a page is part of the page, so it goes with whichever part holds it. The page text says so.
- **One zip holds at most 65,535 files and 4 GB.** `fflate`'s `zipSync`, the owner's choice of zip library, writes no ZIP64. A split past either fails at once with a sentence saying to mark cuts, never with a broken zip. Lifting it needs a ZIP64 writer, our own code or another library, which is the owner's call. The limits live in `src/widget/zip-limits.ts`; the engine checks them early and the worker checks the exact size again before it zips.

## How the code is laid out

- `src/tools/registry.ts` is the one place a tool is declared. `catalogue.ts` beside it is a type only.
- `src/tools/queries.ts` and `filter.ts` hold rules as plain functions. `src/hooks/` holds hooks. None of them render.
- `src/components/` holds React components, one folder each, with a CSS Module beside it when it needs styles. Components get what they show through props. From `src/tools/` they may import only `filter` and types, and they never import an engine or a worker; lint enforces this.
- `src/widget/` holds the tool widget's rules as plain functions: the steps a tool goes through (`state.ts`), shared words and numbers (`format.ts`), and the accepted-type check (`accept.ts`). `zip-limits.ts` is also read by engines and the worker, so what one zip can hold is written once.
- `src/engines/` holds engines: pure functions from bytes to bytes, one file per tool under `src/engines/tools/`, named by the tool's id. They use no page and no network; lint enforces this. `types.ts` is the contract. `qpdf.ts` wraps qpdf compiled to WebAssembly, and `inspect.ts` reads one PDF before a job; libraries reach an engine through `tools`, which the worker or a test fills in.
- `src/content/tools/` holds the text below each tool, one Markdown file per page slug, rendered to plain HTML at build time.
- `tests/fixtures/` holds the shared test PDFs, made by `make.mjs`; its README says what each engine does with each file.
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

- **Repair PDF link.** `SPEC.md` says a damaged file shows a link to Repair PDF. Repair PDF is a phase 2 tool, so for now the page offers to leave the file out, and shows the link only once Repair PDF is published (`add-tool-widget`). The owner may want it otherwise. Also, the WebAssembly build of qpdf does not rebuild a broken cross-reference table that desktop qpdf rebuilds, so Repair PDF may need more than this build.

- **Licence.** The assumed default was AGPL-3.0 because compression would use Ghostscript; the owner has since chosen no Ghostscript (13 Nov 2026). The repo's licence, and whether it is public, are still the owner's to decide ("Source code" in Open decisions). Add no `LICENSE` file until then.
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
- `npm run check:worker` checks the built site: each engine is its own file, loaded late by the worker. Run it after a build.
- `npm run check:base` builds the site as a preview under a sub-path and fails if any link, stylesheet or script would break there. Never write a link as a bare `/path`; pass it through `withBase`.
- `npm run e2e` runs the end-to-end tests (Playwright) against the built site, at 360px and 1280px. Run it after a build, and add `-- --trace off` unless a trace is wanted.
- Astro sends anonymous usage figures to its makers unless `ASTRO_TELEMETRY_DISABLED=1` is set. CI and agent sessions set it. On your own machine, run `npx astro telemetry disable` once.
- `npm run spec` runs `openspec validate --all --strict`. `npx openspec list` shows changes in progress and `npx openspec show <name>` prints a change or a spec.

CI runs all of these on every pull request.
