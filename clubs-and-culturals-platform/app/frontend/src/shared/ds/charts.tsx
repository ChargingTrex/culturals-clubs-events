/**
 * Charts for dashboards, built to the dataviz method:
 * - BarChart: one series, horizontal bars (magnitude by club, category,
 *   department, venue). One validated hue (--chart-bar); no legend, since the
 *   title names the series; value at each bar's tip in text tokens; every row
 *   a hover/focus target with a tooltip (value first); a table view, so no
 *   value depends on hover or on colour.
 * - Meter: a rate against its target; the fill carries severity, with an icon
 *   and a word once it is amber or red.
 */
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from './classes';
import { Icon } from './components';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Shown after the label, muted (e.g. "4 events"). */
  note?: string;
}

export function BarChart({
  data,
  label,
  valueLabel = 'Value',
  format = (n: number) => n.toLocaleString('en-IN'),
  labelWidth,
  sort = true,
  className,
}: {
  data: BarDatum[];
  /** Accessible name and table caption, e.g. "Attendance by club". */
  label: string;
  /** Column heading for the value in the table view. */
  valueLabel?: string;
  format?: (n: number) => string;
  /** Width of the label column, e.g. "12rem". */
  labelWidth?: string;
  /** Largest first (default). Pass false to keep the given order. */
  sort?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const tipId = useId();
  const rows = sort ? [...data].sort((a, b) => b.value - a.value) : data;
  const max = Math.max(1, ...rows.map((d) => d.value));
  const total = rows.reduce((t, d) => t + d.value, 0);

  return (
    <figure
      className={cx('cc-chart', className)}
      style={labelWidth ? ({ '--cc-hbar-label': labelWidth } as CSSProperties) : undefined}
    >
      <ul className="cc-hbars" aria-label={label}>
        {rows.map((d) => {
          const pct = (d.value / max) * 100;
          const share = total > 0 ? Math.round((d.value / total) * 100) : 0;
          const on = active === d.key;
          return (
            <li
              key={d.key}
              className="cc-hbar-row"
              tabIndex={0}
              aria-label={`${d.label}${d.note ? `, ${d.note}` : ''}: ${format(d.value)}`}
              aria-describedby={on ? tipId : undefined}
              onPointerEnter={() => setActive(d.key)}
              onPointerLeave={() => setActive((k) => (k === d.key ? null : k))}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive((k) => (k === d.key ? null : k))}
            >
              <span className="cc-hbar-label body-md" title={d.label}>
                {d.label}
                {d.note ? <small className="caption"> · {d.note}</small> : null}
              </span>
              <span className="cc-hbar-track">
                <span className="cc-hbar" style={{ width: `${pct}%` }} />
                <span className="cc-hbar-value figure-md">{format(d.value)}</span>
                {on ? (
                  <span
                    id={tipId}
                    role="tooltip"
                    className="cc-hbar-tip caption"
                    style={{ left: `clamp(60px, ${pct}%, calc(100% - 60px))` }}
                  >
                    <b className="figure-md">{format(d.value)}</b>
                    <span>{d.label}</span>
                    {total > 0 ? <span>{share}% of the total</span> : null}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <ChartTable
        caption={label}
        head={['', valueLabel]}
        rows={rows.map((d) => [d.note ? `${d.label} (${d.note})` : d.label, format(d.value)])}
      />
    </figure>
  );
}

/** "View as table": every charted value, reachable without hover or colour. */
export function ChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: ReactNode[];
  rows: ReactNode[][];
}) {
  return (
    <details className="cc-chart-table">
      <summary className="label-md">View as table</summary>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="cc-sheet">
          <caption className="cc-sr">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col" className={cx('label-md', i > 0 && 'cc-al-right')}>
                  {h || <span className="cc-sr">Name</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j > 0 ? 'cc-cell--number figure-md' : 'body-md'}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * A rate (0–1) where higher is better. Blue when healthy; amber below
 * `warnBelow`, red below `dangerBelow` — each with an icon and a word.
 */
export function Meter({
  label,
  rate,
  help,
  warnBelow = 0.85,
  dangerBelow = 0.7,
  format = (r: number) => `${Math.round(r * 100)}%`,
  className,
}: {
  label: string;
  rate: number | null | undefined;
  help?: ReactNode;
  warnBelow?: number;
  dangerBelow?: number;
  format?: (rate: number) => string;
  className?: string;
}) {
  const r = rate ?? null;
  const tone = r === null ? null : r < dangerBelow ? 'danger' : r < warnBelow ? 'warning' : null;
  return (
    <div className={cx('cc-meter', tone && `cc-meter--${tone}`, className)}>
      <div className="cc-meter-head">
        <span className="label-lg">{label}</span>
        <span className="cc-meter-value title-lg">{r === null ? '—' : format(r)}</span>
      </div>
      <div
        className="cc-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={r === null ? undefined : Math.round(r * 100)}
      >
        <div className="cc-meter-fill" style={{ width: `${Math.min(100, (r ?? 0) * 100)}%` }} />
      </div>
      {tone || help ? (
        <p className="cc-meter-help caption m-0">
          {tone ? (
            <>
              <Icon name="alert" size={14} />
              <b>{tone === 'danger' ? 'Low' : 'Below target'}</b>
              {help ? ' · ' : ''}
            </>
          ) : null}
          {help}
        </p>
      ) : null}
    </div>
  );
}
