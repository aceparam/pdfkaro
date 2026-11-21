# Design

## Context

- **Options today** (`add-tool-options`, `add-text-option`, `add-option-conditions`, all merged first): `ToolOption = ChoiceOption | TextOption`, each with an optional `when`; `src/widget/option-values.ts` holds what each tool accepts (`optionValues`, `optionTexts`) and the engine-side checks (`acceptedValue`, `acceptedText`, `TextRefused`); `src/widget/options.ts` holds the rules (`shownOptions`, `optionsToSend`, `jobOptions`, `optionsHold`, `enterAction`); `State.choices` holds each option's value by key, kept through Cancel, a failure and "Choose another file" and cleared by "Start again" and by removing the last file; `ToolWorkspace` draws `ChoiceGroup` and `TextField`, ties the first holding option's sentence to the main button, and says a field's sentence once in the status region.
- **What a job carries:** the run message's `options` is a plain object that the worker checks only for being an object (`isToWorker`) and hands to the engine. Arrays of numbers pass through the structured clone as they are.
- **Re-renders:** `ToolWorkspace` renders on every state change; Rotate's work (PR #13, and the fix after PR #16) showed that a dispatch for every pointer move would be costly on a slow phone, so the pad must not dispatch while a line is being drawn.
- **Checked by experiment** (Node, the same qpdf and pdf-lib, through the unchanged `stampPages`): lines of points given to pdf-lib as `moveTo`/`lineTo`/`stroke` operators with round caps and joins, inside one form XObject made in each run's `prepare`, were written once for a 4,100-page file drawn in three runs (the identical form's JSON is reused by `fromPdfLib`), grew the file by about 40 bytes a page, and passed `qpdf --check`. The engine side belongs to `add-sign-pdf`; it is recorded here because it is why a drawing is kept as numbers, not as a picture.

## Goals / Non-Goals

**Goals:**
- A pad that works with a finger, a mouse and a pen, at 360px and 1280px, without moving the page and without blocking it.
- A drawing kept as numbers, written once as a format the pad makes and an engine checks.
- The same keep, reset, hold and send rules as the other kinds, through the same functions.

**Non-Goals:**
- Pressure, smoothing curves, colours or widths; undo; zoom; drawing on a page preview; a drawing as a picture; a drawing as a tool's first option.

## Decisions

### 1. The registry type

```ts
/**
 * A drawing on a pad, with a finger, a mouse or a pen. It is the job's input: it starts empty, and the
 * main button waits until something is drawn. It needs a pointer, so it is never a tool's first option,
 * and its hint names the tool's way to do the job without drawing. Its limits are written once, in
 * src/widget/option-values.ts (`optionDrawings`); the registry holds only its words.
 */
export type DrawingOption = {
  kind: 'drawing';
  /** The key the engine receives: `drawing`. */
  key: string;
  /** Above the box, naming it: "Draw your signature". */
  label: string;
  /** Under the box, describing it: how to draw, and the way to do the job without drawing. */
  hint: string;
  /** The button that empties the box: "Clear the drawing". */
  clearLabel: string;
  /** Tied to the main button while nothing is drawn: "Draw your signature first." */
  emptySentence: string;
  /** When the engine refuses the drawing. Left out: "The drawing could not be used. Clear it and draw again." */
  refusedSentence?: string;
  when?: { key: string; value: string };
};

export type ToolOption = ChoiceOption | TextOption | DrawingOption;
```

### 2. What a drawing is, written once: `src/widget/option-values.ts`

```ts
/** The pad's own units: 1,000 across and 400 down, y counted down from the top; its line is 6 units wide. */
export const pad = { width: 1000, height: 400, line: 6 } as const;

/** A drawing: its lines, each a flat list of whole-number points [x0, y0, x1, y1, …] in the pad's units. */
export type Drawing = readonly (readonly number[])[];

/** What one drawing takes: the most lines and the most points in all. */
export type DrawingRule = { maxLines: number; maxPoints: number };
export const optionDrawings: Readonly<Record<string, Readonly<Record<string, DrawingRule>>>> = {};

export function drawingRule(tool: string, key: string, table = optionDrawings): DrawingRule | undefined;

/** For an engine: the drawing when `value` is one under the tool's own rule; else undefined. */
export function acceptedDrawing(tool: string, key: string, value: unknown, table = optionDrawings): Drawing | undefined;

/** Thrown by an engine that refuses its drawing, before it reads the file. Known to the worker by its name. */
export class DrawingRefused extends Error { override name = 'DrawingRefused'; }
```

