# Proposal

## Why

"Tool page anatomy" part 4 says the working area shows "only the options this tool needs", with defaults set so the main button works untouched. No tool has needed an option yet, so the widget has no way to show one. Add page numbers, the next Phase 1 tool, needs one choice ("Where the numbers go"), and Watermark and Sign PDF after it will need more. `SPEC.md` "Build phases" rule 3 says a tool that needs a new shared component adds it in its own pull request first, and the stage 1 panel for `add-page-numbers` asked for that split. This change is that shared part, with no tool using it yet.

## What Changes

- **Options declared in the registry.** A tool's widget words can list `options`. For now there is one kind, a **choice** of one value from several: a key, a legend, the values with their labels, and the value chosen at first. Plain text only, as every widget word.
- **Accepted values written once.** Each tool's accepted values for each option sit in one plain module, `src/widget/option-values.ts`, which the tool's engine reads to check what it is sent, as engines already read `zip-limits.ts`. The registry test checks every option's values against it, and refuses a page preset whose key is also an option's key.
- **The choice in the working area.** Once a tool with options has read its file, `ToolWorkspace` shows each choice below the file and above the main button: a group of radio buttons, one per line, named by a visible legend, with the starting value chosen. The group has no groove border and no extra padding; the legend looks like the existing field labels; each radio and its label make a target at least 2.75rem tall.
- **Focus.** In a tool with options, once the file has been read, focus moves to the chosen radio button of the first option, and Tab then reaches the main button. Tools with no options keep today's focus.
- **What is chosen is kept** through Cancel, failure and a replaced file, and goes back to the starting values on "Start again". It is held in the widget's state and sent to the engine with the job, on top of the page's preset.
- **Tests:** unit tests for the rules and the state, component tests with a test registry entry, and the registry test. No page shows an option until Add page numbers, so there is no end-to-end test, no screenshot and no page text in this change; the first end-to-end test of an option comes with Add page numbers.

### Scope

- **Shared code only:** the registry type, the accepted values module, the state, the rules in `src/widget/options.ts`, `ToolWorkspace` and `useToolRun`. No tool, page or engine changes.
- **Out of scope:** any other kind of option (a typed number or text, a colour, a slider); options before a file is chosen; options that change the page grid; the options of any one tool.

### `SPEC.md` sections

- "Tool page anatomy", part 4 ("only the options this tool needs. Defaults are set so the main button works without touching any option").
- "Rules for the code", 1 (one registry) and 2 (engines check what they are sent).
- "Build phases", rule 3 (a new shared component in its own pull request first).
- "Definition of done": keyboard alone and screen reader; "Works on a phone"; "Look and feel" (lines and borders).

## Where files are processed, and new requests

No file is processed by this change, and no request is added. What a visitor chooses is kept in the page's memory only and sent to the tool worker with the job.

## Open decisions and owner questions touched

- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and gives the options their own pull request, ahead of Add page numbers.
- **Rotate's waiting main button** (waiting for the owner): not touched. Options start at values that work, so they never hold the main button.
- **The agent's own choices,** named in the pull request: one kind of option for now; one radio button per line; focus to the first option after the file is read; choices kept until "Start again"; the accepted values in `src/widget/option-values.ts`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: a new requirement, "Options a tool needs": where options are shown, how a choice is drawn, used by keyboard and screen reader, where focus goes, and how choices are kept and reset.
- `tool-registry`: a new requirement, "Options are declared in the registry": the choice kind, accepted values written once and checked, and no preset key that is also an option key.

## Impact

- **New code:** `src/widget/options.ts`, `src/widget/option-values.ts` (empty of tools for now), `tests/unit/options.test.ts`.
- **Changed code:** `src/tools/registry.ts` (the `ToolOption` type and `options?` on the widget words), `src/widget/state.ts` (`choices` and `option-set`), `ToolWorkspace` and its CSS Module (the group, the focus rule), `useToolRun` (choices sent to the engine), the registry, state and component tests.
- **Other tools:** no change. They list no options; their working areas, focus and tests are as before.
- **Page weight:** the island before a pick is unchanged; the options' code is in the workspace chunk, which loads after a pick.
