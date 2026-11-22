# tool-registry

## ADDED Requirements

### Requirement: Drawings are declared in the registry

A drawing SHALL be declared in its tool's registry entry by its words only: a key, a label, a hint, the Clear button's words and its sentences. The pad's units and each tool's most lines and points SHALL be written once, in the plain module its engine reads. The engine SHALL refuse, before it reads the file, anything that is not a drawing within them. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test checks a drawing

- **WHEN** the registry test checks a tool with a drawing
- **THEN** it fails unless the words are plain and not empty, the module has a line for that tool and key with most lines and most points within their bounds, every drawing line in the module belongs to a drawing the registry shows, and the tool's first option is not a drawing

#### Scenario: The engine is sent something that is not a drawing

- **WHEN** an engine is sent, for a drawing, something that is not a list of lines, no lines, a line with an odd count or no points, a value that is not a whole number (such as NaN, Infinity, text or null) or lies outside the pad, a line that is not a plain list, or more lines or points than its limits
- **THEN** it refuses before it reads the file with the refused-drawing error, and writes nothing
