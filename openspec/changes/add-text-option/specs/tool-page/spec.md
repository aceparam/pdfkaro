# tool-page

## MODIFIED Requirements

### Requirement: Options a tool needs

A tool with options SHALL show them once its file has been read, below the file and above the main button. A choice SHALL start at a value with which the main button works and be a group of radio buttons, one per line, named by a visible legend. A text SHALL start empty, as "A text a tool needs" says. Focus SHALL then move to the first option. What each option holds SHALL be kept and reset as the scenarios below say. (SPEC.md: Tool page anatomy, 4; Definition of done)

#### Scenario: A file is read in a tool with options

- **WHEN** a file has been read in a tool with one choice
- **THEN** the group is shown below the file with its starting value chosen, focus moves to that radio button, and pressing the main button without touching it gives a sensible result

#### Scenario: A keyboard user goes through the options

- **WHEN** a keyboard user is on the chosen radio button and presses the arrow keys, then Tab
- **THEN** the arrow keys change the choice within the group, and Tab leaves the group, which takes one Tab stop, for the next option, then the rest of the working area in page order and the main button

#### Scenario: A screen reader user reaches a group

- **WHEN** focus moves into a group of radio buttons with a screen reader running
- **THEN** the legend is read, then the button's label, its state and its place in the group, and nothing is announced twice

#### Scenario: How a group looks

- **WHEN** a group is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** it has no border of its own other than, at most, a 1px line in the colour for lines, no extra padding, a legend that looks like the other field labels, each radio button and its label a target at least 2.75rem tall, and nothing overflows sideways

#### Scenario: Cancel and Start again

- **WHEN** the visitor changes a choice, starts the job and presses Cancel, then later gets a result and presses "Start again"
- **THEN** after Cancel the choice is as the visitor left it, and after "Start again" the next file shows every option at its starting value

#### Scenario: Another file

- **WHEN** the visitor changes a choice, then picks another file with "Choose another file" while the file is listed
- **THEN** the new file shows the choice as the visitor left it; but when the only file is removed, including a damaged or password-protected file left out from its notice, the next file shows every option at its starting value

#### Scenario: A tool with no options

- **WHEN** a tool lists no options
- **THEN** its working area and where focus goes are as before

## ADDED Requirements

### Requirement: A text a tool needs

A text SHALL be a one-line field with a visible label and a hint read with it. It is the job's input, so it SHALL start empty and the main button SHALL wait while it holds no text, with the tool's sentence tied to it. Text that is too long, or has a character the tool's rule does not take, SHALL get one sentence tied to the field and to the main button, which stays focusable and does nothing. (SPEC.md: Tool page anatomy, 4 and 5; What we are building, rule 4; Definition of done)

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
- **THEN** the field is marked invalid, and "Ł and ź cannot be used. Use letters from English and other Western European languages, numbers and common marks." is shown, read with the field and tied to the main button, which does nothing when pressed

#### Scenario: Text in another script

- **WHEN** the visitor types "नमस्ते" or "مرحبا" into such a field
- **THEN** the field is marked invalid, and "Some characters cannot be used. Use letters from English and other Western European languages, numbers and common marks." is shown, with no list of characters, tied to the main button; nothing is ever drawn as question marks

#### Scenario: Accented letters in composed or separate form

- **WHEN** the visitor types "Café", with the accent typed as its own mark after the "e"
- **THEN** it is taken as "Café", counted as four characters, and the main button works

#### Scenario: A phone keyboard is open

- **WHEN** the visitor types on a phone at 360px and the on-screen keyboard covers the lower half of the screen
- **THEN** a sentence about the text is shown above the field, where the keyboard does not cover it, and the keyboard's Enter key is labelled as "Go"

#### Scenario: A keyboard user uses the field

- **WHEN** a keyboard user is in the field and presses Tab, or presses Enter
- **THEN** Tab moves on to the next option, then the rest of the working area in page order and the main button; Enter does what pressing the main button does, so it starts the job only when the main button works; the Enter that confirms a word in an input method or a phone keyboard's suggestion does not press it

#### Scenario: A screen reader user reaches the field

- **WHEN** focus moves into the field with a screen reader running
- **THEN** the label is read, then that it is an edit field, its text, the hint, and, when something is wrong, that it is invalid and the sentence; the sentence is said once by the status region when it first appears or changes, and nothing is announced twice

#### Scenario: How the field looks

- **WHEN** the field is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** it has the site's field style, a label that looks like the other field labels, a height of at least 2.75rem, the sentence between the label and the field, bold in the text colour as a wrong password's is, the hint under the field, and nothing overflows sideways

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor types a text, starts the job and presses Cancel, or the job fails, or the visitor picks another file with "Choose another file" while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another file the text is as typed; after "Start again" or removing the only file the field is empty again

### Requirement: A text the engine refuses

When a tool's engine refuses the text it was sent, the page SHALL say "The text could not be used. Check it and try again.", or the tool's own words for its text, under the tool's heading for a failed job, and offer "Go back to your file" with the text as typed. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a text

- **WHEN** a test entry's engine is sent a text it refuses
- **THEN** the page shows the failed heading and "The text could not be used. Check it and try again.", and "Go back to your file" lists the file with the text still in the field
