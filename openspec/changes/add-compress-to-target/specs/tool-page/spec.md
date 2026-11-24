## ADDED Requirements

### Requirement: A target size a page sets

A tool whose pages each set a target size SHALL take the target's bytes and label from `src/widget/option-values.ts`, never from words typed in the registry, and its words SHALL be written once, as plain functions. When a picked file's size is at or under the target, the main button SHALL be unavailable with a sentence tied to it that names the file, decided at the pick, and no password SHALL be asked for that file. (SPEC.md: Tool page anatomy, 5; What we are building, rule 4)

#### Scenario: A file already under the target

- **WHEN** a file of 84 KB is listed on a page whose target is 200 KB
- **THEN** the main button is unavailable, described by "<name> is already 200 KB or smaller, so there is nothing to do here. You can use it as it is.", and the sentence is announced with the status line

#### Scenario: A file name with markup

- **WHEN** a file named `<b>x</b>.pdf` is held as already under the target
- **THEN** the sentence shows the name as text

### Requirement: A result measured against the page's target

A result at or under the page's target SHALL say so in its heading. A result over it SHALL say so in its heading and in a sentence naming its size and the target, then the tool's advice, and SHALL still offer Download. (SPEC.md: Tool page anatomy, 6)

#### Scenario: A result under the target

- **WHEN** a job on a 200 KB page gives a file of 184 KB
- **THEN** the result heading is "Your file is now 200 KB or smaller", followed by the shared "was" line

#### Scenario: A result over the target

- **WHEN** a job on a 200 KB page gives a file of 312 KB
- **THEN** the heading is "Your file is still over 200 KB", then "The smallest file this tool could make is 312 KB, which is over 200 KB.", the tool's advice, and Download

### Requirement: One byte rule for sizes over a target

A size over the target SHALL be shown in bytes, with a thousands separator, whenever the size the shared format shows, taken back to bytes in 1024s, is at most the label in 1024s. The over-target sentence and the "was" line SHALL use the same form. (SPEC.md: Details that apply everywhere)

#### Scenario: Sizes that would read the same

- **WHEN** a job on a 200 KB page gives a file of 203,000 bytes
- **THEN** the sentence and the "was" line both name "203,000 bytes", never "198 KB"

#### Scenario: The byte rule's edges

- **WHEN** the rule is given 1,000,001, 1,040,000, 1,048,576, 1,101,000 and 1,101,004 bytes against 1 MB, 2,050,000 against 2 MB, and 102,400 and 102,911 against 100 KB
- **THEN** each is shown in bytes; 1,101,005 and 1,110,000 against 1 MB show "1.1 MB", 2,150,000 against 2 MB shows "2.1 MB", and 102,912 against 100 KB shows "101 KB"

#### Scenario: Keyboard and screen reader

- **WHEN** a keyboard or screen reader user meets the held main button or the over-target result
- **THEN** the button is reachable and announced as unavailable with its sentence, and focus moves to the result heading, which is announced with its sentence
