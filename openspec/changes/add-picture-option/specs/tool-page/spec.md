# tool-page

## ADDED Requirements

### Requirement: A picture a tool needs

A picture SHALL be a field with a label, a button to choose one picture of the tool's types, and a hint. A chosen picture SHALL be named with its size, not shown. The main button SHALL wait until one is chosen and read. A picture of the wrong type, damaged, unreadable or too large SHALL get one sentence naming it and what to do, tied to the field and the main button. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4 and 5; States every tool handles; Look and feel)

#### Scenario: The field is shown

- **WHEN** a file has been read in a test entry whose options include a picture
- **THEN** the picture's label, a "Choose a picture" button and its hint are shown in registry order, and the main button waits with the tool's sentence under it and read with it

#### Scenario: A picture is chosen

- **WHEN** the visitor chooses `signature.png`, 120 KB, and it is read
- **THEN** a line reads "signature.png, 120 KB", the button reads "Choose another picture", the status region says "signature.png, 120 KB.", no picture is shown, and the main button works

#### Scenario: Not a picture of the tool's types

- **WHEN** the visitor chooses `notes.txt` renamed `notes.png`
- **THEN** nothing is kept, and "notes.png is not a JPG or PNG picture, so it was not used." is shown between the label and the button, read with the button and tied to the main button, which does nothing when pressed

#### Scenario: A damaged picture

- **WHEN** the visitor chooses a PNG whose data is cut short
- **THEN** "broken.png is damaged and cannot be read. Choose another picture." is shown by the field and tied to the main button

#### Scenario: A picture saved in a way the tool cannot read

- **WHEN** the visitor chooses a JPG with arithmetic coding
- **THEN** "arithmetic.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy." is shown by the field and tied to the main button

#### Scenario: A picture that is too large

- **WHEN** the visitor chooses a picture over the tool's most bytes, or one over its most pixels
- **THEN** the first is turned away before it is read, the second once it is read, and "photo.jpg is too large. Choose a picture of up to 8 MB and 16 million pixels." (with the tool's numbers) is shown by the field and tied to the main button

#### Scenario: Another picture

- **WHEN** the visitor chooses another picture after one was read
- **THEN** the new one takes its place, and the old one is forgotten

#### Scenario: A keyboard user chooses a picture

- **WHEN** a keyboard user tabs to the button and presses Enter or Space
- **THEN** the system's file chooser opens, the chosen picture is named in the line, and focus stays on the button

#### Scenario: A screen reader user reaches the field

- **WHEN** a screen reader user reaches the button
- **THEN** its words are read, then the field's label, the line naming the picture if one is chosen, the sentence about a problem if there is one, and the hint, and nothing is announced twice

#### Scenario: How the field looks

- **WHEN** the field is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** the label looks like the other field labels, the button has the site's secondary style, the sentence is bold in the text colour between the label and the button, a long file name wraps, and nothing overflows sideways

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor chooses a picture, starts the job and presses Cancel, or the job fails, or the visitor picks another PDF while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another PDF the picture is still chosen; after "Start again" or removing the only file no picture is chosen and its bytes are forgotten

### Requirement: A picture the engine refuses

When a tool's engine refuses the picture it was sent, the page SHALL say "The picture could not be used. Choose another picture.", or the tool's own words, under the tool's heading for a failed job, and offer "Go back to your file" with the picture still chosen. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a picture

- **WHEN** a test entry's engine is sent a picture it refuses
- **THEN** the page shows the failed heading and "The picture could not be used. Choose another picture.", and "Go back to your file" lists the file with the picture still named in its line
