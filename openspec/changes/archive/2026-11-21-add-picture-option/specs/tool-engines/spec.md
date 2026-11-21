# tool-engines

## ADDED Requirements

### Requirement: A picture option is read in the worker

A picture chosen for an option SHALL be read in the tool worker, not on the page, with the shared picture reader, before the job, and the page SHALL be told only whether it is ready, with its pixels, damaged, or saved in a way the tool cannot read. With the job, each shown, ready picture SHALL go to the worker beside the files and reach the engine as bytes under its option's key. (SPEC.md: Rules for the code, 2 to 4)

#### Scenario: A picture is checked

- **WHEN** each picture in `tests/fixtures/pictures/` is read for a test entry's picture option of JPG and PNG
- **THEN** each gives the outcome the fixtures README gives it, read from its bytes alone, and the page receives the outcome and nothing of the picture

#### Scenario: A picture goes with the job

- **WHEN** a job starts with a shown, ready picture
- **THEN** the run message carries the picture beside the files, the worker hands its bytes to the engine under the option's key, and a hidden or unready picture is not carried

#### Scenario: A message with a bad picture entry

- **WHEN** the worker receives a run message whose pictures are not an object of plain keys to files
- **THEN** it ignores the message, as it ignores any message of the wrong shape
