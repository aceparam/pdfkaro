# Spec delta: privacy

## MODIFIED Requirements

### Requirement: Content Security Policy

The site SHALL send a strict Content Security Policy that allows scripts from the site's own origin only, plus what WebAssembly needs. Where the host cannot send headers, the policy SHALL be a `<meta http-equiv="Content-Security-Policy">` tag on every page, placed before any stylesheet or script. The policy SHALL deny by default, SHALL allow no `'unsafe-inline'` and no `'unsafe-eval'`, SHALL allow an inline script or style only by the hash of that exact block, and SHALL allow requests to the site's own origin only. (SPEC.md: Privacy, limits and security, Whole site; Architecture and tech stack, Hosting; Look and feel, Font)

#### Scenario: A third-party script is added

- **WHEN** a page tries to load a script from another origin
- **THEN** the browser blocks it under the policy

#### Scenario: An inline script or eval is tried

- **WHEN** a page runs an inline script or calls `eval`
- **THEN** the browser blocks it, and only what WebAssembly needs is allowed beyond the site's own scripts

#### Scenario: Every page carries the policy

- **WHEN** any built page, including the 404 page, is read as served
- **THEN** it has exactly one policy tag, straight after the character set tag and before any stylesheet, script or link, and the policy denies by default

#### Scenario: Only the page's own inline blocks are allowed

- **WHEN** a page's policy is read
- **THEN** its script and style allowances are the site's own origin plus the hash of each inline script and style block on that page and no other hash, and a page with no inline block lists no hash

#### Scenario: A request to another origin

- **WHEN** a page tries to fetch from, send to, or load an image, font, frame or object from another origin
- **THEN** the browser blocks it under the policy

#### Scenario: Pictures the site draws

- **WHEN** a tool shows a page thumbnail or a picture's thumbnail
- **THEN** it is shown from a `blob:` address of the page, which the policy allows, and no `data:` address is allowed for images

#### Scenario: No base address and no form sending

- **WHEN** a page tries to set a `<base>` address or submit a form
- **THEN** the browser refuses it under the policy

#### Scenario: Pages look and work the same

- **WHEN** any page is opened, with or without a keyboard or a screen reader, and any tool's job is run
- **THEN** the page looks, reads and behaves as before the policy, and every existing end-to-end and no-upload test passes unchanged

#### Scenario: What a meta tag cannot carry

- **WHEN** the policy is a meta tag
- **THEN** it carries no `frame-ancestors`, `report-uri`, `report-to` or `sandbox` directive, because browsers ignore them there, and the gap is recorded so that a host that sends headers at launch can send the policy as a header with `frame-ancestors 'none'`

#### Scenario: A preview under a sub-path

- **WHEN** the site is built under a sub-path for the preview
- **THEN** every page carries the same policy, the preview's `noindex` tag is still there, and every link, script and worker still works

## ADDED Requirements

### Requirement: The policy reaches every worker

Every worker the site starts, the tool worker and any worker started inside it, SHALL run under the page's policy. A worker MUST NOT be started in a way that gives it no policy, and the policy SHALL allow workers from the page's own `blob:` addresses only. The `blob:` script that starts a worker SHALL hold only an import of the site's own worker file, never file data. (SPEC.md: Privacy, limits and security, Whole site and Browser tools)

#### Scenario: Eval inside a worker

- **WHEN** code running in the tool worker calls `eval`
- **THEN** the browser blocks it, while qpdf's WebAssembly still runs

#### Scenario: A worker tries another origin

- **WHEN** code running in the tool worker tries to fetch from another origin
- **THEN** the browser blocks the request before it is sent

#### Scenario: A worker from an ordinary address

- **WHEN** a page tries to start a worker straight from a same-origin script address
- **THEN** the browser refuses it under the policy

#### Scenario: Every tool's job under the policy

- **WHEN** each tool's end-to-end tests run their jobs, with thumbnails, WebAssembly and zip output
- **THEN** every job finishes as before and no policy violation is seen

### Requirement: The policy is checked on every build and in every end-to-end test

A build check SHALL fail if any built page lacks the policy tag or has it after a stylesheet or script, or if a page carries an inline script or style whose hash the policy lacks, a `style` attribute, an inline event handler or a `javascript:` address. Every end-to-end test SHALL fail if the page or one of its workers reports a policy violation. CI SHALL run both. (SPEC.md: Privacy, limits and security, Whole site; Build phases)

#### Scenario: An inline script without a hash

- **WHEN** a built page carries an inline script or style whose hash is not in its policy
- **THEN** the build check names the page and the block, and fails

#### Scenario: A style attribute or event handler in the HTML

- **WHEN** a built page carries a `style` attribute, an `on…` event handler attribute or a `javascript:` address
- **THEN** the build check names the page and fails

#### Scenario: A violation during a test

- **WHEN** any end-to-end test sees a `securitypolicyviolation` event or a policy message in the console of the page or one of its workers
- **THEN** that test fails and names what was blocked

#### Scenario: The checks run in CI

- **WHEN** a pull request is opened or updated
- **THEN** the build check runs on the root build and on the sub-path build, and the end-to-end tests run with the violation watch
