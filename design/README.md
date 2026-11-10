# Design reference

Static screens that show how PDFkaro pages should look and behave. Use them as a guide when building pages and components. They are not part of the site and are not shipped: the folder sits outside `src/` and `public/`, and the built site must not contain it.

`SPEC.md` is the source of truth, then `openspec/specs/`. If a screen here differs from either, the spec wins and the screen should be fixed.

## What is here

| Path | What it is |
| --- | --- |
| `design.css` | One reference stylesheet for all screens. A guide for writing `src/styles/site.css` and the scoped component styles, not the production file |
| `screens/` | One plain HTML file per screen. Open any of them in a browser; no build step and no JavaScript |
| `screenshots/` | Each screen at 360px and 1280px wide, in light mode, plus three in dark mode |

To see dark mode, set the device or browser to dark. The screens follow the setting; there is no toggle.

## The screens

Merge PDF stands in for every tool, because all tools share one page shell. Word to PDF is here only to show a server tool.

| Screen | Shows | Spec |
| --- | --- | --- |
| `home.html` | Site name, one sentence, the filter box, every launch tool under its group | `look-and-feel`: Home page |
| `home-filtered.html` | The list after "jpg" is typed in the filter box | `look-and-feel`: Home page |
| `merge-pdf-empty.html` | The whole tool page before a file is chosen, with how-to steps, questions and related tools | `tool-page`: Seven parts in a fixed order, File picker, Empty state, Text below the tool |
| `merge-pdf-loading.html` | "Getting ready" beside each file name | `tool-page`: Engine loading state |
| `merge-pdf-files.html` | The working area: files with thumbnails, Move up, Move down, Remove, and the main button | `tool-page`: Working area, Reordering without drag, One main button named after the result |
| `merge-pdf-large.html` | The warning when the files are over 100 MB | `privacy`: No fixed size limit, with a warning |
| `merge-pdf-working.html` | "Page 14 of 120", the progress bar and Cancel | `tool-page`: Working state |
| `merge-pdf-done.html` | File name, size, Download and next steps | `tool-page`: Result block, Handover between tools |
| `merge-pdf-password.html` | A password field with the note that the password stays in the browser | `tool-page`: Password needed state |
| `merge-pdf-password-wrong.html` | The same field after a wrong password | `tool-page`: Password needed state |
| `merge-pdf-damaged.html` | What is wrong and a link to Repair PDF | `tool-page`: Damaged file state |
| `merge-pdf-failed.html` | What happened in one sentence and one thing to try | `tool-page`: Failed state |
| `word-to-pdf-too-large.html` | The upload sentence for a server tool, the limit, the file's size and what to try | `tool-page`: Too large state, Heading and sentence |
| `group-organise-pages.html` | A group page listing its tools | `tool-registry`: Seven groups |
| `not-found.html` | The 404 page with a link to the list of tools | `look-and-feel`: Plain 404 page |
| `about-placeholder.html` | A marked placeholder for a page only the owner writes | `look-and-feel`: Pages only the owner writes |

The state screens leave out the text below the tool. On the real page it stays where `merge-pdf-empty.html` shows it.

## What is decided and what is not

Decided by `SPEC.md` and followed here: one column of 44rem, system fonts, 17px text at 1.55 line height, the light colours, corners of 4px at most, underlined links, no icons, no images apart from page thumbnails, no motion apart from the progress bar, a header and footer of plain links.

Everything below is proposed here. Some of it was decided on 10 Nov 2026; `CLAUDE.md`, under "Owner decisions since the last SPEC.md export", has the list and wins over this file. In short: the dark colours, the `#5c5c5c` control edge and the column position are accepted; the white field fill, the dashed borders on placeholder boxes and the visible "2 tools match." line are turned down, and the screens have not been redrawn for those three. The rest is still waiting for the owner. Do not treat it as settled.

Colours and lines:

- **Dark colours.** `SPEC.md` gives none. `design.css` proposes background `#171614`, text `#ecebe6`, secondary text `#a8a59c`, links `#8ab4f0`, lines `#3a3833`, control edges `#a8a59c`, field fill `#211f1c`, and a light main button with dark text.
- **Edges of inputs and secondary buttons** use `#5c5c5c` (`--control`), not the `#d9d6cc` that `SPEC.md` gives for lines and borders. The lighter colour is too faint to show where a control is. Dividers and the result box keep `#d9d6cc`.
- **Field fill.** Inputs and the progress track are filled with `#fff` (`--field`), a colour `SPEC.md` names only for button text.
- **Problem boxes** (damaged, too large, failed, the 100 MB warning) have a border in the text colour, so they stand apart from the result box.
- **Dashed borders** mark a button that cannot be used and the placeholder box. `SPEC.md` gives solid lines only.

