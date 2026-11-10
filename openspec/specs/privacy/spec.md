# privacy Specification

## Purpose

The promise the site makes about files and how the code keeps it literally true: browser tools never send the file anywhere, nothing tracks the visitor, and the Privacy page matches the code. Derived from "Privacy, limits and security" in `SPEC.md`, which stays the source of truth if the two ever differ. Rules for the conversion server are in the `conversion-server` capability.

## Requirements

### Requirement: Browser tools send no file data

For a browser tool, no request that leaves the page SHALL carry file contents, file names or passwords. (SPEC.md: Browser tools)

#### Scenario: A job runs in a browser tool

- **WHEN** a visitor chooses a file and runs a job in a browser tool
- **THEN** no request made from the page carries any part of the file, its name or a password

### Requirement: The no-upload test

Each browser tool SHALL have an automated test that fails the build if the tool makes any upload while processing. (SPEC.md: Browser tools; Definition of done)

#### Scenario: An upload is added by mistake

- **WHEN** code is added that sends a request with a body while a file is being processed
- **THEN** the no-upload test fails and the build fails

#### Scenario: A browser tool is finished

- **WHEN** a browser tool is called done
- **THEN** its no-upload test exists, runs in CI and passes

### Requirement: Passwords stay in the browser

Passwords typed into Protect, Unlock or the password-needed state SHALL stay in the browser. They MUST NOT be stored, logged, put in a URL or sent anywhere. (SPEC.md: Browser tools)

#### Scenario: A password is typed

- **WHEN** a visitor types a password and the job finishes
- **THEN** the password is in no request, no URL, no console message and no browser storage

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

### Requirement: Content Security Policy

The site SHALL send a strict Content Security Policy that allows scripts from the site's own origin only, plus what WebAssembly needs. (SPEC.md: Whole site)

#### Scenario: A third-party script is added

- **WHEN** a page tries to load a script from another origin
- **THEN** the browser blocks it under the policy

### Requirement: No advertising or tracking

The site SHALL carry no advertising scripts and no tracking scripts, and SHALL load no third-party script besides cookieless analytics if the owner chooses it. Analytics, if used, MUST set no cookies and MUST NOT record file names or anything about a file. (SPEC.md: Whole site; Architecture and tech stack, Analytics; Open decisions)

#### Scenario: A page is loaded

- **WHEN** any page is loaded
- **THEN** no cookie is set and no request goes to an advertising or tracking service

#### Scenario: More than page counts is proposed

- **WHEN** a change proposes analytics beyond cookieless page counts
- **THEN** the change is stopped and the owner is asked

### Requirement: No pop-ups

The site SHALL show no pop-up of any kind, including a cookie banner, newsletter prompt, chat bubble, "rate us" or upgrade prompt. (SPEC.md: Banned patterns; What we are building, rule 3)

#### Scenario: A first visit

- **WHEN** a visitor opens the site for the first time
- **THEN** nothing appears over the page

### Requirement: The Privacy page matches the code

The Privacy page SHALL say in plain words what happens to a file for each kind of tool, and SHALL be checked against the code before each release. (SPEC.md: Whole site; Build phases)

#### Scenario: A release is prepared

- **WHEN** a release is prepared
- **THEN** each statement on the Privacy page is checked against the code, and any that is no longer true blocks the release

### Requirement: Money

Until the owner decides otherwise the site SHALL carry at most a donation link. Adverts MUST NOT be added. (SPEC.md: Open decisions, Money)

#### Scenario: Adverts are proposed

- **WHEN** a change proposes adverts
- **THEN** the change is stopped and the owner is asked
