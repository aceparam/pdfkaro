# tool-page

## ADDED Requirements

### Requirement: A picture a tool needs

A picture SHALL be a field with a label, a button to choose one picture of the tool's types, and a hint. A chosen picture SHALL be named with its size, not shown. The main button SHALL wait until one is read. A wrong, damaged or unreadable picture SHALL get one sentence naming it and what to do, tied to the field and the main button; a large one, a notice, and still be used. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4 and 5; States every tool handles; Look and feel)

#### Scenario: The field is shown

- **WHEN** a file has been read in a test entry whose options include a picture
- **THEN** the picture's label, a "Choose a picture" button and its hint are shown in registry order, and the main button waits with the tool's sentence under it and read with it

#### Scenario: A picture is chosen

- **WHEN** the visitor chooses `signature.png`, 120 KB, and it is read
- **THEN** a line reads "signature.png, 120 KB.", the button reads "Choose another picture", the status region says "signature.png, 120 KB.", no picture is shown, and the main button works

#### Scenario: Not a picture of the tool's types

- **WHEN** the visitor chooses `notes.txt` renamed `notes.png`, with or without a picture chosen before
- **THEN** no picture is chosen, any earlier one is forgotten, and "notes.png is not a JPG or PNG picture, so it was not used. No picture is chosen." is shown between the label and the button, read with the button and tied to the main button, which does nothing when pressed, and the button reads "Choose a picture" again

#### Scenario: A damaged picture

- **WHEN** the visitor chooses a PNG whose data is cut short
- **THEN** "broken.png is damaged and cannot be read. Choose another picture." is shown by the field and tied to the main button

#### Scenario: A picture saved in a way the tool cannot read

- **WHEN** the visitor chooses a JPG with arithmetic coding
- **THEN** "arithmetic.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy." is shown by the field and tied to the main button

#### Scenario: A very large picture

- **WHEN** the visitor chooses `photo.jpg`, 12.4 MB and 24 million pixels, in a tool whose notice sizes are 8 MB and 16 million pixels
- **THEN** it is read and used, its line reads "photo.jpg, 12.4 MB.", a notice says "photo.jpg is 12.4 MB, with 24 million pixels." and "A picture this large makes the new file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead.", the notice is tied to the main button, and the main button works

#### Scenario: The worker is ended while a picture is read

- **WHEN** the worker is ended while a picture is being read, because a thumbnail ran out of time
- **THEN** the picture is read again while it is still chosen and the files are listed, and never stays "Getting ready"

#### Scenario: The job ends while a hidden picture is being read

- **WHEN** a picture hidden by a choice is still being read when the job starts, and the job's end cancels the read
- **THEN** it is not read again during the job or on its result, and no worker is started for it

#### Scenario: A picture is picked again while the last is still being read

- **WHEN** the visitor picks another picture while the last one is still being read
- **THEN** the worker reading the last one is ended, the new one is read on a fresh worker, and the last one is never read again

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

### Requirement: A picture too large for the file

When a tool's engine finds that the chosen picture alone would make the new file pass its size budget, the page SHALL say "photo.jpg (24.6 MB) is too large to place on these pages. Crop it to the signature, or save a smaller copy.", with the picture's name and size and the tool's own step where it gives one, under the failed heading, and offer "Go back to your file". (SPEC.md: States every tool handles, Too large and Failed)

#### Scenario: The engine finds the picture too large

- **WHEN** a test entry's engine throws the picture-too-large error for a chosen `photo.jpg` of 24.6 MB
- **THEN** the page shows the failed heading and that sentence, and "Go back to your file" lists the file with the picture still chosen

### Requirement: A picture the engine refuses

When a tool's engine refuses the picture it was sent, the page SHALL say "The picture could not be used. Choose another picture.", or the tool's own words, under the tool's heading for a failed job, and offer "Go back to your file" with the picture still chosen. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a picture

- **WHEN** a test entry's engine is sent a picture it refuses
- **THEN** the page shows the failed heading and "The picture could not be used. Choose another picture.", and "Go back to your file" lists the file with the picture still named in its line
