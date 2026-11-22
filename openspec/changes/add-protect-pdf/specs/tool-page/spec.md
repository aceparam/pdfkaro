# Spec Delta

## MODIFIED Requirements

### Requirement: A new password a tool needs

A new password SHALL be two hidden one-line fields, one under the other, each with a visible label: the password, then the same password again. The tool's hint SHALL be shown under the first field, and a shared note on where the password goes under the second; both SHALL be read with the first field. Both fields SHALL start empty, and the main button SHALL wait until both hold the same password the tool's rule takes. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Password needed; Definition of done)

#### Scenario: A file is read in a tool with a new password

- **WHEN** a file has been read in a tool whose first option is a new password
- **THEN** both empty fields are shown below the file with their labels, the hint under the first and the shared note under the second, focus moves to the first field, and the main button waits with the tool's first sentence ("Type a password first.") shown under it and read with it

#### Scenario: The password is typed in the first field only

- **WHEN** the visitor types a password the rule takes in the first field and nothing in the second
- **THEN** the main button still waits, with the tool's second sentence ("Type the password again to check it.") under it and read with it

#### Scenario: The second field is being typed

- **WHEN** the second field holds the start of the first field's password, but not all of it
- **THEN** no sentence is shown by either field, the second field is not marked invalid, and the main button waits with the tool's second sentence

#### Scenario: Both fields hold the same password

- **WHEN** both fields hold "open  Sesame-9", with two spaces inside
- **THEN** the sentence under the main button goes, the main button works, and the job is sent "open  Sesame-9" exactly as typed, and nothing from the second field

#### Scenario: A space first

- **WHEN** the first field holds " open sesame"
- **THEN** the first field is marked invalid at once, "A password cannot start or end with a space." is shown between its label and the field, read with it and tied to the main button, which does nothing when pressed

#### Scenario: A space last

- **WHEN** the first field holds "open sesame " and focus is still in it
- **THEN** no sentence is shown by the field and nothing is announced, and the main button waits with the tool's second sentence ("Type the password again to check it.") under it; once focus leaves the first field, or Enter is pressed, or the main button is pressed, the field is marked invalid and "A password cannot start or end with a space." is shown between its label and the field, tied to the main button

#### Scenario: Typing a password with a space inside, one key at a time

- **WHEN** the visitor types "open sesame" into the first field one key at a time, passing through "open "
- **THEN** no sentence is shown by either field at any point, the field is never marked invalid, and the status region announces nothing

#### Scenario: The two passwords differ

- **WHEN** the second field holds something that is not the start of the first field's password, or is longer than it
- **THEN** the second field is marked invalid, "The two passwords are not the same. Type the password again in this box." is shown between its label and the field, read with it and tied to the main button, which stays focusable and does nothing when pressed

#### Scenario: Characters the rule does not take

- **WHEN** the visitor types "café", "पासवर्ड", a tab, a no-break space or "£" into the first field of a field whose rule is printable ASCII
- **THEN** the first field is marked invalid and "Some characters cannot be used. Use only the characters listed under the box." is shown between its label and the field, naming no character, read with the field and tied to the main button, which does nothing when pressed; the hint under the field says which characters can be used

#### Scenario: The password is too long

- **WHEN** the visitor types or pastes 130 characters into the first field of a field that takes 127
- **THEN** nothing typed is cut off, the first field is marked invalid, and "This password is too long. Use 127 characters or fewer." is shown between its label and the field, tied to the main button, which does nothing when pressed; the sentence does not say how many characters were typed

#### Scenario: A phone keyboard is open

- **WHEN** the visitor types on a phone at 360px and the on-screen keyboard covers the lower half of the screen
- **THEN** a sentence about either field is shown above that field, where the keyboard does not cover it, the keyboard's Enter key is labelled as "Next" in the first field and "Go" in the second, the second field's label starts close under the first field (within about 200px at 360px wide), and the fields stay hidden, so the keyboard offers no corrections, suggestions or capitals

#### Scenario: A keyboard user uses the fields

- **WHEN** a keyboard user is in the first field and presses Tab, or presses Enter in either field
- **THEN** Tab moves to the second field, then to the next option, then the rest of the working area in page order and the main button; Enter in the first field moves focus to the second field once the first holds a password the rule takes, and otherwise shows the first field's sentence or has the status region say the sentence that holds the main button, on every press; Enter in the second field does what pressing the main button does, so it starts the job only when the main button works, and while the button waits the status region says why on every press, in the words of the sentence that holds it; the Enter that confirms a word in an input method does neither

#### Scenario: A screen reader user reaches the fields

- **WHEN** focus moves into the first field, then the second, with a screen reader running
- **THEN** the first is read with its label, as a password field, then the hint and the shared note (the note, though shown under the second field, is part of the first field's description), and, when something is wrong with it, that it is invalid and the sentence; the second with its label, as a password field, and, when the two differ, that it is invalid and its sentence; a sentence is said once by the status region when it first appears or changes kind, never holds the password, and nothing is announced twice

#### Scenario: How the fields look

- **WHEN** the fields are shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** each has the site's field style, a label that looks like the other field labels and a height of at least 2.75rem, a sentence sits between its field's label and the field, bold in the text colour as a wrong password's is, the hint sits under the first field and the note under the second, and nothing overflows sideways

#### Scenario: The note under the first field

- **WHEN** a new password's fields are drawn
- **THEN** the note is no longer under the first field but its own paragraph under the second, still read with the first field, and it reads, in draft words for the owner, "The password stays in your browser. This site does not send it anywhere. Your browser may offer to save it or to suggest one. A saved password is kept by your browser and may be copied to your browser account."; it never claims the password goes nowhere at all

#### Scenario: Cancel, a failure and another file

- **WHEN** the visitor types the password in both fields, starts the job and presses Cancel, or the job fails and the visitor presses "Go back to your file", or the visitor picks another file with "Choose another file" while listing
- **THEN** both fields hold what was typed, and the main button works without typing it again

#### Scenario: The password is forgotten

- **WHEN** a job with the password finishes, or the visitor presses "Start again", removes the only file, or leaves the page
- **THEN** the page holds the password no longer, and the next file read shows both fields empty

#### Scenario: A new password shown for one choice

- **WHEN** a test entry shows a new password only while an earlier choice holds one value, and the visitor types it, then changes the choice
- **THEN** the fields go, the password is not sent and does not hold the main button, and changing the choice back shows both fields as typed