Layout and behaviour:

- **Where the column sits.** It is placed towards the left of a wide screen. "Left-aligned" in `SPEC.md` could also mean a centred column with left-aligned text.
- **Two steps to download.** "Merge and download" starts the job, then the result block has its own Download button. This follows `SPEC.md` literally; whether the main button should download at once is an open question.
- **The link to Repair PDF** on the damaged-file screen. Repair PDF is a phase 2 tool, so the link has nowhere to go at launch.
- **Group headings on the home page are links** to the group pages. `SPEC.md` does not say how a visitor reaches a group page.
- **Two lines the specs do not ask for:** "2 tools match." under the filter box, and "You can also drop files anywhere on this page, or paste them." under the file picker. The specs say the home page and the empty state hold nothing else.
- **Controls the specs do not name:** Add more files, Remove, Leave this file out, Merge the other 2 files, Go back to your files.
- **The merged file's name** is built from the first file's name. `SPEC.md` gives the rule for one input only.
- **The 100 MB warning** is shown when the files together pass 100 MB, not when one file does.
- **The wrong-password message** is bold text above the field. The specs say only that the page says the password is wrong.

Content:

- **Which tools the home page lists.** It shows the 16 phase 1 tools in six groups. Read and check has no phase 1 tool, and Image to PDF is left out until the owner answers the question in `CLAUDE.md`.
- **"Unlock PDF".** The word "unlock" is on the banned list in `SPEC.md` and is also this tool's name in the catalogue. The owner settles that.
- **All page text.** Tool descriptions, how-to steps, questions and messages are drafts for the owner to review. Each screen carries a comment saying so. The text below the tool on `merge-pdf-empty.html` is a short sample of about 190 words; the real text is 250 to 500 words.

## Notes for building from these

Which shared component draws which part. Confirm this in the Phase 0 design before building:

| Part of the screen | Component |
| --- | --- |
| Heading, sentence, the slots for everything else, progress, problem boxes, password field, text below the tool | `ToolShell` |
| "Choose PDF files", drop and paste, "Add more files" | `FilePicker` |
| The items in the working area, with thumbnails and Move up, Move down and Remove. In Merge PDF each item is a file; in page tools each item is a page | `PageGrid` |
| File name, size, Download, next steps, Start again | `Result` |

`design.css` is split the same way: a "Global" part for the one site stylesheet, and a "Components" part whose blocks name the component they belong to.

Two things the Phase 0 design has to settle, which the table above does not:

- `ToolShell` holds both served text (heading, sentence, text below the tool) and interactive parts (progress, password field). `SPEC.md` lets only the tool widget ship JavaScript, so the design must split the two.
- Field and button styles are used by three components and by the home page filter, so they belong in the global stylesheet even though `design.css` lists them under "Components".

Things the static screens cannot show:

- **Lists come from the registry.** The home page list, the group page list, related tools and the next steps in the result block are generated from `src/tools/registry.ts`, using registry names. They are written out by hand here only because these are static files. The sentence on a group page ("All of them run in your browser") must also follow the registry, since it is true only for groups with no server tool.
- **The home page filter needs a small script.** Every tool is in the served HTML and the script only hides those that do not match.
- **The password field is never submitted to an address.** It has no `name` and sits in no form here. In the built component, Enter in the field does the same as the main button, in script, and the password never goes into a URL.
- **"Nothing was uploaded"** on the too-large screen is true only because the size is checked in the browser before any request. It must not be shown after the server refuses a file.
- **A button that cannot be used keeps focus.** Move up on the first item is marked with `aria-disabled`, not `disabled`, so focus is not lost when an item reaches an end.
- **Each Move up, Move down and Remove button names its file** for a screen reader.
- **Links that stand alone are at least 44px tall**, and long file names wrap; nothing scrolls sideways at 360px.
- The one inline style left, the width of the progress bar, is a value the script sets.

Other notes:

- The thumbnails are stand-ins drawn with CSS. Real ones are renders of the visitor's own pages.
- The fonts in the screenshots are those of the machine that took them. The site uses the system font stack, so they will differ by device.
- Buttons here do nothing. The screens show one state each.
- File names, sizes and page counts are examples.

## Changing a screen

Edit the HTML or `design.css`, then take new screenshots at 360px and 1280px wide and replace the old ones. If the change is to how the site should look or behave, change `SPEC.md` or the OpenSpec specs first; the owner decides those.
