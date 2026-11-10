# Design

## Context

Nothing is built. `SPEC.md` sets the stack, the repo layout and six rules for the code. `openspec/specs/` restates them as requirements. `design/` shows each screen and has a reference stylesheet. The owner has asked for React and for components that can be reused, with a phone app in mind for later.

## Goals / Non-Goals

**Goals:**

- A project that builds, lints, type checks and tests in CI.
- A registry that pages and lists are generated from, shaped for all 54 tools.
- The global stylesheet and the first reusable components.
- A home page and placeholder pages that pass the look-and-feel test at 360px and 1280px.

**Non-Goals:**

- Any file handling, Web Worker or engine.
- The interactive tool widget and the Merge PDF page text.
- Group pages, sitemap, structured data, social tags, Content Security Policy, offline support.
- Deploys.

## Decisions

### 1. React through the Astro React integration

Pages are thin `.astro` files. Everything visible is a React component in `src/components/`, one folder per component.

Astro renders a React component to HTML at build time. Without a `client:` directive it ships no script, so the header, footer, tool page shell, 404 page and placeholder pages are plain HTML. Only two things become islands: the home page tool directory (this change) and the tool widget (next change).

Why React and not Preact: the owner asked for React and wants the door open to a phone app. A React Native app can reuse hooks and logic written for React. Wrapping the web app as a phone app works with either.

Alternatives considered: Preact with the `preact/compat` alias (about a tenth of the size, but not what was asked); a full React framework with no Astro (a larger departure from `SPEC.md`, and static HTML per page needs extra set-up).

`SPEC.md` is an export of the owner's working doc, so it is not edited here. The decision is recorded in `CLAUDE.md` under "Owner decisions since the last SPEC.md export", and the owner is asked to update the doc.

### 2. Logic apart from views

- `src/tools/catalogue.ts`: the list of catalogue slugs, as a type.
- `src/tools/registry.ts`: data and types only.
- `src/tools/queries.ts`: plain functions over the registry (published pages, pages by group, published related pages, find by slug).
- `src/tools/filter.ts`: the plain function that filters list items by a typed phrase.
- Components take data through props. From `src/tools/` a component may import only `filter` and types. Pages (`.astro`) read the registry and pass props down.

This keeps components reusable and keeps the registry out of island bundles. The three logic modules have no DOM in them, so a phone app could keep them.

### 3. Registry shape

```ts
type GroupId = 'organise' | 'smaller' | 'to-pdf' | 'from-pdf' | 'edit' | 'protect' | 'read';
type ToolPage = {
  slug: CatalogueSlug;   // the URL
  name: string;          // link text in lists: "Merge PDF"
  summary: string;       // one line for lists
  title: string;         // title tag, under 60 characters
  description: string;   // meta description, under 155 characters
  heading: string;       // the h1
  sentence: string;      // what the tool does and where the file goes
  accepts?: string[];    // overrides the tool's list for this URL
  preset?: Record<string, string | number | boolean>; // options already chosen on this URL
};
type Tool = {
  id: string; group: GroupId; runsIn: 'browser' | 'server'; phase: 1 | 2 | 3;
  accepts: string[]; related: CatalogueSlug[]; pages: ToolPage[];
};
```

- A tool is declared once and lists every URL it serves in `pages`. Lists iterate pages, not tools, so a tool with five URLs gives five links, each with its own name, title, description and preset. `/compress-pdf-to-100kb` carries `preset: { targetKb: 100 }`; `/heic-to-pdf` carries its own `accepts`.
- `CatalogueSlug` is a union of every URL in the "Tool catalogue" tables of `SPEC.md`, held in `catalogue.ts`. A misspelt slug in `pages` or `related` fails the type check. `/image2pdf` is left out of the list until the owner answers the question in `CLAUDE.md`.
- **Published** means: the tool has an entry in the registry. An entry is added in the tool's first change. A page links only to related slugs that are published.

Unit tests check: slugs are unique across all pages; every slug is lowercase with hyphens and is not a site page name (`about`, `privacy`, `changes`, `known-problems`, `contact`, `404`); every tool has four to six related slugs; titles are under 60 characters and descriptions under 155; and a made-up tool with three pages yields three list items with the right names, presets and accepted types.

### 4. Pages

