import { memo, useCallback, useEffect, useRef, useState } from 'react';
import styles from './PageGrid.module.css';

export type GridItem = {
  id: string;
  /** The file or page name, shown and used in button names. */
  title: string;
  /** "64 pages, 6.1 MB", or "Getting ready". Empty for a page. */
  detail: string;
  /** The address of a picture of the item's page, once drawn. Until then a blank paper box shows. */
  thumbnail?: string;
};

type Props = {
  items: GridItem[];
  onMove(id: string, to: number): void;
  onRemove(id: string): void;
  /** Called after a move with the item's title and new place, for the status region. */
  onMoved?(title: string, place: number, of: number): void;
  /** Called once for each item, when it comes on screen or near it, so its thumbnail can be drawn. */
  onVisible?(id: string): void;
  /** Whether items have Move up, Move down and Remove, and can be dragged. A tool that lists pages may have none. */
  controls?: boolean;
  /** Rows for a list of files; a wrapping grid for the pages of one file. */
  layout?: 'rows' | 'grid';
  /**
   * A toggle button on each item, such as Split PDF's "Cut after". `label` is
   * its visible text, `name` its full name for a screen reader, `pressed` the
   * items toggled on, and `skip` the items that have none.
   */
  toggle?: {
    label: string;
    name(title: string): string;
    pressed: ReadonlySet<string>;
    skip?: ReadonlySet<string>;
    /** Whether a pressed toggle draws a cut line on its page, as Split PDF's does. */
    drawsCut?: boolean;
    onToggle(id: string, title: string): void;
  };
  /**
   * How many items the whole list has, when only some are given: the pages of a long file, shown in
   * batches. It sets the last item's end, how far an item can move, and the count a move announces.
   */
  total?: number;
  /** An item to move focus to when it appears: its toggle, or the item itself. Asked once; `onFocused` says it is done. */
  focusId?: string | null;
  onFocused?(): void;
};

type FocusTarget = { id: string; button: 'up' | 'down' | 'remove' };
type Actions = {
  toggle(id: string, title: string): void;
  setRow(id: string, element: HTMLLIElement | null): void;
  setButton(key: string, element: HTMLButtonElement | null): void;
  move(id: string, by: -1 | 1, button: 'up' | 'down'): void;
  remove(id: string): void;
  dragStart(id: string, title: string, event: React.DragEvent): void;
  dragOver(event: React.DragEvent): void;
  drop(id: string, event: React.DragEvent): void;
  dragEnd(): void;
};

type ItemProps = GridItem & {
  first: boolean;
  last: boolean;
  controls: boolean;
  grid: boolean;
  actions: Actions;
  /** The toggle's visible text and full name, when this item has one; whether it is pressed. */
  toggleLabel?: string;
  toggleName?: string;
  pressed: boolean;
  /** Whether a pressed toggle draws the cut line. */
  drawsCut: boolean;
};

/**
 * One item. Memoised, with plain props and stable callbacks, so that a
 * thumbnail arriving draws only its own item again, even in a list of 500 pages.
 */
