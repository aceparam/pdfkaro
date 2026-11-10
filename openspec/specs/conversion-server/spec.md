# conversion-server Specification

## Purpose

The small server, from phase 2, that handles the jobs a browser cannot do well: a Node API in front of Gotenberg, with upload limits, rate limits, quick deletion and isolation. Derived from "Architecture and tech stack" and "Privacy, limits and security, Server tools" in `SPEC.md`, which stays the source of truth if the two ever differ. The numbers here are starting values the owner may tune.

## Requirements

### Requirement: Only server tools use the server

A file SHALL be sent to the server only by a tool the catalogue marks "Server". The server MUST NOT be built before phase 2. (SPEC.md: Architecture and tech stack; Build phases)

#### Scenario: A browser tool runs

- **WHEN** any tool marked "Browser" runs
- **THEN** no request goes to the conversion server

### Requirement: The visitor is told before upload

A server tool page SHALL say in plain words that the file is uploaded, before the upload starts. (SPEC.md: What we are building, rule 2)

#### Scenario: A file is chosen in a server tool

- **WHEN** a visitor opens a server tool and chooses a file
- **THEN** the upload notice was already on the page, and no upload starts until the visitor presses the main button

### Requirement: Server shape

The server SHALL be a small Node service in `server/` in front of Gotenberg running in Docker, which wraps LibreOffice and Chromium. The server SHALL be stateless, with no database and no accounts. (SPEC.md: Architecture and tech stack; Rules for the code, 6)

#### Scenario: The service restarts

- **WHEN** the service restarts
- **THEN** it comes up with no stored state to recover and no job data left behind

### Requirement: HTTPS only

The server SHALL accept uploads over HTTPS only. (SPEC.md: Server tools)

#### Scenario: A plain HTTP upload is tried

- **WHEN** a client sends an upload over plain HTTP
- **THEN** the upload is refused or redirected before any file data is accepted

### Requirement: Upload limit

The server SHALL refuse uploads over 50 MB, and SHALL enforce the limit while reading the upload. (SPEC.md: Server tools)

#### Scenario: A 60 MB file is sent

- **WHEN** a client sends a 60 MB file
- **THEN** the server stops reading at the limit and answers that the file is too large

### Requirement: Files are deleted quickly

Uploaded and converted files SHALL live in a temp directory and SHALL be deleted on download or after 60 minutes, whichever comes first. (SPEC.md: Server tools; Rules for the code, 6)

#### Scenario: A result is downloaded

- **WHEN** the visitor downloads a result
- **THEN** the upload and the result are deleted from the server

#### Scenario: A result is never downloaded

- **WHEN** 60 minutes pass after a job without a download
- **THEN** the upload and the result are deleted from the server

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

The server SHALL log only job id, tool, size, duration and outcome. It MUST NOT log file names or contents. (SPEC.md: Server tools)

#### Scenario: A job is logged

- **WHEN** a job finishes
- **THEN** its log line holds the job id, tool, size, duration and outcome, and no file name

### Requirement: File type is checked by contents

The server SHALL check the type of an upload by its contents, not by its extension. (SPEC.md: Server tools)

#### Scenario: A renamed file is sent

- **WHEN** a client sends an executable named `letter.docx` to Word to PDF
- **THEN** the server refuses it

### Requirement: Isolation

Conversions SHALL run in a container with no outbound network access and with document macros disabled. (SPEC.md: Server tools)

#### Scenario: A document with a macro is converted

- **WHEN** a Word file holding a macro is converted
- **THEN** the macro does not run

#### Scenario: A document refers to a remote resource

- **WHEN** a document being converted tries to fetch a remote address
- **THEN** the fetch fails because the container has no outbound network

### Requirement: Web page to PDF refuses internal addresses

Web page to PDF SHALL accept only public `http` and `https` addresses. It SHALL refuse private and loopback ranges after resolving the name, and SHALL refuse redirects into them. (SPEC.md: Server tools)

#### Scenario: A loopback address is given

- **WHEN** a visitor asks for `http://127.0.0.1/` or a name that resolves to a private address
- **THEN** the server refuses the job

#### Scenario: A public page redirects inward

- **WHEN** a public address redirects to a private address
- **THEN** the server refuses to follow and the job fails with a clear message

### Requirement: No third party receives the file

Until the owner decides otherwise, a file sent to the server MUST NOT be passed to a third-party service. (SPEC.md: Open decisions, PDF to Word, Excel, PowerPoint)

#### Scenario: A paid conversion API is proposed

- **WHEN** a change proposes sending files to a paid conversion API
- **THEN** the change is stopped and the owner is asked

### Requirement: The phase 2 gate

Phase 3 SHALL NOT start until server limits and deletion are tested and the Privacy page matches the code. (SPEC.md: Build phases)

#### Scenario: The gate is checked

- **WHEN** phase 2 work is finished
- **THEN** tests prove the upload limit, the rate limit, the time limit and both deletion paths before phase 3 begins