| File | What it renders |
| --- | --- |
| `src/layouts/Base.astro` | `<html>`, title, description, stylesheet, header, `<main>`, footer |
| `src/pages/index.astro` | Site name, sentence, `ToolDirectory` island |
| `src/pages/[slug].astro` | One page per `ToolPage`, through `getStaticPaths`; `ToolShell` |
| `src/pages/404.astro` | Plain 404 with a link to the list of tools |
| `src/pages/about.astro`, `changes.astro`, `known-problems.astro` | `OwnerPlaceholder`: the page has not been written yet and the person who runs the site will write it |
| `src/pages/contact.astro` | `OwnerPlaceholder`: no address has been added yet. No address is shown |
| `src/pages/privacy.astro` | `OwnerPlaceholder`: the page has not been written yet. It makes no claim about files and does not say who writes it |

`src/layouts/` is not in the repo layout of `SPEC.md`. It is where Astro keeps the page frame, which has to be an `.astro` file because it owns `<html>` and the stylesheet link. It holds that one file.

The Merge PDF page shows its heading and sentence. The slot for the widget is empty, with no "coming soon" text. The text below the tool (250 to 500 words, in `src/content/`) arrives with the Merge PDF change, so that the tool's page text ships with its engine and tests. `ToolShell` omits the "Related tools" heading when no related tool is published, which is the case here.

### 5. Components in this change

| Component | Interactive | Notes |
| --- | --- | --- |
| `SiteHeader`, `SiteFooter` | No | Plain links. The header is not sticky. The footer has five links |
| `ToolList` | No | Takes `{ name, href, summary }[]`. Used by the directory and by related tools |
| `ToolDirectory` | Yes, island | Takes groups with their list items. See decision 6 |
| `ToolShell` | No | Heading, sentence, a slot for the widget, a slot for the text below the tool, related tools |
| `OwnerPlaceholder` | No | A plain box with a heading line and one sentence, both passed as props |

Groups with no published tool are not drawn.

Recorded now for the next change, not built here: the tool widget is one generic island, `ToolWidget`, keyed by `Tool.id`, which lazy-loads each tool's own parts by a naming rule. It is a fifth shared component. One island avoids a hand-written switch over 54 tools in `[slug].astro`. How a file is handed between tools in memory across pages (client-side navigation is the likely answer) is decided in that change too.

### 6. The home page filter

- A visible `<label>` ("What do you need to do?") tied to a text input.
- It matches the typed phrase against each item's name and summary, case-insensitive, with spaces trimmed at the ends. The phrase is compared as plain text; no regular expression is built from it, and it never goes into the URL.
- Items that do not match get the `hidden` attribute, so they leave the tab order and the accessibility tree. A group whose items are all hidden is hidden with its heading.
- Every item is in the served HTML, so the list works with JavaScript off; the input then does nothing.
- A `role="status"` element is in the served HTML, empty. After each change it is set to "3 tools match.", "1 tool matches." or "No tools match.". The counts are for screen readers and are visually hidden by clipping (not `display: none` or `hidden`, which would stop them being announced), because `SPEC.md` says the home page holds nothing else. "No tools match." is shown to everyone, since an empty list with no words would look broken.
- Enter in the input does nothing. Text typed before React loads is applied when it loads.

### 7. Styles

`src/styles/site.css` holds page, type, links, header and footer, fields and buttons (fields and buttons are shared by several components, so they are global, as `design/README.md` notes). Values come from the "Look and feel" table. Colours are CSS variables; dark mode swaps them under `prefers-color-scheme`, and `color-scheme: light dark` is set so parts the browser draws follow. Every focusable element, including the filter input, shows the `:focus-visible` outline; with a faint edge, the outline is the clear mark of the box. The input sets `background: transparent` and `color: var(--text)`, so the browser's own fill does not show.

Where `design/design.css` differs from `SPEC.md`, this change builds the `SPEC.md` value:

- Input and button edges are `1px solid #d9d6cc`, not `#5c5c5c`.
- The placeholder box has a solid border, not a dashed one.
- Inputs have no fill.

Each is one variable or one rule, so the owner's answer is a one-line change. The questions are in the proposal.

Where `SPEC.md` is silent, the design is built and marked in the stylesheet as proposed: the dark colours, and the column placed towards the left.

Component styles are CSS Modules beside each component (`ToolList.module.css`). They are hand-written and scoped, which is what "scoped component styles" means when the component is React.

### 8. Checks

