import { useEffect, useRef } from 'react';
import styles from './PageGrid.module.css';

export type GridItem = {
  id: string;
  /** The file or page name, shown and used in button names. */
  title: string;
  /** "64 pages, 6.1 MB", or "Getting ready". */
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
};

type FocusTarget = { id: string; button: 'up' | 'down' | 'remove' };

/**
 * The items of the working area, in order. They move by Move up and Move down,
 * which work with the keyboard and on a touch screen, and by mouse drag.
 * A button that cannot be used stays focusable and is marked unavailable.
 */
export function PageGrid({ items, onMove, onRemove, onMoved, onVisible }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const rows = useRef(new Map<string, HTMLLIElement>());
  const reported = useRef(new Set<string>());
  const visibleRef = useRef(onVisible);
  useEffect(() => {
    visibleRef.current = onVisible;
  }, [onVisible]);

  // Report each item once when it comes on screen or within 300px of it, so
  // thumbnails are drawn only for what the visitor can see or is about to.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.id;
          if (!entry.isIntersecting || !id || reported.current.has(id)) continue;
          reported.current.add(id);
          observer.unobserve(entry.target);
          visibleRef.current?.(id);
        }
      },
      { rootMargin: '300px 0px' },
    );
    for (const [id, row] of rows.current) if (!reported.current.has(id)) observer.observe(row);
    return () => observer.disconnect();
  }, [items]);
  const focusNext = useRef<FocusTarget | null>(null);
  const dragging = useRef<string | null>(null);

  // After a move or a removal the list has changed; put focus where it was asked for.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    buttons.current.get(`${target.id}:${target.button}`)?.focus();
  }, [items]);

  const register = (id: string, button: FocusTarget['button']) => (element: HTMLButtonElement | null) => {
    const key = `${id}:${button}`;
    if (element) buttons.current.set(key, element);
    else buttons.current.delete(key);
  };

  const move = (index: number, by: -1 | 1, button: 'up' | 'down') => {
    const item = items[index];
    const to = index + by;
    if (!item || to < 0 || to >= items.length) return;
    onMove(item.id, to);
    onMoved?.(item.title, to + 1, items.length);
    // Keep focus on the same button, unless it can no longer be used; then the other one.
    const stillUsable = button === 'up' ? to > 0 : to < items.length - 1;
    focusNext.current = { id: item.id, button: stillUsable ? button : button === 'up' ? 'down' : 'up' };
  };

  const remove = (index: number) => {
    const item = items[index];
    if (!item) return;
    const neighbour = items[index + 1] ?? items[index - 1];
    onRemove(item.id);
    // With no neighbour the list is gone, and the widget puts focus on the picker.
    if (neighbour) focusNext.current = { id: neighbour.id, button: 'remove' };
  };

  return (
    <ol className={styles.list}>
      {items.map((item, index) => {
        const first = index === 0;
        const last = index === items.length - 1;
        return (
          <li
            key={item.id}
            ref={(element) => {
              if (element) rows.current.set(item.id, element);
              else rows.current.delete(item.id);
            }}
            data-id={item.id}
            className={styles.item}
            draggable={items.length > 1}
            onDragStart={(event) => {
              dragging.current = item.id;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', item.title);
            }}
            onDragOver={(event) => {
              if (dragging.current) event.preventDefault();
            }}
            onDrop={(event) => {
              const id = dragging.current;
              dragging.current = null;
              if (!id || id === item.id) return;
              event.preventDefault();
              onMove(id, index);
              const moved = items.find((entry) => entry.id === id);
              if (moved) onMoved?.(moved.title, index + 1, items.length);
            }}
            onDragEnd={() => {
              dragging.current = null;
            }}
          >
            {/* A picture of the page, decorative: the name beside it says what it is. Until it is drawn, blank paper. */}
            <div className={styles.slot} aria-hidden="true">
              {item.thumbnail ? (
                <img className={styles.thumb} src={item.thumbnail} alt="" draggable={false} />
              ) : (
                <div className={styles.blank} />
              )}
            </div>
            <div className={styles.about}>
              <div className={styles.title}>{item.title}</div>
              <div className="muted">{item.detail}</div>
            </div>
            <div className={styles.moves}>
              <button
                ref={register(item.id, 'up')}
                type="button"
                className={styles.small}
                aria-label={`Move ${item.title} up`}
                aria-disabled={first ? true : undefined}
                onClick={() => move(index, -1, 'up')}
              >
                Move up
              </button>
              <button
                ref={register(item.id, 'down')}
                type="button"
                className={styles.small}
                aria-label={`Move ${item.title} down`}
                aria-disabled={last ? true : undefined}
                onClick={() => move(index, 1, 'down')}
              >
                Move down
              </button>
              <button
                ref={register(item.id, 'remove')}
                type="button"
                className={styles.small}
                aria-label={`Remove ${item.title}`}
                onClick={() => remove(index)}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
