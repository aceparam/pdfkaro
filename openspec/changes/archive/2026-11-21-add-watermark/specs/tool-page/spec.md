# tool-page

## MODIFIED Requirements

### Requirement: A text a tool needs

A text SHALL be a one-line field with a visible label and a hint read with it. It is the job's input, so it SHALL start empty and the main button SHALL wait while it holds no text, with the tool's sentence tied to it. Text that is too long, or has a character the tool's rule does not take, SHALL get one sentence tied to the field and to the main button, which stays focusable and does nothing. A sentence about refused characters SHALL say only which characters cannot be used, since the hint states the rule. Enter in the field while the main button waits SHALL have the status region say why, on every press. (SPEC.md: Tool page anatomy, 4 and 5; What we are building, rule 4; Definition of done)

#### Scenario: A file is read in a tool with a text

- **WHEN** a file has been read in a tool whose first option is a text
- **THEN** the empty field is shown below the file with its label and hint, focus moves to the field, and the main button waits with the tool's sentence shown under it and read with it

#### Scenario: Text is typed

- **WHEN** the visitor types " Draft copy " into the field
- **THEN** the sentence under the main button goes, the main button works, and the job is sent "Draft copy", trimmed at both ends

#### Scenario: Only spaces are typed

- **WHEN** the field holds only spaces
- **THEN** it counts as empty, and the main button still waits with the tool's sentence

#### Scenario: The text is too long

- **WHEN** the visitor types or pastes 63 characters into a field that takes 50
- **THEN** nothing typed is cut off, the field is marked invalid, and "This text has 63 characters. Use 50 or fewer." is shown between the label and the field, read with the field and tied to the main button, which does nothing when pressed

#### Scenario: A few Western characters the rule does not take

- **WHEN** the visitor types "Łódź" into a field whose rule is the standard fonts' characters
- **THEN** the field is marked invalid, and "Ł and ź cannot be used." is shown, with the rule left to the hint under the field, read with the field and tied to the main button, which does nothing when pressed

#### Scenario: Text in another script

- **WHEN** the visitor types "नमस्ते" or "مرحبا" into such a field
- **THEN** the field is marked invalid, and "Some characters cannot be used." is shown, with the rule left to the hint under the field, with no list of characters, tied to the main button; nothing is ever drawn as question marks

#### Scenario: Accented letters in composed or separate form

- **WHEN** the visitor types "Café", with the accent typed as its own mark after the "e"
- **THEN** it is taken as "Café", counted as four characters, and the main button works

#### Scenario: A phone keyboard is open

- **WHEN** the visitor types on a phone at 360px and the on-screen keyboard covers the lower half of the screen
- **THEN** a sentence about the text is shown above the field, where the keyboard does not cover it, and the keyboard's Enter key is labelled as "Go"

#### Scenario: A keyboard user uses the field

- **WHEN** a keyboard user is in the field and presses Tab, or presses Enter
- **THEN** Tab moves on to the next option, then the rest of the working area in page order and the main button; Enter does what pressing the main button does, so it starts the job only when the main button works, and while the button waits the status region says why on every press ("Type the watermark text first.", or the field's sentence); the Enter that confirms a word in an input method or a phone keyboard's suggestion does not press it

#### Scenario: A screen reader user reaches the field

- **WHEN** focus moves into the field with a screen reader running
- **THEN** the label is read, then that it is an edit field, its text, the hint, and, when something is wrong, that it is invalid and the sentence; the sentence is said once by the status region when it first appears or changes, and nothing is announced twice

#### Scenario: How the field looks

- **WHEN** the field is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** it has the site's field style, a label that looks like the other field labels, a height of at least 2.75rem, the sentence between the label and the field, bold in the text colour as a wrong password's is, the hint under the field, and nothing overflows sideways

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor types a text, starts the job and presses Cancel, or the job fails, or the visitor picks another file with "Choose another file" while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another file the text is as typed; after "Start again" or removing the only file the field is empty again
