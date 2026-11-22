**Privacy page draft (`add-privacy-draft`)**

The Privacy page is now an agent's draft, written from what the code does. It carries a line saying it has not been checked by the person who runs the site, has `noindex` at the site's root and is left out of the sitemap. It stays that way until the owner approves it; then a small change removes the draft line and sets `written: true` for `/privacy` in `src/site.ts`.

Owner review of the Privacy draft:

- [ ] Read every sentence of `/privacy` (preview: https://aceparam.github.io/pdfkaro/privacy) and approve or correct it. Every word is a draft.
- [ ] Hosting: the page says the site is served by GitHub Pages, which receives each visitor's IP address. Keep naming GitHub, or launch elsewhere and rewrite the section first?
- [ ] Analytics: the page says there are none. Adding page counts later means changing this page first.
- [ ] Money: the page says there are no adverts and says nothing about donations.
- [ ] Contact: the page gives no contact address and does not say how to ask a question.
- [ ] Password manager: the page uses the longer words (a browser may save or suggest a password and may copy a saved one to the browser account), whichever note the tool pages end with (open question from PR #28).
- [ ] Error reports: add "No error reports are sent anywhere."? Default: no.
- [ ] Draft and search engines: keep `noindex` and out of the sitemap until approved (the default), so "the sitemap lists every page" in "Definition of done, The site" stays not passed until then.

- [ ] Page text review: the Privacy page now says what a new file can keep, but three tool pages do not say it all yet. Merge PDF's page does not say the merged file keeps the first file's title, author and other details. Reorder pages' page does not name the document's title and details. PDF to PNG's page does not say its pictures hold only the drawn page, with no title, author or date (PDF to JPG's page does). These pages are not changed in `add-privacy-draft`.

Release checks (no automated test watches these; read them again against the code before each release, using the claim table in `openspec/changes/add-privacy-draft/design.md`, decision 4, or its archived copy):

- [ ] The page lets go of the file when it is removed or replaced and on leaving the page; switching tabs keeps it (`removeFile`, `pagehide` → `clear` in `src/hooks/useToolRun.ts`).
- [ ] In tools that show every page of one file the workers keep the file open; in the others nothing is kept open between pictures; the page closes the kept copy on remove and replace.
- [ ] The new file is let go on leaving the page.
- [ ] The tool's worker, and PDF.js's worker with it, are closed on "Start again" and on leaving the page; ending the tool's worker also ends PDF.js's worker.
- [ ] An input file's password is forgotten on remove, replace and leaving the page.
- [ ] A new password is forgotten on leaving the page.
- [ ] Text, drawings and pictures are let go on leaving the page.
- [ ] PDF to JPG and PDF to PNG pictures still hold no text, EXIF or comment (the browser's canvas encoder).
- [ ] The browser may offer to save or suggest a password (`autocomplete="new-password"` in `NewPasswordField`).
- [ ] No accounts anywhere in the code.
- [ ] On the live host, no cookie is set by a response header.
- [ ] The downloads list, cache and extensions sentences still describe browsers.
- [ ] The site is still served by GitHub Pages (`.github/workflows/pages.yml`), or the hosting section is rewritten.
- [ ] Safari: the Content Security Policy reaches PDF.js's worker (the existing hand check above). Once done, a change edits the Safari sentence on the Privacy page and its guard in `tests/unit/privacy-page.test.ts` together.
