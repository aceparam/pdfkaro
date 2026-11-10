# Spec Delta

## MODIFIED Requirements

### Requirement: Site stack

The site SHALL be built with Astro with static output and TypeScript. The interface SHALL be written as React components. A component with no interaction SHALL be rendered to static HTML at build time and ship no JavaScript. Interactive parts SHALL be React islands, and on a tool page only the tool widget SHALL ship JavaScript. Styling SHALL be hand-written CSS: one global stylesheet at `src/styles/site.css` plus scoped component styles. Tailwind, component kits and icon libraries MUST NOT be used. (SPEC.md: Architecture and tech stack; React in place of Preact by the owner's decision of 10 Nov 2026, recorded in CLAUDE.md)

#### Scenario: A tool page is built

- **WHEN** a tool page is built
- **THEN** the output is static HTML with one island for the tool widget and no other script for the page content

#### Scenario: A page with no interaction is built

- **WHEN** a page such as the 404 page or a placeholder page is built
- **THEN** the output is static HTML that loads no JavaScript

#### Scenario: The home page is built

- **WHEN** the home page is built
- **THEN** every tool is in the served HTML, and the only script on the page is the island that filters the list

## ADDED Requirements

### Requirement: Logic is kept apart from views

Rules and state SHALL live in plain TypeScript modules and hooks that render nothing, and components SHALL receive what they show through props. A component MUST NOT read the registry, storage or the network directly when a prop can carry the value. This keeps components reusable on other pages and lets a later phone app reuse the logic with new views. (Owner request; SPEC.md: Rules for the code, 1 and 2)

#### Scenario: A rule is tested without rendering

- **WHEN** the rule that filters the list of tools is unit tested
- **THEN** the test calls a plain function in Node and renders no component

#### Scenario: A component is reused

- **WHEN** the list of tools is shown on a second page
- **THEN** the same component is used with different props, and no copy of it is made
