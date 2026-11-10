import type { ReactNode } from 'react';
import type { ListItem } from '../../tools/queries';
import { ToolList } from '../ToolList/ToolList';
import styles from './ToolShell.module.css';

type Props = {
  /** The job in plain words. The one h1 on the page. */
  heading: string;
  /** What the tool does and where the file goes. */
  sentence: string;
  /** The interactive tool. It is a separate island, so this shell ships no script. */
  children?: ReactNode;
  /** How-to steps and questions, shown below the tool. */
  below?: ReactNode;
  /** Related tools that are published. The heading is left out when there are none. */
  related?: ListItem[];
};

/**
 * The served part of every tool page: heading, sentence, the tool, then the
 * text below it. Always in this order.
 */
export function ToolShell({ heading, sentence, children, below, related = [] }: Props) {
  const hasBelow = Boolean(below) || related.length > 0;

  return (
    <>
      <h1>{heading}</h1>
      <p className="lede">{sentence}</p>
      {children}
      {hasBelow && (
        <section className={styles.below}>
          {below}
          {related.length > 0 && (
            <>
              <h2>Related tools</h2>
              <ToolList items={related} />
            </>
          )}
        </section>
      )}
    </>
  );
}
