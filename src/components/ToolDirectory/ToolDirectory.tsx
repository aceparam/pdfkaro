import { useInputValue } from '../../hooks/useInputValue';
import { matchesPhrase, matchStatus } from '../../tools/filter';
import type { GroupWithItems } from '../../tools/queries';
import { ToolList } from '../ToolList/ToolList';
import styles from './ToolDirectory.module.css';

type Props = {
  /** The label of the filter box. */
  label: string;
  /** Groups to list, each with its tools. Groups with no tools should not be passed. */
  groups: GroupWithItems[];
  /** The id of the filter input. Change it if two directories share a page. */
  inputId?: string;
};

/**
 * Every tool under its group heading, with a box that filters the list.
 *
 * The whole list is in the served HTML, so it works with no script. When the
 * script loads, typing hides the tools that do not match.
 */
export function ToolDirectory({ label, groups, inputId = 'tool-filter' }: Props) {
  const phrase = useInputValue(inputId);

  const filtered = groups.map((group) => {
    const items = group.items.map((item) => ({ ...item, hidden: !matchesPhrase(item, phrase) }));
    return { ...group, items, shown: items.filter((item) => !item.hidden).length };
  });
  const count = filtered.reduce((sum, group) => sum + group.shown, 0);
  const status = matchStatus(phrase, count);

  return (
    <div>
      <div className="field field-short">
        <label htmlFor={inputId}>{label}</label>
        <input id={inputId} type="text" autoComplete="off" spellCheck={false} />
      </div>
      {/* The count is for screen readers. "No tools match." is shown to everyone. */}
      <p role="status" className={count === 0 ? styles.none : 'visually-hidden'}>
        {status}
      </p>
      {filtered.map((group) => (
        <section key={group.id} hidden={group.shown === 0}>
          <h2>{group.name}</h2>
          <ToolList items={group.items} />
        </section>
      ))}
    </div>
  );
}
