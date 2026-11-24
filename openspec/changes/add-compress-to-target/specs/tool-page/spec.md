## ADDED Requirements

### Requirement: A target size a page sets

A tool whose pages each set a target size SHALL take the target's bytes and label from `src/widget/option-values.ts`, never from words typed in the registry, and its words SHALL be written once, as plain functions. Once a file is read, when its size is at or under the target, the main button SHALL be unavailable with a sentence tied to it that names the file. (SPEC.md: Tool page anatomy, 5; What we are building, rule 4)

#### Scenario: A file already under the target

- **WHEN** a file of 84 KB is listed on a page whose target is 200 KB
- **THEN** the main button is unavailable, described by "<name> is already 200 KB or smaller, so there is nothing to do here. You can use it as it is.", and the sentence is announced with the status line

#### Scenario: A file name with markup

- **WHEN** a file named `<b>x</b>.pdf` is held as already under the target
- **THEN** the sentence shows the name as text

### Requirement: A result measured against the page's target

A result at or under the page's target SHALL say so in its heading. A result over it SHALL say so in its heading and in a sentence naming its size and the target, then the tool's advice, and SHALL still offer Download. A size said to be over the target that would read as the target's number or less SHALL be given in bytes. (SPEC.md: Tool page anatomy, 6; Details that apply everywhere)

#### Scenario: A result under the target

- **WHEN** a job on a 200 KB page gives a file of 184 KB
- **THEN** the result heading is "Your file is now 200 KB or smaller", followed by the shared "was" line

#### Scenario: A result over the target

- **WHEN** a job on a 200 KB page gives a file of 312 KB
- **THEN** the heading is "Your file is still over 200 KB", then "The smallest file this tool could make is 312 KB, which is over 200 KB.", the tool's advice, and Download

#### Scenario: Sizes that would read the same

- **WHEN** a job on a 200 KB page gives a file of 203,000 bytes
- **THEN** the sentence names "203,000 bytes", never "198 KB"

#### Scenario: Keyboard and screen reader

- **WHEN** a keyboard or screen reader user meets the held main button or the over-target result
- **THEN** the button is reachable and announced as unavailable with its sentence, and focus moves to the result heading, which is announced with its sentence
