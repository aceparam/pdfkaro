---
status: Draft. Waiting for the owner to review this wording before the tool is called done.
---

## Making a PDF fit under 1 MB

1. Open the file picker and choose a PDF full of photos, slides or scanned pages. A drop or a paste onto this page does the same.
2. Press “Compress to 1 MB and download”. The page first reads the file, then counts each picture as it measures it.
3. If the heading says the file is now 1 MB or smaller, download it. If it says the file is still over, read the sentence below it first.

## Questions

### Why would a file of slides or photos be so large?

Cameras and phones store photos at many millions of pixels, and slide software often keeps those photos whole. Placed on a page a few inches wide, most of those pixels are never seen. That is the room this tool uses.

### In what order are things tried?

Seven steps, mild to strong. The first keeps 150 pixels to the inch across the largest page at quality 75. Later steps lower the quality and the resolution, down to 72 pixels to the inch at quality 40. Every picture is measured once at each step, the mildest step expected to fit is written, and the written file decides.

### Which pictures are left as they are?

Pictures in CMYK colour, pictures with a limited palette, grey pictures with a colour profile, black and white scans, JPEG 2000 pictures, 16-bit pictures, small pictures drawn inside the page itself, and masks. Changing them safely needs more than this tool does, so they keep their size.

### Is 1 MB a million bytes?

It is 1,000,000 bytes here. Upload limits are written in both ways, and a million bytes is below 1,048,576, so the file passes either. A file listed as 1.0 MB on this page may therefore still be above the target.

### What if it cannot get under 1 MB?

You still get the smallest file made, with a sentence naming its size. Splitting a long slide deck, or deleting pages, is the usual next step.

### Does the file stay on my phone or computer?

Yes. Your browser does every step on your device, and nothing is uploaded: not the file, not its name, not a password.

### Are links and bookmarks kept?

Yes, along with form fields, attachments and the password. A digital signature will not be valid afterwards.
