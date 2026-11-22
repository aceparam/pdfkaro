# tool-page

## ADDED Requirements

### Requirement: Options shown for one choice

An option that names a condition SHALL be shown only while the earlier choice it names holds the value it names, after the options before it. While hidden it SHALL NOT hold the main button back and SHALL NOT be sent to the engine, and what it holds SHALL be kept for when it is shown again. Changing the choice SHALL NOT move focus. (SPEC.md: Tool page anatomy, 4; Scope notes, Sign PDF; Definition of done)

#### Scenario: The file is read

- **WHEN** a file has been read in a test entry whose first option is a choice of "a" or "b", starting at "a", followed by a text shown for "a" and a text shown for "b"
- **THEN** the choice and the text for "a" are shown, the text for "b" is not in the page, and only the text for "a" can hold the main button back

#### Scenario: The choice is changed

- **WHEN** the visitor types in the text for "a", then chooses "b" with the arrow keys
- **THEN** the text for "a" goes and the text for "b" appears after the choice, focus stays on the radio button for "b", Tab moves next to the text for "b", and the main button waits only for the text for "b"

#### Scenario: Switching back

- **WHEN** the visitor chooses "a" again
- **THEN** the text for "a" is shown as the visitor typed it

#### Scenario: What the engine is sent

- **WHEN** the job starts with "b" chosen
- **THEN** the engine is sent the choice and the text for "b" only, and nothing under the key of the text for "a"

#### Scenario: A screen reader user changes the choice

- **WHEN** a screen reader user moves through the radio buttons and chooses "b"
- **THEN** the radio button's label, state and place are read as for any choice, nothing else is announced, and the next Tab reaches the field now shown, read with its label and hint

#### Scenario: Start again and the last file removed

- **WHEN** the visitor has chosen "b" and typed in both texts, then presses "Start again", or removes the only file, and picks another file
- **THEN** once it is read the choice is at "a" again and both texts are empty

#### Scenario: A tool with no conditions

- **WHEN** a tool's options name no condition
- **THEN** every option is shown, held and sent as before
