# Spec delta: privacy

## MODIFIED Requirements

### Requirement: Content Security Policy

The site SHALL send a strict Content Security Policy that allows scripts from the site's own origin only, plus what WebAssembly needs. Without headers, it SHALL be a meta tag on every page, before any stylesheet or script. It SHALL deny by default, allow no `'unsafe-inline'` or `'unsafe-eval'`, allow an inline block only by its hash, and allow requests to the site's own origin only. It does not stop requests to that origin; the no-upload test does. (SPEC.md: Privacy, limits and security, Whole site)

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
- **THEN** the policy does not govern it, and the no-upload test remains the guard that no file data leaves the page

#### Scenario: Pictures the site draws

- **WHEN** a tool shows a page thumbnail or a picture's thumbnail
- **THEN** it is shown from a `blob:` address of the page, which the policy allows, and no `data:` address is allowed for images

#### Scenario: No base address and no form sending

- **WHEN** a page tries to set a `<base>` address or submit a form
- **THEN** the browser refuses it under the policy

#### Scenario: Pages look and work the same

- **WHEN** any page is opened, with or without a keyboard or a screen reader, and any tool's job is run
- **THEN** the page looks, reads and behaves as before the policy, and every existing end-to-end and no-upload test passes with no change beyond importing the shared watching fixture (in tests that open their own browser context, calling its watch helper), and, in test helpers that fetched a `blob:` address, read a worker's own address or listed every `Blob` the page made, an equivalent check that keeps the same assertion

#### Scenario: What a meta tag cannot carry

- **WHEN** the policy is a meta tag
- **THEN** it carries no `frame-ancestors`, `report-uri`, `report-to` or `sandbox` directive, because browsers ignore them there, and the gap is recorded so that a host that sends headers at launch can send the policy as a header with `frame-ancestors 'none'`

#### Scenario: A preview under a sub-path

- **WHEN** the site is built under a sub-path for the preview
- **THEN** every page carries the same policy, the preview's `noindex` tag is still there, and every link, script and worker still works

## ADDED Requirements

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

- **WHEN** CI runs the policy checks in Firefox and WebKit
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
