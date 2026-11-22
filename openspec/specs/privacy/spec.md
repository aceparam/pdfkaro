# privacy Specification

## Purpose

The promise from `SPEC.md`, which must be literally true: browser tools never send the file anywhere, and server tools delete it within an hour. This capability covers how the code keeps it for browser tools, the site-wide rules on scripts and tracking, and the Privacy page. Derived from "Privacy, limits and security" in `SPEC.md`, which stays the source of truth if the two ever differ. Rules for the conversion server are in the `conversion-server` capability.

## Requirements

### Requirement: Browser tools send no file data

For a browser tool, no request that leaves the page or one of its workers SHALL carry file contents, file names or passwords. (SPEC.md: Browser tools)

#### Scenario: A job runs in a browser tool

- **WHEN** a visitor chooses a file and runs a job in a browser tool
- **THEN** no request made from the page or its workers carries any part of the file, its name or a password

### Requirement: The no-upload test

Each browser tool SHALL have an automated test that fails the build if the tool makes any upload while processing. The test SHALL watch every request from the page, its workers and its service worker, from file pick to download. (SPEC.md: Browser tools; Definition of done)

#### Scenario: A request carries a body

- **WHEN** a request with a body is made between file pick and download, even if the body is encoded or compressed
- **THEN** the no-upload test fails and the build fails

#### Scenario: File data is put in an address

- **WHEN** code sends the file, text or metadata taken from it, its name or a password in a query string, an image address or a socket message
- **THEN** the no-upload test fails and the build fails

#### Scenario: A request goes to another origin

- **WHEN** a request goes to any origin other than the site's own between file pick and download
- **THEN** the no-upload test fails, unless the change names that origin and the owner has approved it

#### Scenario: A browser tool is finished

- **WHEN** a browser tool is called done
- **THEN** its no-upload test exists, runs in CI and passes

### Requirement: Passwords stay in the browser

Passwords typed into Protect or Unlock SHALL stay in the browser. They MUST NOT be stored, logged, put in a URL or sent anywhere. (SPEC.md: Browser tools)

#### Scenario: A password is typed

- **WHEN** a visitor types a password and the job finishes
- **THEN** the password is in no request from the page, a worker or the service worker, no URL, no console message and no browser storage

### Requirement: No fixed size limit, with a warning

Browser tools SHALL have no fixed size limit. Above 100 MB the page SHALL warn that the job may be slow or run out of memory on a phone. (SPEC.md: Browser tools)

#### Scenario: A 150 MB file is chosen

- **WHEN** a visitor chooses a 150 MB file in a browser tool
- **THEN** the page shows the warning and still lets the job run

### Requirement: Offline use

From phase 2, a service worker SHALL cache tool pages and engines so that browser tools work with no connection. It MUST NOT cache the visitor's files. (SPEC.md: Browser tools)

#### Scenario: The connection drops

- **WHEN** a visitor who has used a browser tool before opens it with no connection
- **THEN** the page loads and the job runs

#### Scenario: The cache is inspected

- **WHEN** the service worker's cache is listed after a job
- **THEN** it holds only the site's own pages and engines, and none of the visitor's files

### Requirement: Content Security Policy

The site SHALL send a strict Content Security Policy that allows scripts from the site's own origin only, plus what WebAssembly needs. Without headers, it SHALL be a meta tag on every page, before any stylesheet or script. It SHALL deny by default, allow no `'unsafe-inline'` or `'unsafe-eval'`, allow an inline block only by its hash, and allow requests to the site's own origin only. (SPEC.md: Privacy, limits and security, Whole site)

#### Scenario: A third-party script is added

- **WHEN** a page tries to load a script from another origin
- **THEN** the browser blocks it under the policy

#### Scenario: An inline script or eval is tried

- **WHEN** a page runs an inline script or calls `eval`
- **THEN** the browser blocks it, and only what WebAssembly needs is allowed beyond the site's own scripts

#### Scenario: Every page carries the policy

- **WHEN** any built page, including the 404 page, is read as served
- **THEN** it has exactly one policy tag, straight after the character set tag and before any stylesheet, script or link, and the policy denies by default

#### Scenario: Only the page's own runnable inline blocks are allowed

- **WHEN** a page's policy is read
- **THEN** its script and style allowances are the site's own origin plus the hash of each inline script and style block on that page that the browser would run or apply, and no other hash; a data block such as JSON-LD is not hashed, and a page with no such block lists no hash

#### Scenario: Requests and loads from another origin

- **WHEN** a page or one of its workers tries `fetch`, `XMLHttpRequest`, `sendBeacon`, a WebSocket or an EventSource to another origin, or the page tries to load a script, stylesheet, image, font, frame or object from another origin
- **THEN** the browser blocks it under the policy

#### Scenario: What the policy does not stop

