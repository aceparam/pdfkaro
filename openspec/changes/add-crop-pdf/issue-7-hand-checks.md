# Crop PDF (`/crop-pdf`): hand checks for issue #7

For the program manager to post on issue #7. Crop PDF is the first Phase 2 tool (`add-crop-pdf`). It is not done until these are checked.

- [ ] **Readers.** Crop `text.pdf`, `mixed.pdf`, `form.pdf`, `rich.pdf` and `tagged.pdf`, and open each result in Chrome, Firefox, Adobe Reader and macOS Preview. Check that:
  - each page is cut to its content with a small margin, and nothing that was drawn is cut off;
  - turned pages (`mixed.pdf`) show upright as before;
  - links work, form fields can be filled, bookmarks go to their pages;
  - printing uses the cropped page, not the old paper (each reader's print preview).
- [ ] **Hidden, not removed.** In a result whose cut-off margin held text, search for that text in each reader and note which ones still find it, so the words "some programs can still find, copy or read aloud its text" can be checked or made more exact.
- [ ] **Multilingual file.** Crop `multilingual.pdf`; a reader of Hindi, Telugu, Arabic and Chinese checks that no text was cut off and every page reads as before.
- [ ] **Browsers and phones.** The page in Firefox, Safari and Edge, and on Android Chrome and iOS Safari at phone size: pick, crop, download.
- [ ] **Screen reader.** The result's heading, name, size and four notes are read in order; "No pages were cropped." and its words are read when nothing is cut.
- [ ] **200% text on a phone.** With the four notes, Download sits just under the heading, but "Start again" is about 3,700 pixels further down. Decide whether that is acceptable.
- [ ] **Owner's review** of the page text (`src/content/tools/crop-pdf.md`), the result notes, the no-new-file words, the Privacy draft sentence and the "Organise pages" hub words.
- [ ] **Owner's answers** on the four defaults: the margin (a fortieth of the shorter side), white from 240, bleed, trim and art boxes cut back, passwords dropped.
