# PDFkaro: build spec

Last updated 10 Nov 2026. Exported from the owner's working doc, which stays the source of truth:
https://claude.ai/artifact/7Rp7wzcZc24tX2sGeiy3TW

## Names

Call the site **PDFkaro** and the repo `pdfkaro`.

| Item | Choice |
| --- | --- |
| Website name | PDFkaro (one word, said "PDF karo") |
| Tagline | Every PDF job, done in your browser. |
| Domain, in order of preference | pdfkaro.com, pdfkaro.in, pdfkaro.app |
| Repo name | `pdfkaro` |

Why this name:

- "PDF" is in the name, so the domain and every page title carry the word people search with.
- "Karo" is Hindi for "do it". The name says what the site is for: whatever the PDF job is, do it here.
- Seven letters, easy to say aloud, and it sticks at once for anyone who speaks Hindi.

What the name will not do is rank the site for "merge pdf". No name does that. Ranking comes from the tool pages, covered under SEO below.

Names checked and dropped:

| Name | Why it was dropped |
| --- | --- |
| PDFshed | The owner found it not catchy enough |
| PlainPDF | [plain.tools](https://plain-tools.vercel.app/pdf-tools) already uses "Plain PDF tools" |
| EveryPDF | [EveryPDFTool](https://www.saasworthy.com/product/everypdftool) is a live PDF toolkit |
| PDF Anything | [PDF Everything](https://www.thejoai.com/ai-tools/pdf-everything/) already exists |
| OhMyPDF | [OhMyPDF](https://ohmypdf.pages.dev/about) is a live browser-based PDF site |
| PDFchores | Searches for it return chore-chart printables, which the brand would compete with |
| PDF Handyman | Searches for it return handyman contract templates |

One risk to settle before buying the domain: [PDFKro](https://www.producthunt.com/p/pdfkro), a free browser-based PDF platform, launched in 2026 under a name one letter away. Visitors who mistype may land there, and its owners could object to the name. Check its domain and any trademark filing first. If either is a problem, the fallbacks are PDFbaba and PDFwala, which showed no existing PDF product in search.

These checks used web search only. Domain registration and trademarks were not checked, so confirm both at a registrar before buying.

## What we are building

A free website with one page per PDF job, where most jobs run inside the visitor's browser and the file never leaves their device. A small server handles only the jobs a browser cannot do well, such as Word to PDF.

The typical visitor has one PDF, one problem and a deadline: a form portal that rejects files over 200 KB, six scans that must become one file, a page that is upside down. They arrive from a search, do the job and leave. Every decision below serves that visit.

Rules that settle arguments:

1. **One job per page.** The page a visitor lands on does the thing they searched for, with the file picker visible without scrolling.
2. **Browser first.** A tool goes to the server only when it cannot run in the browser. When a file is uploaded, the page says so in plain words before the upload starts.
3. **No account, no watermark, no daily limit popup.** Nothing stands between the visitor and the download.
4. **Honest about limits.** If a tool will do a poor job on this file (PDF to Word on a scanned page, for example), the page says so instead of producing a broken result.
5. **Works on a phone.** Every tool is usable with one thumb on a 360 px wide screen.
6. **Boring on purpose.** No animation, no illustration, no marketing copy. The site should look like one careful person made it.

## Tool catalogue

The full site has 54 tools in seven groups. Seventeen ship at launch, and all seventeen run in the browser, so the launch site needs no server.

"Runs in" says where the file is processed. "Phase" says when the tool ships (see Build phases).

### Organise pages

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| Merge PDF | /merge-pdf | Browser | 1 |
| Split PDF | /split-pdf | Browser | 1 |
| Extract pages | /extract-pdf-pages | Browser | 1 |
| Delete pages | /delete-pdf-pages | Browser | 1 |
| Reorder pages | /rearrange-pdf-pages | Browser | 1 |
| Rotate PDF | /rotate-pdf | Browser | 1 |
| Crop PDF | /crop-pdf | Browser | 2 |
| Resize pages to A4 or Letter | /resize-pdf | Browser | 2 |
| Insert blank pages | /add-pages-to-pdf | Browser | 3 |
| Pages per sheet | /pdf-pages-per-sheet | Browser | 3 |
| Booklet | /pdf-booklet | Browser | 3 |
| Interleave two scans | /alternate-mix-pdf | Browser | 3 |
| Image to PDF | /image2pdf | Browser | 1 |

### Make smaller and fix

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| Compress PDF | /compress-pdf | Browser | 1 |
| Compress to a target size | /compress-pdf-to-100kb, -200kb, -500kb, -1mb, -2mb | Browser | 2 |
| Grayscale PDF | /grayscale-pdf | Browser | 2 |
| Repair PDF | /repair-pdf | Browser | 2 |
| Flatten PDF | /flatten-pdf | Browser | 2 |
| PDF to PDF/A | /pdf-to-pdfa | Server | 3 |

### Convert to PDF

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| JPG to PDF | /jpg-to-pdf | Browser | 1 |
| PNG to PDF | /png-to-pdf | Browser | 1 |
| HEIC, WebP, TIFF to PDF | /heic-to-pdf, /webp-to-pdf, /tiff-to-pdf | Browser | 2 |
| Word to PDF | /word-to-pdf | Server | 2 |
| Excel to PDF | /excel-to-pdf | Server | 2 |
| PowerPoint to PDF | /powerpoint-to-pdf | Server | 2 |
| Web page to PDF | /html-to-pdf | Server | 3 |
| Text or Markdown to PDF | /text-to-pdf, /markdown-to-pdf | Browser | 3 |
| Scan to PDF with the phone camera | /scan-to-pdf | Browser | 3 |

### Convert from PDF

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| PDF to JPG | /pdf-to-jpg | Browser | 1 |
| PDF to PNG | /pdf-to-png | Browser | 1 |
| PDF to text | /pdf-to-text | Browser | 2 |
| Extract images | /extract-images-from-pdf | Browser | 2 |
| PDF to Word | /pdf-to-word | Server | 2 |
| PDF to Excel | /pdf-to-excel | Server | 3 |
| PDF to PowerPoint | /pdf-to-powerpoint | Server | 3 |
| PDF to Markdown | /pdf-to-markdown | Browser | 3 |

### Edit and sign

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| Add page numbers | /add-page-numbers-to-pdf | Browser | 1 |
| Watermark | /watermark-pdf | Browser | 1 |
| Sign PDF | /sign-pdf | Browser | 1 |
| Fill a form | /fill-pdf-form | Browser | 2 |
| Edit PDF | /edit-pdf | Browser | 2 |
| Edit metadata | /edit-pdf-metadata | Browser | 2 |
| Header and footer | /add-header-footer-to-pdf | Browser | 3 |
| Bates numbering | /bates-numbering | Browser | 3 |
| Edit bookmarks | /pdf-bookmarks | Browser | 3 |

### Protect

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| Protect with a password | /protect-pdf | Browser | 1 |
| Unlock PDF | /unlock-pdf | Browser | 1 |
| Redact | /redact-pdf | Browser | 2 |
| Remove metadata | /remove-pdf-metadata | Browser | 2 |
| Sign with a certificate | /digitally-sign-pdf | Browser | 3 |

### Read and check

| Tool | URL | Runs in | Phase |
| --- | --- | --- | --- |
| OCR, make a scan searchable | /ocr-pdf | Browser | 2 |
| Page count and file info | /pdf-info | Browser | 2 |
| Compare two PDFs | /compare-pdf | Browser | 3 |
| View PDF | /pdf-viewer | Browser | 3 |

### Scope notes for specific tools

- **Unlock** removes a password the visitor types in, and removes print and edit restrictions. It does not guess or crack an unknown password.
- **Redact** must remove the content, not draw a black box over it. Redacted pages are turned into images so the text underneath cannot be copied out, and the page says so.
- **Sign PDF** places a drawn, typed or uploaded signature image on the page. Certificate signatures are the separate phase 3 tool.
- **Edit PDF** adds text, images, shapes, highlights and whiteout on top of a page. Rewriting the existing text of a PDF in place is out of scope.
- **Compress to a target size** is one tool with preset pages. Each preset page opens the compressor with that target already selected.
- **PDF to Word, Excel and PowerPoint** are the hardest tools on the list. See Open decisions.
- **AI tools** (summarise, chat with a PDF, translate) are left out. See Open decisions.

## Architecture and tech stack

The site is static HTML served from a CDN. Each tool loads its PDF engine into a Web Worker in the visitor's browser and does the work there. Only the tools marked "Server" in the catalogue send a file to a small conversion service.

How the parts connect (the doc shows this as a diagram):

- **Static site on a CDN** sends pages and engines to the browser.
- **In the browser** (46 of the 54 tools): the tool page holds the file picker, options, progress and result. It hands the file to a Web Worker, which runs qpdf, pdf-lib, PDF.js, Ghostscript and Tesseract and does all the processing.
- **Conversion server** (server tools only, from phase 2): an API that limits uploads and deletes files within an hour, in front of Gotenberg, which wraps LibreOffice and Chromium. The browser sends a file here only for server tools, and the result comes back.

Eight of the 54 tools send a file to the server. The other 46 do all their work in the browser.

| Layer | Choice | Notes |
| --- | --- | --- |
| Site | Astro with static output, TypeScript | One HTML page per tool, generated from a single registry file |
| Interactive parts | Preact islands | Only the tool widget ships JavaScript; the rest of the page is plain HTML |
| Styling | Hand-written CSS, one global stylesheet plus scoped component styles | No Tailwind, no component kit, no icon library |
| Page structure: merge, split, rotate, delete, reorder, encrypt, decrypt, repair | qpdf compiled to WebAssembly | Copes with damaged and encrypted files better than pure JavaScript libraries |
| Drawing on pages: numbers, watermark, signature, images to PDF, form filling | [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) | The maintained fork; the original pdf-lib has had no release in years |
| Rendering: thumbnails, PDF to image, text extraction | PDF.js (`pdfjs-dist`) | Apache 2.0 licence |
| Compression | Ghostscript compiled to WebAssembly | AGPL licence, see Open decisions |
| OCR | Tesseract.js | Language data is downloaded only when the visitor picks that language |
| Server conversions | [Gotenberg](https://github.com/gotenberg/gotenberg) in Docker | Wraps LibreOffice (Office to PDF) and Chromium (HTML to PDF); also does PDF/A |
| Server API | A small Node service in front of Gotenberg | Upload limits, rate limiting, job ids, file deletion |
| Hosting | Static site on any CDN host; server on one small container host | No database and no accounts at launch |
| Tests | Vitest for engines, Playwright for one end-to-end run per tool | |
| Analytics | Cookieless page counts, or none | No third-party scripts besides this |

Before installing any library, confirm that the package is still maintained and note its licence in `LICENSES.md`. Package names move quickly in this area.

Rules for the code:

1. **One registry drives everything.** `src/tools/registry.ts` has one entry per tool: slug, name, page title, description, group, where it runs, phase, accepted file types, related tools. Pages, navigation, the home page list and the sitemap are all generated from it.
2. **Engines are pure functions.** Each operation is a function of the form `(files: Uint8Array[], options) => Promise<Uint8Array[]>` with a progress callback. It has no DOM access, so it can be unit tested in Node.
3. **Engines run in a Web Worker.** The UI thread never processes a file.
4. **Engines load late.** WebAssembly is fetched when the visitor picks a file, not when the page loads.
5. **Files hand over between tools in memory.** After a result, "do something else with this file" opens the next tool with the file already loaded.
6. **The server is stateless.** Files live in a temp directory and are deleted on download or after 60 minutes, whichever comes first.

Repo layout:

```
pdfkaro/
  src/
    tools/registry.ts      one entry per tool
    engines/               pure functions, one file per operation
    workers/               worker entry points and message types
    components/            ToolShell, FilePicker, PageGrid, Result
    pages/index.astro      home page, the list of tools
    pages/[slug].astro     one page per registry entry
    content/               how-to text and FAQ per tool, Markdown, edited by hand
    styles/site.css
  server/                  API in front of Gotenberg (phase 2)
  tests/
    fixtures/              the PDF test set
  public/
  LICENSES.md
```

## Tool page anatomy

Every tool page has the same seven parts in the same order, built from one shared `ToolShell` component.

1. **Heading.** The job in plain words: "Merge PDF files".
2. **One sentence.** What the tool does and where the file goes: "Combine several PDFs into one. Files stay on your device." Server tools say instead: "Your file is uploaded to convert it and deleted within an hour."
3. **File picker.** One large button, "Choose PDF files". Dropping a file anywhere on the page also works, and so does paste.
4. **Working area.** Appears after a file is chosen: page thumbnails and only the options this tool needs. Defaults are set so the main button works without touching any option.
5. **One main button**, named after the result: "Merge and download", not "Submit" or "Process".
6. **Result.** File name, new size, a Download button, and a short list of next steps that carry the file into another tool.
7. **Below the tool.** Three or four how-to steps, a short FAQ, links to related tools.

States every tool handles:

| State | What the visitor sees |
| --- | --- |
| Empty | The file picker and nothing else |
| Engine loading | "Getting ready" next to the file name, never a blank screen |
| Working | Progress in real units: "Page 14 of 120", with a Cancel button |
| Done | The result block |
| Password needed | A password field, with a note that the password stays in the browser |
| Damaged file | What is wrong, and a link that opens the file in Repair PDF |
| Too large | The limit, the file's size, and what to try |
| Failed | What happened in one sentence, and one thing to try next |

Details that apply everywhere:

- Output names are built from the input name: `report.pdf` becomes `report-merged.pdf`. Several outputs download as one zip.
- Nothing downloads on its own. The visitor presses Download.
- Reordering works by drag and also by "move up" and "move down" buttons, so it works with a keyboard and on a small touch screen.
- Page thumbnails load as they scroll into view. A 500-page file must not freeze the page.
- Size figures are real and in plain units: "4.2 MB, was 11.8 MB".

## Look and feel

The site should look like a well-kept personal tool page: one column of text, plain links, one button. Reference points for tone are GOV.UK service pages and sqlite.org, not startup landing pages.

The test for every page: take a screenshot. If it could be the landing page of any software startup, it fails. If it could be a page one careful person built for their own use and then tidied, it passes.

### What to build

| Element | Rule |
| --- | --- |
| Layout | One column, 44rem maximum width, left-aligned. No sidebars, no card grids |
| Font | The system font stack. No web fonts are downloaded |
| Text size | 17px body, 1.55 line height, headings in the same font, bold |
| Background | `#fbfaf6` |
| Text | `#1b1b1b`, secondary text `#5c5c5c` |
| Links | `#0b4fa8`, always underlined |
| Main button | `#1b1b1b` background, white text, 4px corners |
| Lines and borders | 1px solid `#d9d6cc`, 4px corner radius at most |
| Dark mode | Follows the device setting, same rules, no toggle needed |
| Spacing | Generous and uneven where content calls for it; not every block the same height |
| Images | None, apart from page thumbnails of the visitor's own file |
| Icons | None by default. A word is clearer than an icon |
| Motion | None, apart from the progress bar |

The home page is the site name, one sentence, a plain text box that filters the list ("What do you need to do?"), and every tool as a text link under their seven group headings, each with a one-line description. Nothing else.

The header is the site name as a text link and a link to "All tools". The footer is five text links: About, Privacy, Changes, Known problems, Contact.

### How the words should read

- Short sentences, plain verbs: "Choose files", "Download", "Start again".
- Say what the tool does, then stop. No selling.
- Errors say what happened and what to do next.
- FAQ entries answer questions people really have, such as "Why is my file still large after compressing?" Never an entry that restates the page title.
- No exclamation marks anywhere.

### Pages only the owner can write

Agents leave a clearly marked placeholder for these and must not invent a person, a backstory or a motive.

- **About.** First person, a few paragraphs: who made this, why, how it pays for itself, a real contact address.
- **Changes.** A dated list of what was added or fixed, in plain words.
- **Known problems.** What does not work well yet. This page does more for trust than any badge.

### Banned patterns

These are what make a site read as machine-made. None of them appear anywhere.

- A hero section: giant headline, gradient text, "Get started" button, floating screenshot
- Three feature cards in a row with an icon each ("Fast. Secure. Free.")
- Emoji used as icons, or an icon in front of every heading
- Purple or indigo gradients, glass blur, glow, drop shadows, large rounded corners, pill badges
- Entrance animations, hover lift, animated counters, confetti
- Testimonials, star ratings, "trusted by" lines, user counts, company logos
- The words seamless, effortless, powerful, blazing, supercharge, unlock, elevate, revolutionise, all-in-one solution
- "100%" claims and anything in capitals for emphasis
- Pop-ups of any kind: newsletter, cookie banner, chat bubble, "rate us", upgrade prompts
- The Inter font, shadcn/ui, default Tailwind styling, Lucide or Heroicons
- Stock illustrations, 3D shapes, generated images
- A sticky header that follows the scroll

When a design question is not answered here, choose the plainer option.

## SEO

People do not search for a site name. They search for the job: "merge pdf", "compress pdf to 200kb". So each tool gets its own page whose URL, title and heading are that search phrase, and the page does the job the moment it loads.

The broad searches ("merge pdf", "pdf to word") are held by sites with many years of links, and a new site should not expect to rank for them soon. The first traffic will come from longer, specific searches, which is why the catalogue includes target-size and format-specific pages.

### Every tool page

| Part | Rule |
| --- | --- |
| URL | The search phrase, lowercase with hyphens, at the root: `/merge-pdf`. A published URL never changes |
| Title tag | Job first, then the brand, under 60 characters: "Merge PDF files in your browser - PDFkaro" |
| Meta description | Under 155 characters. States the job and that files stay on the device (or are deleted within an hour for server tools) |
| Heading | One `h1`, the job in plain words |
| Body text | Present in the served HTML, not injected by JavaScript |
| Text under the tool | 250 to 500 words: how-to steps and real questions, edited by hand |
| Links | Four to six related tools, chosen in the registry |
| Structured data | `WebApplication` and `BreadcrumbList` JSON-LD, checked with Google's Rich Results Test |
| Social tags | Open Graph title, description and one plain image |
| Canonical | A self-referencing canonical tag on every page |

### Site-wide

- `sitemap.xml` and `robots.txt` are generated from the registry at build time.
- Each of the seven groups has a hub page that lists its tools, and the home page links to every tool.
- Speed targets on a mid-range Android phone: Largest Contentful Paint under 2.5 s, Interaction to Next Paint under 200 ms, layout shift under 0.1.
- A tool page ships under 100 KB of compressed HTML, CSS and JavaScript before a file is chosen.
- The site is registered in Google Search Console and Bing Webmaster Tools on launch day.

### Specific-search pages

These are where a new site can win first.

- **Target sizes:** "compress pdf to 100kb", "to 200kb", "to 500kb", "to 1mb". Upload forms with size limits make these common searches.
- **Format pairs:** "heic to pdf", "webp to pdf", "tiff to pdf".
- **Specific jobs:** "remove last page from pdf", "rotate one page in pdf", "combine scanned pages".

Each of these pages must be the working tool with that setting already chosen, plus text written for that exact case. Pages that are the same text with one word swapped get ignored by search engines and make the site look cheap, so none are published.

### After launch

- The line that sets this site apart is "your file never leaves your device". It goes in titles and descriptions where it is true.
- The owner posts the site, in their own words, where such tools get discussed. If the repo is public, the README links to the site.
- Translations come in phase 3, starting with Hindi, each reviewed by a fluent reader and marked with `hreflang` tags.

## Privacy, limits and security

The promise is simple and must be literally true: browser tools never send the file anywhere, and server tools delete it within an hour.

### Browser tools

- No request that leaves the page carries file contents, file names or passwords. An automated test fails the build if a tool makes any upload while processing.
- Passwords typed into Protect and Unlock stay in the browser.
- There is no fixed size limit. Above 100 MB the page warns that the job may be slow or run out of memory on a phone.
- From phase 2, a service worker caches tool pages and engines so browser tools work with no connection.

### Server tools

| Rule | Value |
| --- | --- |
| Transport | HTTPS only |
| Largest upload | 50 MB |
| File lifetime | Deleted on download or after 60 minutes, whichever comes first |
| Rate limit | 20 jobs per IP address per hour |
| Time limit per job | 60 seconds, then the job is stopped and the visitor is told |
| Logging | Job id, tool, size, duration and outcome only. Never file names or contents |
| File type check | By file contents, not by extension |
| Isolation | Conversions run in a container with no outbound network access and with document macros disabled |

The numbers above are starting values to tune once real usage is known.

Web page to PDF needs extra care, because a visitor could ask the server to fetch an internal address. Accept only public `http` and `https` addresses, refuse private and loopback ranges after resolving the name, and refuse redirects into them.

### Whole site

- A strict Content Security Policy: scripts from the site's own origin only, plus what WebAssembly needs.
- No advertising or tracking scripts. Analytics, if used, sets no cookies.
- The Privacy page says in plain words what happens to a file for each kind of tool, and it is checked against the code before each release.

## Build phases

The site is built in four phases, and no phase starts until the one before it passes its gate.

| Phase | What ships | Gate before the next phase |
| --- | --- | --- |
| 0. Skeleton | Repo, registry, `ToolShell`, file picker, page grid, worker plumbing, stylesheet, home page, placeholder About and Privacy pages, CI with lint, type check and tests, preview deploys | Merge PDF works end to end on a phone, and the page passes the look-and-feel test |
| 1. Launch | The phase 1 tools, all in the browser. Sitemap, titles, structured data, Privacy page, Search Console | Every tool passes the Definition of done, and the owner has written the About page |
| 2. Server and harder tools | The conversion server, Office to PDF, PDF to Word, OCR, Edit, Fill a form, Crop, Redact, target-size pages, the remaining phase 2 tools, offline support | Server limits and deletion are tested, and the Privacy page matches the code |
| 3. Everything else | The phase 3 tools, specific-search pages, translations | None. Ongoing |

How agents work in this repo:

1. One tool per pull request, with its engine, tests, page text and registry entry together.
2. Build tools in catalogue order within a phase. Merge PDF is first because every shared component gets exercised by it.
3. Reuse `ToolShell`, `FilePicker`, `PageGrid` and `Result`. A tool that needs a new shared component adds it in its own pull request first.
4. A new dependency needs a line in `LICENSES.md` and a sentence in the pull request on why it is needed.
5. Anything listed under Open decisions is a question for the owner. Ask, do not guess.
6. Page text is drafted plainly and marked for the owner to review. The About, Changes and Known problems pages are left as placeholders.
7. Every pull request includes screenshots of the changed page at 360px and 1280px wide.

## Definition of done

A tool is done when it passes every check below on the shared test set, and not before.

### The test set

`tests/fixtures/` holds one PDF of each kind. Every tool runs against all of them.

- An ordinary text document of a few pages
- A 500-page document
- A file over 100 MB, generated by a script and not committed to the repo
- A scanned document with no text layer
- A password-protected file, and a file with print and edit restrictions
- A damaged file with a broken cross-reference table
- A fillable form
- Text in Hindi, Telugu, Arabic and Chinese
- Pages with mixed sizes and mixed rotation
- A file with bookmarks, links and attachments

### Each tool

- Produces a correct result for every file in the test set, or a clear message saying why it cannot.
- Output passes `qpdf --check` and opens without warnings in Chrome, Firefox, Adobe Reader and macOS Preview.
- Leaves alone what it was not asked to change: links, bookmarks, form fields and text stay intact.
- Never blocks the page for more than 100 ms. Progress is visible and Cancel works.
- Works in current Chrome, Firefox, Safari and Edge, and on Android Chrome and iOS Safari.
- Can be used with a keyboard alone and with a screen reader. Text contrast is at least 4.5 to 1.
- For browser tools, the no-upload test passes.
- Has unit tests for its engine and one end-to-end test.
- Has page text reviewed by the owner, with nothing from the banned patterns list.

### The site

- Lighthouse scores on a phone profile: performance 90 or more, accessibility 95 or more.
- The speed targets in the SEO section are met on the home page and on three tool pages.
- Every page has a unique title and description, and the sitemap lists every page.
- There is a plain 404 page that links to the list of tools.
- A full pass over every page at 360px and 1280px finds nothing from the banned patterns list.

## Open decisions

Eight choices belong to the owner. The last column is what agents assume until the owner says otherwise.

| Decision | Options | Assumed until decided |
| --- | --- | --- |
| Licence | [Ghostscript](https://ghostscript.com/licensing) is offered under the AGPL or a paid commercial licence. Publish this repo under AGPL-3.0, buy the commercial licence, or write our own image recompression and drop Ghostscript | Publish under AGPL-3.0. This is not legal advice; read the licensing page before launch |
| PDF to Word, Excel, PowerPoint | Open-source conversion (LibreOffice's PDF import, or pdf2docx, which builds on AGPL-licensed PyMuPDF): free, rough on complex layouts. A paid conversion API: better output, a cost per file, and the file goes to a third party | Open-source, with the page saying it works best on simple text documents |
| Money | Nothing, a donation link, or adverts. Adverts break the look, the speed targets and the no-tracking promise | A donation link only |
| AI tools | Leave out, or add summarise, chat and translate later. They send document text to a model provider and cost money per use | Leave out |
| Source code | Public or private. Tied to the licence decision | Public |
| Domain | Confirm that pdfkaro.com, .in or .app is free, and that the name does not conflict with PDFKro or a registered trademark | Not bought yet |
| Analytics | None, or cookieless page counts | Cookieless page counts |
| Server host and budget | Sets the upload limit and when phase 2 can start | The smallest container plan that runs Gotenberg |

## Sources

- [Gotenberg](https://github.com/gotenberg/gotenberg), the conversion service
- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib), the maintained pdf-lib fork
- [Ghostscript licensing](https://ghostscript.com/licensing), Artifex
- [pdftools by jere-mie](https://github.com/jere-mie/pdftools), an open-source example of the same browser-first stack
