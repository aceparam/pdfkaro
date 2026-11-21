# Proposal

## Why

Watermark, the next Phase 1 tool after Add page numbers, puts the visitor's own words on every page, so its working area needs a place to type them. The widget can show only one kind of option, a choice (`add-tool-options`). `SPEC.md` "Build phases" rule 3 says a tool that needs a new shared component adds it in its own pull request first, and the program manager asked for the same split for `add-tool-options`. This change is that shared part: a typed text, with no tool using it yet. Sign PDF's typed signature, after Watermark, will need it too.

## What Changes

- **A second kind of option, a text,** declared in the registry by its words only: a key, a visible label, a hint, the sentence tied to the main button while it is empty, and, if the tool wants its own, the sentence for a text its engine refuses. Plain text only, as every widget word.
- **What a text takes is written once,** in `src/widget/option-values.ts`, beside the accepted values of choices: each tool's most characters and character rule, by tool id and key. The widget looks them up there, and a tool's engine checks what it is sent with the same function. The registry does not repeat them; its test checks that each text in the registry has its line there and that each line belongs to a text in the registry.
- **One character rule for now, the standard PDF fonts' characters:** letters from English and other Western European languages, numbers and common marks, the standard fonts' encoding less the soft hyphen. The text is put in its composed form and trimmed at both ends before it is counted and checked. This matters because pdf-lib's standard fonts draw any other character as `?` without a word.
- **A text is the job's input.** It starts empty, and the main button waits until it holds text, with the tool's sentence tied to it, as Extract pages waits for a page and Merge PDF for a second file. A choice still starts at a value with which the main button works. (Extract's empty start is the owner's decision of 13 Nov 2026; reading a typed text the same way is the agent's, named below.)
- **The field in the working area.** Once the file has been read, each text is shown below the file and above the main button: a visible label, a one-line field with the site's field style, and the hint under it, read with the field. The field has no name, sits in no form, and has `autocomplete="off"` and `spellcheck="false"`, so the text is never sent to an address, kept by the browser in its form memory or saved form state, or sent to an online spell checker. `enterkeyhint="go"` labels a phone keyboard's Enter key. No `maxlength` is set, so pasted text is never cut silently.
- **What is wrong is said.** Text that is too long, or has a character the rule does not take, shows one sentence between the label and the field, where a phone keyboard does not hide it. It names the refused characters when there are a few ("Ł and ź cannot be used. Use letters from English and other Western European languages, numbers and common marks."), and says "Some characters cannot be used." before that second sentence when the text is in another script, has more than three such characters, or has invisible ones, so the sentence says what happened as well as what to do. It is read with the field (`aria-invalid`) and tied to the main button, which stays focusable and does nothing. The status region says it once when it first appears or changes. Enter in the field does what the main button does.
- **A text the engine refuses** (which the page should never send) fails with a new failure kind and its own sentence with a next step: "The text could not be used. Check it and try again.", or the tool's own words; "Go back to your file" keeps the text to check.
- **Focus.** Once the file has been read, focus moves to the first option, as now; when that option is a text, to its field.
- **What is typed is kept** through Cancel, a failure and "Choose another file" while listing, and cleared by "Start again" or by removing the last file, as choices are. It lives in the page's memory only and goes to the tool worker with the job.
- **Each option kind in its own folder.** `ChoiceGroup` moves out of `ToolWorkspace` into `src/components/ChoiceGroup/`, and the new `TextField` goes in `src/components/TextField/`, each with its CSS Module, as the repo's layout asks and `add-tool-options` left for when a second kind arrived.
- **Tests:** unit tests for the rule, the clean-up, the checks, the sentences, the state and the new failure; both components' markup and handlers with a test registry entry; the registry test; and a check that every character the rule takes is drawn by pdf-lib's standard fonts. No page shows a text until Watermark, so there is no end-to-end test, no screenshot and no page text here; Watermark's end-to-end test is the first browser test of the field.

### Scope

- **Shared code only:** the registry type, `src/widget/option-values.ts`, `src/widget/options.ts`, the state and failures, the worker's failure mapping, `ToolWorkspace` and its CSS Module, the two component folders, `useToolRun`, and their tests. No tool, page or engine changes. Add page numbers' choice looks and behaves as before.
- **Out of scope:**
  - any tool's text, label or limits (each tool's change adds its own);
  - a text with a starting value, or one the main button does not wait for; text of several lines; a live count of characters;
  - characters beyond the standard fonts' encoding, which needs a font put inside the file (an owner question raised by `add-watermark`);
  - other kinds of option (a number, a colour, a slider), and options before a pick.

