# Proposal

## Why

Sign PDF, the third Phase 1 tool under "Edit and sign", lets the visitor make the signature in one of three ways, as `SPEC.md` "Scope notes for specific tools" asks: type a name, draw it, or use a picture. Only the way chosen should be on screen, hold the main button and reach the engine. The widget shows every option a tool lists, all the time (`add-tool-options`, `add-text-option`). This change lets an option be shown only while an earlier choice holds one value. `SPEC.md` "Build phases" rule 3 says a shared piece comes in its own pull request first, and the program manager asked for that split for `add-tool-options` and `add-text-option`. No tool uses it yet; Sign PDF is its first user (`add-sign-pdf`).

## What Changes

- **An option may name a condition:** an earlier choice of the same tool, and one of that choice's values. Declared in the registry beside the option's words, as `when`.
- **Shown only while the condition holds.** Once the file is read, an option with a condition is drawn only while its choice holds that value, directly after the options before it, in registry order. Changing the choice shows the matching option and hides the others at once; nothing moves focus, and Tab from the choice reaches the option now shown.
- **Hidden means not there:** a hidden option does not hold the main button back and is not sent to the engine. What it holds is kept while it is hidden, so switching back shows it as the visitor left it, and it is cleared with the other options by "Start again" or by removing the last file.
- **The registry test** refuses a condition that names no earlier choice of the tool, names a value the choice does not have, or names an option that itself has a condition; and it refuses a first option with a condition, so focus after reading always has a place to go.
- **Tests:** unit tests for the rules and the registry checks, with a test entry. No page shows a conditional option until Sign PDF, so there is no end-to-end test, screenshot or page text here.

### Scope

- **Shared code only:** the registry type, `src/widget/options.ts`, `ToolWorkspace` and their tests. No tool, page, engine, worker message or state field changes. Add page numbers and Watermark look and behave as before.
- **Out of scope:** conditions on a text, a page count or anything but one choice's value; several values or nested conditions; showing an option before the file is read; any tool's options. The drawing pad and the picture field are their own changes (`add-drawing-option`, `add-picture-option`).

### `SPEC.md` sections

- "Tool page anatomy", part 4 ("only the options this tool needs").
- "Scope notes for specific tools": Sign PDF's "drawn, typed or uploaded" signature, which needs one of three inputs at a time.
- "Rules for the code", 1 (one registry drives everything).
- "Build phases", rule 3 (a new shared piece in its own pull request first).
- "Definition of done": keyboard alone and screen reader; "Works on a phone".
- "Look and feel": "When a design question is not answered here, choose the plainer option" (the option appears after the group, with no extra control).

## Where files are processed, and new requests

No file is processed by this change, and no request is added. What the visitor chooses stays in the page's memory, as before; a hidden option is simply not sent to the tool worker.

## Open decisions and owner questions touched

- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and comes in its own pull request, ahead of `add-drawing-option`, `add-picture-option` and `add-sign-pdf`.
- **Waiting main buttons** (waiting for the owner): touched only in that a hidden text no longer holds the button; nothing that holds it today changes.
- **The agent's own choices,** named in the pull request: one condition per option, on one earlier choice's value; the option shown after the group, not inside it; nothing announced and focus not moved when it appears; a hidden option keeps what it holds and is not sent; the first option has no condition.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: a new requirement, "Options shown for one choice": when a conditional option is drawn, what it holds while hidden, and that it neither holds the main button nor is sent.
- `tool-registry`: a new requirement, "An option's condition is declared in the registry", with the registry test's checks.

## Impact

- **Changed code:** `src/tools/registry.ts` (`when?` on each option kind), `src/widget/options.ts` (`shownOptions`; `optionsToSend` and `optionsHold` read only shown options), `ToolWorkspace` (draws only shown options), and the registry, options and component tests.
- **Other tools:** no change. No option today has a condition, so `shownOptions` gives every option and their tests pass unchanged.
- **Page weight:** the island before a pick is unchanged; the rule is a few lines in the workspace chunk, which loads after a pick.
