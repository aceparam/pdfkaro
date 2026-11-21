import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingOption } from '../../tools/registry';
import { extendLine, isFull, padPoint, paintDrawing, withLine } from '../../widget/drawing';
import { pad, type Drawing, type DrawingRule } from '../../widget/option-values';
import styles from './DrawingPad.module.css';

type Props = {
  option: DrawingOption;
  /** The drawing's id, unique on the page. The label and the hint take ids built from it. */
  id: string;
  /** The finished lines, from the widget's state. */
  drawing: Drawing;
  /** The tool's most lines and points for this drawing (option-values.ts). */
  rule: DrawingRule;
  /** Called once per finished line, with the drawing it makes and whether that drawing is now full. */
  onDraw(drawing: Drawing, full: boolean): void;
  /** The Clear button. */
  onClear(): void;
};

/** The line being drawn: the pointer drawing it and its points so far. Lives in a ref, never in state. */
type Drawn = { pointer: number; line: readonly number[] };

/**
 * A box to draw in with a finger, a mouse or a pen, its label above, its hint under it, and a Clear
 * button. The drawing is kept as whole-number points in the pad's units (option-values.ts), never as
 * a picture: nothing here reads the canvas back. The line in progress lives in a ref and is painted
 * segment by segment; the widget is told once, when the line ends. The box takes touch for itself
 * (its CSS Module), takes one pointer at a time, and takes no Tab stop: nothing in it can be done
 * with a keyboard, so the hint names the tool's other way, and Clear is described by it too.
 */
export function DrawingPad({ option, id, drawing, rule, onDraw, onClear }: Props) {
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawnRef = useRef<Drawn | null>(null);
  // The finished lines as last drawn, for painting again after a resize without waiting for a render.
  const drawingRef = useRef(drawing);

  /** Paints the whole drawing, and the line in progress, at the canvas's backing size, in its text colour. */
  const paintAll = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const current = drawnRef.current;
    const lines = current ? [...drawingRef.current, current.line] : drawingRef.current;
    paintDrawing(context, lines, canvas.width / pad.width, getComputedStyle(canvas).color);
  }, []);

  // A new drawing from the widget (a finished line, Clear, Start again) is painted whole.
  useEffect(() => {
    drawingRef.current = drawing;
    paintAll();
  }, [drawing, paintAll]);

  // The backing size follows the box's CSS size × devicePixelRatio, so lines stay sharp; after each
  // change, and when the colour scheme changes, the whole drawing is painted again.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      paintAll();
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(canvas);
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    scheme?.addEventListener('change', paintAll);
    return () => {
      observer?.disconnect();
      scheme?.removeEventListener('change', paintAll);
    };
  }, [paintAll]);

  /**
   * The pointer's point in pad units, from the box inside its edge. Its height is taken from its width,
   * as painting takes one scale from the width, so a point is painted exactly where it was drawn.
   */
  const pointOf = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const width = canvas.clientWidth;
    return padPoint(clientX, clientY, { left: rect.left + canvas.clientLeft, top: rect.top + canvas.clientTop, width, height: (width * pad.height) / pad.width });
  };

  /** Paints one new segment of the line in progress, or a dot for its first point. */
  const paintStep = (canvas: HTMLCanvasElement, line: readonly number[], colour: string) => {
    const context = canvas.getContext('2d');
    if (!context) return;
    const segment = line.length >= 4 ? [line.slice(-4)] : [line];
    paintDrawing(context, segment, canvas.width / pad.width, colour);
  };

  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Only the first finger or pointer draws, and for a mouse only its main button.
    if (!event.isPrimary || drawnRef.current !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A full drawing takes no more; the status region has said so.
    if (isFull(drawing, rule)) return;
    const canvas = event.currentTarget;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const line = extendLine([], pointOf(canvas, event.clientX, event.clientY));
    drawnRef.current = { pointer: event.pointerId, line };
    paintStep(canvas, line, getComputedStyle(canvas).color);
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drawn = drawnRef.current;
    if (drawn === null || drawn.pointer !== event.pointerId) return;
    const canvas = event.currentTarget;
    // The points between frames, where the browser gives them; else the move alone.
    const native = event.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const moves = coalesced.length > 0 ? coalesced : [native];
    let line = drawn.line;
    // The colour is read once per move, not once per point: pointer moves are the hot path on a slow phone.
    const colour = getComputedStyle(canvas).color;
    for (const each of moves) {
      const next = extendLine(line, pointOf(canvas, each.clientX, each.clientY));
      if (next !== line) {
        line = next;
        paintStep(canvas, line, colour);
      }
    }
    drawnRef.current = { pointer: drawn.pointer, line };
  };

  // The line ends: let go, cancelled by the browser, or capture lost. A cancelled line is kept as drawn so far.
  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drawn = drawnRef.current;
    if (drawn === null || drawn.pointer !== event.pointerId) return;
    drawnRef.current = null;
    const result = withLine(drawing, drawn.line, rule);
    // A line cut at the limit, or not taken, is shown as the drawing holds it, before the widget renders again.
    drawingRef.current = result.drawing;
    paintAll();
    if (result.drawing !== drawing) onDraw(result.drawing, result.full);
  };

  return (
    <div className={styles.drawing}>
      <p id={labelId} className={styles.label}>
        {option.label}
      </p>
      <canvas
        ref={canvasRef}
        role="img"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className={styles.box}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(event) => event.preventDefault()}
      />
      <p id={hintId} className={styles.note}>
        {option.hint}
      </p>
      <div className="actions">
        <button type="button" className="button-secondary" aria-describedby={hintId} onClick={onClear}>
          {option.clearLabel}
        </button>
      </div>
    </div>
  );
}
