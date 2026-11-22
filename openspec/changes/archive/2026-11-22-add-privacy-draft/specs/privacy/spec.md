## ADDED Requirements

### Requirement: The Privacy page draft says what happens for each kind of tool

Until the owner has reviewed it, the Privacy page SHALL be an agent's draft, written from what the code does. In plain words it SHALL say where every published tool processes a file; what the page and its worker hold and when they let go; what happens to passwords, typed text, drawings and pictures given to a tool; what the site does not do; what the browser itself may do; what the Content Security Policy blocks and does not; and who serves the site. (SPEC.md: Whole site; Build phases, Phase 1)

#### Scenario: The page is read

- **WHEN** a visitor opens `/privacy`
- **THEN** it has one heading, "Privacy", and a section for each topic above, in served HTML with no script

#### Scenario: Every published tool runs in the browser

- **WHEN** every tool in the registry runs in the browser, as today
- **THEN** the page says that no tool on the site runs on a server today, and describes no upload, server limit, deletion time or other behaviour of a later phase

#### Scenario: Kinds of input are named by the tools that take them

- **WHEN** the page speaks of typed text, drawings, pictures or passwords
- **THEN** it names exactly the published tools whose registry options take them (and Remove a password for an input file's password), by their registry names, and says what the page does with each, as the code does it

#### Scenario: A password is kept, and forgotten

- **WHEN** the page describes when a password is forgotten
- **THEN** it says a failed or cancelled job keeps it, and names only the moments the code forgets it: a job that made a new file or told the visitor no new file was needed, the file replaced or removed, "Start again", and leaving the page

### Requirement: The Privacy draft is marked and kept from search engines

While the owner has not approved it, the Privacy page SHALL begin, under its heading, with one plain line saying it is a draft written from what the site's code does and not yet checked by the person who runs the site. It SHALL carry `noindex` when built at the site's root, and SHALL be left out of the sitemap. Approval is marked by the owner's word, in a change that removes the line and marks the page written. (SPEC.md: Build phases, 6; owner decision 13 Nov 2026)

#### Scenario: The draft at the site's root

- **WHEN** the site is built at its root and the Privacy page still shows the draft line
- **THEN** the page carries `noindex`, keeps its canonical and social tags, and `sitemap.xml` does not list it

#### Scenario: A draft marked written by mistake

- **WHEN** the Privacy page is marked written while it still shows the draft line, or marked not written while it shows neither the draft line nor a placeholder sentence
- **THEN** the build check names the page and fails

### Requirement: Every sentence on the Privacy page is literally true

Each statement on the Privacy page SHALL be true of the code as built, and the change that writes it SHALL list each claim with the code that makes it true and the test or release check that proves it. The page MUST NOT make an absolute claim ("100%", "never", "secure" and the like), invent a person, contact or motive, or claim the policy reaches the file-reading workers in a browser not yet checked. (SPEC.md: Privacy, limits and security; Banned patterns)

#### Scenario: The page's words are checked

- **WHEN** the unit tests read the Privacy page, without its frontmatter and comments
- **THEN** they find no absolute claim from the list in design.md, no word from "Banned patterns", no exclamation mark and no email address

#### Scenario: The policy section

- **WHEN** the unit tests read the section on the Content Security Policy
- **THEN** its unconditional sentence speaks of the page only and names no worker; workers are named only where it says the tests check them in Chrome and Firefox; it says the policy has not yet been checked in Safari; and it names what the policy does not stop (links, opening another page, WebRTC, DNS prefetch, requests to the site's own address)

#### Scenario: Safari has not been checked by hand

- **WHEN** the hand check in issue #7 that the policy reaches PDF.js's worker in Safari has not been done
- **THEN** a unit test fails if the Safari sentence is removed without the guard being changed in the same change

#### Scenario: A server tool is added

- **WHEN** a tool whose registry entry runs on the server is added while the page says that every tool works in the browser or that no tool runs on a server
- **THEN** a unit test fails with a message saying to update the Privacy page and ask the owner before the tool ships

#### Scenario: The browser-only sentences are reworded away

- **WHEN** every published tool runs in the browser but the page no longer holds any of the listed browser-only sentences
- **THEN** a unit test fails, so the server guard cannot switch off silently

#### Scenario: A tool gains a text, drawing, picture or new-password option

- **WHEN** a published tool gains such an option, or a named tool is renamed, and the page's section for that kind does not name exactly the matching tools
- **THEN** a unit test fails and names the tools to add or remove

### Requirement: No page stores anything in the browser

No page SHALL set a cookie or write to `localStorage`, `sessionStorage`, IndexedDB or the origin private file system, on load or after a job. Until the offline service worker ships, no page SHALL write a Cache API entry; after that, the cache SHALL hold only the site's own pages and engines, never a visitor's file. (SPEC.md: Whole site; Privacy, limits and security, Browser tools)

#### Scenario: Every page is opened

- **WHEN** the site end-to-end test opens each built page, including the 404 page, and waits for the network to settle
- **THEN** the browser holds no cookie for the site, those stores are empty, and every request was a `GET` with no body and no query string, to the site's own origin and a path that exists in the build

#### Scenario: A job finishes

- **WHEN** a tool's no-upload test finishes its job
- **THEN** the browser holds no cookie for the site and those stores are empty, as each tool's test already checks

#### Scenario: The offline service worker ships

- **WHEN** a later change adds the phase 2 service worker cache
- **THEN** that change rewrites the Privacy page's storage sentences and lets the checks find only the site's own pages and engines in the cache
