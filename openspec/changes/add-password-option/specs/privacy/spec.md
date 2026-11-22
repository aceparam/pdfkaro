# privacy

## ADDED Requirements

### Requirement: A new password stays in the browser

A new password SHALL go only to the tool worker, with the job, and only the first field's copy. It MUST NOT be held in the widget's state, written to browser storage, the page address, the title or the console, put in any sentence, or sent with a form. The page SHALL forget it when the job finishes, on "Start again", when the last file is removed and when the page is left. (SPEC.md: Privacy, limits and security, Browser tools)

#### Scenario: The fields' markup

- **WHEN** the fields of a test entry's new password are drawn
- **THEN** each is `type="password"` with `autocomplete="new-password"`, has no name and no `maxlength`, and sits in no form

#### Scenario: The widget's state

- **WHEN** a test entry's new password is typed and a job is started, then finishes
- **THEN** the widget's state never holds either field's value, only the first field's value is in the worker's run message, and once the job has finished the page holds neither

#### Scenario: No sentence holds the password

- **WHEN** the unit tests make every sentence and status message for many passwords built around a marked string, such as "Qz7#Kw", in each case the rules know (empty, refused characters, a space first or last, too long, the second field part-typed or different, refused by the engine)
- **THEN** none holds the password, the marked string, or any refused character

#### Scenario: A tool with a new password is tested

- **WHEN** the no-upload test of a tool that takes a new password types a marked password in both fields and runs the job
- **THEN** the password is in no request, header, address, title, console message or browser storage