- `npm run lint`: ESLint with the TypeScript, Astro and React hooks plugins. A rule lets files in `src/components/` import from `src/tools/` only `filter` and types.
- `npm run check`: `astro check`.
- `npm test`: Vitest, Node environment, for the catalogue, registry, queries and filter.
- `npm run weigh`: a script that adds up the compressed HTML, CSS and JavaScript each built page loads, prints gzip and brotli sizes, and fails if any page is over 100 KB by gzip, the stricter of the two.
- `npm run e2e`: Playwright against the built site, at 360px and 1280px, in light and dark mode:
  - home lists every published tool, and still does with JavaScript off;
  - the filter narrows the list by name and by summary, hides empty groups, sets the status text for many, one and no matches, takes hidden links out of the tab order, and ignores Enter;
  - text typed before the script loads is applied when it loads;
  - "No tools match." is visible on screen, and the filter input shows a focus outline;
  - the tool page has one `h1` and its sentence is in the served HTML;
  - pages with no interaction load no script;
  - no request goes to another origin, and no font or image is requested;
  - body text is 17px, the header scrolls away, the footer has five links;
  - every page has a different title;
  - nothing overflows sideways at 360px;
  - the 404 page links to the list;
  - no page holds a banned word or an exclamation mark;
  - the home page script does not contain any tool's meta description (the registry stays out of the island).
- CI: one workflow, on `pull_request` and on pushes to `main`, with `contents: read` and no secrets. It runs `npm ci`, lint, type check, unit tests, build, the weight check, the end-to-end tests and `openspec validate --all --strict`. `--force` and `legacy-peer-deps` are not used.

### 9. Dependencies

| Package | Why | Licence | Last release | Size shipped |
| --- | --- | --- | --- | --- |
| `astro` 7 | Static site build | MIT | Nov 2026 | None; build tool |
| `@astrojs/react` | Renders React in Astro | MIT | Nov 2026 | Island loader, about 2 KB |
| `react`, `react-dom` 19 | Components | MIT | Nov 2026 | 68.9 KB gzip, 59.4 KB brotli, only on pages with an island |
| `typescript` 6 | Type check. Version 7 is outside what `@astrojs/check` and `typescript-eslint` accept | Apache-2.0 | 2026 | None |
| `@astrojs/check` | Type check for `.astro` files | MIT | Oct 2026 | None |
| `@types/react`, `@types/react-dom` | Types | MIT | Oct 2026 | None |
| `@types/node` | Types for the test and build configuration | MIT | 2026 | None |
| `eslint`, `@eslint/js`, `globals`, `typescript-eslint`, `eslint-plugin-astro`, `eslint-plugin-react-hooks` | Lint | MIT | Sep to Nov 2026 | None |
| `vitest` | Unit tests | MIT | Nov 2026 | None |
| `@playwright/test` | End-to-end tests | Apache-2.0 | 2026 | None |
| `@fission-ai/openspec` | Spec checks, already used; now installed from the lockfile | MIT | 2026 | None |

Playwright also downloads a Chromium build from Microsoft's servers in CI (`npx playwright install chromium`). That download is outside the lockfile.

Existing code cannot do these jobs because there is no existing code.

### 10. Page weight and late loading

Measured by `npm run weigh` and reported in the pull request. Expected: placeholder and tool pages under 10 KB (no script yet); home page about 75 KB by gzip because of React.

On a tool page React leaves about 30 KB by gzip for HTML, CSS and the widget's first chunk. The rule for the next change: only the file picker is in the first chunk; everything else in the widget loads after a file is picked.

No engine or WebAssembly exists yet. The rule against importing `src/engines/` from components is added with the first engine.

### 11. Threats considered

- **Supply chain:** packages are the official ones (publisher and repo checked), pinned by `package-lock.json`. `npm audit` is run; the one known advisory (a denial of service in `minimatch`, reached only through lint tools, nothing shipped) is fixed with `npm audit fix` and the result recorded.
- **Hostile input:** this change takes no file. The only input is the filter text, which is compared with names and summaries as plain text and never rendered as HTML.
- **Content Security Policy:** not set in this change. Astro's island loader uses a small inline script, so the Phase 1 change that sets the policy must use hashes for it.
- **Malicious PDF, oversized file, hostile file name, server risks:** not applicable until files are handled.

## Risks / Trade-offs

- **React uses most of the page budget.** 68.9 KB of 100 KB by gzip on a tool page. If the widget cannot fit in the rest, either the budget or React gives way; that is the owner's call. Switching to the `preact/compat` alias stays possible only while components keep to what it supports.
- **React on the home page for one filter box.** A few lines of plain script would be smaller. One way of building interaction was chosen over the smallest page; the home page still serves every tool as HTML.
- **Light control edges.** `#d9d6cc` on `#fbfaf6` is 1.39 to 1, so the edge of the filter box is faint. It follows `SPEC.md`; the UX review recommends `#5c5c5c`.
- **The Merge PDF page has no picker or text until the next changes.** Acceptable only because nothing is deployed.
- **New major versions.** Astro 7, ESLint 10 and Vitest 5 are recent. The Playwright version is pinned to the one whose browser is installed in the build environment.
