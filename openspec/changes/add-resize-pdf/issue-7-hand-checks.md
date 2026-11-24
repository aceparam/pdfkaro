# Resize pages to A4 or Letter (`/resize-pdf`): hand checks for issue #7

For the program manager to post on issue #7 once the tool is built (`add-resize-pdf`). It is not done until these are checked.

- [ ] **Readers.** Resize `text.pdf` to Letter and `mixed.pdf`, `form.pdf`, `rich.pdf` and `tagged.pdf` to A4 and to Letter, and open each result in Chrome, Firefox, Adobe Reader and macOS Preview. Check that:
  - every page is the chosen paper, the same way round as before, and shows the same way up;
  - the content is centred, keeps its shape, and nothing is cut off;
  - links still cover their words and work, form fields sit on their boxes with their values, bookmarks go to the same spot;
  - typing into `form.pdf`'s field after resizing to Letter: how large the typed text looks in each reader;
  - print preview at actual size shows the chosen paper.
- [ ] **Hidden stays hidden.** Crop a file with a note and some text in its margin, then resize the result from A4 to Letter: in each reader, nothing from the cut-off margin shows in the white space, and the note is not shown, while its popup still opens if the note had one.
- [ ] **Multilingual file.** Resize `multilingual.pdf` to Letter; a reader of Hindi, Telugu, Arabic and Chinese checks that every page reads as before.
- [ ] **Browsers and phones.** The page in Firefox, Safari and Edge, and on Android Chrome and iOS Safari at phone size: pick, choose Letter, resize, download.
- [ ] **Screen reader.** "Paper size" is read as a group with its two choices and which is chosen; the result's heading, name, size and two notes are read in order; "Every page is already the paper size you chose." and its words are read when nothing changes.
- [ ] **Owner's review** of the page text (`src/content/tools/resize-pdf.md`), the choice's labels, the result notes, the no-new-file words and the "Organise pages" hub words.
- [ ] **Owner's answers** on the eight defaults:
  1. pages already the chosen size (within 1 point, no user unit) left as they are;
  2. square pages upright;
  3. no margin added;
  4. a resized page's own bleed, trim and art boxes removed (Crop PDF cuts them back instead);
  5. passwords and restrictions dropped;
  6. text typed into a form field later uses its old font size, which can look large on a page made much smaller: accept for now?
  7. notes, links and fields that an earlier crop kept out of view are hidden after resizing (their Hidden flag is set; popups excepted): keep?
  8. a page with broken drawing instructions can show, after resizing, what an earlier crop hid (it was still in the file before too): accept for now, or build a content check later?