const PageItem = memo(function PageItem({ id, title, detail, thumbnail, first, last, controls, grid, actions, toggleLabel, toggleName, pressed, drawsCut }: ItemProps) {
  const item = { id, title, detail, thumbnail };
  const rowRef = useCallback((element: HTMLLIElement | null) => actions.setRow(id, element), [actions, id]);
  return (
    <li
      ref={rowRef}
      data-id={item.id}
      // A page can take focus from code, when more pages are shown and it has no control of its own.
      tabIndex={grid && !toggleLabel ? -1 : undefined}
      className={`${grid ? styles.cell : styles.item}${pressed && drawsCut ? ` ${styles.cut}` : ''}`}
      draggable={controls && !(first && last)}
      onDragStart={controls ? (event) => actions.dragStart(item.id, item.title, event) : undefined}
      onDragOver={controls ? actions.dragOver : undefined}
      onDrop={controls ? (event) => actions.drop(item.id, event) : undefined}
      onDragEnd={controls ? actions.dragEnd : undefined}
    >
      {/* A picture of the page, decorative: the name beside it says what it is. Until it is drawn, blank paper. */}
      <div className={styles.slot} aria-hidden="true">
        {item.thumbnail ? <img className={styles.thumb} src={item.thumbnail} alt="" draggable={false} /> : <div className={styles.blank} />}
      </div>
      <div className={grid ? styles.caption : styles.about}>
        <div className={grid ? undefined : styles.title}>{item.title}</div>
        {item.detail && <div className="muted">{item.detail}</div>}
      </div>
      {toggleLabel && (
        <button
          ref={(element) => actions.setButton(`${item.id}:toggle`, element)}
          type="button"
          className={`${styles.toggle}${pressed ? ` ${styles.pressed}` : ''}`}
          aria-pressed={pressed}
          aria-label={toggleName}
          onClick={() => actions.toggle(item.id, item.title)}
        >
          {toggleLabel}
        </button>
      )}
      {controls && grid && (
        // A page in a grid moves earlier or later in the order; in a wrapping grid "up" would usually move it sideways.
        <div className={styles.pageMoves}>
          <button
            ref={(element) => actions.setButton(`${item.id}:up`, element)}
            type="button"
            className={styles.small}
            aria-label={`Move ${item.title.toLowerCase()} earlier`}
            aria-disabled={first ? true : undefined}
            onClick={() => actions.move(item.id, -1, 'up')}
          >
            Earlier
          </button>
          <button
            ref={(element) => actions.setButton(`${item.id}:down`, element)}
            type="button"
            className={styles.small}
            aria-label={`Move ${item.title.toLowerCase()} later`}
            aria-disabled={last ? true : undefined}
            onClick={() => actions.move(item.id, 1, 'down')}
          >
            Later
          </button>
        </div>
      )}
      {controls && !grid && (
        <div className={styles.moves}>
          <button
            ref={(element) => actions.setButton(`${item.id}:up`, element)}
            type="button"
            className={styles.small}
            aria-label={`Move ${item.title} up`}
            aria-disabled={first ? true : undefined}
            onClick={() => actions.move(item.id, -1, 'up')}
          >
            Move up
          </button>
          <button
            ref={(element) => actions.setButton(`${item.id}:down`, element)}
            type="button"
            className={styles.small}
            aria-label={`Move ${item.title} down`}
            aria-disabled={last ? true : undefined}
            onClick={() => actions.move(item.id, 1, 'down')}
          >
            Move down
          </button>
          <button
            ref={(element) => actions.setButton(`${item.id}:remove`, element)}
            type="button"
            className={styles.small}
            aria-label={`Remove ${item.title}`}
            onClick={() => actions.remove(item.id)}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
});

/**
 * The items of the working area, in order. When the tool gives them controls,
 * they move by Move up and Move down, which work with the keyboard and on a
 * touch screen, and by mouse drag. A button that cannot be used stays
 * focusable and is marked unavailable.
 */
export function PageGrid({ items, onMove, onRemove, onMoved, onVisible, controls = true, layout = 'rows', toggle, total, focusId, onFocused }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const rows = useRef(new Map<string, HTMLLIElement>());
  const reported = useRef(new Set<string>());
  const focusNext = useRef<FocusTarget | null>(null);
  const dragging = useRef<string | null>(null);

  // The latest props, read by the stable callbacks below.
  const count = total ?? items.length;
  const latest = useRef({ items, count, onMove, onRemove, onMoved, onVisible, toggle, onFocused });
  useEffect(() => {
    latest.current = { items, count, onMove, onRemove, onMoved, onVisible, toggle, onFocused };
  });

  // When asked, move focus to an item as soon as it is on the page: its toggle, or the item itself.
  useEffect(() => {
    if (!focusId) return;
    const target = buttons.current.get(`${focusId}:toggle`) ?? rows.current.get(focusId);
    if (!target) return;
    target.focus();
    // A one-time request: once focus has moved, it is not asked again when the list comes back.
    latest.current.onFocused?.();
  }, [focusId, items]);

  // Report each item once when it comes on screen or within 300px of it, so
  // thumbnails are drawn only for what the visitor can see or is about to.
  // One watcher lives as long as the list; each item is added to it once, when
  // it first appears, so a picture arriving costs the page no extra work.
  const watcher = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.id;
          if (!entry.isIntersecting || !id || reported.current.has(id)) continue;
          reported.current.add(id);
          observer.unobserve(entry.target);
          latest.current.onVisible?.(id);
        }
      },
      { rootMargin: '300px 0px' },
    );
    watcher.current = observer;
    for (const [id, row] of rows.current) if (!reported.current.has(id)) observer.observe(row);
    return () => {
      observer.disconnect();
      watcher.current = null;
    };
  }, []);

  // After a move or a removal the list has changed; put focus where it was asked for. A page moved
  // into the next batch is not drawn yet; then the request waits, and setButton moves focus when it is.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    // The list emptied before the moved page was drawn (a job started, or the file went): the request is stale.
    if (items.length === 0) {
      focusNext.current = null;
      return;
    }
    const button = buttons.current.get(`${target.id}:${target.button}`);
    if (!button) return;
    focusNext.current = null;
    button.focus();
  }, [items]);

  // Made once, so every item keeps the same callbacks; they read the latest props through refs.
  const [actions] = useState<Actions>(() => ({
    toggle(id, title) {
      latest.current.toggle?.onToggle(id, title);
    },
    setRow(id, element) {
      if (element) {
        if (rows.current.get(id) === element) return;
        rows.current.set(id, element);
        if (!reported.current.has(id)) watcher.current?.observe(element);
      } else {
        rows.current.delete(id);
      }
    },
    setButton(key, element) {
      if (!element) {
        buttons.current.delete(key);
        return;
      }
      buttons.current.set(key, element);
      const target = focusNext.current;
      if (target && key === `${target.id}:${target.button}`) {
        focusNext.current = null;
        element.focus();
      }
    },
    move(id, by, button) {
      const { items: list, count: whole, onMove: moveTo, onMoved: moved } = latest.current;
      const index = list.findIndex((entry) => entry.id === id);
      const to = index + by;
      if (index < 0 || to < 0 || to >= whole) return;
      moveTo(id, to);
      moved?.(list[index]!.title, to + 1, whole);
      // Keep focus on the same button, unless it can no longer be used; then the other one.
      const stillUsable = button === 'up' ? to > 0 : to < whole - 1;
      focusNext.current = { id, button: stillUsable ? button : button === 'up' ? 'down' : 'up' };
    },
    remove(id) {
      const { items: list, onRemove: removeItem } = latest.current;
      const index = list.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const neighbour = list[index + 1] ?? list[index - 1];
      removeItem(id);
      // With no neighbour the list is gone, and the widget puts focus on the picker.
      if (neighbour) focusNext.current = { id: neighbour.id, button: 'remove' };
    },
    dragStart(id, title, event) {
      dragging.current = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', title);
    },
    dragOver(event) {
      if (dragging.current) event.preventDefault();
    },
    drop(id, event) {
      const from = dragging.current;
      dragging.current = null;
      const { items: list, onMove: moveTo, onMoved: moved } = latest.current;
      const index = list.findIndex((entry) => entry.id === id);
      if (!from || from === id || index < 0) return;
      event.preventDefault();
      moveTo(from, index);
      const dragged = list.find((entry) => entry.id === from);
      if (dragged) moved?.(dragged.title, index + 1, latest.current.count);
    },
    dragEnd() {
      dragging.current = null;
    },
  }));

  const grid = layout === 'grid';
  return (
    <ol className={grid ? styles.grid : styles.list}>
      {items.map((item, index) => (
        <PageItem
          key={item.id}
          id={item.id}
          title={item.title}
          detail={item.detail}
          thumbnail={item.thumbnail}
          first={index === 0}
          last={index === count - 1}
          controls={controls}
          grid={grid}
          actions={actions}
          toggleLabel={toggle && !toggle.skip?.has(item.id) ? toggle.label : undefined}
          toggleName={toggle && !toggle.skip?.has(item.id) ? toggle.name(item.title) : undefined}
          pressed={toggle?.pressed.has(item.id) ?? false}
          drawsCut={toggle?.drawsCut ?? false}
        />
      ))}
    </ol>
  );
}
