# tool-page

## ADDED Requirements

### Requirement: Options a tool needs

A tool with options SHALL show them in the working area once its file has been read, below the file and above the main button, each set at first so the main button works untouched. A choice of one from several SHALL be a group of radio buttons named by a visible legend; a typed value SHALL be a text field with a visible label and hint. The choices SHALL be kept through Cancel and failure, and reset on "Start again". (SPEC.md: Tool page anatomy, 4; Definition of done)

#### Scenario: A file is chosen in a tool with options

- **WHEN** a file has been read in a tool with options
- **THEN** the options are shown below the file, each with its starting value, and pressing the main button without touching them gives a sensible result

#### Scenario: A keyboard user goes through the options

- **WHEN** a keyboard user presses Tab through the working area
- **THEN** a group of radio buttons takes one Tab stop, on its chosen button, the arrow keys change the choice, and the next Tab reaches the next option, then the main button

#### Scenario: A screen reader user reaches a group

- **WHEN** a screen reader user moves into a group of radio buttons
- **THEN** the legend is read, then the button's label, its state and its place in the group

#### Scenario: The options at phone width

- **WHEN** the options are shown at 360px, at 1280px, or with text at 200%
- **THEN** each radio button and its label make a target at least 2.75rem tall, the field is at least 3rem tall, and nothing overflows sideways

#### Scenario: Start again

- **WHEN** the visitor changes an option, gets a result and presses "Start again"
- **THEN** the next file is listed with every option back at its starting value

#### Scenario: A tool with no options

- **WHEN** a tool lists no options, as every tool before Add page numbers
- **THEN** its working area is as before

### Requirement: A typed option that is not valid

While a typed option holds a value the tool cannot use, the field SHALL be marked as not valid, with one sentence under it saying what to type, and the main button SHALL be unavailable but focusable with the same sentence tied to it. The sentence SHALL go as soon as the value can be used. The engine SHALL check every option again and refuse one that is not valid. (SPEC.md: Tool page anatomy, 4 and 5; How the words should read)

#### Scenario: A value that cannot be used

- **WHEN** the visitor empties a field that takes a whole number
- **THEN** the field is marked as not valid with the sentence under it, the main button is unavailable with the same sentence tied to it, and a screen reader reads the sentence with the field and with the button

#### Scenario: The value is put right

- **WHEN** the visitor types a value the tool can use
- **THEN** the sentence goes, the field is no longer marked, and the main button can be used
