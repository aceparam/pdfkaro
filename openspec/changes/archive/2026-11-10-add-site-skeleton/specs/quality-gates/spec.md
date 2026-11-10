# Spec Delta

## MODIFIED Requirements

### Requirement: Continuous checks

CI SHALL run lint, type check, unit tests and end-to-end tests on every pull request. A preview of the site SHALL be published from the main branch and from the branches the owner allows, and only after the same checks pass on that push. There is one preview; it shows the latest such push. (SPEC.md: Build phases, phase 0; one shared preview on GitHub Pages by the owner's choice of 10 Nov 2026, recorded in CLAUDE.md)

#### Scenario: A pull request is opened

- **WHEN** a pull request is opened or updated
- **THEN** lint, type check, unit tests and end-to-end tests run and must pass

#### Scenario: A branch the owner allows is pushed

- **WHEN** a push is made to the main branch or to a branch the owner has allowed to deploy
- **THEN** the checks run, and if they pass the preview is replaced with a build of that push

#### Scenario: The checks fail on a push

- **WHEN** a check fails on a push to a branch that can deploy
- **THEN** nothing is published and the preview keeps showing the last good build

#### Scenario: A pull request comes from a fork

- **WHEN** a pull request is opened from a fork
- **THEN** the checks run and nothing is published
