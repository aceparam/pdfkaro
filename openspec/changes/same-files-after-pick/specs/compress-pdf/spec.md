# Spec delta: compress-pdf

## MODIFIED Requirements

### Requirement: Nothing is uploaded

No request that leaves the page SHALL carry the file's contents, its name or its password. After a pick the page SHALL fetch only the site's own files the tool needs, and for any two files read as ready and compressed, the set it fetches SHALL be the same, whatever the files hold: every job fetches `fflate`, whether or not the file has a picture it uses it for. (A file read as damaged, or waiting for its password, fetches no thumbnail files; that is outside this requirement.) (SPEC.md: Privacy, limits and security, Browser tools; owner's decision of 11 Nov 2026, "PDF.js's helper data is one fixed set")

#### Scenario: The no-upload test

- **WHEN** the no-upload test picks `rich.pdf` under a telling name, and `password.pdf` with its password, compresses and downloads
- **THEN** every request is to the site's own files on an exact list taken from the build, which includes the engine, `qpdf-json`, `picture`, `resample` and `fflate` and no pdf-lib; no request, header, console line or page title holds the file name, its stem, the password, a bookmark title, the attachment's name or the document's title

#### Scenario: The picture path is watched

- **WHEN** the no-upload test compresses, under a telling name, a file where a JPG picture carrying the camera and place markers of `pictures/details.jpg` and a lossless picture are both made smaller, and downloads the result
- **THEN** a download happened, the engine, `picture`, `resample` and `fflate` were fetched, and no request, header, console line or page title holds the file name, its stem or the markers

#### Scenario: Files of different kinds fetch the same files

- **WHEN** the test compresses `compress-text.pdf` (no pictures), `compress-small-jpg.pdf` (JPG pictures only), `compress-scans.pdf` (a JPG and a lossless picture) and `compress-packed.pdf` (which ends with no new file), each in a fresh browser context with an empty cache, recording every request from the pick to the result
- **THEN** each run passes the no-upload check, each run's paths include `fflate`'s exact file, and the four sets of paths, leaving out `blob:` addresses, are the same

#### Scenario: The engine asks for fflate for every job

- **WHEN** the engine's unit test runs a job on a file with no pictures, one with JPG pictures only, one with a lossless picture and one whose dictionaries are too large to read
- **THEN** each job asks its tools for `fflate` once, before it asks for qpdf

#### Scenario: Hidden text and form values

- **WHEN** the no-upload test compresses and downloads `tagged.pdf` and `form.pdf`, then compresses `compress-packed.pdf`, which ends in "could not be made smaller"
- **THEN** no request, header, console line or page title holds `tagged.pdf`'s `SECRET-` markers, either document's title or `form.pdf`'s field values

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves
- **THEN** nothing about the file is kept in storage, and the address has no query and no hash
