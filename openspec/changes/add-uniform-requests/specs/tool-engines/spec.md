## ADDED Requirements

### Requirement: Each tool loads one fixed set at the pick

Each engine SHALL declare what its reading uses and what draws its thumbnails. On any pick, and whenever a reading worker starts, the worker SHALL load the engine and its reading libraries, then start the thumbnail code, all before it reads any file. It SHALL not wait for the thumbnail code. Which files are loaded, and in what order, SHALL come from the tool, never from a file. (SPEC.md: Rules for the code, 3 and 4; owner, 11 and 22 Nov 2026)

#### Scenario: A file is picked on a slow connection

- **WHEN** a visitor picks a file and the set is still loading
- **THEN** the file name is shown with "Getting ready" beside it, as before, and the file is read only once the engine and its reading libraries have loaded

#### Scenario: The thumbnail code is slow or fails

- **WHEN** PDF.js is slow to arrive or cannot be fetched
- **THEN** the file is still read and listed, its blank box stays, and the main button can be used once every file is read, as before

#### Scenario: A damaged file, or one that needs a password

- **WHEN** the file picked is damaged, or needs a password that has not been given
- **THEN** the damaged file state or the password field is shown as before, and the thumbnail code has been started all the same

#### Scenario: A pick that takes no file

- **WHEN** every file picked is of a kind the page does not take
- **THEN** "Getting ready" is shown until the set has loaded, then the sentence saying the file cannot be used is shown and read out in the status line, as before

#### Scenario: A reading worker starts again

- **WHEN** a reading worker is started again, after a job, Cancel, a failure or a thumbnail that took too long
- **THEN** it loads the same set, in the same order, before it reads any file

#### Scenario: Keyboard only

- **WHEN** a visitor picks a file with the keyboard and the set is loading
- **THEN** focus stays where it is today, and moves as it does today once the file is read or refused

### Requirement: Each job loads one fixed set in a fresh worker

Pressing the main button SHALL end the reading worker and run the job in a fresh worker. Before the engine sees any file, that worker SHALL load everything the tool's job can use, in a fixed order, whatever the file, the options, or how the job ends. A file loaded for the pick SHALL be loaded again only if the job uses it. (SPEC.md: Rules for the code, 3 and 4; owner, 22 Nov 2026)

#### Scenario: A job that fails early

- **WHEN** a Watermark job fails before it draws anything, such as when the file's pages cannot be read at the job
- **THEN** pdf-lib was loaded before the engine read the file, as it is for a job that succeeds

#### Scenario: A Compress PDF job on a file with no lossless picture

- **WHEN** Compress PDF runs on a file with no lossless picture, or with no picture at all
- **THEN** `fflate` was loaded before the engine read the file, as it is for a file with lossless pictures

#### Scenario: A thumbnail is being drawn when the button is pressed

- **WHEN** a thumbnail is still being drawn and the visitor presses the main button
- **THEN** the drawing stops, the reading worker is ended, and the job starts in a fresh worker with its progress shown, as before

#### Scenario: The job's set cannot be fetched

- **WHEN** a file of the job's set cannot be fetched
- **THEN** the job fails with "The tool could not be loaded. Check your connection and try again.", keeping the file, as before

### Requirement: Every library an engine asks for is declared

A unit test SHALL run every engine's reading, picture reading and job against every file in `tests/fixtures/` with a recording set of libraries, and SHALL fail if an engine asks for a library outside the set it declares for that step, or if an engine declares no sets. In the browser, the worker SHALL refuse any library an engine has not declared for the step. (SPEC.md: Definition of done; Rules for the code, 2)

#### Scenario: A new engine asks for a library for some files only

- **WHEN** an engine asks for a library that its declared set does not name, for any fixture
- **THEN** the unit test fails, naming the engine, the step, the fixture and the library

#### Scenario: An undeclared library is asked for in the browser

- **WHEN** an engine asks the worker, during a step, for a library its declaration does not name for that step
- **THEN** nothing is fetched for it and the step fails as "The tool could not be loaded. Check your connection and try again."

#### Scenario: A new engine is added

- **WHEN** a file is added to `src/engines/tools/` without a declaration of its sets
- **THEN** the unit test fails
