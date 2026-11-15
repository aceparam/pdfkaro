# tool-page

## MODIFIED Requirements

### Requirement: Result block

When a job is done the page SHALL show the file name, the new size, a Download button and a short list of next steps that carry the file into another tool. A tool that makes a file smaller SHALL show the old size beside the new one, as "4.2 MB, was 11.8 MB". A tool whose job can end with no new file, because the file could not be improved, SHALL instead say so in its own words, with one thing to try and "Start again", and SHALL show no Download button. Nothing SHALL download until the visitor presses a button. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere; How the words should read)

#### Scenario: A job finishes

- **WHEN** a job finishes
- **THEN** the result block appears and no download starts on its own

#### Scenario: The result is announced

- **WHEN** a job finishes while a screen reader is in use
- **THEN** the screen reader announces that the result is ready

#### Scenario: A file is made smaller

- **WHEN** a tool that makes files smaller finishes with a smaller file
- **THEN** the result shows the new size, "was" and the old size

#### Scenario: There is no new file

- **WHEN** a tool's job ends with no new file because the file could not be improved
- **THEN** the page shows the tool's sentence and advice, "Start again" and no Download button, focus moves to the sentence, and the screen reader announces it

### Requirement: Working state

While a job runs the page SHALL show progress in real units, such as "Page 14 of 120" or "Picture 3 of 40", with a Cancel button. While a single file is read before the work starts, the line SHALL say "Reading the file". Cancel SHALL stop the job. (SPEC.md: States every tool handles)

#### Scenario: A long job runs

- **WHEN** a 120-page job is running
- **THEN** the page shows which page of 120 is being worked on and a Cancel button

#### Scenario: Pictures are worked on

- **WHEN** a job works through 40 pictures
- **THEN** the page shows which picture of 40 is being worked on

#### Scenario: Cancel is pressed

- **WHEN** the visitor presses Cancel during a job
- **THEN** the job stops, no result is shown, and the visitor can start again with the same file
