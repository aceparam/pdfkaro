# Proposal

## Why

Phase 2 is being built before the Phase 1 gate, by the owner's decision of 23 Nov 2026 (`CLAUDE.md`, "Phase 2 starts before the Phase 1 gate"), browser tools first, in catalogue order. Crop PDF, Resize pages, Compress to a target size, Grayscale PDF and Repair PDF are merged and archived. The next browser row is **Flatten PDF** (`/flatten-pdf`, "Make smaller and fix", Browser, Phase 2, fifth in its group after Repair PDF).

`SPEC.md` names the tool and nothing else: no scope note, no line in the tech stack table, no word on what "flatten" covers. People who search for it usually want a filled form, or a file with comments and highlights, to stop being editable and look the same everywhere: the values and marks become part of the page, and the fields and comments are gone. This plan measured what our qpdf build (`@neslinesli93/qpdf-wasm` 0.3.1, qpdf 12.2.0) does when asked (design, "Measurements"):

- **qpdf flattens annotations that have their own drawing** (`--flatten-annotations=all|print|screen`): it draws each one into the page as a form XObject, removes it, and, once any form field is flattened, removes the whole form (`/AcroForm`, its `/XFA` too). Fast: as fast as a plain rewrite on every fixture, 26 s for 100,000 fields at 1,000 a page.
- **It also does things this site cannot hand to a visitor as they are:**
  1. it **flattens links** that have their own drawing, so they stop working;
  2. it **draws an annotation that sits in a hidden layer**, so something hidden becomes visible;
  3. it **leaves widgets it cannot draw on the page after removing the form** (a check box or radio button with no drawing for its state, an empty signature field), and leaves popups pointing at removed notes, and the accessibility tags pointing at removed fields, which keeps those fields' names and values in the file;
  4. with `--generate-appearances` (needed whenever a form asks readers to draw its fields, `/NeedAppearances`; without it qpdf flattens no field at all), it **redraws every text and choice field itself, badly for many forms:** any letter outside Western European ones becomes `?` (Hindi, Telugu, Arabic, Chinese, and also Polish or Turkish letters), with exit code 0; line breaks in a field of several lines are lost; centred, right-aligned and comb fields come out left-aligned; and **a password field's value is drawn in clear**;
  5. it takes time that grows with the **square of the annotations on one page** (10,000 on one page: 17 to 22 s; 20,000: 95 s).
- **What qpdf does well:** a form whose fields already carry their drawing (most forms saved by a PDF reader), comments and highlights, stamps, shapes, ink and signatures' looks are drawn exactly as shown, text in the drawing stays searchable, and the result passes `qpdf --check`.

So the plan is qpdf's flattening, wrapped in our own steps that fix or refuse each problem above, with no new dependency.

**Blocked on the owner.** What "flatten" covers is not in `SPEC.md`, and the answer to question 2 decides whether a new piece (fonts, or our own field drawing) is needed. Questions 1 and 2 must be answered before building; the plan below assumes the recommended answers.

## What Changes

- **A new page, `/flatten-pdf`,** from a new registry entry under "Make smaller and fix", after Repair PDF. One PDF; its row shows the name, page count and size, with the first page's thumbnail. No options. "Flatten and download" works at once.
- **What is flattened** (owner question 1, recommended answer): form fields and comments with their own drawing are drawn into the page as they would print, and then removed: filled-in text, ticks and choices, the look of signature fields, highlights, underlines, strike-outs, notes' icons, free text, stamps, shapes, lines and ink. The form itself is removed. Text drawn this way can still be searched and copied. Comments' written text (the words in a note or a reply) is not drawn and is removed. Annotations hidden from printing are removed with nothing drawn.
- **What is kept as it is:** links (they keep working, with their own look), attached-file icons with their files, redaction marks not yet applied, media (sound, video, 3D), any annotation kind not on the flattened list, notes and comments with no drawing of their own, layers (an annotation in a layer is drawn into that same layer, so a hidden layer stays hidden), bookmarks, document attachments, the document's details, tags (with their pointers to removed fields and notes taken out, design decision 6).
- **Fields this tool cannot draw as a reader shows them** (owner question 2, recommended answer): when a form asks readers to draw its fields, the file is read before the job and turned away with one sentence if any field it would have to draw holds letters outside the Western European set its font can show, has several lines, is centred, right-aligned or a comb, is a password field with a value, holds rich text, is formatted by a script, uses a font the form does not hold or one it cannot use, or is a check box or radio button that is on with no drawing for its state. The same for a dynamic XFA form, and for a file with more annotations on one page or in all than the bounds of decision 8. No file with `?` in place of letters, misplaced text or a visible password is ever given.
- **Nothing to flatten:** no new file, "There is nothing to flatten in this file." with "No new file was made. It has no form fields or comments this tool flattens. Links, bookmarks and attached files are left as they are." Found only after the main button, as for Remove a password and Repair PDF (owner question 6).
- **No password and no restrictions** on the new file, as for the page tools (owner question 4).
- **A digital signature** stops being valid, and the page says so; its look is kept as drawing.
- **Progress:** "Reading the file", then the write fills the bar to 0.9, the final check to 1.0; Cancel works throughout.
- **The "Make smaller and fix" hub words** gain flattening (`add-search-basics`).
- **The Privacy page draft** gains a visible draft sentence on what the request count can tell (a file with nothing to flatten stops one qpdf instance earlier).

