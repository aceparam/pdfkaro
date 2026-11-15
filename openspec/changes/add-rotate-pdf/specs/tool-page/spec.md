## ADDED Requirements

### Requirement: Pages that a tool lets turn

When a tool lets the pages of one file turn, each page SHALL have "Turn left" and "Turn right" buttons, stacked and named "Turn page N left" and "Turn page N right", and no Remove; its thumbnail SHALL be drawn turned within its slot, and its caption SHALL say how far it is turned from how it was. Focus SHALL stay on the button pressed. (SPEC.md: Tool page anatomy, 4; Works on a phone)

#### Scenario: A page is turned

- **WHEN** a keyboard user presses "Turn page 3 right"
- **THEN** page 3's thumbnail is drawn a quarter turned to the right within its slot, its caption reads "Page 3, turned right", the turn is announced, and focus stays on the button

#### Scenario: The buttons at phone width

- **WHEN** the pages are shown at 360px, at 1280px, or with text at 200%
- **THEN** each page's two buttons are stacked, each as wide as the page's cell and at least 2.75rem tall, and nothing overflows sideways
