# split-pdf

## MODIFIED Requirements

### Requirement: More parts than a zip can hold

A job that would give more than 65,535 parts, or more than 4 GB of parts, SHALL fail with a sentence saying it is more than one zip can hold and to mark cuts, and SHALL never hand back a broken zip. There SHALL be no other limit. (SPEC.md: Definition of done, Each tool, "a correct result … or a clear message saying why it cannot"; States every tool handles, Failed)

#### Scenario: Too many parts

- **WHEN** a 120,000-page file is split with no cuts
- **THEN** the page says "This would make more than 65,535 files, more than one zip can hold. Mark cuts so the file is split into fewer parts." at once, and "Go back to your file" returns to the pages

#### Scenario: Parts over 4 GB

- **WHEN** the parts being written pass 4 GB in all
- **THEN** the job stops and the page says "This would make a zip over 4 GB, more than one zip can hold. Mark cuts so the file is split into fewer parts."

### Requirement: A job that fails

When the job fails the page SHALL say what happened in one sentence and give one thing to try, with a way back to the pages that keeps the cuts. (SPEC.md: States every tool handles, Failed)

#### Scenario: The browser runs out of memory

- **WHEN** the browser runs out of memory during a split
- **THEN** the page says "Your browser ran out of memory. Mark cuts so the file is split into fewer parts, then try again.", and "Go back to your file" returns to the pages with the same cuts

#### Scenario: The engine cannot be fetched

- **WHEN** the engine or the zip step cannot be fetched because the connection has dropped
- **THEN** the page says the tool could not be loaded and to check the connection and try again
