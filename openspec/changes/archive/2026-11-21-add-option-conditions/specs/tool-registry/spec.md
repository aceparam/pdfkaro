# tool-registry

## ADDED Requirements

### Requirement: An option's condition is declared in the registry

An option MAY name, in its registry entry, a condition: an earlier choice of the same tool and one of that choice's values. The first option SHALL have no condition, and an option named by a condition SHALL itself have none. (SPEC.md: Rules for the code, 1; Tool page anatomy, 4)

#### Scenario: The registry test checks a condition

- **WHEN** the registry test checks a tool whose options name conditions
- **THEN** it fails unless each condition names a choice listed earlier in the same tool, one of that choice's values, and a choice with no condition of its own, and unless the tool's first option has no condition

#### Scenario: A condition that cannot hold

- **WHEN** a test entry names a condition on a key that is not an earlier choice, on a value the choice does not have, or on its own first option
- **THEN** the registry test fails for each
