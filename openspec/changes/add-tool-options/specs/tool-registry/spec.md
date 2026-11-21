# tool-registry

## ADDED Requirements

### Requirement: Options are declared in the registry

A tool's options SHALL be declared in its registry entry: for each, a key, a legend, the values with their labels and the value chosen at first. The values each tool accepts SHALL be written once, in a plain module its engine reads to check what it is sent. No page preset SHALL use a key that is also an option's key. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test runs

- **WHEN** the registry test checks a tool with options
- **THEN** it fails unless the option keys are unique, each value is listed once with a label, the starting value is among them, and the values are exactly those the accepted-values module gives for that tool and key

#### Scenario: A preset uses an option's key

- **WHEN** a page's preset has a key that is also one of its tool's option keys
- **THEN** the registry test fails

#### Scenario: The engine is sent a value it does not accept

- **WHEN** an engine is sent a value for an option that is not among the accepted values, or no value
- **THEN** it refuses before it reads the file, and writes nothing
