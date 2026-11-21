# Proposal

## Why

`SPEC.md` "Scope notes for specific tools" says Sign PDF places "a drawn, typed or uploaded signature image on the page". The widget can take a choice and a typed text (`add-tool-options`, `add-text-option`), but nothing a visitor can draw on with a finger, a mouse or a pen. This change adds that drawing pad as a third kind of option, with no tool using it yet. `SPEC.md` "Build phases" rule 3 says a tool that needs a new shared component adds it in its own pull request first, and the program manager has asked for that split twice (`add-tool-options`, `add-text-option`). Sign PDF (`add-sign-pdf`) is its first user.

## What Changes

- **A third kind of option, a drawing,** declared in the registry by its words only: a key, a visible label, a hint, the words of its Clear button, the sentence tied to the main button while nothing is drawn, and, if the tool wants its own, the sentence for a drawing its engine refuses. It may name a condition (`add-option-conditions`).
- **What a drawing is, written once** in `src/widget/option-values.ts`: lines of points in the pad's own units (1,000 across, 400 down, a line 6 units wide), and each tool's most lines and most points. The pad, the registry test and the tool's engine all read it there. A drawing is numbers only: the pad never turns it into a picture.
- **The pad in the working area.** Once the file is read, the drawing shows below the file and above the main button, in registry order: its label, a box the width of the column at 5 to 2 with the site's control edge and 4px corners, the hint under it, and a "Clear" button (in the tool's words). Lines show as they are drawn, in the text colour, and stay sharp on high-density screens and after the window changes size.
- **Drawing with a finger does not move the page.** The box takes touch for itself, so a finger drawing in it never scrolls or zooms the page, selects text or opens a menu. Only one finger or pointer draws at a time.
- **It is the job's input.** Like a text, a drawing starts empty, and the main button waits until something is drawn, with the tool's sentence tied to it. Clear empties it; the status region says so once.
- **Not for keyboard or screen reader alone, and it says so.** Drawing needs a pointer, so a drawing is never a tool's first option, and the tool's hint names the keyboard route (Sign PDF: typing the name instead). The box is named by its label and described by its hint, and takes no Tab stop; Clear is a normal button.
- **Limits:** a drawing past its most lines or points takes no more, and the status region says once that it is full and to clear it. Points closer than 3 units to the last are skipped, so a pen's many points stay few.
- **What is drawn is kept** through Cancel, a failure and "Choose another file", and cleared by "Start again" or by removing the last file, as other options are. It lives in the page's memory and goes to the tool worker with the job.
- **A drawing the engine refuses** (which the page should never send) fails with a new failure kind: "The drawing could not be used. Clear it and draw again.", or the tool's own words; "Go back to your file" keeps the drawing.
- **Tests:** unit tests for the rules, the limits and the engine-side check; the component's markup and its painting with a test entry. No page shows a drawing until Sign PDF, so no end-to-end test, screenshot or page text here.

### Scope

- **Shared code only:** the registry type, `src/widget/option-values.ts`, a new `src/widget/drawing.ts`, `src/widget/options.ts`, the state and failures, the worker's failure mapping and messages, `ToolWorkspace`, `useToolRun` (one setter), the new `src/components/DrawingPad/`, and their tests. No tool, page or engine changes.
- **Out of scope:** pressure, colours or line widths to choose; undo of one line; drawing on a page preview; turning a drawing into a picture; any tool's drawing or limits.

### `SPEC.md` sections

- "Scope notes for specific tools": Sign PDF's drawn signature.
- "Tool page anatomy", part 4 ("only the options this tool needs").
- "Rules for the code", 1 (one registry) and 2 (engines check what they are sent).
- "Build phases", rule 3 (a new shared component in its own pull request first).
- "What we are building", rule 5, "Works on a phone": usable with one thumb at 360px.
- "Look and feel": lines and borders, no images or icons, no motion.
- "Privacy, limits and security", "Browser tools".
- "Definition of done": keyboard alone and screen reader (through the tool's other ways), never blocking the page for more than 100 ms.

## Where files are processed, and new requests

No file is processed by this change, and no request is added. What the visitor draws stays in the page's memory as numbers and goes to the tool worker with the job. It is never written to browser storage, the page address or the console, and is never made into a picture or a data address.

## Open decisions and owner questions touched

- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and gives the pad its own pull request, ahead of Sign PDF.
- **Waiting main buttons** (waiting for the owner): touched in kind. A drawing makes the main button wait while it is empty, as a text does.
- **"Defaults are set so the main button works without touching any option"** (`SPEC.md` "Tool page anatomy", 4): a drawing is read as the job's input, as `add-text-option` read a typed text, after the owner's decision on Extract pages (13 Nov 2026). The reading is the agent's and is named in the pull request.
- **The agent's own choices,** named in the pull request: the drawing kind and its words; lines of whole-number points in a 1,000 by 400 box; a 5 to 2 box the column's width; a line 6 units wide in the text colour; one pointer at a time; 3 units between points; most lines and points written once in `option-values.ts`; a drawing never first and never made into a picture; Clear with no undo; the `drawing-refused` failure; `DrawingPad` in its own folder.

No open decision needs more than its assumed default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: new requirements "A drawing a tool needs" (the pad, drawing with a finger, mouse or pen, the main button waiting, Clear, limits, keeping and resetting, keyboard and screen reader) and "A drawing the engine refuses".
- `tool-registry`: a new requirement, "Drawings are declared in the registry": the words in the registry, the units and limits written once, and the engine's check.
- `privacy`: a new requirement, "Drawings stay in the browser".

## Impact

- **New code:** `src/components/DrawingPad/` (component and CSS Module), `src/widget/drawing.ts`, `tests/unit/drawing.test.ts`.
- **Changed code:** `src/tools/registry.ts` (`DrawingOption`), `src/widget/option-values.ts` (`pad`, `DrawingRule`, `optionDrawings`, `acceptedDrawing`, `DrawingRefused`), `src/widget/options.ts`, `src/widget/state.ts` (`drawing-set`, `choices` may hold a drawing, the `drawing-refused` kind), `src/widget/failures.ts`, `src/workers/worker-core.ts` and `messages.ts`, `ToolWorkspace`, `useToolRun` (`setDrawing`), and the registry, options, state, failures, worker and component tests.
- **Other tools:** no change; their tests must pass unchanged.
- **Page weight:** the island before a pick is unchanged; the pad's code is in the workspace chunk, which loads after a pick.
