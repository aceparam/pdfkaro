# look-and-feel Specification

## Purpose

How every page looks and reads: one plain column, system fonts, a fixed small set of colours, plain words, and a list of patterns that never appear. Also the home page, the header and footer, and the pages only the owner may write. Derived from "Look and feel" in `SPEC.md`, which stays the source of truth if the two ever differ.

## Requirements

### Requirement: The screenshot test

Every page SHALL pass this test: in a screenshot, it could be a page one careful person built for their own use and then tidied, and could not be the landing page of any software startup. When a design question is not answered, the plainer option SHALL be chosen. (SPEC.md: Look and feel)

#### Scenario: A page is reviewed

- **WHEN** a page is changed
- **THEN** screenshots at 360px and 1280px wide are taken and judged against the test before the change is called done

### Requirement: Layout

Pages SHALL use one column, 44rem maximum width, left-aligned. Sidebars and card grids MUST NOT be used. Spacing SHALL be generous and uneven where content calls for it. (SPEC.md: What to build)

#### Scenario: A page is viewed at 1280px

- **WHEN** a page is opened at 1280px wide
- **THEN** content sits in one left-aligned column no wider than 44rem

#### Scenario: A page is viewed at 360px

- **WHEN** a page is opened at 360px wide
- **THEN** nothing overflows sideways and every control can be reached with one thumb

### Requirement: Type

Pages SHALL use the system font stack and MUST NOT download a web font. Body text SHALL be 17px with 1.55 line height. Headings SHALL be in the same font, bold. (SPEC.md: What to build)

#### Scenario: A page loads

- **WHEN** a page loads
- **THEN** no font file is requested and body text computes to 17px

### Requirement: Colours

In light mode the background SHALL be `#fbfaf6`, text `#1b1b1b`, secondary text `#5c5c5c` and links `#0b4fa8`. Links SHALL always be underlined. The main button SHALL have a `#1b1b1b` background, white text and 4px corners. Lines and borders SHALL be 1px solid `#d9d6cc` with a corner radius of 4px at most. Dark mode colours SHALL be defined in `src/styles/site.css`. (SPEC.md: What to build)

#### Scenario: Light mode styles are checked

- **WHEN** the stylesheet is reviewed
- **THEN** every light mode colour on a page is one of the listed values, and no corner radius exceeds 4px

#### Scenario: Dark mode styles are checked

- **WHEN** the dark mode colours are reviewed
- **THEN** the main button is still clearly set apart from the background, and the owner is shown the palette to review

### Requirement: Dark mode

Pages SHALL follow the device's light or dark setting under the same rules, with no toggle. Text contrast SHALL be at least 4.5 to 1 in both modes. (SPEC.md: What to build; Definition of done)

#### Scenario: The device is set to dark

- **WHEN** a page is opened on a device set to dark mode
- **THEN** the page is dark, links are still underlined, and every text and background pair has a contrast of 4.5 to 1 or more

### Requirement: No images, icons or motion

Pages SHALL carry no images apart from page thumbnails of the visitor's own file and the one plain social image. Pages SHALL use no icons by default; a word is used instead. Pages SHALL have no motion apart from the progress bar. (SPEC.md: What to build; SEO, Social tags)

#### Scenario: A control needs a label

- **WHEN** a control such as "move up" is added
- **THEN** it is labelled with words, not an icon

### Requirement: Home page

The home page SHALL hold the site name, one sentence, a plain text box that filters the list ("What do you need to do?"), and every tool as a text link under the seven group headings, each with a one-line description. It SHALL hold nothing else. (SPEC.md: What to build)

#### Scenario: A visitor filters the list

- **WHEN** a visitor types "merge" in the box
- **THEN** only tools matching "merge" remain listed

#### Scenario: The served page is read

- **WHEN** the home page is fetched and no script is run
- **THEN** every tool is listed as a link in the response

### Requirement: Header and footer

The header SHALL be the site name as a text link and a link to "All tools". It MUST NOT stick to the top while scrolling. The footer SHALL be five text links: About, Privacy, Changes, Known problems, Contact. (SPEC.md: What to build; Banned patterns)

#### Scenario: A page is scrolled

- **WHEN** a visitor scrolls down a long page
- **THEN** the header scrolls away with the page

### Requirement: Wording

Page text SHALL use short sentences and plain verbs, say what the tool does and then stop, and carry no selling. Errors SHALL say what happened and what to do next. FAQ entries SHALL answer questions people really have and MUST NOT restate the page title. Exclamation marks MUST NOT appear anywhere. (SPEC.md: How the words should read)

#### Scenario: Page text is checked

- **WHEN** the text of a changed page is searched
- **THEN** it holds no exclamation mark and no FAQ entry that repeats the title

### Requirement: Banned patterns

Nothing on the "Banned patterns" list in `SPEC.md` SHALL appear on any page. The list in `SPEC.md` is the one to check against; it is not copied here so that the two cannot drift apart. The list bans the word "unlock" while the catalogue names a tool Unlock PDF; that conflict is the owner's to settle and is not settled here. (SPEC.md: Banned patterns; Tool catalogue)

#### Scenario: A page is checked before it is called done

- **WHEN** a page is added or changed
- **THEN** it is checked against each item on the list at 360px and 1280px, and its text is searched for the banned words

#### Scenario: A banned styling tool is added

- **WHEN** a change adds the Inter font, shadcn/ui, Tailwind, Lucide or Heroicons
- **THEN** the change is rejected

#### Scenario: A banned visual pattern is added

- **WHEN** a page gains a hero section, a row of feature cards, a purple or indigo gradient, a drop shadow, a pill badge, an entrance animation, a testimonial or a pop-up
- **THEN** the page fails the check

#### Scenario: Unlock PDF is built

- **WHEN** a change builds the Unlock PDF tool
- **THEN** the change asks the owner how the banned word is to be treated before the page text is written

### Requirement: Pages only the owner writes

Agents SHALL leave a clearly marked placeholder for the About, Changes and Known problems pages and MUST NOT write them. The Contact page SHALL be a marked placeholder with no invented address. Agents MUST NOT invent a person, a backstory or a motive for the site. (SPEC.md: Pages only the owner can write; What to build)

#### Scenario: A placeholder page is built

- **WHEN** the About page is built before the owner has written it
- **THEN** it says plainly that the owner has yet to write it and holds no made-up content

#### Scenario: The Contact page is built

- **WHEN** the Contact page is built before the owner has given an address
- **THEN** it says plainly that the owner has yet to add one, and shows no email address

### Requirement: Plain 404 page

The site SHALL have a plain 404 page that links to the list of tools. (SPEC.md: Definition of done, The site)

#### Scenario: A missing page is opened

- **WHEN** a visitor opens a URL that does not exist
- **THEN** the 404 page says the page was not found and links to the list of tools
