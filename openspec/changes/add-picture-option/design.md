# Design

## Context

- **Options today** (`add-tool-options`, `add-text-option`, `add-option-conditions`, `add-drawing-option`, merged first): `ToolOption = ChoiceOption | TextOption | DrawingOption`, each with an optional `when`; what each tool accepts is written once in `src/widget/option-values.ts`; `src/widget/options.ts` holds `shownOptions`, `optionsToSend`, `jobOptions` and `optionsHold`; `State.choices` holds choices, texts and drawings; `ToolWorkspace` draws each kind and ties the first holding option's sentence to the main button.
- **Files today:** `useToolRun` keeps the tool's files (`File`) and passwords in refs, never in the state; the state holds each file's name, size and status. `addFiles` sniffs the first bytes against the tool's `accepts` (`looksAccepted`), lists the file, and has the worker read it (`inspect`), ending any thumbnail being drawn first. The run message carries `files: Blob[]` and `options`; `worker-core` reads each Blob into bytes and calls the engine. The worker is ended after every job.
- **Pictures today:** `src/engines/picture.ts` reads a JPG or PNG from its bytes without decoding a pixel (`readPicture`), bounds-checked and capped, and gives the parts that may go into a PDF with no details (`jpegForPdf`, `pngForPdf`), with `pngDataFits` checking a PNG's data inflates to no more than its header says. Image to PDF reads its pictures this way, and `tests/fixtures/pictures/` holds a picture of each kind with its outcome in the fixtures README.
- **`FilePicker`** is a real file input inside a label styled as a button; it empties itself after each pick.

## Goals / Non-Goals

**Goals:**
- A second file of another kind, picked, checked and sent through the same paths as the tool's own files: read in the worker, held in memory, never in the state.
- One sentence for each problem, as a file's problems have, and the main button waiting until the picture is ready.
- What a picture may be written once, read by the page, the worker's check and the engine.

**Non-Goals:**
- A preview; drops or pastes for the picture; other types; several pictures per option; cropping, turning or background removal.

## Decisions

### 1. The registry type

```ts
/**
 * One picture the visitor chooses beside the tool's file, such as a picture of a signature. It is the
 * job's input: the main button waits until one is chosen and read. Its types and notice sizes are written
 * once, in src/widget/option-values.ts (`optionPictures`); the registry holds only its words.
 */
export type PictureOption = {
  kind: 'picture';
  /** The key the engine receives the picture's bytes under: `picture`. */
  key: string;
  /** Above the button, naming the field: "Picture of your signature". */
  label: string;
  /** The button before a pick: "Choose a picture". */
  pickLabel: string;
  /** The button once a picture is chosen: "Choose another picture". */
  againLabel: string;
  /** Under the button: what it takes and the notice sizes. "A JPG or PNG picture. One over 8 MB or 16 million pixels still works but makes the file large. …" */
  hint: string;
  /** What a picture of the wrong type is not: "a JPG or PNG picture". */
  acceptsName: string;
  /** Tied to the main button while none is chosen: "Choose a picture of your signature first." */
  emptySentence: string;
  /** When the engine refuses the picture. Left out: "The picture could not be used. Choose another picture." */
  refusedSentence?: string;
  /** The notice's text for a very large picture. Left out: "A picture this large makes the new file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead." (decision 7) */
  largeAdvice?: string;
  /** Said after "photo.jpg (24.6 MB) is too large to place on these pages." Left out: "Choose a smaller picture." (decision 8) */
  tooLargeAdvice?: string;
  when?: { key: string; value: string };
};
```

### 2. What a picture may be, written once: `src/widget/option-values.ts`

```ts
/** A picture option's types. Not `PictureType`, which picture.ts already uses for 'jpeg' | 'png'. */
export type PictureMime = 'image/jpeg' | 'image/png';
/** What one picture may be: its types, and the sizes above which the page shows a notice. Nothing is refused for its size. */
export type PictureRule = { types: readonly PictureMime[]; noticeBytes: number; noticePixels: number };
export const optionPictures: Readonly<Record<string, Readonly<Record<string, PictureRule>>>> = {};
export function pictureRule(tool: string, key: string, table = optionPictures): PictureRule | undefined;
/** Thrown by an engine that refuses its picture, before it reads the PDF. Known to the worker by its name. Its message holds nothing of the picture. */
export class PictureRefused extends Error { override name = 'PictureRefused'; }
```

