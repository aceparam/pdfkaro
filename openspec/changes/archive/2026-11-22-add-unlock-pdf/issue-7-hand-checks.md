## Remove a password (Unlock PDF, `/unlock-pdf`), `add-unlock-pdf`

Hand checks still owed before the tool can be called done:

- [ ] Download `restricted-unprotected.pdf` and `password-unprotected.pdf` (from `tests/fixtures/restricted.pdf`, and `password.pdf` with `open-sesame`), and open each with no password in Chrome, Firefox, Adobe Reader and macOS Preview. Print a page and copy text from each, and confirm no reader reports restrictions or a warning.
- [ ] A certified file (`/Perms` with `/DocMDP`) that also has restrictions: write it with the tool and open the result in Adobe Reader, to see whether its certification still limits it (the result note says only that restrictions are removed).
- [ ] Try the page in Firefox, Safari and Edge, and on Android Chrome and iOS Safari at phone size: a file with restrictions only, a file that needs a password, a wrong password, a file with nothing to remove, Cancel.
- [ ] A screen reader (VoiceOver and NVDA) on the password field: announced as a password field labelled "Password for <name>", with "The password stays in your browser. It is not sent anywhere."; the result heading and the "This file has no password or restrictions." heading read when focus moves to them.
- [ ] The owner's review of the page text (`src/content/tools/unlock-pdf.md`, the registry words and result notes), a draft.
- [ ] The multilingual test file (Hindi, Telugu, Arabic, Chinese) must exist and the tool must be run on it, protected first, before it is called done.
