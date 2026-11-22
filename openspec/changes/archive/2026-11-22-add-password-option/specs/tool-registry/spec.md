# tool-registry

## ADDED Requirements

### Requirement: New passwords are declared in the registry

A new password SHALL be declared in its tool's registry entry by its words only. Each tool's most characters, from 1 to 127, and its character rule SHALL be written once, in the plain module its engine reads. The one rule for now SHALL be printable ASCII (U+0020 to U+007E) with no space first or last. The engine SHALL refuse anything else before it reads the file, and use an accepted password exactly as sent. (SPEC.md: Rules for the code, 1 and 2; Tool page anatomy, 4)

#### Scenario: The registry test checks a new password

- **WHEN** the registry test checks a tool with a new password
- **THEN** it fails unless the key is a plain word not used by another option, a preset, the page's items or the worker (`passwords`), the words are plain and not empty with no exclamation mark, the module has a line for that tool and key with a most characters from 1 to 127 and a known character rule, every password line in the module belongs to a new password the registry shows, a hint that names a number of characters names that most characters, and the hint ends with what its character rule takes, in the rule's own words

#### Scenario: A test entry breaks a check

- **WHEN** a test entry has a new password whose key is `passwords`, whose words are empty, whose line is missing or whose limit is 0 or 128, or the module has a line no registry entry shows
- **THEN** the registry test fails for each

#### Scenario: The engine is sent a password it does not accept

- **WHEN** an engine is sent, for a new password, something that is not a string, is empty, starts or ends with a space, is longer than its limit, or has a character its rule does not take
- **THEN** it refuses before it reads the file with the refused-password error, writes nothing, and its error does not hold the password

#### Scenario: The rule matches the readers

- **WHEN** the unit tests encrypt a small PDF with this repo's qpdf at 256-bit AES, using a password made of every character the rule takes (spaces inside only), and also passwords that start with "--" or "@"
- **THEN** each file opens with its password, and with no other, in qpdf and in PDF.js