- **Whole numbers in a fixed box** make the check simple and the message small: `acceptedDrawing` takes only an array (`Array.isArray`) of 1 to `maxLines` arrays; each of even length, at least 2, read by index so a hole is refused; every x a whole number from 0 to 1,000 and every y from 0 to 400; and no more than `maxPoints` points in all. Anything else gives `undefined`. Own keys only, with `Object.hasOwn`, as `acceptedValue` reads.
- **5 to 2** (1,000 by 400) is wide enough for a name written across and tall enough for loops below the line on a phone: 328 by 131 CSS pixels at 360px, 704 by 282 at 1280px (the 44rem column).
- **A line 6 units wide** is 2 CSS pixels at 360px and 4 at 1280px, as a pen line looks at those sizes; the engine scales it with the drawing, so what is seen is what is written.
- **The registry test** checks each drawing has its line and each line belongs to a drawing the registry shows; `maxLines` from 1 to 1,000 and `maxPoints` from 1 to 100,000; words plain and not empty, with no exclamation mark; and that no tool's first option is a drawing (`add-option-conditions` already keeps the first option unconditional).

### 3. The pointer rules: `src/widget/drawing.ts`

Plain functions, tested in Node, so the component holds only wiring:
- `padPoint(clientX, clientY, rect)`: the point in pad units, rounded and held inside the box, from the canvas's bounding box;
- `extendLine(line, point, step = 3)`: the line with the point added when it is at least `step` units from the last point on either axis, else the same line, so a pen's 240 points a second on a still hand add nothing;
- `withLine(drawing, line, rule)`: `{ drawing, full }`: the drawing with the line added, cut to the points left when it would pass `maxPoints`, or not added past `maxLines`; `full` says the limit was reached, so the status region says it once;
- `paintDrawing(context, drawing, scale, colour)`: draws every line on a 2D context with round caps and joins, `pad.line × scale` wide; a line of one point is a filled circle of the line's width, so a dot shows the same everywhere and never relies on how a zero-length line is drawn.

### 4. The state and the failure

- `State.choices` widens from `Record<string, string>` to `Record<string, string | Drawing>`: a choice's value, a text as typed, or a drawing. `chosenValue` and `typedText` already read only strings, so a drawing under a key is never taken for either. The name is kept, so no other tool's code changes.
- A new action, `drawing-set { key, drawing }`, acts only while listing, after a light check that it is an array of arrays of numbers (the pad keeps to the rule; the engine checks fully). The keep and reset rules are those of every option.
- `optionsToSend` sends a shown drawing's lines as they are; `optionsHold` gives `{ key, kind: 'empty', sentence: emptySentence }` for a shown drawing with no lines. Signatures unchanged.
- `FailureKind` gains `drawing-refused`; `worker-core` maps an error named `DrawingRefused` to it and `messages.ts` accepts it; `failureSentence` gives the first drawing option's `refusedSentence`, else "The drawing could not be used. Clear it and draw again."

### 5. The component: `src/components/DrawingPad/`

```tsx
<div className={styles.drawing}>
  <p id={labelId} className={styles.label}>{option.label}</p>
  <canvas ref={canvasRef} role="img" aria-labelledby={labelId} aria-describedby={hintId} className={styles.box}
          onPointerDown={…} onPointerMove={…} onPointerUp={…} onPointerCancel={…} onContextMenu={(e) => e.preventDefault()} />
  <p id={hintId} className={styles.note}>{option.hint}</p>
  <div className="actions"><button type="button" className="button-secondary" onClick={onClear}>{option.clearLabel}</button></div>
</div>
```

- **A label paragraph, not a `<label>`:** a canvas is not a form control, so it is named with `aria-labelledby`. `role="img"` tells a screen reader the box is a picture and not something to type in; it has no `tabindex`, so it takes no Tab stop, since nothing in it can be done with a keyboard. The tool's hint says what to do instead (decision 1).
- **Touch:** `.box` has `touch-action: none`, so the browser does not scroll, zoom or turn a finger into mouse events; `user-select: none`, `-webkit-user-select: none` and `-webkit-touch-callout: none`, so a long press selects nothing and opens no menu; and the context menu is prevented on the box only.
- **One pointer:** a press starts a line only for a primary pointer (`isPrimary`, and for a mouse the main button), captures it (`setPointerCapture`), and ignores every other pointer until it ends. A second finger draws nothing.
- **No dispatch while drawing:** the line in progress lives in a ref and is painted segment by segment on the canvas; `getCoalescedEvents()`, where the browser has it, gives the points between frames. On `pointerup`, `pointercancel` or lost capture, the line goes through `withLine` and `onDraw(drawing)` is called once. A cancelled line (the browser took the touch) is kept as drawn so far.
- **Painting:** the canvas's backing size is its CSS size × `devicePixelRatio`, set by a `ResizeObserver`, after which the whole drawing is painted again with `paintDrawing`, so it stays sharp and in place when the window or the phone turns. The colour is the canvas's computed `color` (`var(--text)`), read at each paint and again when `prefers-color-scheme` changes, so dark mode needs no colour of its own.
- **Look,** in `DrawingPad.module.css` with the site's tokens only: `display: block; width: 100%; aspect-ratio: 5 / 2; border: 1px solid var(--control); border-radius: 4px; background: transparent; cursor: crosshair; color: var(--text)`; the label styled as the field labels; the hint as `.note`; a top margin of 1.5rem as `TextField` has. No shadow, no fill, no guide line.
- **Not a picture:** the component never calls `toDataURL`, `toBlob` or `getImageData`, and writes nothing to storage; a unit test reads its source to check.

