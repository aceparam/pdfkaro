**add-uniform-requests: checks and words for the owner**

Which of the site's files a tool page fetches no longer depends on what the visitor's file holds (owner, 22 Nov 2026, "we need transparency"). The end-to-end test `tests/e2e/uniform-requests.spec.ts` checks this in Chromium against a stand-in host. These are the checks it cannot do, and the new words.

### Privacy page draft review: two new paragraphs (draft words, for the owner)

Under "What happens to your file", after "These requests carry nothing from your file: not its contents, not its name and not a password.":

> Which programs the page fetches does not depend on what your file holds. This is true for a damaged file, a protected file or a file of the wrong kind too.

At the end of "Who serves the site":

> From your browser's requests, GitHub can tell which tool page you opened and when you chose a file: in practice your first file, and later ones once your browser's copies of the programs are about 10 minutes old, or if your browser keeps no copies. It may be able to tell when you started a job. GitHub does not receive your file, its name or a password. Your browser may ask for a program more than once, and in a few cases how often it asks can depend on your file. If a page of your file is slow to show, asking again can tell GitHub that.

Three questions go with them, each with the default that is built:

1. Keep the last two sentences ("Your browser may ask for a program more than once …")? Default: yes.
2. Accept, for now, the rare cases where a program is asked for again and how often can depend on the file: no usable browser cache; copies older than about 10 minutes; a page of the file slow to draw; the main button pressed while PDF.js's files are still arriving; a worker crash or running out of memory; a replaced signature picture still being read after a minute; a job longer than 10 minutes. The Privacy page does not claim them closed. Default: yes.
3. When several files of the wrong kind are picked, keep a Remove button on the "Getting ready" line (read out as "Remove 2 files")? Default: yes.

Please do not approve the sentence "Which programs the page fetches does not depend on what your file holds…" until the Firefox and Safari release check below has passed: the automated test runs in Chromium only.

### Release checks

- [ ] **Firefox and Safari.** On one PDF tool page (for example `/merge-pdf`), pick `text.pdf` in a fresh private window, then `damaged-xref.pdf` in another fresh private window, and compare the requests the browser makes after each pick (the network panel, filtered to the site's own files). They should be the same files, each once. The automated test runs in Chromium only.
- [ ] **The live host's cache lifetime.** Run `curl -sI` on one built file of the live site and check that `Cache-Control` still says `max-age=600` (10 minutes), which the new Privacy sentences rely on. If the site launches on another host, read its headers instead.

### Hand checks

- [ ] **A file of the wrong kind on a phone, on a slow connection.** On Android Chrome and iOS Safari, with a slow connection (or the browser's network throttling), pick a file that is not a PDF on a PDF tool page. The line should say "notes.docx, Getting ready" (the file's own name) with its Remove button while the site's programs load, up to a minute, then the picker comes back and says the file is not a PDF. With a screen reader on, check that focus goes to the "Getting ready" line, that the Remove button can be reached, and that the sentence is read out when the picker comes back. Also check that Remove during the wait goes straight back to the picker.
- [ ] **The same by keyboard on a desktop browser** (Firefox and Safari): Tab reaches Remove from the "Getting ready" line; when the wait ends, focus is on the picker.

- [ ] **Run every per-tool hand check on code that includes `add-uniform-requests`.** This change touches every tool's pick and job flow, so the pending browser, phone and screen-reader checks above should be done on a preview built after it merged.
