# Design reference

Static screens that show how PDFkaro pages should look and behave. Use them as a guide when building pages and components. They are not part of the site and are not shipped.

`SPEC.md` is the source of truth, then `openspec/specs/`. If a screen here differs from either, the spec wins and the screen should be fixed.

## What is here

| Path | What it is |
| --- | --- |
| `design.css` | One reference stylesheet for all screens. A guide for writing `src/styles/site.css`, not the production file |
| `screens/` | One plain HTML file per screen. Open any of them in a browser; no build step and no JavaScript |
| `screenshots/` | Each screen at 360px and 1280px wide, in light mode, plus three in dark mode |

To see dark mode, set the device or browser to dark. The screens follow the setting; there is no toggle.

The owner's working canvas for these designs is at https://claude.ai/artifact/Rk7fHt6xcoCWnHPWerGD83 (private to the owner).

## The screens

Merge PDF stands in for every tool, because all tools share one page shell. Word to PDF is here only to show a server tool.

| Screen | Shows | Spec |
| --- | --- | --- |
| `home.html` | Site name, one sentence, the filter box, every launch tool under its group | `look-and-feel`: Home page |
| `home-filtered.html` | The list after "jpg" is typed in the filter box | `look-and-feel`: Home page |
| `merge-pdf-empty.html` | The whole tool page before a file is chosen, with how-to steps, questions and related tools | `tool-page`: Seven parts, File picker, Empty state, Text below the tool |
| `merge-pdf-loading.html` | "Getting ready" beside each file name | `tool-page`: Engine loading state |
| `merge-pdf-files.html` | The working area: files with thumbnails, Move up, Move down, Remove, and the main button | `tool-page`: Working area, Reordering without drag, One main button |
| `merge-pdf-working.html` | "Page 14 of 120", the progress bar and Cancel | `tool-page`: Working state |
| `merge-pdf-done.html` | File name, size, Download and next steps | `tool-page`: Result block, Handover between tools |
| `merge-pdf-password.html` | A password field with the note that the password stays in the browser | `tool-page`: Password needed state |
| `merge-pdf-damaged.html` | What is wrong and a link to Repair PDF | `tool-page`: Damaged file state |
| `merge-pdf-failed.html` | What happened in one sentence and one thing to try | `tool-page`: Failed state |
| `word-to-pdf-too-large.html` | The upload sentence for a server tool, the limit, the file's size and what to try | `tool-page`: Too large state, Heading and sentence |
| `group-organise-pages.html` | A group page listing its tools | `tool-registry`: Seven groups |
| `not-found.html` | The 404 page with a link to the list of tools | `look-and-feel`: Plain 404 page |
| `about-placeholder.html` | A marked placeholder for a page only the owner writes | `look-and-feel`: Pages only the owner writes |

The state screens leave out the text below the tool. On the real page it stays where `merge-pdf-empty.html` shows it.

## What is decided and what is not

Decided by `SPEC.md` and followed here: one column of 44rem, system fonts, 17px text at 1.55 line height, the light colours, 1px lines, corners of 4px at most, underlined links, no icons, no images apart from page thumbnails, no motion apart from the progress bar, a header and footer of plain links.

Proposed here and waiting for the owner. Do not treat these as settled:

- **Dark colours.** `SPEC.md` gives none. `design.css` proposes background `#171614`, text `#ecebe6`, secondary text `#a8a59c`, links `#8ab4f0`, lines `#3a3833`, and a light main button with dark text.
- **Edges of inputs and secondary buttons** use `#5c5c5c`, not the `#d9d6cc` that `SPEC.md` gives for lines and borders. The lighter colour is too faint to show where a control is. Dividers and boxes keep `#d9d6cc`.
- **Where the column sits.** It is placed towards the left of a wide screen. "Left-aligned" in `SPEC.md` could also mean a centred column with left-aligned text.
- **Two steps to download.** "Merge and download" starts the job, then the result block has its own Download button. This follows `SPEC.md` literally; whether the main button should download at once is an open question.
- **The link to Repair PDF** on the damaged-file screen. Repair PDF is a phase 2 tool, so the link has nowhere to go at launch.
- **Which tools the home page lists.** It shows the 16 phase 1 tools in six groups. Read and check has no phase 1 tool, and Image to PDF is left out until the owner answers the question in `CLAUDE.md`.
- **All page text.** Tool descriptions, how-to steps and answers are drafts for the owner to review.

## Notes for building from these

- The thumbnails are stand-ins drawn with CSS. Real ones are renders of the visitor's own pages.
- The fonts in the screenshots are those of the machine that took them. The site uses the system font stack, so they will differ by device.
- Buttons here do nothing. The screens show one state each.
- File names, sizes and page counts are examples.

## Changing a screen

Edit the HTML or `design.css`, then take new screenshots at 360px and 1280px wide and replace the old ones. If the change is to how the site should look or behave, change `SPEC.md` or the OpenSpec specs first; the owner decides those.
