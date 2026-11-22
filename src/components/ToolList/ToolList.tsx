import type { ListItem } from '../../tools/queries';
import styles from './ToolList.module.css';

export type ToolListItem = ListItem & {
  /** True to take the item out of view, the tab order and the accessibility tree. */
  hidden?: boolean;
};

type Props = {
  items: ToolListItem[];
};

/**
 * Tools as text links, each with a one-line description. The list has no bullets, which makes
 * VoiceOver in Safari stop announcing it as a list, so it says it is one.
 */
export function ToolList({ items }: Props) {
  return (
    <ul className={styles.list} role="list">
      {items.map((item) => (
        <li key={item.href} hidden={item.hidden}>
          <a href={item.href}>{item.name}</a> <span className={styles.summary}>{item.summary}</span>
        </li>
      ))}
    </ul>
  );
}
