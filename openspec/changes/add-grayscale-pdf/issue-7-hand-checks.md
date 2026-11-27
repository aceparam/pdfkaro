# Grayscale PDF (`/grayscale-pdf`): hand checks for issue #7

For the program manager to post on issue #7 once the tool is built (`add-grayscale-pdf`). It is not done until these are checked.

- [ ] **Readers and printers.** Convert `text.pdf`, `images.pdf`, `form.pdf`, `rich.pdf`, `tagged.pdf`, `scanned.pdf` and a coloured file with pictures and shadings, and open each result in Chrome, Firefox, Adobe Reader and macOS Preview, then print it on a black-and-white and on a colour office printer. Check that:
  - everything that was colour shows and prints grey, with no leftover colour other than the kinds the page names;
  - the text can be selected, searched and copied;
  - links work and bookmarks go to the same spot;
  - typing into `form.pdf`'s field shows grey text, and its box and border are grey.
- [ ] **The starting black.** A page that selects RGB (`/DeviceRGB cs`, and a named ICC RGB space) and then draws text with no colour set: in Acrobat and Chrome the text is black, not white.
- [ ] **ICC CMYK start.** A page that selects a named ICC CMYK space and paints with no colour set: in Acrobat and Chrome the shape is white after converting, as before.
- [ ] **Left parts.** A form left unedited that inherits a repointed name and holds `sc`, and a stream left because of doubt (a glued token): in Acrobat and Chrome each draws as before, with no error.
- [ ] **CMYK pictures.** Adobe (APP14) CMYK JPGs, as stored and with `/Decode [1 0 1 0 1 0 1 0]`: in each reader, grey and not inverted.
- [ ] **Print preflight.** In Acrobat's Output Preview, a converted RGB file and a converted CMYK file: which inks are listed (`GreyR`, `GreyG`, `GreyB`, `GreyC` … `GreyK`), and how overprint (`/OPM 1`) shows on a CMYK file before and after.
- [ ] **Type 4 drawing time.** A 300-pixel-to-the-inch A4 colour scan, converted: how long Chrome's viewer takes to draw it, against the original.
- [ ] **Inline pictures.** A file with an inline picture with a clear end, converted: each reader shows the picture (in colour, as left) and the grey drawing around it.
- [ ] **Multilingual file.** Convert `multilingual.pdf`; a reader of Hindi, Telugu, Arabic and Chinese checks that every page reads as before.
- [ ] **Browsers and phones.** The page in Firefox, Safari and Edge, and on Android Chrome and iOS Safari at phone size: pick, convert, download; `grey-only.pdf` gives "Nothing in this file was turned grey."
- [ ] **Screen reader.** The row is read once read; progress is read in real units ("Page 3 of 12"); the result heading, name, size and two notes are read in order; "Nothing in this file was turned grey." and its words are read; the failure "Page 14 has too much drawing on it …" is read under "The file was not converted.".
- [ ] **Owner's review** of the page text (`src/content/tools/grayscale-pdf.md`), the two result notes, the no-new-file words, the failure sentence for a page with too much drawing, the "Make smaller and fix" hub words, and the Privacy draft sentence ("Grayscale PDF shows colours in grey but keeps the colours of the pages’ drawing and pictures in the new file, where a program can still read them.").
- [ ] **Owner's answers** on the defaults (questions 2 to 8 of the change):
  2. the grey formula, 0.3 R + 0.59 G + 0.11 B, CMYK through the simple conversion, CalRGB and ICC by their raw components;
  3. what is left in colour (spot colours, Lab, unusual profiles, JPEG 2000, inline pictures, soft masks and the rest named below the tool);
  4. the names: "Grayscale PDF", "grayscale" in the title, button and file name, "grey" and "colour" in sentences;
  5. black set as RGB (`0 0 0 rg`) counts as a change, so most files give a new one;
  6. passwords and restrictions dropped, stored page thumbnails removed, bookmark colours made grey;
  7. fixed notes, not a sentence naming what was left in this file;
  8. a page whose drawing unpacks past 64 MiB stops the job with its own sentence: keep the stop, or raise it?
- [ ] **Owner question 9.** A 119 MB file of very dense drawing takes 77 s, and the 100 MB scans file 54 s, mostly in the qpdf --check every writing tool runs. Accept for now, or look at that check for every tool first? (default accept for now)