### 6. In `ToolWorkspace` and `useToolRun`

- `useToolRun` gains `setDrawing(key, drawing)`, dispatching `drawing-set`.
- `ToolWorkspace` draws a `DrawingPad` for each shown drawing, in registry order. `onDraw` calls `setDrawing`; when `withLine` reported `full` and it was not full before, the status region says "The drawing is full. Clear it to start again." Clear sets an empty drawing and says "The drawing is cleared."
- The main button: a shown, empty drawing holds it with its `emptySentence` in the tied paragraph, as an empty text does. A drawing is never the focus target after reading, as it is never first.

## Page weight and late loading

The script before a pick is unchanged: the island's props are the same for every published tool, none of which has a drawing, and the pad, its rules and its styles are in the workspace chunk and its stylesheet, fetched after a pick. The stylesheets every tool page links grow by well under 0.1 KB by gzip. Nothing about WebAssembly changes. `npm run weigh` must pass.

## Threats

- **What is drawn.** Numbers only; the engine checks shape, whole numbers, bounds and counts before it reads the file (`acceptedDrawing`), so no crafted message can make it draw outside the box, loop for long or build a huge stream. The limits are per tool, in `optionDrawings`.
- **A flood of points.** `extendLine` skips near points and `withLine` stops at the limit, so the state stays small and a dispatch happens once per line.
- **Leaks.** Never a picture, a data address, storage, the address, the title or the console; the drawing goes only to the tool worker. The widget forgets it on "Start again", on removing the last file and on `pagehide`, and the canvas goes with the component.
- **No file parsing** is added. Malicious PDFs, oversized files and hostile file names are untouched by this change.

## Tests

- **Unit, `tests/unit/drawing.test.ts`:** `padPoint` (inside, outside on each side, a box of odd size, rounding); `extendLine` (a far point added, a near one not, the first point always); `withLine` (added; cut at `maxPoints` with `full`; refused past `maxLines` with `full`); `paintDrawing` on `@napi-rs/canvas` (already used by the thumbnail tests): a line's pixels where its points are, a one-point line as a dot, the width scaled, nothing outside.
- **Unit, `tests/unit/options.test.ts`:** `acceptedDrawing` with a filled table (a good drawing; not an array; no lines; a line of odd count or no points; a hole; 1.5; -1; 1,001 across; 401 down; one line too many; one point too many; `__proto__`; `toString`); `optionsToSend` and `optionsHold` with a drawing, shown and hidden.
- **State:** `drawing-set` only while listing; kept through Cancel, a failure and "Choose another file"; cleared by "Start again" and removing the last file; a non-array refused.
- **Failure:** `worker-core` maps `DrawingRefused` to `drawing-refused`; `failureSentence` gives the generic sentence and a test entry's own; `messages.ts` accepts the kind.
- **Worker message:** a test entry's drawing, through the reducer and `jobOptions`, reaches the real `ToolClient`'s run message unchanged, with a fake worker.
- **Registry:** the checks of decision 2, each with a failing case from a test entry and table.
- **Component,** `tests/unit/components.test.tsx`: `DrawingPad`'s markup with `renderToStaticMarkup` (the label paragraph's id named by the canvas's `aria-labelledby`, the hint by `aria-describedby`, `role="img"`, no `tabindex`, the Clear button's words); its CSS Module holding `touch-action: none` and `user-select: none` on the box; its source holding no `toDataURL`, `toBlob`, `getImageData`, `localStorage` or `sessionStorage`. No test runs its pointer handlers or effects, for the reason given in `add-tool-options` (no render harness); they rest on the plain functions above. Sign PDF's end-to-end test is the first browser test: drawing with a mouse, with touch on a phone-sized page with the page's scroll position checked unchanged, a second finger, Clear, a full drawing, resizing, and the long-task check.
- **Other tools:** every existing unit and end-to-end test passes unchanged.

## Risks / Trade-offs

- **[Not usable by keyboard or screen reader]** Drawing needs a pointer. → Never a tool's first option; the tool's hint names its other ways, and Sign PDF offers typing and a picture, which the keyboard and a screen reader can use. `SPEC.md` asks that the tool can be used by keyboard alone; the tool can, by those ways.
- **[Straight segments]** Lines are joined points, not curves. → With round joins and points at least 3 units apart they look smooth at signature size; curves can come later if asked.
- **[Old browsers]** `getCoalescedEvents` is missing in some browsers. → Points come from the moves alone there; lines are a little coarser, not broken.
- **[A palm on a tablet]** A palm that touches first would draw. → Only the first pointer draws; Clear and draw again. The hand checks in issue #7 cover iPad and Android tablets with a pen.

## Migration Plan

None. No tool uses a drawing until Sign PDF.
