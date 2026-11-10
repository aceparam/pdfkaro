# Spec Delta

## ADDED Requirements

### Requirement: One generic tool widget

Every tool page SHALL mount the same island, `ToolWidget`, told which tool it is by the registry. Before a file is picked the island SHALL load only what the file picker needs. The tool's engine, its WebAssembly and the rest of the widget's parts SHALL load after a file is picked. (SPEC.md: Rules for the code, 1 and 4; Tool page anatomy)

#### Scenario: A tool page loads

- **WHEN** a tool page loads and no file has been picked
- **THEN** no engine script, worker script or WebAssembly file has been requested

#### Scenario: A second tool is added

- **WHEN** a second tool is added to the registry
- **THEN** its page uses the same island, and `[slug].astro` gains no branch for it

#### Scenario: The picker is used with the keyboard

- **WHEN** a visitor reaches the file picker with Tab and presses Enter or Space
- **THEN** the file chooser opens
