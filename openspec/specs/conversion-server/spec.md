# conversion-server Specification

## Purpose

The small server, from phase 2, that handles the jobs a browser cannot do well: a Node API in front of Gotenberg, with upload limits, rate limits, quick deletion and isolation. Derived from "Architecture and tech stack" and "Privacy, limits and security, Server tools" in `SPEC.md`, which stays the source of truth if the two ever differ. The numbers here are starting values the owner may tune.

## Requirements

### Requirement: Only server tools use the server

A file SHALL be sent to the server only by a tool the catalogue marks "Server". The server MUST NOT be built before phase 2, and the 17 launch tools run in the browser. (SPEC.md: Architecture and tech stack; Build phases; Tool catalogue)

#### Scenario: A browser tool runs

- **WHEN** any tool marked "Browser" runs
- **THEN** no request goes to the conversion server

#### Scenario: The launch site is built

- **WHEN** the phase 1 site is built
- **THEN** it needs no conversion server to work

### Requirement: The visitor is told before upload

A server tool page SHALL say in plain words that the file is uploaded, before the upload starts. (SPEC.md: What we are building, rule 2)

#### Scenario: A file is chosen in a server tool

- **WHEN** a visitor opens a server tool and chooses a file
- **THEN** the upload notice was already on the page before any upload started

### Requirement: Server shape

The server SHALL be a small Node service in `server/` in front of Gotenberg running in Docker, which wraps LibreOffice and Chromium. The server SHALL be stateless, with no database and no accounts. (SPEC.md: Architecture and tech stack; Rules for the code, 6)

#### Scenario: The service restarts

- **WHEN** the service restarts
- **THEN** it comes up with no stored state to recover

#### Scenario: Old files are left over after a restart

- **WHEN** the service starts and the temp directory holds files older than 60 minutes
- **THEN** those files are deleted at start, so a restart never keeps a file past its lifetime

### Requirement: HTTPS only

The server SHALL serve HTTPS only, for uploads, job status and downloads. It SHALL refuse a plain HTTP request without reading its body. (SPEC.md: Server tools)

#### Scenario: A plain HTTP upload is tried

- **WHEN** a client sends an upload over plain HTTP
- **THEN** the request is refused before any file data is accepted, and it is not redirected

### Requirement: Upload limit

The server SHALL refuse uploads over 50 MB, and SHALL enforce the limit while reading the upload. (SPEC.md: Server tools)

#### Scenario: A 60 MB file is sent

- **WHEN** a client sends a 60 MB file
- **THEN** the server stops reading at the limit and answers that the file is too large

### Requirement: Files are deleted quickly

Uploaded and converted files SHALL live in a temp directory and SHALL be deleted on download or 60 minutes after the upload began, whichever comes first. They SHALL also be deleted when a job fails, is cancelled, is refused or is aborted. (SPEC.md: Server tools; Rules for the code, 6)

#### Scenario: A result is downloaded

- **WHEN** the visitor downloads a result
- **THEN** the upload and the result are deleted from the server

#### Scenario: A result is never downloaded

- **WHEN** 60 minutes pass after the upload began without a download
- **THEN** the upload and the result are deleted from the server

#### Scenario: A job does not finish

- **WHEN** a job fails, is cancelled, is refused for size or type, or the upload is cut off
- **THEN** whatever was stored for it is deleted at once

### Requirement: Rate limit

The server SHALL allow at most 20 jobs per IP address per hour. (SPEC.md: Server tools)

#### Scenario: A twenty-first job is sent

- **WHEN** one IP address sends a twenty-first job within an hour
- **THEN** the server refuses it and the page tells the visitor the limit and what to try

### Requirement: Time limit

The server SHALL stop a job that runs longer than 60 seconds, and the visitor SHALL be told. (SPEC.md: Server tools)

#### Scenario: A conversion hangs

- **WHEN** a conversion is still running after 60 seconds
- **THEN** the job is stopped, its files are deleted and the page shows the failed state

### Requirement: Logging

The server SHALL log only job id, tool, size, duration and outcome. It MUST NOT log file names, contents or anything else about a file. (SPEC.md: Server tools)

#### Scenario: A job is logged

- **WHEN** a job finishes, fails or is refused
- **THEN** its log line holds the job id, tool, size, duration and outcome, and nothing else

#### Scenario: A converter reports an error

- **WHEN** Gotenberg or LibreOffice prints an error that holds a file name or text from the document
- **THEN** that text is not written to any log

### Requirement: File type is checked by contents

The server SHALL check the type of an upload by its contents, not by its extension. (SPEC.md: Server tools)

#### Scenario: A renamed file is sent

- **WHEN** a client sends an executable named `letter.docx` to Word to PDF
- **THEN** the server refuses it

#### Scenario: A file of the wrong type is sent

- **WHEN** a client sends a valid PDF or image to a tool that accepts only Office documents
- **THEN** the server refuses it because its contents do not match what the tool accepts

### Requirement: Isolation

Conversions of uploaded documents SHALL run in a container with no outbound network access and with document macros disabled. (SPEC.md: Server tools)

#### Scenario: A document with a macro is converted

- **WHEN** a Word file holding a macro is converted
- **THEN** the macro does not run

#### Scenario: A document refers to a remote resource

- **WHEN** a document being converted tries to fetch a remote address
- **THEN** the fetch fails because the container has no outbound network

### Requirement: Web page to PDF refuses internal addresses

Web page to PDF SHALL accept only public `http` and `https` addresses. It SHALL refuse private, loopback and link-local ranges after resolving the name, and SHALL refuse redirects into them. (SPEC.md: Server tools)

#### Scenario: A loopback or private address is given

- **WHEN** a visitor asks for `http://127.0.0.1/`, `http://[::1]/` or a name that resolves to a private address
- **THEN** the server refuses the job

#### Scenario: A link-local address is given

- **WHEN** a visitor asks for `http://169.254.169.254/`
- **THEN** the server refuses the job

#### Scenario: Another scheme is given

- **WHEN** a visitor asks for `file:///etc/passwd` or an `ftp` address
- **THEN** the server refuses the job

#### Scenario: A public page redirects inward

- **WHEN** a public address redirects to a private address
- **THEN** the server refuses to follow and the job fails with a clear message

### Requirement: No third party receives the file

Until the owner decides otherwise, a file sent to the server MUST NOT be passed to a third-party service. (SPEC.md: Open decisions, PDF to Word, Excel, PowerPoint)

#### Scenario: A paid conversion API is proposed

- **WHEN** a change proposes sending files to a paid conversion API
- **THEN** the change is stopped and the owner is asked

### Requirement: Web page to PDF network access waits for the owner

Web page to PDF has to fetch public pages, which the isolation rule forbids for conversions. Web page to PDF SHALL NOT be built until the owner says how it is given network access. (SPEC.md: Server tools, Isolation and Web page to PDF)

#### Scenario: Web page to PDF is proposed

- **WHEN** a change proposes Web page to PDF
- **THEN** the change states how it fetches pages without giving document conversions outbound network, and the owner is asked to approve it

### Requirement: Job ids cannot be guessed

Job ids SHALL be unguessable, and stored files SHALL be named by job id, never by the visitor's file name. (SPEC.md: Architecture and tech stack, Server API; Server tools, Logging)

#### Scenario: Job ids are compared

- **WHEN** two job ids are issued one after the other
- **THEN** the second cannot be worked out from the first, and no stored file name holds part of the visitor's file name
