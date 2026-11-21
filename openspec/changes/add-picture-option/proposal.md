# Proposal

## Why

`SPEC.md` "Scope notes for specific tools" says Sign PDF places a drawn, typed "or uploaded" signature picture on the page. So beside the PDF, the visitor must be able to choose a second file of another kind, a JPG or PNG of their signature. The widget takes files of one kind only, all through the one picker, and every file it takes is a file the tool works on. This change adds a picture as a fourth kind of option: picked through its own button, read and checked in the tool worker, and sent with the job, with no tool using it yet. `SPEC.md` "Build phases" rule 3 says a new shared component comes in its own pull request first, as the program manager has asked twice. Sign PDF (`add-sign-pdf`) is its first user.

## What Changes

- **A fourth kind of option, a picture,** declared in the registry by its words only: a key, a visible label, the words of its button before and after a pick, a hint, the words for what it takes ("a JPG or PNG picture"), the sentence tied to the main button while none is chosen, and, if the tool wants its own, the sentence for a picture its engine refuses. It may name a condition (`add-option-conditions`).
- **What a picture may be, written once** in `src/widget/option-values.ts`: each tool's types (JPG, PNG or both), and the size in bytes and pixels above which the page shows a notice. The page, the worker's check and the engine read the same line. There is no fixed size limit: a large picture is used, with a notice.
- **The field in the working area.** Once the file is read, the picture shows below the file and above the main button, in registry order: its label, a secondary button in the site's own style ("Choose a picture"), and the hint under it. Once a picture is chosen, a line names it with its size, and the button reads "Choose another picture". The picture itself is not shown: "Look and feel" allows no image but the visitor's own page thumbnails.
- **Checked before the job:** the page turns away at once a file that is not of the picture's types (by its first bytes, as the picker does). Otherwise the tool worker reads it with the shared picture reader Image to PDF uses, and says it is ready (with its pixels), damaged, or saved in a way the tool cannot read. Each problem gets one sentence between the label and the button, naming the file and what to do; the status region says it once. A ready picture over the tool's notice size gets a notice naming its size and what to try, tied to the main button, which still works, as Image to PDF's notice for very large pictures does.
- **It is the job's input.** The main button waits until a picture is chosen and read, with the tool's sentence tied to it, or the problem's sentence from the field.
- **Kept in memory, never in the state:** the picture's bytes stay with the page's other files in memory; the state holds only its name, size, pixels and status. It is kept through Cancel, a failure and "Choose another file", replaced by the next pick (a pick of the wrong type leaves no picture chosen, and says so), and forgotten on "Start again", on removing the last file and on leaving the page. A hidden picture is not sent. A read cut short when the worker is ended (a thumbnail's time limit) is started again.
- **Sent with the job:** the run message carries each shown, ready picture beside the files; the worker hands its bytes to the engine under the option's key, and the engine checks it again before it reads the PDF.
- **A picture too large for the file:** a tool whose engine finds the picture alone would pass its new file's size budget fails with a new failure kind whose sentence names the picture, its size and a step: "photo.jpg (24.6 MB) is too large to place on these pages. Crop it to the signature, or save a smaller copy."
- **A picture the engine refuses** (which the page should never send) fails with a new failure kind: "The picture could not be used. Choose another picture.", or the tool's own words.
- **Tests:** unit tests for the rules, the notice, the reading of every test picture, the state, the messages and the worker; the field's markup with a test entry. No page shows a picture until Sign PDF, so no end-to-end test, screenshot or page text here.

### Scope

- **Shared code only:** the registry type, `src/widget/option-values.ts`, `src/widget/options.ts`, the state and failures, `src/engines/picture.ts` (one shared check), the worker's messages, client and core, `useToolRun`, `ToolWorkspace`, `FilePicker` (an optional description), the new `src/components/PictureField/`, and their tests. No tool, page or engine of a tool changes.
- **Out of scope:**
  - a preview of the chosen picture;
  - dropping or pasting a picture onto the page for this field (drops and pastes stay the tool's own files);
  - types other than JPG and PNG, several pictures for one option, or cropping, turning or cleaning up a picture's background;
  - any tool's picture or notice sizes;
  - a fixed refusal of large pictures (a question for the owner).

### `SPEC.md` sections

- "Scope notes for specific tools": Sign PDF's uploaded signature.
- "Tool page anatomy", part 4 ("only the options this tool needs"), and "States every tool handles": damaged, too large (a notice, the job still runs) and failed, for the picture.
- "Rules for the code", 1 to 4: one registry; engines check what they are sent; the file is read in the worker; nothing loads before a pick.
- "Look and feel": "Images: none, apart from page thumbnails of the visitor's own file".
- "Build phases", rule 3 (a new shared component in its own pull request first).
- "Privacy, limits and security", "Browser tools".
- "Definition of done": keyboard alone and screen reader.

## Where files are processed, and new requests

The picture is read in the visitor's browser, in the tool worker, with the same reader Image to PDF uses. No request is added and none carries the picture, its name or its contents. It is never written to browser storage, the page address or the console, and the page makes no address for it.

## Open decisions and owner questions touched

- **No fixed size limit** (`SPEC.md` "Privacy, limits and security") and **Very large PNGs** (waiting for the owner, Image to PDF): kept. No picture is refused for its size; above each tool's notice size (Sign PDF: 8 MB or 16 million pixels) the page shows a notice and the job still runs, as Image to PDF does. A new question for the owner, which does not block: "Refuse very large signature pictures, or keep the notice?"
- **Picture details** (waiting for the owner): touched in kind. The picture is read with the reader that keeps no camera, date or place; a tool that draws it (Sign PDF) copies none, as Image to PDF does.
- **Shared pieces in tool pull requests** (waiting for the owner): this change follows `SPEC.md`'s rule and gives the picture its own pull request, ahead of Sign PDF.
- **Repair PDF link** (waiting for the owner): not touched; a damaged picture is replaced, not repaired.
- **The agent's own choices,** named in the pull request: the picture kind and its words; types and notice sizes written once in `option-values.ts`; a notice, not a refusal, for a large picture; a wrong pick leaves no picture chosen; a read cut short is started again; checked in the worker before the job; no preview; drops and pastes not taken for it; the bytes kept beside the files, never in the state; replaced by the next pick; the `picture-refused` failure; `PictureField` in its own folder.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-page`: new requirements "A picture a tool needs" (the field, picking, checking, each problem, the notice, the main button waiting, keeping and resetting, keyboard and screen reader), "A picture too large for the file" and "A picture the engine refuses".
- `tool-registry`: a new requirement, "Pictures are declared in the registry": the words in the registry, the types and notice sizes written once, and the engine's check.
- `tool-engines`: a new requirement, "A picture option is read in the worker": the check before the job and how the picture reaches the engine.
- `privacy`: a new requirement, "A chosen picture stays in the browser".

## Impact

- **New code:** `src/components/PictureField/` (component and CSS Module).
- **Changed code:** `src/tools/registry.ts` (`PictureOption`), `src/widget/option-values.ts` (`PictureRule`, `optionPictures`, `pictureRule`, `PictureRefused`), `src/engines/picture.ts` (`pictureOutcome`, `acceptedPicture`), `src/engines/types.ts` (an engine's optional `inspectPicture`), `src/widget/options.ts`, `src/widget/state.ts` (`pictures`, two actions, the `picture-refused` kind), `src/widget/failures.ts`, `src/workers/messages.ts`, `client.ts` and `worker-core.ts`, `useToolRun`, `ToolWorkspace`, `FilePicker` (`describedBy`), and the registry, options, picture, state, failures, messages, client, worker and component tests.
- **Other tools:** no change; their tests must pass unchanged.
- **Page weight:** the island before a pick is unchanged; the field's code is in the workspace chunk, which loads after a pick.
