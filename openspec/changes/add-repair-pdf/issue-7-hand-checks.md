# Repair PDF: hand checks for issue #7 (draft)

A draft of the hand checks Repair PDF (`/repair-pdf`, add-repair-pdf) adds to issue #7, to be posted there when the pull request opens. Repair PDF is not called done until each is ticked and the owner has reviewed its words.

## Repaired files in readers

Make the files with `tests/unit/repair-helpers.ts` (`damagedKinds()`; a short script can write each to disk), repair each on the preview, and open the result.

- [ ] Each of the 36 damaged kinds, repaired, opens without a warning or a repair prompt in Chrome, Firefox, Adobe Reader and macOS Preview, with the pages, text, bookmarks, link and attachment the fixtures README records for it.
- [ ] A real damaged file: a PDF download interrupted part way (stop a download of a large PDF, keep the partial file) repaired; the pages that arrived open in all four readers.
- [ ] A real damaged file: a PDF that went through a text-mode transfer (every line ending changed, as an FTP text transfer or an email attachment saved as text does) repaired; it opens in all four readers.
- [ ] A damaged protected file (`damagedCopy(password.pdf)` from the helpers): the page asks for the password, a wrong one is refused, `open-sesame` reads 3 pages; the repaired file opens with no password and no restrictions in all four readers.
- [ ] A damaged file with restrictions only (`damagedCopy(restricted.pdf)`): no password asked; the repaired file prints and copies in Adobe Reader.
- [ ] A file whose last save was lost (`cutUpdate()` from the helpers): the repaired file shows the earlier page one, as the result note and the page text say.
- [ ] Adobe Reader's Preflight (or its document properties) shows no structure warning on the repaired `damaged-xref.pdf` and `damaged-cut.pdf`.

## The page

- [ ] "Nothing to repair" is known only after the main button: choose `text.pdf`, press "Repair and download", and read "This file has no damage this tool can find." with its advice. Judge whether this is clear enough, or whether the owner wants it found before the button (owner question 4).
- [ ] The page in Chrome, Firefox, Safari and Edge, and on Android Chrome and iOS Safari at phone size: choose a damaged file, repair it, download it.
- [ ] A screen reader (VoiceOver and NVDA or TalkBack) on the page: the file's row once read ("damaged-xref.pdf, 3 pages, 5.9 KB."), the password field and its note, progress, the result heading and both notes, the "no damage found" heading and advice, the too-damaged words with "Choose another file", and the damaged notice for a file with no pages.
- [ ] The multilingual file damaged (`damagedCopy(multilingual.pdf)` from the helpers) and repaired: a reader of each script (Hindi, Telugu, Arabic, Chinese) checks that every sentence reads as in the original.
- [ ] A 110 MB damaged file (`make-large.mjs`, then `damagedCopy`) on a phone: the 100 MB notice shows, and the job either finishes or says the browser ran out of memory (owner question 10).

## The link from every other tool

- [ ] On each browser and phone above, a damaged file on Merge PDF shows, after "Leave this file out", the sentence "Repair PDF may be able to recover it. On that page, choose the file again." and the link "Go to Repair PDF" on its own line, easy to tap and apart from the button; following it opens Repair PDF in the same tab with no file listed and no leave-page prompt; Back shows Merge PDF with no file.
- [ ] The same on one page tool (Split PDF), one one-file tool (Compress PDF) and Remove a password.
- [ ] A screen reader on the damaged notice: the heading, then the sentence about Repair PDF; Tab reaches the button first and the link next, each with a visible focus outline.

## Words for the owner to review

- [ ] The page text below the tool (`src/content/tools/repair-pdf.md`), marked as a draft.
- [ ] The tool's words in the registry: name "Repair PDF", heading "Repair a damaged PDF", sentence, title and description, "Repair and download", `report-repaired.pdf`, the two result notes, the "no damage found" heading and advice, the damaged advice ("No pages could be found in it. If you have another copy of the file, try that one."), the too-damaged sentence, and the page-too-large sentence ("… to repair here. … and repair the rest.").
- [ ] The "Make smaller and fix" hub's description and sentence, which now name repairing a damaged file.
- [ ] The damaged notice's words on every other tool: "Repair PDF may be able to recover it. On that page, choose the file again." and "Go to Repair PDF".
- [ ] The Privacy page's new draft sentences: the link and what following it tells GitHub, the program fetched on Repair PDF's page, what the number of qpdf requests can tell, and that a repaired file can hold parts of an earlier saved version.