- **WHEN** the page navigates, opens a window, follows a link, is sent elsewhere by a meta refresh, uses WebRTC or prefetches a name, or a request goes to the site's own origin (on the preview, the whole `github.io` origin of the account), with or without a body
- **THEN** the policy does not stop it, and the no-upload test remains the guard that no file data leaves the page

#### Scenario: Pictures the site draws

- **WHEN** a tool shows a page thumbnail or a picture's thumbnail
- **THEN** it is shown from a `blob:` address of the page, which the policy allows, and no `data:` address is allowed for images

#### Scenario: No base address and no form sending

- **WHEN** a page tries to set a `<base>` address or submit a form
- **THEN** the browser refuses it under the policy

#### Scenario: Pages look and work the same

- **WHEN** any page is opened, with or without a keyboard or a screen reader, and any tool's job is run
- **THEN** the page looks, reads and behaves as before the policy, and every existing end-to-end and no-upload test passes with no change beyond importing the shared watching fixture (in tests that open their own browser context, calling its watch helper), and, in test helpers that fetched a `blob:` address, read a worker's own address or listed every `Blob` the page made, an equivalent check that keeps the same assertion, or a wait for a thumbnail where starting PDF.js's worker now takes one more step

#### Scenario: What a meta tag cannot carry

- **WHEN** the policy is a meta tag
- **THEN** it carries no `frame-ancestors`, `report-uri`, `report-to` or `sandbox` directive, because browsers ignore them there, and the gap is recorded so that a host that sends headers at launch can send the policy as a header with `frame-ancestors 'none'`

#### Scenario: A preview under a sub-path

- **WHEN** the site is built under a sub-path for the preview
- **THEN** every page carries the same policy, the preview's `noindex` tag is still there, and every link, script and worker still works

### Requirement: No advertising or tracking

The site SHALL carry no advertising or tracking scripts. It SHALL make no request to any origin other than its own, apart from the conversion server for a server tool, cookieless analytics if used, and any origin the owner has approved. Analytics MUST set no cookies and MUST NOT record file names or anything about a file, and until the owner decides otherwise SHALL be cookieless page counts. (SPEC.md: Whole site; Architecture and tech stack, Analytics; Open decisions)

#### Scenario: A page is loaded

- **WHEN** any page is loaded
- **THEN** no cookie is set and no request goes to an origin other than the site's own, the conversion server, cookieless analytics if the owner has chosen it, or an origin the owner has approved

#### Scenario: More than page counts is proposed

- **WHEN** a change proposes analytics beyond cookieless page counts
- **THEN** the change is stopped and the owner is asked

### Requirement: No pop-ups

The site SHALL show no pop-up of any kind, including a cookie banner, newsletter prompt, chat bubble, "rate us" or upgrade prompt. (SPEC.md: Banned patterns; What we are building, rule 3)

#### Scenario: A first visit and a finished job

- **WHEN** a visitor opens the site for the first time, and again when a job finishes
- **THEN** nothing appears over the page

### Requirement: The Privacy page matches the code

The Privacy page SHALL say in plain words what happens to a file for each kind of tool, and SHALL be checked against the code before each release. (SPEC.md: Whole site; Build phases)

#### Scenario: A release is prepared

- **WHEN** a release is prepared
- **THEN** each statement on the Privacy page is checked against the code, and any that is no longer true blocks the release

### Requirement: Money

Until the owner decides otherwise the site SHALL carry no adverts. A donation link, as a plain text link, is allowed, and where it sits is the owner's call. (SPEC.md: Open decisions, Money)

#### Scenario: Adverts are proposed

- **WHEN** a change proposes adverts
- **THEN** the change is stopped and the owner is asked

### Requirement: Typed text stays in the browser

Text a visitor types into a tool's field SHALL go only to the tool worker, with the job. It MUST NOT be written to browser storage, the page address, the title or the console, be sent with a form, be kept by the browser's form memory, or be offered to an online spell checker. The status line MAY name up to three refused characters, never the text. A tool that takes a text SHALL treat it as a secret in its no-upload test. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The field's markup

- **WHEN** the field of a test entry's text is drawn
- **THEN** it has no name, sits in no form, and has `autocomplete="off"` and `spellcheck="false"`

#### Scenario: A tool with a text is tested

- **WHEN** the no-upload test of a tool that takes a text types a marked text and runs the job
- **THEN** the text, and each word of it, is in no request, header, address, title, console message or browser storage

### Requirement: Drawings stay in the browser

What a visitor draws SHALL go only to the tool worker, with the job, as numbers. It MUST NOT be written to browser storage, the page address, the title or the console, and the page MUST NOT turn it into a picture or a data address. A tool that takes a drawing SHALL check in its no-upload test that no request carries anything once something is drawn. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The pad's code

- **WHEN** the pad's source is checked by a unit test
- **THEN** it never makes a picture or a data address of the canvas and never writes to storage

#### Scenario: A tool with a drawing is tested

- **WHEN** the no-upload test of a tool that takes a drawing draws in the box and runs the job
- **THEN** no request has a body or goes to another origin, and storage, the title and the address hold nothing new

