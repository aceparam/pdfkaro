# Compress to a target size (`/compress-pdf-to-100kb`, `-200kb`, `-500kb`, `-1mb`, `-2mb`): hand checks for issue #7

For the program manager to post on issue #7 once the tool is built (`add-compress-to-target`). It is not done until these are checked.

- [ ] **Readers.** Compress `compress-scans.pdf` on the 100 KB, 200 KB and 500 KB pages, `rich.pdf`, `form.pdf` and `tagged.pdf` on the 100 KB page with a target the tests use (they are under 100 KB, so take the made files: `node tests/fixtures/make-large.mjs --scans` on the 2 MB page, and the files `tests/e2e/target-files.ts` writes into the temporary folder), and open each result in Chrome, Firefox, Adobe Reader and macOS Preview. Check that:
  - every page shows, with no warning, and the pictures are where they were;
  - text, drawings and fonts look exactly as before; links, bookmarks, form fields and their values, and attached files are there;
  - a result said to be "now 200 KB or smaller" is at most 200,000 bytes in the reader's or the system's file details.
- [ ] **Pictures at the floor, read by eye on a phone.** On the 100 KB page, compress a scanned form or certificate that reaches the floor (72 pixels to the inch, quality 40), and read the result on a phone at its printed size: is 10-point text in the scan still readable? A lossless screenshot at the floor: still sharp-edged, never blurred like a JPG?
- [ ] **The over-target result.** On the 100 KB page with a long scan: the heading says it is still over, the sentence names the same size as the line under the file name, and Download gives that file.
- [ ] **A held file.** On the 2 MB page, pick a small PDF and a small protected PDF: the button is unavailable, says why, and no password is asked.
- [ ] **Passwords.** A protected file over the target: after compressing it asks for the same password in each reader, and keeps its print and edit restrictions.
- [ ] **Multilingual file.** On a page whose target is under its size (the tests call the engine with a target of half its size), `multilingual.pdf` keeps every page reading as before for a reader of Hindi, Telugu, Arabic and Chinese.
- [ ] **Browsers and phones.** Each of the five pages in Firefox, Safari and Edge, and on Android Chrome and iOS Safari at phone size: pick, compress, download; and the time a 100 MB scan file takes on a mid-range Android phone, against the figure measured with the CPU slowed four times (tests/fixtures/README.md).
- [ ] **Screen reader.** The held main button is read as unavailable with its sentence; the progress line in real units ("Picture 2 of 3"); the result heading with its sentence when over the target; "This file could not be made smaller." with its advice.
- [ ] **Owner's review** of the five page texts (`src/content/tools/compress-pdf-to-100kb.md` to `-2mb.md`), the titles, descriptions, headings and sentences, the result notes, the over-target advice, the no-smaller-file words, and the "Make smaller and fix" hub words.
- [ ] **Owner's answers** on the five defaults:
  1. the target is fixed by each page, with no choice of target on the page;
  2. the floor of 72 pixels to the inch and JPG quality 40;
  3. a target counts in thousands (200 KB = 200,000 bytes);
  4. a file already at or under the target is not compressed, and the main button says why;
  5. a file that fits is always given, whatever it saves; a file still over is given only when at least 1% smaller, else no new file.
