# Licences

Every dependency the project adds is listed here, with why it is needed. Check that a library is still maintained before adding it, then add a line.

The project's own licence is not set yet. It waits on the owner's decision under "Open decisions" in `SPEC.md`.

## Shipped to visitors

| Package | Licence | Why |
| --- | --- | --- |
| `react` | MIT | Components |
| `react-dom` | MIT | Renders components to HTML at build time and wakes interactive ones in the browser |
| `@astrojs/react` | MIT | Lets Astro render React components; ships a small loader on pages with an interactive part |

## Used to build and test only

| Package | Licence | Why |
| --- | --- | --- |
| `astro` | MIT | Builds the static site |
| `typescript` | Apache-2.0 | Type check. Held at version 6, the newest the lint and check tools accept |
| `@astrojs/check` | MIT | Type check for `.astro` files |
| `@types/react`, `@types/react-dom` | MIT | Types for React |
| `@types/node` | MIT | Types for Node, used by the test and build configuration |
| `eslint`, `@eslint/js` | MIT | Lint |
| `globals` | MIT | Names of browser and Node globals for lint |
| `typescript-eslint` | MIT | Lint for TypeScript |
| `eslint-plugin-astro` | MIT | Lint for `.astro` files |
| `eslint-plugin-react-hooks` | MIT | Lint for React hooks |
| `vitest` | MIT | Unit tests |
| `@playwright/test` | Apache-2.0 | End-to-end tests. Pinned to an exact version so it matches the installed browser |
| `@fission-ai/openspec` | MIT | Checks OpenSpec changes and specs |

`minimatch` (BlueOak-1.0.0) is not used directly. It is pinned to a patched version in `package.json` under `overrides`, because the version the lint tools ask for has a known advisory.

In CI, Playwright downloads a Chromium build from Microsoft's servers. That download is outside `package-lock.json`.
