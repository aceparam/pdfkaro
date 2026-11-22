## ADDED Requirements

### Requirement: Each tool loads one fixed set at the pick

Each engine SHALL declare what its reading uses; its thumbnail code follows from how its thumbnails are drawn. On any pick, and whenever a reading worker starts, the worker SHALL load the engine and its reading libraries, then start the thumbnail code, all before it reads any file, without waiting for the thumbnail code. Which files are loaded, and in what order, SHALL come from the tool, never from a file. (SPEC.md: Rules for the code, 3 and 4; owner, 11 and 22 Nov 2026)

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
- **THEN** the file's line is shown with "Getting ready" and its Remove button ("notes.docx, Getting ready"), or for several files the summary line with "Getting ready", until the set has loaded or failed, or for at most 60 seconds; then the picker returns with the sentence saying the file cannot be used, read out in the status line, and a worker whose set has not yet loaded is left to finish loading it before it is ended

#### Scenario: Remove during that wait

- **WHEN** the visitor presses Remove on that line while the set is loading
- **THEN** the wait ends, the worker is ended, and the picker returns as it does when the last file is removed

#### Scenario: A reading worker starts again

- **WHEN** a reading worker is started again, after a job, Cancel, a failure or a thumbnail that took too long
- **THEN** it loads the same set, in the same order, before it reads any file

#### Scenario: Keyboard only

- **WHEN** a visitor picks, with the keyboard, a file of a kind the page does not take
- **THEN** focus moves to the "Getting ready" line, Tab reaches its Remove button, and when the wait ends focus moves to the picker and the sentence is read out

### Requirement: A reading worker is not ended while its set is loading

Until a reading worker's pick set, thumbnail code included, has loaded or failed, the page SHALL end it only for the visitor's own actions, and a thumbnail waiting in that time SHALL be dropped by message. The thumbnail limit SHALL start only once the set has settled. When the page stops waiting (after 60 seconds), it SHALL NOT end the worker. (SPEC.md: Privacy, limits and security; owner, 22 Nov 2026)

#### Scenario: The thumbnail limit on a slow connection

- **WHEN** PDF.js's files take more than 10 seconds to arrive and a thumbnail is waiting for them
- **THEN** the worker is not ended; the 10-second limit starts only once the set has settled

#### Scenario: Another file or a password while the set loads

- **WHEN** the visitor adds a file or types a password while the set is still loading
- **THEN** any waiting thumbnail is dropped by message, and the same worker reads the file

#### Scenario: A signature picture chosen again while the set loads

- **WHEN** a Sign PDF picture is chosen again while the set is still loading and the earlier picture is still being read
- **THEN** the old worker is ended once its set has settled and the new read starts after that; if the set has not settled within 60 seconds, the new read starts on a fresh worker and the old one is ended only once its set has settled

#### Scenario: A reading failure while the set loads

- **WHEN** reading a file fails, such as by running out of memory, while the set is still loading
- **THEN** the failure is shown once the set has settled, or after 60 seconds, as before, and the worker is ended only once its set has settled

#### Scenario: A thumbnail waiting longer than the page waits

- **WHEN** a thumbnail has waited 60 seconds for a set that has not settled
- **THEN** it gives no picture and is dropped by message, and the worker is kept until its set settles

#### Scenario: The visitor's own actions

- **WHEN** the visitor presses Cancel, "Start again" or the main button, removes the last file, or leaves the page while the set is loading
- **THEN** every worker of the page, any left to finish loading included, is ended at once, as before

### Requirement: Each job loads one fixed set in a fresh worker

Pressing the main button SHALL end the reading worker and run the job in a fresh worker. Before the engine sees any file, that worker SHALL load everything the tool's job can use, the zip step included, in a fixed order, whatever the file, the options, or how the job ends. A file loaded for the pick SHALL be loaded again only if the job uses it. (SPEC.md: Rules for the code, 3 and 4; owner, 22 Nov 2026)

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

A unit test SHALL run every engine's reading, picture reading and job against every file in `tests/fixtures/` with a recording set of libraries, and SHALL fail if an engine asks for a library outside the set it declares for that step, if an engine declares no sets, or if a tool that can give several files does not declare the zip library for its job. In the browser, the worker SHALL refuse any library not declared for the step. (SPEC.md: Definition of done; Rules for the code, 2)

#### Scenario: A new engine asks for a library for some files only

- **WHEN** an engine asks for a library that its declared set does not name, for any fixture
- **THEN** the unit test fails, naming the engine, the step, the fixture and the library

#### Scenario: An undeclared library is asked for in the browser

- **WHEN** an engine asks the worker, during a step, for a library its declaration does not name for that step
- **THEN** nothing is fetched for it and the step fails as "The tool could not be loaded. Check your connection and try again."

#### Scenario: A new engine is added

- **WHEN** a file is added to `src/engines/tools/` without a declaration of its sets
- **THEN** the unit test fails
