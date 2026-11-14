# Design

## Context

- **Reorder pages** (PR #12) gave pages in the grid a pair of stacked buttons, a `total` for long files, and a page order kept in the widget's state. It also added `writePages` in `src/engines/plain.ts`, which writes pages with no bookmark rewrite.
- **Rotate PDF** needs a different pair ("Left" and "Right"), a turn per page in the state, a thumbnail drawn turned, and a qpdf write that changes each page's `/Rotate` and nothing else.
- **qpdf turns pages** with `--rotate=+90:1-3,7`: the `+` adds to the turn a page already has, and the page list uses the same form as `--pages`. Several `--rotate` options can be given, one per angle. Only `/Rotate` changes; content, annotations, bookmarks and the rest are untouched.

## Goals and non-goals

**Goals**
- Rotate PDF end to end: single pages and every page, by keyboard, touch and mouse, on files of any length.
- Reorder's moves and the toggle tools unchanged.

**Non-goals**
- Angles other than quarters; odd or even pages; typed ranges; straightening scans.

## Decisions

### The registry entry

```ts
{ id: 'rotate-pdf', group: 'organise', runsIn: 'browser', phase: 1, accepts: ['application/pdf'],
  related: ['rearrange-pdf-pages', 'delete-pdf-pages', 'extract-pdf-pages', 'split-pdf', 'merge-pdf'],
  pages: [{ slug: 'rotate-pdf', name: 'Rotate PDF', summary: 'Turn the pages of a PDF.',
            title: 'Rotate PDF pages in your browser - PDFkaro',
            description: 'Turn one page or every page of a PDF. The file stays on your device and is not uploaded.',
            heading: 'Rotate PDF pages',
            sentence: 'Turn one page or every page of a PDF. Your file stays on your device.' }],
  widget: { pickerLabel: 'Choose a PDF file', addLabel: 'Choose another file',
            dropHint: 'You can also drop a file anywhere on this page, or paste it.', acceptsName: 'a PDF',
            multiple: false, minFiles: 1, tooFewFiles: 'Choose a PDF file to turn its pages.',
            items: 'pages', itemControls: false, itemTurns: true, outputs: 'one', outputSuffix: 'rotated', resultPages: 'input',
            actionLabel: 'Turn and download', writingLabel: 'Writing the new file',
            doneHeading: 'Your new file is ready', failedHeading: 'The new file was not made.',
            resultNotes: ['Apart from the password, nothing changes but the way pages face: text, links, form fields, bookmarks, attached files, hidden text and the document's details are as they were.',
                          'The new file has no password and no restrictions, even if the file you chose had them.'] } }
```

- **`itemTurns?: true`** says a page tool's pages turn. A tool has at most one of page moves (`itemControls` on pages), page turns and a toggle; the registry test checks this.
- **"Turn" in the words, "rotate" in the name.** The heading, title and file name use "Rotate", the word people search for; the buttons and sentences use "turn", the plainer verb ("How the words should read").

### The turns in the state

`State` gains `turns: Turns | null`, with `Turns = { all: number; pages: Record<number, number> }` in a new `src/widget/turns.ts`. `null` means nothing turned, for every tool, so the reducer needs no tool setting.

- `all` is the quarters every page is turned (0 to 3). `pages[n]` is page n's own quarters on top of it (1 to 3; a page with none has no key). A page's turn is `(all + (pages[n] ?? 0)) % 4`.
- **`page-turned { page, by }`** (`by` is 1 for right, -1 for left) changes `pages[page]`, removing the key when it comes to 0. **`all-turned { by }`** changes `all` only, so turning every page of a 120,000-page file is one number. Both act only while the file's pages are listed, and check that `page` is in the file.
- `added` (replacing the file), `removed` and `reset` set `turns` back to `null`. `started`, `failed` and `cancelled` leave it, so Cancel and failure keep the turns.
- Plain functions in `turns.ts`, tested in Node:
  - `turnOf(turns, page)`;
  - `turnedCount(turns, pages)`: pages whose turn is not 0, without walking every page (with `all` at 0 it counts the keys; otherwise it is `pages` less the keys that bring a page back to 0);
  - `turnSummary(turns, pages)`: "No pages will be turned. Press “Left” or “Right” under a page to turn it, or turn them all." / "1 page will be turned." / "3 pages will be turned." / "Every page will be turned.";
  - `turnAnnouncement(page, by, turn)`: "Page 3 turned right. It is now a quarter turn right of how it was." / "… half a turn from how it was." / "… a quarter turn left of how it was." / "… back the way it was.";
  - `allAnnouncement(by)`: "Every page turned right." / "… left.";
  - `turnsToSend(turns, pages)`: the option for the engine (below).

### Turning in the page grid

- `PageGrid` gains `turns?: { of(id): number; onTurn(id, title, by): void }`. With it, each grid cell shows "Left" and "Right" stacked under "Page N", each as wide as the cell and at least 2.75rem tall, as Reorder's pair is built, named "Turn page N left" and "Turn page N right". No button is ever unavailable: a page turns round and round.
- **The turned thumbnail.** `PageItem` gets `turn` (0 to 3) and draws the picture with `transform: rotate(turn × 90deg)`, and for a quarter or three quarters `scale(0.76)` too, so a turned portrait page (52 by 68 in the slot) fits the slot's 52 width. The slot keeps its size, so the grid never moves. The blank paper shown before a picture arrives turns the same way. The picture is drawn by PDF.js with the turn the file already gives the page, so what the visitor sees is the result.
- Focus stays on the button pressed (nothing moves, so no focus request is needed).
- **"Turn all left" and "Turn all right"** are two secondary buttons in `ToolWorkspace`, above the pages and below the line that says what will happen, shown once the pages are. They dispatch `all-turned` and announce.
- `ToolWorkspace` builds the item's turn from `turnOf`, memoised so a turn draws only its own cell again (`PageItem` is memoised and gets a plain number).

### The option and the engine

- `turnsToSend(turns, pages)` gives `{ all: 0..3, pages: [[page, quarters], …] }` with `pages` sorted by page; `useToolRun` sends `{ turns: … }` when `words.itemTurns`, and `{ turns: { all: 0, pages: [] } }` when nothing is turned.
- `src/engines/tools/rotate-pdf.ts`:
  1. `plainCopy`;
  2. `pageTurns(pages, options.turns)` checks the option: `all` a whole number 0 to 3; `pages` an array no longer than the file, of entries that are each an array of exactly two items, `[page, quarters]`, with each page a whole number in the file, sorted and unique, and quarters a whole number 1 to 3; anything else is refused ("The page turns are not valid."). It returns the pages grouped by their final turn: `{ 1: number[], 2: number[], 3: number[] }`, sorted page arrays, with the pages not named taking `all`. With `all` set, a group can be most of the file, an array of up to 120,000 numbers (about 1 MB); `pageList` joins its runs into ranges, so the qpdf list stays short. Every argument is still built from checked page numbers, as the comment on `callWithArgumentFile` says;
  3. progress 0;
  4. `writeTurned(tools, plain, groups)`;
  5. progress 100.
- **`writeTurned(tools, plain, groups)`** in `src/engines/plain.ts`, beside `writePages`: one qpdf call through the argument file, `/in.pdf`, then `--rotate=+90:<list>`, `--rotate=+180:<list>` and `--rotate=+270:<list>` for the groups that have pages, then `/out.pdf`, then `qpdf --check`. With no group it still writes the plain copy, so the result has no password. `pageList` already writes runs as ranges.
- `pageTurns` lives in the engine file, exported for its test, until a second caller needs it.

### Tests

- **Unit:**
  - the reducer: `page-turned` and `all-turned`, keys removed at 0, pages not in the file ignored, nothing while a job runs, back to `null` on replace, remove and reset, kept through Cancel;
  - `turns.ts`: `turnOf`, `turnedCount` (including with `all` set and exceptions, on 120,000 pages, without walking them), the summary, the announcements, `turnsToSend`;
  - `pageTurns` (refuses a page out of range, repeated or out of order, quarters of 0, 4, a fraction or a string, a list longer than the file, `all` out of range, not an object);
  - `run` on every file in `tests/fixtures/`, checking each page's `/Rotate` through qpdf's JSON: single pages, every page, a page that already had a turn (`mixed.pdf`'s A5 and upside-down pages), text unchanged in the uncompressed result, `rich.pdf`'s bookmarks, link and `note.txt` kept, `tagged.pdf` keeping everything, `password.pdf` and `restricted.pdf` coming back unprotected, nothing turned, damaged files, bad turns.
- **Component:** grid cells with turns show "Left" and "Right" stacked with full names, no Remove, nothing unavailable; a turned item's picture carries the turn.
- **E2e:**
  - turning by keyboard, with announcement and focus;
  - turning back;
  - "Turn all right", and the next batch of a 900-page file drawn turned;
  - turning and checking each page's turn in the download (`mixed.pdf`);
  - password, damaged, not a PDF, two files dropped;
  - Cancel keeps the turns;
  - engine-load failure;
  - skip link;
  - the 20,000-page notice, with "Turn all right" and a page's "Right" on the 120,000-page file blocking nothing for more than 100 ms;
  - no-upload with an exact allowlist; `rich.pdf` and `tagged.pdf` strings in requests and the console; the address with no query and no hash;
  - Merge, Split, Extract, Delete and Reorder e2e tests still pass.

### Odd turns already in a file

qpdf adds a quarter to whatever `/Rotate` a page has. A crafted file can carry a value that is not a multiple of 90 (`45`), a negative one (`-90`), one past a full turn (`450`), or one inherited from a `/Pages` node. PDF.js draws a value that is not a multiple of 90 as 0. Task 3.1 adds fixture pages with each of these and records in the fixtures README what the result is and whether it matches the turned thumbnail. If one does not match, the README says so and the owner may list it on Known problems; turning to absolute angles worked out from each page's current turn is the fix, if the owner wants it (the security reviewer, stage 1).

## Risks and trade-offs

- **Two kinds of turn.** "Turn all" adds to every page's own turn: turning page 3 right and then all pages left leaves page 3 as it was. The thumbnails show this, and every announcement says how far a page is from how it was in the file, never which way it points, because a page the file already turns (such as `mixed.pdf`'s upside-down page) would otherwise be described wrongly. The summary counts the pages whose final turn is not 0.
- **The scaled thumbnail** of a page turned a quarter is about three quarters of its size. It keeps the grid still; the turn is still plain to see.
- **Many taps.** Turning a single page three quarters left takes one press of "Left"; there is no case that takes more than two presses. Turning many single pages takes a press each; "Turn all" covers the common case of a whole sideways scan.
