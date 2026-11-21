# Design

## Context

- The widget sends an engine the page's preset (PDF to JPG's `{ format: 'jpg' }`) and, for page tools, the marks, order or turns (`jobOption` in `useToolRun`). Nothing in the registry, the state or `ToolWorkspace` describes an option the visitor sets.
- `src/widget/zip-limits.ts` is the precedent for a plain module read by both the widget and engines, so a limit is written once.
- Focus after a pick in a one-file tool listed as a row (Compress PDF) goes to the main button, and the status region says the file's line once it has been read.
- The first user is Add page numbers (`add-page-numbers`, merged after this), with one choice of six places.

## Goals / Non-Goals

**Goals:**
- One way to declare, show, keep and send a choice, reusable by Add page numbers, Watermark and Sign PDF.
- Keyboard, screen reader and phone use from the first version.
- Accepted values written once, checked by the engine and the registry test.

**Non-Goals:**
- Typed values, colours, sliders, options before a pick, options per page.

## Decisions

### 1. The registry type

```ts
/** An option a tool's working area shows. Only one kind for now. */
export type ToolOption = {
  kind: 'choice';
  /** The key the engine receives: `position`. */
  key: string;
  /** The group's visible name: "Where the numbers go". */
  legend: string;
  /** The values, in the order shown, each with its label. */
  choices: { value: string; label: string }[];
  /** The value chosen at first. */
  initial: string;
};
```

`ToolWidgetWords` gains `options?: ToolOption[]`. `kind` is there so later kinds can be added without changing existing entries.

### 2. Accepted values written once: `src/widget/option-values.ts`

```ts
/** Each tool's accepted values for each option, by tool id and key. Engines read this to check what they are sent. */
export const optionValues: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {};
```

- Empty in this change; each tool's change adds its own line, such as `'add-page-numbers': { position: [...] }`.
- An engine reads only its own line, through `acceptedValue(tool, key, value)` (also in this module): the value when it is a string among the accepted ones, else `undefined`, read with `Object.hasOwn` so no inherited key counts.
- The registry keeps its words literal (it holds data and types only); the registry test checks, for every tool with options, that each option's values are exactly the list here, in any order, with no value twice and every value labelled.
- It sits in `src/widget/`, beside `zip-limits.ts`, because engines may import from there and pages already do; `src/tools/` is not imported by engines, and `src/engines/` is not imported by components (lint).

### 3. The registry test

- Option keys are unique within a tool; each choice has at least two values; `initial` is one of them.
- Values match `optionValues` as above.
- **No preset key is an option key** (the architect, stage 1): `{ ...preset, ...choices }` would otherwise let a choice silently replace what a page's URL promises.
- A component test renders `ToolWorkspace` with a test entry holding one choice of three values, since no published tool has options yet.

### 4. The state

- `State.choices: Record<string, string>`: what each option shows. `{}` means every option at its start, so no tool needs a setting in the reducer, as `turns: null` does for tools that do not turn.
- `option-set { key, value }` acts only while listing.
- `reset` (Start again) clears it. `added`, `removed`, `started`, `progressed`, `cancelled`, `failed` and `back-to-files` leave it, so a choice outlives Cancel, a failure and a replaced file.
- The state holds no file, as before; a choice is not written to storage or the address.

### 5. The rules: `src/widget/options.ts`

Plain functions, tested in Node:
- `chosenValue(option, choices)`: the value in `choices` when it is one of the option's values, else `initial`;
- `optionsToSend(options, choices)`: `{ [key]: chosenValue }` for every option, or `{}` for a tool with none.

A choice always holds a value that works, so no option ever holds the main button back, and there is no "not valid" state.

### 6. Drawing a choice in `ToolWorkspace`

- **Where:** after the file's row (or the page tools' line and grid), once the file has been read, while listing; above the main button and any sentence tied to it. Not shown while reading, while a password is asked for, for a damaged file, during the job or on the result.
- **Markup:** a `fieldset` with a `legend`, and one `<label>` per value wrapping a native `<input type="radio">` with a shared `name` made with `useId`, `checked` from `chosenValue`, `onChange` dispatching `option-set`. No ARIA roles are added: the browser's own radio group gives one Tab stop, arrow keys and the "1 of 6" a screen reader reads.
- **Look,** in `ToolWorkspace.module.css`, with the site's tokens only:
  - `fieldset { border: 0; padding: 0; margin: 1.5rem 0 0; min-width: 0 }`, so there is no groove border and no extra padding (`min-width: 0` stops a long label widening the page);
  - `legend` styled as `.field label` (bold, the body size), `padding: 0`, with the same gap below as a field label;
  - each label is a row: `display: flex; align-items: center; gap: 0.625rem; min-height: 2.75rem`, one per line; the radio itself `width` and `height` 1.25rem, `accent-color: var(--text)`, so it follows dark mode with no new colour;
  - the focus ring is the site's own (`outline: 2px solid var(--link)`).
- **Focus** (the UX reviewer, stage 1): in a tool with options, when the file's status becomes ready while listing, focus moves to the chosen radio button of the first option, through a ref on it, instead of staying on the main button. The status region still says the file's line once, so the file is announced and focus lands where the next choice is. Tab from the group reaches the next option or the main button. A tool with no options keeps today's focus exactly; a test checks Compress PDF's and Rotate PDF's focus are unchanged. After Cancel or "Go back to your file", focus goes to the main button, as now.

### 7. Sending: `useToolRun`

`{ ...preset, ...jobOption(), ...optionsToSend(words.options, state.choices) }`. Since no preset key is an option key (section 3), nothing is overwritten. The engine checks every value again through `acceptedValue`.

## Page weight and late loading

No change before a pick: the island and its props are the same for every published tool, which has no options. The new code is in the workspace chunk, fetched after a pick. `npm run weigh` must pass unchanged.

## Threats

- **Values from the page.** The engine never trusts a value: `acceptedValue` takes only own keys, only strings, only listed values, and the engine refuses anything else before it reads the file (each tool's change tests this).
- **No new request or storage.** Choices live in the page's memory and go to the worker in the job message, as presets do; the no-upload tests are unchanged.
- **No file parsing** is added. Malicious PDFs, oversized files and hostile file names are untouched by this change.

## Tests

- **Unit:** `chosenValue` and `optionsToSend` (an unknown stored value falls back to `initial`; no options gives `{}`); `acceptedValue` (a listed value, an unlisted one, a number, `__proto__`, `toString`); the reducer's `option-set` (only while listing) and that only `reset` clears `choices`.
- **Registry:** the checks in section 3, run on every entry, and a failing case for each check built in the test.
- **Component:** `ToolWorkspace` with a test entry: the fieldset and legend; one radio per value, the starting one checked; `option-set` on change; focus to the chosen radio once the file is ready; the group hidden while reading, for a password and for a damaged file; tools without options rendering and focusing as before.
- **End-to-end:** none in this change, as no published page has options; Add page numbers' end-to-end test covers keyboard use, focus and phone width, and its screenshots show the group at 360px and 1280px.

## Risks / Trade-offs

- **[Built before its first user]** A shape chosen without a tool using it could miss what Watermark or Sign PDF need. → Kept to one kind; a later kind is added in its own change.
- **[Focus moves after reading]** A visitor who tabbed elsewhere while a large file was read could have focus moved. → Focus moves only if it is still on the main button or the page body, as the existing focus rules check; tested.
- **[Values written in two places]** The registry's values and `optionValues` could drift. → The registry test fails on any difference.

## Migration Plan

None. No tool uses options until Add page numbers.
