# Proposal

## Why

The privacy reviewer found, at `add-privacy-draft` stage 2 (22 Nov 2026), that two tools fetch fflate's file (`fflate-*.js`) only for some files:

- **Compress PDF** (`src/engines/tools/compress-pdf.ts`, the `needsLossless` branch) fetches it only when the file holds a lossless picture this tool can make smaller.
- **Image to PDF** (`src/engines/tools/images-to-pdf.ts`, `inspect`) fetches it at pick time only for a PNG. (The job itself always fetches it.)

On a cold cache the host sees that request, and GitHub Pages logs it with the visitor's IP address. So the request pattern tells the host one fact about the visitor's file: whether a PDF holds such pictures, and on `/image-to-pdf` (and `/jpg-to-pdf`, `/png-to-pdf`) whether a PNG was picked. This goes against the owner's decision of 11 Nov 2026 (CLAUDE.md, "PDF.js's helper data is one fixed set"), that no request depends on what a file needs, which the `tool-page` spec already asks of thumbnails ("the same for every file, after a pick"). PDF to JPG and PNG, Split PDF and Sign PDF already fetch their fflate use the same way for every file.

## What Changes

- **Compress PDF fetches fflate at the start of every job,** before the file is read, whatever the file holds. The rest of the job is unchanged: fflate is still used only for lossless pictures.
- **Image to PDF fetches fflate for every picture read,** JPG or PNG, before the picture's type is read, as Sign PDF already does for its picture.
- **Tests:**
  - unit: each engine asks for fflate for every file (Compress: a file with no pictures, one with only JPGs, one with lossless pictures; Image to PDF: a JPG, a PNG and a file of neither kind);
  - end-to-end: for each tool, two or more runs in fresh browser contexts (a cold cache each) on inputs that differ in kind, recording every request from the pick to the downloaded result, give the same set of paths, and each passes the existing no-upload check.
- **Spec deltas** to `compress-pdf` and `images-to-pdf` "Nothing is uploaded": which files are fetched after a pick SHALL NOT depend on the file.

No page text changes. No Privacy page wording changes in this change. The Privacy page draft (`add-privacy-draft`, PR #33) merged first; it says only that requests after a pick carry nothing from the file, which stays true, and claims nothing about which files are fetched, so it needs no change. It must not claim that the files fetched never depend on the file while the gap below is open (program manager and privacy, stage 1).

## Cost

fflate's built file is 13,650 bytes, 6,282 bytes by gzip (measured on this branch's build). It is now fetched by every Compress job and every Image to PDF pick that did not fetch it before. Nothing changes before a pick, so `npm run weigh` is unchanged. Compress already fetches qpdf's WebAssembly (megabytes) for every job, so 6 KB is small beside it. This is within the owner's 11 Nov decision, which accepted larger fixed downloads for the same reason, so it is not put to the owner as a new question.

## Scope

- **In:** the two engines named above, their unit tests, their end-to-end tests, the two spec deltas.
- **Out:**
  - a site-wide rule and test that every tool's requests after a pick are the same for every file. Other tools were checked by reading their engines (design.md); among files read as ready, none fetches a file depending on content;
  - files not read as ready (damaged, unsupported, waiting for a password): on every tool they fetch no thumbnail files and run no job, so the host can tell them from readable ones. This is put to the owner as a question (design.md), not fixed here;
  - the Privacy page wording (`add-privacy-draft`);
  - the order of requests, which can differ (for example, a protected file's thumbnail waits for its password); the set is what is checked.

## SPEC.md sections

- "Privacy, limits and security", "Browser tools": "No request that leaves the page carries file contents, file names or passwords."
- "Architecture and tech stack", "Rules for the code" 4: engines load late, after a pick. Still true.
- The owner's decision of 11 Nov 2026 in CLAUDE.md, "PDF.js's helper data is one fixed set".

Phase 1, not a tool: a privacy fix to two Phase 1 tools already published (Compress PDF, catalogue 14th; Image to PDF, 7th). It is a change in behaviour seen only in network requests, so it goes through OpenSpec.

## Open decisions and owner questions touched

- None blocks this change. The fix follows the owner's 11 Nov decision.
- New question for the owner, raised at stage 1 and carried in CLAUDE.md: a damaged, unsupported or still-locked file fetches no thumbnail files, so it can be told apart from a readable one; and even once a password is typed, the delay before the thumbnail files are fetched shows the file was protected (privacy, stage 1). Is that acceptable under the 11 Nov decision, or should every pick fetch the thumbnail files (a separate change)? "Compress PDF keeps passwords" and "Very large PNGs" are untouched.

## Where the file is processed

In the browser, in the tool worker, as now. No network request is added beyond fetching one more of the site's own files, by a fixed name, for every file. No request carries file contents, a name or a password.