### Scope

- **One tool,** with one small shared piece riding along, named in the pull request: an optional registry word `unsupportedHeading`, so the notice for a file turned away reads "report.pdf has form fields or notes this tool cannot flatten." instead of the shared "report.pdf is saved in a way this tool cannot read.", which would not be true here (every other tool keeps the shared heading). It can go first in its own pull request if the panel or the owner prefers (owner question "Shared pieces in tool pull requests"). No new shared component, library or failure kind. A read-time hold with a sentence naming the reason (instead of one `unsupported` sentence, and instead of "nothing to flatten" only after the main button) would be a new shared piece and would go first in its own change; it is not part of this plan (owner question 6).
- **Out of scope:**
  - layers (optional content): hidden layers are not removed and visible ones are not merged into the page (owner question 1c);
  - transparency flattening (turning see-through drawing into solid drawing): it needs pages turned into pictures or a renderer we do not ship (owner question 1d);
  - drawing fields qpdf cannot draw: fonts for other scripts are issue #20; our own field drawing would be its own change (owner question 2);
  - filling a form first: Fill a form is a later Phase 2 tool and may offer flattening itself;
  - tagging the drawn field values for screen readers (owner question 7);
  - carrying the file into another tool (`add-tool-handover`), next steps after the result, a known gap across the site.

### `SPEC.md` sections

- "Tool catalogue": Flatten PDF, `/flatten-pdf`, Browser, Phase 2, fifth under "Make smaller and fix". No scope note exists; owner question 1.
- "What we are building": rule 4, honest about limits (owner question 2).
- "Architecture and tech stack": qpdf for page structure; "Rules for the code" 1 to 4. The tech stack table names no library for flattening; qpdf is chosen in the design and the `tool-engines` delta.
- "Tool page anatomy": parts 1 to 7; every state in "States every tool handles".
- "Details that apply everywhere": output names.
- "SEO": "Every tool page"; "Site-wide" (hub words).
- "Privacy, limits and security": "Browser tools"; "Whole site".
- "Build phases": Phase 2, with the owner's decision of 23 Nov 2026.
- "Definition of done": "The test set" (a fillable form; text in Hindi, Telugu, Arabic and Chinese; bookmarks, links and attachments); "Each tool": "Leaves alone what it was not asked to change: links, bookmarks, form fields and text stay intact" (form fields are exactly what this tool is asked to change; links, bookmarks and text are kept).

## Where files are processed, and new requests

Everything happens in the visitor's browser, in the tool worker. No request carries file contents, a file name, a field value or a password. The tool declares `loads: { read: ['qpdf'], job: ['qpdf'] }`. After a pick the page fetches the read set (qpdf and its WebAssembly) and the draw set (PDF.js), whatever the file holds; the job's fresh worker loads the job set with the engine's chunks (`flatten-pdf`, `plain`, `pages`, `qpdf-json`, `inspect`, `qpdf`, as built). No dependency is added and no new shared built file is expected (task 4.2 checks).

**Request differences named,** under the uniform-requests owner question (2): the qpdf instance count depends on the file (a file with nothing to flatten stops after reading, about two instances fewer); nothing else does.

## Owner decisions and questions

**Blocking: answer before building.**