- **A notice, not a limit** (the coordinator's decision at stage 1, after the program manager, UX, the architect and security): `SPEC.md` sets no fixed size limit, and Image to PDF's very large pictures get a notice and are still converted, with the owner's question on refusing them still open. A picture option does the same: over `noticeBytes` or `noticePixels`, the page names the size, says what to try, and the job still runs. Whether a tool should refuse such pictures is put to the owner (proposal). What makes a large picture safe to place is the tool's job: Sign PDF passes a picture's data still compressed and writes it once (`add-sign-pdf`).
- **The registry test** checks each picture has its line and each line belongs to a picture the registry shows; `types` is one or both of JPG and PNG, with no repeat; `noticeBytes` a whole number of megabytes (1,048,576 bytes) from 1 to 50, so it is written "8 MB" in words; `noticePixels` a whole number of millions from 1 to 100; words plain and not empty, with no exclamation mark; a hint that names a size in MB names `noticeBytes` (as a hint's characters are checked against a text's limit); and that the tool's engine exports `inspectPicture` (in `engines-match-registry.test.ts`).

### 3. The shared check: `src/engines/picture.ts`

```ts
export type PictureOutcome = { kind: 'ready'; pixels: number } | { kind: 'damaged' } | { kind: 'unsupported' };

/** Whether a picture's bytes may be used under a rule: read without decoding a pixel, every read bounds-checked. */
export function pictureOutcome(bytes: Uint8Array, rule: PictureRule, fflate: { Inflate: InflateClass }): PictureOutcome;

/** For an engine: the bytes when `value` is bytes whose outcome under the tool's own rule is ready; else undefined. */
/** The engine passes `optionPictures` as `table`: picture.ts imports only types from option-values.ts, so Image to PDF, which shares picture.ts, fetches no more files than before. */
export function acceptedPicture(tool: string, key: string, value: unknown, fflate: { Inflate: InflateClass }, table: PictureTable): Uint8Array | undefined;
```

`pictureOutcome`, in order: `readPicture` damaged or unsupported is that; a type not in `types` is damaged (the page sniffed it first, so only a file whose header lies reaches here); a PNG whose data does not fit (`pngDataFits`) or a JPG `jpegForPdf` cannot rebuild is damaged; else ready, with its width × height as stored. Size never refuses. Reading only, with the caps `picture.ts` already has; nothing is decoded and nothing kept.

It always takes `fflate`, and a tool's `inspectPicture` asks for it for every picture, JPG or PNG, so the files the worker fetches are the same whatever the picture's type (the privacy rule issue #20 sets for fonts, applied here). In the built site `fflate` shares a chunk with pdf-lib, so that chunk is fetched when a picture is read, before the main button, as Image to PDF's reading of a PNG already does.

### 4. The state

```ts
export type PictureEntry = { name: string; size: number; pixels?: number; status: 'reading' | 'ready' | 'damaged' | 'unsupported' | 'refused' };
/** Each picture option's chosen picture, by key: what the screen shows, never its bytes. */
pictures: Readonly<Record<string, PictureEntry>>;
```

- Actions: `picture-chosen { key, name, size, status }` (status `reading`, or `refused` when the page turned it away) and `picture-read { key, outcome }`, both only while listing; `picture-read` changes only an entry still `reading`.
- Kept and reset as choices: kept through `added`, `started`, `progressed`, `failed`, `back-to-files` and removing a file that is not the last; cleared by `reset` and by removing the last file.

### 5. Picking and reading: `useToolRun`

- The bytes are held in a ref, `pictures: Map<string, File>`, beside `files`. `pickPicture(key, file)`:
  1. reads the first `sniffLength` bytes (from `accept.ts`); if they are not of the rule's types (`looksAccepted(head, rule.types)`), the held picture for that key is forgotten and `picture-chosen` records it as `refused`. **A wrong pick leaves no picture chosen**, even if one was ready before: the field has one slot, holding the last pick, and its sentence says "No picture is chosen." This was chosen over keeping the earlier picture beside a sentence about the new file, which would show a ready line and a problem at once (UX, stage 1: either, the plainer written down);
  2. else holds it, records `reading`, ends any thumbnail being drawn (as `inspect` does), and asks the worker to read it (`readChosenPicture`); when the answer comes, and the same file is still held for that key, records it. A worker failure while reading (the engine could not load) is the tool's failure, as for a file.
- **A read cut short** (the architect, stage 1): `ToolClient.end()` rejects a pending request as `cancelled`, and the worker is ended by a thumbnail's time limit or by `stopThumbnail`. `readChosenPicture` therefore reads again when the answer is `cancelled` and the same file is still held and still `reading`, at most twice, then records it as damaged; and `backToFiles` reads again any picture still `reading`, as it does for files. So a picture never stays "Getting ready".
- **No thumbnail while a picture is read:** the thumbnail pump starts nothing while any picture is `reading`, so the second cause does not arise in normal use; the retry covers the rest.
- `clear` forgets the held pictures with the files; removing the last file forgets them too, as the state is reset.
- `start` sends `picturesToSend(options, choices, state.pictures, held)`: for each shown picture option whose entry is `ready`, its held `File`, by key. A hidden or unready picture is not sent.

### 6. The messages, the client and the worker

- `ToWorker` gains `{ type: 'inspect-picture'; requestId; toolId; key; file: Blob }`, and the run message an optional `pictures?: Record<string, Blob>`. `isToWorker` checks `key` and each `pictures` key against the plain-word pattern the tool id uses, at most 4 entries, each a `Blob`; anything else is ignored, as now.
- `FromWorker` gains `{ type: 'picture-inspected'; requestId; outcome: PictureOutcome }`, its outcome one of the three kinds, `pixels` a whole number above 0 when ready.
- `ToolClient` gains `inspectPicture(file, key)`, and `run` an optional `pictures` argument.
- `worker-core`: for `inspect-picture`, it loads the tool's engine and calls its `inspectPicture(key, bytes, tools)`; an engine without one answers `damaged`, so nothing unread is ever called ready. For a run, it reads each picture into bytes and calls the engine with `{ ...options, ...pictureBytes, passwords }`; the registry test already keeps option keys apart from presets and item keys, and now from `passwords` too.
- `EngineModule` gains `inspectPicture?: (key: string, bytes: Uint8Array, tools: EngineTools) => Promise<PictureOutcome>`; a tool's is one line, `pictureOutcome` with its rule.

### 7. The component: `src/components/PictureField/`

```tsx
<div className={`field ${styles.picture}`}>
  <p id={labelId} className={styles.label}>{option.label}</p>
  {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
  {chosen ? <p id={chosenId} className={styles.chosen}>{chosen}</p> : null}
  <FilePicker label={entry ? option.againLabel : option.pickLabel} accepts={types} multiple={false} look="secondary"
              onFiles={(files) => onPick(files[0])} describedBy={[labelId, chosenId, errorId, hintId]} inputRef={focusRef} />
  <p id={hintId} className={styles.note}>{option.hint}</p>
</div>
```

- `FilePicker` gains an optional `describedBy` (ids joined into the input's `aria-describedby`); nothing else about it changes, and its other uses pass none.
- **The line:** "signature.png, 120 KB" when ready, "signature.png, Getting ready" while read; no line for a picture turned away (its sentence names it and says no picture is chosen). A long name wraps (`overflow-wrap: anywhere`).
- **The sentences,** in `src/widget/options.ts` (`pictureSentence`), each naming the file as React text, so a hostile name is shown, never run:
  - refused: "notes.png is not a JPG or PNG picture, so it was not used. No picture is chosen." (with `acceptsName`);
  - damaged: "broken.png is damaged and cannot be read. Choose another picture.";
  - unsupported: "arithmetic.jpg is saved in a way this tool cannot read. Open it in a photo app, save a copy, and choose the copy.";
- **The notice** (`pictureNotice`, beside them), for a ready picture over `noticeBytes` or `noticePixels`: a `Notice` under the field whose heading is "photo.jpg is 12.4 MB, with 24 million pixels." (`formatSize`, and pixels in millions with `number`), and whose text is "A picture this large makes the new file larger, and a phone may run out of memory. Crop it to the signature, or save a smaller copy. You can still go ahead." (the tool's words where it gives `largeAdvice`; Sign PDF names the signature). It is tied to the main button by `aria-describedby`, as Image to PDF's notice is, and holds nothing back. The hint names the notice sizes, so the visitor knows them before choosing.
- **`optionsHold`'s signature** gains two last, optional arguments, after the `drawings` table `add-drawing-option` added: `optionsHold(tool, options, choices, texts?, drawings?, pictures: State['pictures'] = {}, pictureTable = optionPictures)`, so its callers and tests that pass `texts` or `drawings` keep working; `ToolWorkspace` passes `state.pictures` and memoises on it too. `picturesToSend(options, choices, pictures, held)` is new beside it; `optionsToSend` and `jobOptions` are unchanged, as the bytes do not go in `options` on the page.
- **The main button:** `optionsHold` gives, for a shown picture, `empty` with `emptySentence` when none is chosen, `reading` with "The picture is still being read." while read (both in the tied paragraph under the button), and the sentence above, by the field, for a problem (tied from there, as a text's is). The status region says "signature.png, 120 KB." once when ready, and each problem's sentence once when it appears.
- **No preview:** "Look and feel" allows no image but page thumbnails of the visitor's file, and showing it would mean decoding it on the page or a second thumbnail path. The name and size say which picture was chosen.
- **Drops and pastes** stay the tool's own files (`useFileDrop` is unchanged): a picture dropped on a PDF tool's page is refused as not a PDF, as now. Taking drops for the field was considered and dropped: a drop has no target field, and guessing by type would surprise.
- **Look,** in `PictureField.module.css`: a top margin of 1.5rem; the label as the field labels; `.error` bold in the text colour and `.note` muted, copied from `TextField` on purpose, as `add-text-option` copied them from `PasswordField`, so each component owns its styles.

### 8. The failures

- `FailureKind` gains `picture-refused`; `worker-core` maps an error named `PictureRefused` to it and `messages.ts` accepts it; `failureSentence` gives the first picture option's `refusedSentence`, else "The picture could not be used. Choose another picture."
- `FailureKind` also gains `picture-too-large`, from an error named `PictureTooLarge` (in `option-values.ts`, beside `PictureRefused`), for an engine that finds the picture alone would pass its new file's size budget (Sign PDF, whose drawing step counts the picture once; the architect and UX, stage 1). `failureSentence` gains an optional last argument, the state's `pictures`, so the sentence names the chosen picture and its size: "photo.jpg (24.6 MB) is too large to place on these pages." followed by the option's `tooLargeAdvice`, else "Choose a smaller picture." Without a chosen picture it says "The picture is too large to place on these pages." `PictureOption` gains optional `tooLargeAdvice` (Sign PDF: "Crop it to the signature, or save a smaller copy.").
- **Never a blob address:** a unit test reads the source of `PictureField` and of `useToolRun`'s picking code (`pickPicture`, `readChosenPicture`) and checks neither calls `URL.createObjectURL` or writes to storage (the privacy reviewer, stage 1).

## Page weight and late loading

The script before a pick is unchanged: no published tool has a picture, and the field, its rules and its styles are in the workspace chunk and its stylesheet, fetched after a pick. `pictureOutcome` is in `picture.ts`, which only an engine that uses it imports, so it loads with that engine, after a pick. Nothing about WebAssembly changes. `npm run weigh` must pass.

## Threats

- **A hostile picture.** It is never decoded on the page; the worker reads it with `readPicture`, which is bounds-checked and capped, and `pngDataFits`, which inflates with a limit; the worker is ended after every job. Its first bytes are sniffed on the page only to turn away the wrong type, as for every file.
- **A huge picture.** Not refused (decision 2): never read whole on the page; read in the worker without decoding a pixel, with `pngDataFits` inflating under the size the header gives; its size and pixels named in a notice. What a tool does with it (decoding, writing it into the file) is that tool's to bound; Sign PDF's design says how it does.
- **A hostile name.** Shown as text only; never sent, never in an address, a title or an error.
- **A crafted message.** Keys and blobs checked by `isToWorker`; an engine re-checks the bytes with `acceptedPicture` before it reads the PDF, and throws `PictureRefused`, whose message holds nothing of the picture.
- **Leaks.** No `blob:` address is made for the picture; its bytes live in a ref and the worker only, and are forgotten on "Start again", on removing the last file and on `pagehide`.

## Tests

- **Unit, `tests/unit/picture.test.ts`:** `pictureOutcome` for every picture in `tests/fixtures/pictures/` under a rule of JPG and PNG (ready with its pixels, damaged or unsupported as the README gives them; `huge.jpg` and `huge.png` ready with their pixels; `data-bomb.png` damaged) and under a JPG-only rule (a PNG damaged); `acceptedPicture` with a filled table (good bytes; a large picture taken; not bytes; an array of numbers; `__proto__`; `toString`). The outcomes go into the fixtures README.
- **Unit, `tests/unit/options.test.ts`:** `pictureSentence` for each status (the refused one saying no picture is chosen); `pictureNotice` (none at or under both sizes; a heading with size and pixels over either; the tool's `largeAdvice`); `optionsHold` (empty, reading, a problem, ready, ready and large never holding; hidden; called with and without `pictures`); `picturesToSend` (shown and ready only).
- **State:** both actions only while listing; `picture-read` ignored unless reading; kept through Cancel, a failure and "Choose another file"; cleared by "Start again" and removing the last file.
- **Messages and client:** `isToWorker` accepts the new message and run field and refuses a bad key, more than 4 pictures, or a picture that is not a Blob; `isFromWorker` accepts each outcome and refuses others; `ToolClient.inspectPicture` and `run` with pictures, with a fake worker; **the worker ended during a picture read** gives `cancelled`, and the plain rule `rereadPicture(entry, stillHeld, tries)` (in `src/widget/options.ts`, used by `useToolRun`) says read again while held and reading, up to twice, then damaged; `backToFiles`' list of pictures to read again (`picturesToReread(state)`) holds every one still reading.
- **Worker:** with a fake engine, `inspect-picture` answers its outcome, an engine without `inspectPicture` answers damaged, a run hands the picture's bytes to the engine under its key beside the page's options and the passwords, and `PictureRefused` maps to `picture-refused`.
- **Failure:** `failureSentence` gives the generic sentence and a test entry's own for `picture-refused`; for `picture-too-large` the picture's name, size and the option's `tooLargeAdvice`, the default step, and the sentence with no picture chosen; `worker-core` maps `PictureTooLarge`.
- **Registry:** the checks of decision 2, each with a failing case from a test entry and table; `passwords` refused as an option key.
- **Component,** `tests/unit/components.test.tsx`: `PictureField`'s markup with `renderToStaticMarkup` before a pick, while read, ready and with each problem (the label, the line, the sentence between the label and the button, the button's words, the input's `accept` and `aria-describedby` in order, no `<img>`); `FilePicker` with and without `describedBy`. No test renders `ToolWorkspace` or runs its effects (no render harness); Sign PDF's end-to-end test is the first browser test of picking, each problem, focus and the status messages.
- **Other tools:** every existing unit and end-to-end test passes unchanged.

## Risks / Trade-offs

- **[No preview]** A visitor who picks the wrong picture sees only its name. → The name and size are shown and said; the result is checked before download; a preview can come later if the owner wants one, which would need its own look-and-feel decision.
- **[A very large picture is used]** A 40 MB photo picked by mistake is placed, with a notice. → No fixed limit, as `SPEC.md` says; the hint names the notice sizes, the notice names the picture's size and says to crop it or save a smaller copy, and the owner is asked whether to refuse such pictures instead. A tool that writes the picture into a file bounds the cost itself (Sign PDF: kept compressed, written once, with its own sentence if it passes the size budget).
- **[Drops go to the PDF]** A visitor who drops a picture on the page is told it is not a PDF. → The field's button is next to it; the hand checks in issue #7 look at whether this confuses.
- **[Two pickers on one screen]** "Choose another file" for the PDF and "Choose a picture" for the option. → Different words, the picture's inside its labelled field, the PDF's in the actions row by the main button.

## Migration Plan

None. No tool uses a picture until Sign PDF.
