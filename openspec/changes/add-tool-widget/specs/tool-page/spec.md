# Spec Delta

## ADDED Requirements

### Requirement: One generic tool widget

Every tool page SHALL mount the same island, `ToolWidget`, told which tool it is by the registry. Before a file is picked the island SHALL load only what the file picker needs. The tool's engine, its WebAssembly and the rest of the widget SHALL load after a file is picked. (SPEC.md: Rules for the code, 1 and 4; Tool page anatomy)

#### Scenario: A tool page loads

- **WHEN** a tool page loads and no file has been picked
- **THEN** no engine script, worker script or WebAssembly file has been requested

#### Scenario: A second tool is added

- **WHEN** a second tool is added to the registry
- **THEN** its page uses the same island, and `[slug].astro` gains no branch for it

### Requirement: The file picker works without the mouse and before the script

The file picker SHALL be a real file input with a visible label styled as the main button. It SHALL open with Enter or Space, show where focus is, and take files chosen before the page's script has loaded. (SPEC.md: Tool page anatomy, 3; Definition of done, keyboard use)

#### Scenario: The picker is used with the keyboard

- **WHEN** a visitor reaches the file picker with Tab and presses Enter or Space
- **THEN** the file chooser opens

#### Scenario: Files are chosen before the script loads

- **WHEN** a visitor chooses files before the page's script has finished loading
- **THEN** the files are taken as soon as it has

### Requirement: Focus goes where the visitor needs it

When a part of the widget appears or goes, focus SHALL move to the next thing the visitor needs, as the table in the `add-tool-widget` design sets out. A change SHALL be announced to a screen reader once: by moving focus to it, or by a status message, not both. (SPEC.md: Definition of done, keyboard and screen reader use)

#### Scenario: The main button is pressed

- **WHEN** a visitor presses the main button with the keyboard
- **THEN** focus moves to Cancel, and progress is read from a status region

#### Scenario: The result appears

- **WHEN** a job finishes
- **THEN** focus moves to the result's heading, and no separate status message repeats it

#### Scenario: The last file is removed

- **WHEN** a visitor removes the only file in the list
- **THEN** the page returns to the file picker alone and focus moves to it

## MODIFIED Requirements

### Requirement: Damaged file state

When a file is damaged the page SHALL say that the file is damaged and cannot be read, name it, and offer to carry on without it. When Repair PDF is published, the page SHALL also show a link that opens the file in Repair PDF. Until then no such link SHALL be shown. (SPEC.md: States every tool handles; openspec: tool-registry, related tools link only to published tools)

#### Scenario: A damaged file is chosen

- **WHEN** a visitor chooses a PDF that the tool cannot read
- **THEN** the page says "appendix.pdf is damaged and cannot be read.", names it, and offers to carry on without it

#### Scenario: Repair PDF is not published

- **WHEN** a file is damaged and Repair PDF has no registry entry
- **THEN** no link to Repair PDF is shown

#### Scenario: Repair PDF is published

- **WHEN** a file is damaged and Repair PDF has a registry entry
- **THEN** the page also links to Repair PDF with the file carried over
