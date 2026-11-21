# tool-registry

## MODIFIED Requirements

### Requirement: Options are declared in the registry

A tool's options SHALL be declared in its registry entry: for a choice, a key, a legend, the values with their labels and the value chosen at first; for a text, a key, a label, a hint, the sentence while empty, the most characters and the character rule. What each tool accepts SHALL be written once, in a plain module its engine reads to check what it is sent. No page preset SHALL use an option's key. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test runs

- **WHEN** the registry test checks a tool with options
- **THEN** it fails unless the option keys are unique, each value is listed once with a label, the starting value is among them, and the values are exactly those the accepted-values module gives for that tool and key

#### Scenario: The registry test checks a text

- **WHEN** the registry test checks a tool with a text
- **THEN** it fails unless the label, hint and sentence while empty are plain and not empty, the most characters is a whole number from 1 to 200, the character rule is a known one, both are exactly those the accepted-values module gives for that tool and key, and every text line in that module belongs to a text the registry shows

#### Scenario: A preset uses an option's key

- **WHEN** a page's preset has a key that is also one of its tool's option keys
- **THEN** the registry test fails

#### Scenario: The engine is sent a value it does not accept

- **WHEN** an engine is sent a value for an option that is not among the accepted values, or no value
- **THEN** it refuses before it reads the file, and writes nothing

#### Scenario: The engine is sent a text it does not accept

- **WHEN** an engine is sent, for a text, something that is not a string, is empty or only spaces once trimmed, is longer than its limit, or has a character its rule does not take
- **THEN** it refuses before it reads the file, writes nothing, and its error does not hold the text

#### Scenario: The character rule matches the fonts

- **WHEN** the unit tests check the standard fonts' character rule
- **THEN** every character it takes is drawn by pdf-lib's standard Helvetica, Helvetica Bold, Times and Courier as itself and not as a question mark, and a sample of characters it refuses (Devanagari, Telugu, Arabic, Chinese, Polish, an emoji, a tab, a soft hyphen) is refused