1. **What "flatten" covers.** `SPEC.md` names the tool only. Recommended:
   a. **Form fields:** drawn into the page and the form removed. Default: yes.
   b. **Comments and marks with their own drawing** (highlights, notes' icons, stamps, shapes, ink, free text): drawn and removed; their written text removed. Default: yes.
   c. **Layers:** left as they are; an annotation in a layer stays in it. Default: leave.
   d. **Transparency:** not flattened. Default: leave.
   e. **Links:** kept working, with their own look. Default: keep.
   f. **As shown or as printed:** as printed (`print`): what prints is drawn; annotations set not to print are removed; annotations set to print but not to show on screen are drawn. The alternative is as shown on screen (`screen`). Default: as printed.
   g. **Kept as they are:** attached-file icons with their files, redaction marks not yet applied, sound, video and 3D, unknown kinds. Default: keep.
2. **Fields qpdf cannot draw as a reader shows them** (the list under "What Changes"). Options: (a) turn the file away before the job with one sentence (recommended; no new dependency); (b) give the file with `?` and misplaced text, saying so (not recommended: a password would be drawn in clear and letters lost); (c) first build our own field drawing, with pdf-lib, in its own change, and ship fonts for other scripts with issue #20 (larger; pdf-lib's standard fonts have the same Western European limit, so (c) without fonts gains layouts, not letters). Default: (a).

**Going ahead on defaults** (listed in the pull request and added to "Questions waiting for the owner"):

3. **Names:** "Flatten PDF", heading "Flatten a PDF", "Flatten and download", `report-flattened.pdf`, the hub words. The agent's choice, for the owner's text review.
4. **Passwords and restrictions dropped,** as for the page tools (13 Nov 2026). Default: drop.
5. **Bounds:** at most 1,000 flattened annotations on one page and 100,000 in all, counted per page they appear on; past either the file is turned away (measured worst case about 26 s in Node). Default: keep.
6. **One sentence for every reason a file is turned away, and "nothing to flatten" only after the main button,** as built today for other tools; naming the reason before the job needs a shared piece first. Default: keep for now.
7. **Tags:** in a file with accessibility tags, drawn field values and marks are not tagged, so a screen reader may not read them; the tags' pointers to removed fields and notes are taken out. Tagging them would mean our own flattening (design, alternative B). Default: accept for now, and say so.
8. **Signed files:** flattened; the signature's look is kept and the page says the signature is no longer valid. Turning signed files away is the alternative. Default: flatten (touches "Signed files").
9. **Comments' text removed:** the words written in notes, replies and comments on highlights are not kept anywhere in the new file. Default: yes, and say so.

**Touched, not changed:**

- **Uniform requests** (`add-uniform-requests`, question 2): the instance-count difference above.
- **Signed files:** question 8.
- **Fonts for other scripts** (issue #20): question 2.
- **Tagged fields of left-out pages:** not this tool's question, but the same tag pointers are cleaned here.
- **20,000 pages:** the shared notice is shown.
- **Licence, server host, money, analytics, AI tools:** not touched.

No open decision in `SPEC.md` needs more than its assumed default.

## Capabilities

### New Capabilities

- `flatten-pdf`: what the Flatten PDF tool at `/flatten-pdf` does: choosing one file, passwords, what is flattened and what is kept, fields it cannot draw, nothing to flatten, bounds on hostile files, every state, nothing uploaded, the same requests for every file, keyboard and screen reader, and the words on the page and the Privacy draft.

### Modified Capabilities

- `tool-engines`: "The library for each job". Flattening uses qpdf's own flattening and field drawing, wrapped in our steps, with no pdf-lib.

## Impact

- **New code:** `src/engines/tools/flatten-pdf.ts` (the plan read from dictionaries, the update before flattening, the flattening call, the clean-up update and final write); `src/content/tools/flatten-pdf.md`; `tests/unit/flatten-pdf.test.ts`, `tests/unit/flatten-helpers.ts`; `tests/e2e/flatten-pdf.spec.ts`; two fixtures from `make.mjs` (`flatten-kinds.pdf`, `flatten-cannot-draw.pdf`).
- **Changed code:** `src/tools/registry.ts` (the entry, hub words) and `tests/unit/registry.test.ts`; `unsupportedHeading` in `src/tools/catalogue.ts`, `unreadableNotice` in `src/widget/failures.ts` and its test; `src/pages/privacy.astro` and `tests/unit/privacy-page.test.ts` (one draft sentence); `tests/fixtures/make.mjs` and `README.md`; `tests/e2e/uniform-requests.spec.ts`, `tool-files.ts`, `performance.spec.ts`; other tools' no-upload forbidden lists (`/flatten-pdf-/`); the `engine-loads` shards.
- **Reused, not copied:** `plainCopy` and `passwordFrom` (`plain.ts`), `readPages` with `{ objects: true }` (`pages.ts`), `opening`/`entryText`/`passwordArgsFor` (`qpdf-json.ts`), `cappedWrite`, `oneFileLimit`, `OutputLimit`, `finished` (`qpdf.ts`), `readPdf` (`inspect.ts`), `characterRules['standard-font']` (`option-values.ts`). Not needed: `content.ts` (no drawing instructions are read or edited), `rewrite` (two JSON updates, not one plain rewrite), pdf-lib, PDF.js in the job.
- **Every other tool:** no change.