### Requirement: A chosen picture stays in the browser

A picture chosen for an option SHALL go only to the tool worker. Its bytes MUST NOT be held in the widget's state, and neither they nor its name SHALL be sent in a request or written to browser storage, the page address, the title or the console; the page MUST NOT make an address for it. A tool that takes a picture SHALL treat its name as a secret in its no-upload test. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: A tool with a picture is tested

- **WHEN** the no-upload test of a tool that takes a picture chooses a picture with a marked name and runs the job
- **THEN** no request has a body or goes to another origin, the name is in no request, header, address, title, console message or browser storage, and no `blob:` address is made for the picture

#### Scenario: The field's code

- **WHEN** the source of `PictureField` and of the page's picking code is checked by a unit test
- **THEN** neither calls `URL.createObjectURL` or writes to storage

### Requirement: A new password stays in the browser

A new password SHALL go only to the tool worker, with the job, and only the first field's copy. It MUST NOT be held in the widget's state, written to browser storage, the page address, the title or the console, put in any sentence, or sent with a form. The page SHALL forget it when the job finishes, on "Start again", when the last file is removed and when the page is left. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The fields' markup

- **WHEN** the fields of a test entry's new password are drawn
- **THEN** each is `type="password"` with `autocomplete="new-password"`, has no name and no `maxlength`, and sits in no form

#### Scenario: The widget's state

- **WHEN** a test entry's new password is typed and a job is started, then finishes
- **THEN** the widget's state never holds either field's value, only the first field's value is in the worker's run message, and once the job has finished the page holds neither

#### Scenario: No sentence holds the password

- **WHEN** the unit tests make every sentence and status message for many passwords built around a marked string, such as "Qz7#Kw", in each case the rules know (empty, refused characters, a space first or last, too long, the second field part-typed or different, refused by the engine)
- **THEN** none holds the password, the marked string, or any refused character

#### Scenario: A tool with a new password is tested

- **WHEN** the no-upload test of a tool that takes a new password types a marked password in both fields and runs the job
- **THEN** the password is in no request, header, address, title, console message or browser storage

### Requirement: The policy reaches every worker

Every worker the site starts, the tool worker and any worker started inside it, SHALL run under the page's policy, by being started from a `blob:` address of the page whose script holds only an import of the site's own worker file, never file data. No code SHALL start a worker any other way: the site's own code SHALL start workers only through one start helper, and the built files SHALL show no other worker start. (SPEC.md: Privacy, limits and security, Whole site and Browser tools)

#### Scenario: Eval inside a worker

- **WHEN** code running in a worker started the site's way, or in a worker it starts, calls `eval`
- **THEN** the browser blocks it and reports a violation, while WebAssembly still compiles there

#### Scenario: A worker tries another origin

- **WHEN** code running in a worker started the site's way, or in a worker it starts, tries to fetch from another origin
- **THEN** the browser blocks the request before it is sent, reports a violation on that worker, and the other origin receives nothing

#### Scenario: A worker started another way

- **WHEN** the site's source starts a worker outside the start helper, or a built file contains a worker start outside the helper's code (other than PDF.js's own display file, which the site configures never to start one)
- **THEN** lint or the built-file check fails

#### Scenario: Every tool's job under the policy

- **WHEN** each tool's end-to-end tests run their jobs, with thumbnails, WebAssembly and zip output
- **THEN** every job finishes as before and no policy violation is seen in the page or any worker

#### Scenario: Other browser engines

- **WHEN** CI runs the policy checks in Firefox
- **THEN** eval and a request to another origin are blocked in a worker started the site's way and in one nested in it, and one ordinary job of each engine kind finishes with no violation

### Requirement: The policy is checked on every build and in every end-to-end test

A build check SHALL fail if any built page lacks the policy tag or has it after a stylesheet or script, or if a page carries a runnable inline script or style whose hash the policy lacks, a `style` attribute, an inline event handler or a `javascript:` address. Every end-to-end test SHALL fail if the page or one of its workers reports a policy violation. CI SHALL run both. (SPEC.md: Privacy, limits and security, Whole site; Build phases)

#### Scenario: An inline script without a hash

- **WHEN** a built page carries a runnable inline script or style whose hash is not in its policy
- **THEN** the build check names the page and the block, and fails

#### Scenario: A style attribute or event handler in the HTML

- **WHEN** a built page carries a `style` attribute, an `on…` event handler attribute or a `javascript:` address
- **THEN** the build check names the page and fails

#### Scenario: A violation during a test

- **WHEN** any end-to-end test sees a `securitypolicyviolation` event on the page or on the scope of one of its workers
- **THEN** that test fails and names the directive and what was blocked

#### Scenario: The checks run in CI

- **WHEN** a pull request is opened or updated
- **THEN** the build check runs on the root build and on the sub-path build, and the end-to-end tests run with the violation watch
