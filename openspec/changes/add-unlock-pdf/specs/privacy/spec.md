# Spec delta: privacy

## ADDED Requirements

### Requirement: A file's own password is forgotten when it is no longer needed

On every tool, the password a visitor types to open a protected input file SHALL be kept only in the page's memory while that file is listed, through Cancel and a failure, and SHALL be forgotten when a job ends with a file or with no new file, on "Start again", when the file is replaced or left out, and when the page is left. A wrong try is kept until replaced and forgotten in the same cases. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: After a result

- **WHEN** a job on a protected file ends with a file, or with no new file
- **THEN** the file's password is no longer held, and choosing the same file again after "Start again" asks for it again

#### Scenario: After a failure or Cancel

- **WHEN** a job on a protected file fails or is cancelled
- **THEN** the password is still held, and "Go back to your file" runs again without typing it

#### Scenario: Leaving

- **WHEN** the visitor presses "Start again", replaces or removes the file, or leaves the page
- **THEN** the file's password is no longer held
