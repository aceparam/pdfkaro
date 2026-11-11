import { useEffect, useRef } from 'react';
import styles from './PageGrid.module.css';

export type GridItem = {
  id: string;
  /** The file or page name, shown and used in button names. */
  title: string;
  /** "64 pages, 6.1 MB", or "Getting ready". */
  detail: string;
  /** A picture of the item, when a tool has one. None does yet. */
  thumbnail?: string;
};

type Props = {
  items: GridItem[];
  onMove(id: string, to: number): void;
  onRemove(id: string): void;
  /** Called after a move with the item's title and new place, for the status region. */
  onMoved?(title: string, place: number, of: number): void;
};

type FocusTarget = { id: string; button: 'up' | 'down' | 'remove' };

/**
 * The items of the working area, in order. They move by Move up and Move down,
 * which work with the keyboard and on a touch screen, and by mouse drag.
 * A button that cannot be used stays focusable and is marked unavailable.
 */
export function PageGrid({ items, onMove, onRemove, onMoved }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
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
            {item.thumbnail && <img className={styles.thumb} src={item.thumbnail} alt="" />}
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
