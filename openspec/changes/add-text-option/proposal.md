# Proposal

## Why

Watermark, the next Phase 1 tool after Add page numbers, puts the visitor's own words on every page, so its working area needs a place to type them. The widget can show only one kind of option, a choice (`add-tool-options`). `SPEC.md` "Build phases" rule 3 says a tool that needs a new shared component adds it in its own pull request first, and the program manager asked for the same split for `add-tool-options`. This change is that shared part: a typed text, with no tool using it yet. Sign PDF's typed signature, after Watermark, will need it too.

## What Changes

- **A second kind of option, a text,** declared in the registry: a key, a visible label, a hint, the most characters it takes, which characters it accepts, and the sentence tied to the main button while it is empty. Plain text only, as every widget word.
- **A text is the job's input.** It starts empty, and the main button waits until it holds text, with the tool's sentence tied to it, as Extract pages waits for a page and Merge PDF for a second file. A choice still starts at a value with which the main button works.
- **Which characters a text takes, written once.** One rule for now, "the characters the standard PDF fonts can draw": the Western European letters, numbers and marks of the standard fonts' encoding. The text is put in its composed form and trimmed at both ends before it is counted and checked. The rule and each tool's limits sit in `src/widget/option-values.ts`, beside the accepted values of choices; the widget checks what is typed with it, and a tool's engine checks what it is sent with the same function, as engines already read that module.
- **The field in the working area.** Once the file has been read, `ToolWorkspace` shows each text below the file and above the main button: a visible label, a one-line field with the site's field style, and the hint under it, read with the field. The field has no name, sits in no form, has `autocomplete="off"` and `spellcheck="false"`, so the text is never sent to an address, kept by the browser for later, or sent to an online spell checker. No `maxlength` is set, so pasted text is never cut silently.
- **What is wrong is said.** Text that is too long, or has a character the rule does not take, shows one sentence under the field, read with the field (`aria-invalid`) and tied to the main button, which stays focusable and does nothing. The status region says the sentence once when it first appears or changes. Enter in the field does what the main button does.
- **Focus.** Once the file has been read, focus moves to the first option, as now; when that option is a text, to its field.
- **What is typed is kept** through Cancel, a failure and "Choose another file" while listing, and cleared by "Start again" or by removing the last file, as choices are. It lives in the page's memory only and goes to the tool worker with the job.
- **Tests:** unit tests for the rule, the clean-up, the checks, the state and the sentences; the field's markup and handlers with a test registry entry; the registry test; and a check that every character the rule takes is drawn by pdf-lib's standard fonts. No page shows a text until Watermark, so there is no end-to-end test, no screenshot and no page text here; Watermark's end-to-end test is the first browser test of the field.

### Scope

- **Shared code only:** the registry type, `src/widget/option-values.ts`, `src/widget/options.ts`, the state, `ToolWorkspace` and its CSS Module, `useToolRun`, the registry, options, state and component tests. No tool, page or engine changes.
- **Out of scope:**
  - any tool's text, label or limits (each tool's change adds its own);
  - a text with a starting value, or one the main button does not wait for; text of several lines; a live count of characters;
  - characters beyond the standard fonts' encoding, which needs a font put inside the file (an owner question raised by `add-watermark`);
  - other kinds of option (a number, a colour, a slider), and options before a pick;
  - moving `ChoiceGroup` and the new field out of `ToolWorkspace` into their own folders, left for later as `add-tool-options` said.

### `SPEC.md` sections

- "Tool page anatomy", part 4 ("only the options this tool needs").
- "Rules for the code", 1 (one registry) and 2 (engines check what they are sent).
- "Build phases", rule 3 (a new shared component in its own pull request first).
- "What we are building", rule 4, "Honest about limits": characters that cannot be drawn are refused with a sentence, never drawn as question marks (pdf-lib's standard fonts turn them into `?` without a word).
- "Privacy, limits and security", "Browser tools".
- "Definition of done": keyboard alone and screen reader; "Works on a phone".

## Where files are processed, and new requests

No file is processed by this change, and no request is added. What a visitor types stays in the page's memory and goes to the tool worker with the job. It is never written to browser storage, the page address or the console. The field turns off the browser's form memory and spell checking, so the browser has no reason to send or keep it.

## Open decisions and owner questions touched

- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and gives the text its own pull request, ahead of Watermark.
- **Rotate's waiting main button** (waiting for the owner): touched in kind. A text makes the main button wait while it is empty, as Extract's does, because a text is the job's input. A choice never makes it wait.
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4): a text is read as the job's input, not an option, as `CLAUDE.md` records for Extract's chosen pages. This is the agent's reading and is named in the pull request; the owner can overturn it.
- **The agent's own choices,** named in the pull request: the text kind and its fields; a text starts empty and the main button waits; the one character rule, the standard fonts' encoding less the soft hyphen; composed form and trimming; no `maxlength`, a sentence instead; `autocomplete="off"` and `spellcheck="false"`; Enter does what the main button does; the sentence said once by the status region; the rule and limits in `src/widget/option-values.ts`.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: "Options a tool needs" now covers both kinds (a choice starts at a working value; a text starts empty and is the job's input); a new requirement, "A text a tool needs", says how a text is shown, used by keyboard and screen reader, checked, kept, reset and kept private.
- `tool-registry`: "Options are declared in the registry" gains the text kind, its limits and character rule written once and checked by the registry test and the engine.
- `privacy`: a new requirement, "Typed text stays in the browser": the text goes only to the tool worker, is never stored, put in the address or offered to a spell checker, and is a secret in each such tool's no-upload test.

## Impact

- **Changed code:** `src/tools/registry.ts` (`ToolOption` becomes a choice or a text), `src/widget/option-values.ts` (`optionTexts`, the character rule, `cleanText`, `textProblem`, `acceptedText`), `src/widget/options.ts` (a text's value, what is sent, the sentence tied to the main button), `src/widget/state.ts` (the comment on `choices`, which now holds a text too; no new action), `ToolWorkspace` and its CSS Module (the field, the tied sentence, the focus ref), `useToolRun` (unchanged in shape; a text goes through `jobOptions`), and the registry, options, state and component tests.
- **Other tools:** no change. Add page numbers' choice behaves as before; tools with no options are untouched; their tests must pass unchanged.
- **Page weight:** the island before a pick is unchanged; the field's code is in the workspace chunk, which loads after a pick, and its few styles reuse the site's field style.
