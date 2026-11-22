## ADDED Requirements

### Requirement: Which site files a tool page requests does not depend on the file

On every tool page, the site files requested after a pick, and after the main button, SHALL be the same whatever the visitor's file holds: its kind, damage, password, pages, size, pictures, how many files there are, or whether the job gives a file, no new file or a failure. Only the visitor's own actions (opening the page, picking, pressing a button) may change what is requested. (SPEC.md: Privacy, limits and security; owner, 22 Nov 2026)

#### Scenario: A PDF that reads and one that is damaged

- **WHEN** a visitor picks `text.pdf` on a PDF tool page, and in a fresh browser picks `damaged-xref.pdf` on the same page
- **THEN** the same site files are requested after each pick, PDF.js's files among them, although the damaged file draws no thumbnail

#### Scenario: A file that needs a password

- **WHEN** a visitor picks `password.pdf` and has not yet typed its password, then types it
- **THEN** the files requested after the pick are the same as for a file with no password, and typing the password requests no further file

#### Scenario: A file of the wrong kind

- **WHEN** a visitor picks a file the page does not take, such as `not-a-pdf.pdf` on a PDF tool page or a PDF on an Image to PDF page
- **THEN** the same site files are requested as for a file the page takes, and the page then says the file cannot be used, as it does today

#### Scenario: A JPG and a PNG

- **WHEN** a visitor picks a JPG, and in a fresh browser a PNG, or a picture that cannot be read, on any Image to PDF page
- **THEN** the same site files are requested after each pick, `fflate` and the picture thumbnail step among them

#### Scenario: One file and several

- **WHEN** a visitor picks one file on a tool that takes several, and in a fresh browser picks three
- **THEN** the same site files are requested after each pick

#### Scenario: Jobs that end differently

- **WHEN** jobs run on files that give a new file, give no new file (Compress PDF on a file it cannot make smaller) or fail
- **THEN** the same site files are requested after the main button for each, with `fflate` for every Compress PDF job and pdf-lib for every Add page numbers, Watermark and Sign PDF job

#### Scenario: A signature picture

- **WHEN** a visitor chooses a signature picture in Sign PDF that is a JPG, a PNG, or a file of the wrong kind
- **THEN** no site file is requested for the picture itself

#### Scenario: What the host can still see

- **WHEN** someone reads the host's log of a visit
- **THEN** it can show that a tool page was opened and, from when the files are requested, that a pick was made and when a job was started, and this is what the Privacy page says the host can see

### Requirement: The test of what the host sees

An end-to-end test SHALL serve the built site from a local server that sends GitHub Pages' cache headers and records each request it receives. For every tool page it SHALL pick several different inputs, each in a fresh browser, run a job where one can run, and fail unless the server's record after the pick and after the main button is the same for every input. Every request SHALL also pass the no-upload watcher. (SPEC.md: Browser tools; Definition of done)

#### Scenario: Every tool page is covered

- **WHEN** the test runs
- **THEN** it covers every published tool page in the registry, and a tool page with no inputs listed in its table fails the test

#### Scenario: An engine fetches something for some files only

- **WHEN** a change makes a tool fetch a file for some inputs and not others, such as `fflate` only for files with lossless pictures
- **THEN** the test fails, naming the page, the inputs and the requests that differ

#### Scenario: Each request is checked for file data

- **WHEN** the test records the requests of a pick and a job
- **THEN** each one passes the no-upload watcher against that tool's exact list of files taken from the build, with the file names and any password as secrets

#### Scenario: Files the browser already holds

- **WHEN** the browser answers a request from its own cache within the cache lifetime the server sends
- **THEN** the server records nothing for it, as the host would record nothing

### Requirement: The Privacy page says what the host can see of a file

The Privacy page draft SHALL say that which programs a tool page fetches, and in what order, does not depend on what the visitor's file holds, and what the host can still see: that a tool page was opened and, from when the programs are fetched, that a file was chosen and when a job was started. Each sentence SHALL be tied in the change's claim table to the test of what the host sees. (SPEC.md: Whole site; owner, 22 Nov 2026)

#### Scenario: The page is read

- **WHEN** a visitor reads "What happens to your file" and "Who serves the site"
- **THEN** they find these sentences in plain words, marked with the rest of the draft for the owner's review, with no absolute claim, banned word or exclamation mark

#### Scenario: The code stops making it true

- **WHEN** a change makes a tool page request a file for some inputs only
- **THEN** the test of what the host sees fails, and the sentence must not ship until the code is fixed or the sentence is removed

#### Scenario: A screen reader user reads the page

- **WHEN** a screen reader user moves through the Privacy page by headings
- **THEN** the new sentences are plain paragraphs under their headings, with no script, link or hidden text
