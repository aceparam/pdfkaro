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

The site SHALL send a strict Content Security Policy that allows scripts from the site's own origin only, plus what WebAssembly needs. (SPEC.md: Whole site)

#### Scenario: A third-party script is added

- **WHEN** a page tries to load a script from another origin
- **THEN** the browser blocks it under the policy

#### Scenario: An inline script or eval is tried

- **WHEN** a page runs an inline script or calls `eval`
- **THEN** the browser blocks it, and only what WebAssembly needs is allowed beyond the site's own scripts

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
