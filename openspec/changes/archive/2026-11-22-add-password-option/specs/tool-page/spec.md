# tool-page

## MODIFIED Requirements

### Requirement: Options a tool needs

A tool with options SHALL show them once its file has been read, below the file and above the main button. A choice SHALL start at a value with which the main button works and be a group of radio buttons, one per line, named by a visible legend. A text SHALL start empty, as "A text a tool needs" says. A new password SHALL start empty, as "A new password a tool needs" says. Focus SHALL then move to the first option. What each option holds SHALL be kept and reset as the scenarios below say. (SPEC.md: Tool page anatomy, 4; Definition of done)

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

### Requirement: A new password a tool needs

A new password SHALL be two hidden one-line fields, one under the other, each with a visible label: the password, then the same password again. The tool's hint, then a shared note on where the password goes, SHALL be shown under the first field and read with it. Both fields SHALL start empty, and the main button SHALL wait until both hold the same password the tool's rule takes. (SPEC.md: Tool page anatomy, 4 and 5; States every tool handles, Password needed; Definition of done)

#### Scenario: A file is read in a tool with a new password

- **WHEN** a file has been read in a tool whose first option is a new password
- **THEN** both empty fields are shown below the file with their labels, the hint and the shared note under the first, focus moves to the first field, and the main button waits with the tool's first sentence ("Type a password first.") shown under it and read with it

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
- **THEN** a sentence about either field is shown above that field, where the keyboard does not cover it, the keyboard's Enter key is labelled as "Go", and the fields stay hidden, so the keyboard offers no corrections, suggestions or capitals

#### Scenario: A keyboard user uses the fields

- **WHEN** a keyboard user is in the first field and presses Tab, or presses Enter in either field
- **THEN** Tab moves to the second field, then to the next option, then the rest of the working area in page order and the main button; Enter does what pressing the main button does, so it starts the job only when the main button works, and while the button waits the status region says why on every press, in the words of the sentence that holds it; the Enter that confirms a word in an input method does not press it

#### Scenario: A screen reader user reaches the fields

- **WHEN** focus moves into the first field, then the second, with a screen reader running
- **THEN** the first is read with its label, as a password field, then the hint and the shared note, and, when something is wrong with it, that it is invalid and the sentence; the second with its label, as a password field, and, when the two differ, that it is invalid and its sentence; a sentence is said once by the status region when it first appears or changes kind, never holds the password, and nothing is announced twice

#### Scenario: How the fields look

- **WHEN** the fields are shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** each has the site's field style, a label that looks like the other field labels and a height of at least 2.75rem, a sentence sits between its field's label and the field, bold in the text colour as a wrong password's is, the hint and note sit under the first field, and nothing overflows sideways

#### Scenario: The note under the first field

- **WHEN** a new password's fields are drawn
- **THEN** the note under the first field reads, in draft words for the owner, "The password stays in your browser. This site does not send it anywhere. Your browser may offer to save it or to suggest one. A saved password is kept by your browser and may be copied to your browser account."; it never claims the password goes nowhere at all

#### Scenario: Cancel, a failure and another file

- **WHEN** the visitor types the password in both fields, starts the job and presses Cancel, or the job fails and the visitor presses "Go back to your file", or the visitor picks another file with "Choose another file" while listing
- **THEN** both fields hold what was typed, and the main button works without typing it again

#### Scenario: The password is forgotten

- **WHEN** a job with the password finishes, or the visitor presses "Start again", removes the only file, or leaves the page
- **THEN** the page holds the password no longer, and the next file read shows both fields empty

#### Scenario: A new password shown for one choice

- **WHEN** a test entry shows a new password only while an earlier choice holds one value, and the visitor types it, then changes the choice
- **THEN** the fields go, the password is not sent and does not hold the main button, and changing the choice back shows both fields as typed

### Requirement: A new password is used as typed and never said back

A new password SHALL be sent exactly as typed: never trimmed, composed or cut. No sentence or status message on the page SHALL hold the password, a part of it, a refused character or its length. (SPEC.md: What we are building, rule 4; Privacy, limits and security, Browser tools)

#### Scenario: What is sent

- **WHEN** both fields hold "Open  Sesame-9 ", with two spaces inside and one at the end
- **THEN** the job is not started, because of the space at the end; and once both hold "Open  Sesame-9", the job is sent "Open  Sesame-9", byte for byte

#### Scenario: A sentence about a password

- **WHEN** any sentence about a new password is shown or said, for refused characters, a space at an end, a password too long, two passwords that differ, or a password the engine refused
- **THEN** it is one of the fixed sentences, naming no character and no number of characters typed

### Requirement: A new password the engine refuses

When a tool's engine refuses the new password it was sent, the page SHALL say "The password could not be used. Go back to your file and type it again.", or the tool's own words for its password, under the tool's heading for a failed job, and offer "Go back to your file" with both fields as typed. The sentence SHALL NOT hold the password. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a password

- **WHEN** a test entry's engine is sent a new password it refuses
- **THEN** the page shows the failed heading and "The password could not be used. Go back to your file and type it again.", and "Go back to your file" lists the file with both fields as typed