### `SPEC.md` sections

- "Tool page anatomy", part 4 ("only the options this tool needs").
- "Rules for the code", 1 (one registry) and 2 (engines check what they are sent).
- "Build phases", rule 3 (a new shared component in its own pull request first).
- "What we are building", rule 4, "Honest about limits": characters that cannot be drawn are refused with a sentence, never drawn as question marks.
- "States every tool handles", Failed: the new failure kind says what happened and what to try.
- "Privacy, limits and security", "Browser tools".
- "Definition of done": keyboard alone and screen reader; "Works on a phone".

## Where files are processed, and new requests

No file is processed by this change, and no request is added. What a visitor types stays in the page's memory and goes to the tool worker with the job. It is never written to browser storage, the page address or the console. The field turns off the browser's form memory and spell checking, so the browser has no reason to send or keep it.

## Open decisions and owner questions touched

- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and gives the text its own pull request, ahead of Watermark.
- **Rotate's waiting main button** (waiting for the owner): touched in kind. A text makes the main button wait while it is empty. A choice never makes it wait.
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4): the owner decided Extract pages starts with no page chosen (13 Nov 2026); that the chosen pages are the job's input and not an option is the agent's reading, recorded in `CLAUDE.md`. This change applies the same reading, again the agent's, to a typed text, and the pull request names it; the owner can overturn it.
- **The agent's own choices,** named in the pull request: the text kind and its words; a text starts empty and the main button waits; limits and rules written once in `src/widget/option-values.ts`, not in the registry; the one character rule, the standard fonts' encoding less the soft hyphen; composed form and trimming; refused characters named when few; the sentence between the label and the field; no `maxlength`; `autocomplete="off"`, `spellcheck="false"` and `enterkeyhint="go"`; Enter does what the main button does; the sentence said once; the new `text-refused` failure; the two component folders.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: "Options a tool needs" now covers both kinds (a choice starts at a working value; a text starts empty and is the job's input); a new requirement, "A text a tool needs", says how a text is shown, used by keyboard and screen reader, checked, kept and reset; a new requirement, "A text the engine refuses", gives that failure its sentence.
- `tool-registry`: "Options are declared in the registry" gains the text kind, whose limit and character rule are written once outside the registry and checked by the registry test and the engine.
- `privacy`: a new requirement, "Typed text stays in the browser": the text goes only to the tool worker, is never stored, put in the address or offered to a spell checker, and is a secret in each such tool's no-upload test.

## Impact

- **New code:** `src/components/TextField/` (component and CSS Module); `src/components/ChoiceGroup/` (moved from `ToolWorkspace`, with its styles moved from `ToolWorkspace.module.css`).
- **Changed code:** `src/tools/registry.ts` (`ToolOption` becomes a choice or a text; `CharacterRule` is imported as a type from `option-values.ts`), `src/widget/option-values.ts` (`CharacterRule`, `optionTexts`, the character rule, `cleanText`, `textProblem`, `acceptedText`, `TextRefused`), `src/widget/options.ts` (a text's value, what is sent, the sentences, what holds the main button), `src/widget/state.ts` (the comment on `choices`, which now holds a text too; the `text-refused` kind), `src/widget/failures.ts`, `src/workers/worker-core.ts` and `src/workers/messages.ts` (the new kind), `ToolWorkspace` (draws both components, the tied sentence, the focus ref), and the registry, options, state, failures, worker and component tests.
- **Other tools:** no change. Add page numbers' choice behaves and looks as before; tools with no options are untouched; their tests must pass unchanged.
- **Page weight:** the island before a pick is unchanged; the field's code is in the workspace chunk, which loads after a pick.
