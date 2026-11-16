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

### Requirement: Focus goes where the visitor needs it

When a part of the widget appears or goes, focus SHALL move to the next thing the visitor needs, as the table in the `add-tool-widget` design sets out. A change SHALL be announced to a screen reader once: by moving focus to it, or by a status message, not both. (SPEC.md: Definition of done, keyboard and screen reader use)

#### Scenario: The main button is pressed

- **WHEN** a visitor presses the main button with the keyboard
- **THEN** focus moves to Cancel, and progress is read from a status region

#### Scenario: The result appears

- **WHEN** a job finishes
- **THEN** focus moves to the result's heading, and no separate status message repeats it

#### Scenario: The last file is removed

- **WHEN** a visitor removes the only file in the list
- **THEN** the page returns to the file picker alone and focus moves to it

#### Scenario: A one-file tool lists its file as a row

- **WHEN** a visitor chooses a file in a tool that takes one file and lists it as a row, with no summary line above it (Compress PDF)
- **THEN** focus moves to the main button, and once the file has been read the status region says its name, pages and size once, such as "report.pdf, 64 pages, 11.8 MB."

### Requirement: Failed state

When a job fails the page SHALL say what happened in one sentence and give one thing to try next. (SPEC.md: States every tool handles)

#### Scenario: A job fails

- **WHEN** an engine reports an error it cannot recover from
- **THEN** the page shows one sentence on what happened and one next step, with no stack trace or error code alone

#### Scenario: A browser tool runs out of memory

- **WHEN** a browser tool runs out of memory on a large file
- **THEN** the page shows the failed state and suggests a smaller file or a computer with more memory

#### Scenario: Going back to one file

- **WHEN** a job fails in a tool that takes one file
- **THEN** the way back reads "Go back to your file"; a tool that takes several files says "Go back to your files"
