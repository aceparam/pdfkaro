## ADDED Requirements

### Requirement: A tool page links to its group

Below its related tools, every tool page SHALL show one text link to its group's hub page, worded "All tools in" and the group name, in the served HTML. It is part of the text below the tool and adds no new part. (SPEC.md: Tool page anatomy, 7; SEO, Site-wide; SEO, Every tool page, Structured data)

#### Scenario: A tool page is fetched

- **WHEN** `/merge-pdf` is fetched and no script is run
- **THEN** after its related tools it holds a link "All tools in Organise pages" to the "Organise pages" hub page, and the link matches the middle step of its breadcrumb

#### Scenario: Keyboard and screen reader

- **WHEN** a visitor tabs past the related tools
- **THEN** the hub link takes focus next with a visible outline, is at least 44px tall, and a screen reader reads its words as they are shown

#### Scenario: A phone-sized screen

- **WHEN** a tool page is shown 360px wide
- **THEN** the link wraps within the column and nothing scrolls sideways
