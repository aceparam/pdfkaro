import styles from './ProgressBar.module.css';

type Props = {
  /** How full, 0 to 1. */
  fraction: number;
  /** What the bar is for, read by screen readers: "Merging". */
  label: string;
};

/** The only thing on the site that moves. */
export function ProgressBar({ fraction, label }: Props) {
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className={styles.done} style={{ width: `${percent}%` }} />
    </div>
  );
}
