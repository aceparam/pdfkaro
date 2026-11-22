# Spec delta: images-to-pdf

## MODIFIED Requirements

### Requirement: Nothing is uploaded

No request that leaves the page SHALL carry a picture's contents, its name or its details. After a pick the page SHALL fetch only the site's own files the tool needs, and for any two pictures read as ready, the set it fetches SHALL be the same, whether JPG or PNG: reading any picture fetches `fflate`, whatever its type. (A picture refused or read as damaged fetches no thumbnail file; that is outside this requirement.) (SPEC.md: Privacy, limits and security, Browser tools; owner's decision of 11 Nov 2026, "PDF.js's helper data is one fixed set")

#### Scenario: The no-upload test

- **WHEN** the no-upload test picks two pictures, one with a camera name and a GPS place in its details, reorders them, converts them and downloads the result
- **THEN** every request is to the site's own files on an exact list taken from the build (the worker, the workspace chunk, the engine, the shared picture files, pdf-lib's file and `fflate`'s file, with no qpdf or PDF.js), no request has a header the browser does not send itself, no request, console line or page title holds either file name, its stem, the camera name or the place, and the downloaded PDF holds neither the camera name nor the place

#### Scenario: A JPG and a PNG fetch the same files

- **WHEN** the test picks a JPG alone and, in another fresh browser context with an empty cache, a PNG alone on `/image-to-pdf`, recording every request from the pick until the thumbnail shows and then through converting and downloading
- **THEN** each run passes the no-upload check, `fflate`'s exact file is fetched before the thumbnail shows in both, and the two runs' sets of paths, leaving out `blob:` addresses, are the same until the thumbnail and the same for the whole run

#### Scenario: Reading a picture asks for fflate whatever its type

- **WHEN** the engine's unit test reads a JPG, a PNG and a file of neither kind before the job
- **THEN** each read asks its tools for `fflate` once

#### Scenario: The visitor starts again or leaves

- **WHEN** the visitor presses "Start again" or leaves the page
- **THEN** nothing about the pictures is kept in storage, and the address has no query and no hash
