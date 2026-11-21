# tool-page

## ADDED Requirements

### Requirement: A drawing a tool needs

A drawing SHALL be a box the width of the column with a visible label, a hint and a Clear button, drawn on with a finger, mouse or pen without moving the page. It is the job's input, so it SHALL start empty and the main button SHALL wait while nothing is drawn, with the tool's sentence tied to it. It SHALL never be a tool's first option, and the tool's hint SHALL name a way to do the job without drawing. (SPEC.md: Scope notes, Sign PDF; Tool page anatomy, 4 and 5; Works on a phone)

#### Scenario: A drawing is shown

- **WHEN** a file has been read in a test entry whose options include a drawing
- **THEN** the drawing's label, an empty box, its hint and its Clear button are shown in registry order, and the main button waits with the tool's sentence under it and read with it

#### Scenario: Drawing with a mouse or a pen

- **WHEN** the visitor presses in the box, moves and lets go, twice
- **THEN** two lines show where the pointer went, in the text colour, the sentence under the main button goes, and the main button works

#### Scenario: Drawing with a finger on a phone

- **WHEN** the visitor draws in the box with a finger at 360px
- **THEN** the line follows the finger, the page does not scroll or zoom, no text is selected and no menu opens

#### Scenario: A second finger

- **WHEN** a second finger touches the box while the first is drawing
- **THEN** only the first finger draws

#### Scenario: Clear

- **WHEN** the visitor presses Clear
- **THEN** the box is empty, the status region says the drawing is cleared, and the main button waits again with the tool's sentence

#### Scenario: A full drawing

- **WHEN** a drawing reaches its most lines or points
- **THEN** it takes no more, what was drawn stays, and the status region says once that the drawing is full and to clear it to start again

#### Scenario: A keyboard user reaches the drawing

- **WHEN** a keyboard user presses Tab through the working area
- **THEN** the box takes no Tab stop, Clear does, and Clear is read with the drawing's hint, which names the tool's way to do the job without drawing

#### Scenario: A screen reader user reaches the drawing

- **WHEN** a screen reader user moves through the working area
- **THEN** the box is read as a picture named by the drawing's label and described by its hint, and Clear as a button with its words, described by the same hint

#### Scenario: How the drawing looks

- **WHEN** the drawing is shown at 360px, at 1280px, in dark mode or with text at 200%
- **THEN** the box is 5 wide to 2 tall, the column's width, with a 1px edge in the control colour and corners of 4px, lines stay sharp, and nothing overflows sideways

#### Scenario: The window changes size

- **WHEN** the window is resized or the phone is turned after something is drawn
- **THEN** the drawing is shown again whole, at the new size, in the same place in the box

#### Scenario: Cancel, Start again and another file

- **WHEN** the visitor draws, starts the job and presses Cancel, or the job fails, or the visitor picks another file while listing; and later presses "Start again" or removes the only file
- **THEN** after Cancel, a failure or another file the drawing is as it was; after "Start again" or removing the only file the box is empty

#### Scenario: Drawing never blocks the page

- **WHEN** the visitor draws quickly on a phone whose processor is slowed four times
- **THEN** no task blocks the page for more than 100 ms

### Requirement: A drawing the engine refuses

When a tool's engine refuses the drawing it was sent, the page SHALL say "The drawing could not be used. Clear it and draw again.", or the tool's own words, under the tool's heading for a failed job, and offer "Go back to your file" with the drawing kept. (SPEC.md: States every tool handles, Failed; Rules for the code, 2)

#### Scenario: The engine refuses a drawing

- **WHEN** a test entry's engine is sent a drawing it refuses
- **THEN** the page shows the failed heading and "The drawing could not be used. Clear it and draw again.", and "Go back to your file" lists the file with the drawing still in the box
