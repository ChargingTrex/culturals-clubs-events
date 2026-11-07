/**
 * Culturals design system — phase 2 components: edit tracking, budgets,
 * approvals, scan results, attendance and dashboard stats. Ported from the
 * design system's component bundle; styles in domain.css.
 */
import { useState, type ReactNode } from 'react';
import { cx } from './classes';
import { Avatar, ClubIcon, Icon, StatusChip, Switch } from './components';
import { POSITIONS, formatINR, type Accent, type Position } from './config';
import type { ClubCategory, IconName } from './icons';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* ========================= Edit tracking ========================= */
export type EditRole = 'admin' | 'management';
const EDIT_ROLE: Record<EditRole, { letter: string; label: string }> = {
  admin: { letter: 'A', label: 'Admin' },
  management: { letter: 'M', label: 'Management' },
};

/** The round A / square M badge after an edit. */
export function EditTag({ role }: { role: EditRole }) {
  return (
    <span className={cx('cc-edit-tag', `cc-edit-tag--${role}`, 'label-sm')} aria-hidden="true">
      {EDIT_ROLE[role].letter}
    </span>
  );
}

/** One marked change: added (tinted), removed (struck) or replaced (both). */
export function EditMark({
  role,
  kind = 'added',
  from,
  by,
  at,
  tag = true,
  children,
  className,
}: {
  role: EditRole;
  kind?: 'added' | 'removed' | 'replaced';
  from?: ReactNode;
  by?: string;
  at?: string;
  tag?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const r = EDIT_ROLE[role];
  const verb = kind === 'removed' ? 'Removed' : kind === 'replaced' ? 'Changed' : 'Added';
  const title =
    `${verb} by ${by ?? r.label} (${r.label})` +
    (at ? ` · ${at}` : '') +
    (kind === 'replaced' && typeof from !== 'object' && from != null ? ` — was “${from}”` : '');
  return (
    <span className={cx('cc-edit-group', className)} title={title}>
      {kind === 'replaced' ? (
        <>
          <del className={cx('cc-edit', 'cc-edit--removed', `cc-edit--${role}`)}>{from}</del>{' '}
          <ins className={cx('cc-edit', 'cc-edit--added', `cc-edit--${role}`)}>{children}</ins>
        </>
      ) : kind === 'removed' ? (
        <del className={cx('cc-edit', 'cc-edit--removed', `cc-edit--${role}`)}>{children}</del>
      ) : (
        <ins className={cx('cc-edit', 'cc-edit--added', `cc-edit--${role}`)}>{children}</ins>
      )}
      {tag ? <EditTag role={role} /> : null}
      <span className="cc-sr"> ({title})</span>
    </span>
  );
}

/** Colour key above anything that carries edit marks. */
export function EditLegend({
  counts = {},
  compact,
  who = { admin: 'Society · Dean · Student Life Office', management: 'Vice-Chancellor' },
  showEdits,
  onShowEditsChange,
  className,
}: {
  counts?: { admin?: number; management?: number };
  compact?: boolean;
  who?: { admin: string; management: string };
  showEdits?: boolean;
  onShowEditsChange?: (on: boolean) => void;
  className?: string;
}) {
  const item = (role: EditRole) => (
    <span key={role} className="cc-legend-item">
      <span className={cx('cc-role-mark', `cc-role-mark--${role}`, 'label-sm')} aria-hidden="true">
        {EDIT_ROLE[role].letter}
      </span>
      <span className="cc-legend-words">
        <span className="label-lg">
          <ins className={cx('cc-edit', 'cc-edit--added', `cc-edit--${role}`)}>
            {role === 'admin' ? 'Admin edits' : 'Management edits'}
          </ins>
        </span>
        {compact ? null : (
          <span className="cc-legend-who caption">
            {who[role]}
            {counts[role] != null ? ` · ${plural(counts[role] ?? 0, 'change', 'changes')}` : ''}
          </span>
        )}
      </span>
      {compact && counts[role] != null ? (
        <span className="cc-legend-count label-md">{counts[role]}</span>
      ) : null}
    </span>
  );
  return (
    <div
      className={cx('cc-legend', compact && 'cc-legend--compact', className)}
      role="note"
      aria-label="Edit colour key"
    >
      {item('admin')}
      <span className="cc-legend-sep" aria-hidden="true" />
      {item('management')}
      {onShowEditsChange ? (
        <>
          <span className="cc-legend-sep" aria-hidden="true" />
          <Switch label="Show edits" checked={showEdits !== false} onChange={onShowEditsChange} />
        </>
      ) : null}
    </div>
  );
}

export interface RevisionItem {
  role: EditRole | 'member';
  position?: Position;
  name: string;
  roleLabel?: string;
  action?: ReactNode;
  field?: string;
  from?: ReactNode;
  to?: ReactNode;
  comment?: string;
  at?: string;
  /** Extra chips after the role (e.g. decision, MFA). */
  tags?: ReactNode;
}
/** One row per decision: who, what changed (old → new in the role's style), and why. */
export function RevisionTimeline({
  items,
  className,
}: {
  items: RevisionItem[];
  className?: string;
}) {
  return (
    <ol className={cx('cc-timeline', className)}>
      {items.map((it, i) => {
        const role = it.role;
        const tier = it.position ? POSITIONS[it.position]?.tier : null;
        const labelClass = tier ? `cc-pos-label--${tier}` : `cc-role-label--${role}`;
        const hasChange = it.from != null || it.to != null;
        const markRole: EditRole = role === 'management' ? 'management' : 'admin';
        return (
          <li key={i} className="cc-tl-item">
            <Avatar
              name={it.name}
              size="sm"
              position={it.position}
              badge={role === 'member' || it.position ? null : role}
            />
            <div className="cc-tl-main">
              <div className="cc-tl-head">
                <span className="title-sm">{it.name}</span>
                <span className={cx('label-md', labelClass)}>
                  {it.roleLabel ?? (it.position ? POSITIONS[it.position].label : 'Club')}
                </span>
                {it.tags}
                {it.at ? <span className="cc-tl-time caption">{it.at}</span> : null}
              </div>
              {it.action ? <p className="cc-tl-action body-md">{it.action}</p> : null}
              {hasChange ? (
                <div className="cc-tl-change body-md">
                  {it.field ? <span className="cc-tl-field caption">{it.field}</span> : null}
                  {it.from != null ? (
                    <del className={cx('cc-edit', 'cc-edit--removed', `cc-edit--${markRole}`)}>
                      {it.from}
                    </del>
                  ) : null}
                  {it.from != null && it.to != null ? (
                    <Icon name="chevron-right" size={16} className="cc-tl-arrow" />
                  ) : null}
                  {it.to != null ? (
                    <ins className={cx('cc-edit', 'cc-edit--added', `cc-edit--${markRole}`)}>
                      {it.to}
                    </ins>
                  ) : null}
                </div>
              ) : null}
              {it.comment ? <p className="cc-tl-comment body-md">“{it.comment}”</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ========================= Budgets ========================= */
/** Sanctioned vs spent: amber at 85 % used, red over 100 %, with the words to match. */
export function BudgetSummary({
  sanctioned,
  spent,
  committed = 0,
  title = 'Budget',
  subtitle,
  club,
  accent,
  category,
  labels,
  className,
}: {
  sanctioned: number;
  spent: number;
  committed?: number;
  title?: ReactNode;
  subtitle?: ReactNode;
  club?: string;
  accent?: Accent;
  category?: ClubCategory;
  /** Rename the three figures (e.g. an envelope: Envelope / Sanctioned / Remaining). */
  labels?: { total?: string; used?: string; left?: string };
  className?: string;
}) {
  const a = Number(sanctioned || 0);
  const s = Number(spent || 0);
  const c = Number(committed || 0);
  const used = s + c;
  const pct = a ? used / a : 0;
  const over = used > a;
  const near = !over && pct >= 0.85;
  const remaining = a - used;
  const base = Math.max(a, used) || 1;
  const state = over ? (
    <StatusChip status="rejected" icon="alert">
      Over by {formatINR(used - a)}
    </StatusChip>
  ) : near ? (
    <StatusChip status="pending" icon="alert">
      {Math.round(pct * 100)}% used
    </StatusChip>
  ) : (
    <StatusChip status="approved">Within budget</StatusChip>
  );
  const fig = (label: string, value: string, mod?: string) => (
    <div className={cx('cc-budget-fig', mod && `cc-budget-fig--${mod}`)}>
      <dt className="label-md">{label}</dt>
      <dd className="figure-xl cc-num">{value}</dd>
    </div>
  );
  return (
    <section className={cx('cc-card', 'cc-budget', className)}>
      <div className="cc-budget-head">
        {club ? <ClubIcon name={club} accent={accent} category={category} size="md" /> : null}
        <div className="cc-budget-titles">
          <h3 className="title-md">{title}</h3>
          {subtitle ? <p className="caption">{subtitle}</p> : null}
        </div>
        {state}
      </div>
      <dl className="cc-budget-figs">
        {fig(labels?.total ?? 'Sanctioned', formatINR(a))}
        {fig(labels?.used ?? (c ? 'Spent + committed' : 'Spent'), formatINR(used))}
        {over
          ? fig('Over budget', formatINR(used - a), 'over')
          : fig(labels?.left ?? 'Remaining', formatINR(remaining), 'remaining')}
      </dl>
      <div
        className={cx('cc-progress', near && 'cc-progress--near', over && 'cc-progress--over')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="Budget used"
      >
        <span
          className="cc-progress-seg cc-progress-seg--spent"
          style={{ width: `${(s / base) * 100}%` }}
        />
        {c ? (
          <span
            className="cc-progress-seg cc-progress-seg--committed"
            style={{ width: `${(c / base) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="cc-budget-legend caption">
        <span>
          <i
            className={cx(
              'cc-swatch',
              'cc-swatch--spent',
              near && 'cc-swatch--near',
              over && 'cc-swatch--over',
            )}
          />
          {labels?.used ?? 'Spent'} <b className="cc-num">{formatINR(s)}</b>
        </span>
        {c ? (
          <span>
            <i className="cc-swatch cc-swatch--committed" />
            Committed <b className="cc-num">{formatINR(c)}</b>
          </span>
        ) : null}
        <span>
          <i className="cc-swatch cc-swatch--left" />
          {over ? 'Nothing left' : 'Left '}
          {over ? null : <b className="cc-num">{formatINR(remaining)}</b>}
        </span>
      </div>
    </section>
  );
}

export interface EditInfo {
  role: EditRole;
  by?: string;
  at?: string;
  from?: string | number;
}
export interface SheetColumn {
  key: string;
  label: ReactNode;
  type?: 'text' | 'money' | 'number' | 'id' | 'status';
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  /** Let long text wrap instead of truncating the row. */
  wrap?: boolean;
}
export interface SheetRow {
  id?: string | number;
  cells: Record<string, ReactNode>;
  edits?: Record<string, EditInfo>;
  over?: Record<string, boolean>;
}
const cellValue = (col: SheetColumn, v: ReactNode): ReactNode => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' || typeof v === 'string') {
    if (col.type === 'money') return formatINR(Number(v));
    if (col.type === 'number') return Number(v).toLocaleString('en-IN');
  }
  return v;
};
/**
 * Every budget, as a sheet: row numbers, header and totals rows, zebra rows,
 * amounts right-aligned and tabular. Edited cells carry the role tint, a
 * corner flag, the badge and the old value struck through; over-spend turns
 * the cell red with an alert icon. Cells may hold inputs (editable sheets).
 */
export function BudgetSheet({
  columns,
  rows,
  totals = [],
  totalValues = {},
  totalLabel = 'Total',
  title,
  subtitle,
  caption,
  legend,
  actions,
  maxHeight,
  rowNumbers = true,
  showPrevious = true,
  className,
}: {
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Column keys summed in the footer (numeric cell values only). */
  totals?: string[];
  /** Footer values given directly (overrides summing). */
  totalValues?: Record<string, ReactNode>;
  totalLabel?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  caption?: string;
  legend?: boolean | { admin?: number; management?: number };
  actions?: ReactNode;
  maxHeight?: number | string;
  rowNumbers?: boolean;
  showPrevious?: boolean;
  className?: string;
}) {
  const typeClass = (c: SheetColumn) =>
    c.type === 'money' || c.type === 'number'
      ? 'figure-md'
      : c.type === 'id'
        ? 'mono-md'
        : 'body-md';
  const footKeys = new Set([...totals, ...Object.keys(totalValues)]);
  // Cells already edited when the sheet mounted with data don't flash; an edit
  // that lands while it is on screen does (motion.css .cc-cell--flash).
  // shortcut: a sheet mounted empty never flashes; key it on the budget id if a page mounts it before data.
  const [seen] = useState(() =>
    rows.length
      ? new Set(rows.flatMap((r, i) => Object.keys(r.edits ?? {}).map((k) => `${r.id ?? i}:${k}`)))
      : null,
  );
  return (
    <section className={cx('cc-card', 'cc-sheet-wrap', className)}>
      {title || legend || actions ? (
        <div className="cc-sheet-toolbar">
          <div>
            {title ? <h3 className="title-md">{title}</h3> : null}
            {subtitle ? <div className="caption cc-sheet-sub">{subtitle}</div> : null}
          </div>
          <span className="cc-spacer" />
          {legend ? <EditLegend compact counts={legend === true ? undefined : legend} /> : null}
          {actions ?? null}
        </div>
      ) : null}
      <div className="cc-sheet-scroll" style={maxHeight ? { maxHeight } : undefined}>
        <table className="cc-sheet">
          {caption ? <caption className="cc-sr">{caption}</caption> : null}
          <thead>
            <tr>
              {rowNumbers ? (
                <th className="cc-rownum label-md" scope="col">
                  <span className="cc-sr">Row</span>
                </th>
              ) : null}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    'label-md',
                    (c.type === 'money' || c.type === 'number' || c.align === 'right') &&
                      'cc-al-right',
                    c.align === 'center' && 'cc-al-center',
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i}>
                {rowNumbers ? <td className="cc-rownum mono-sm">{i + 1}</td> : null}
                {columns.map((c) => {
                  const ed = r.edits?.[c.key];
                  const over = r.over?.[c.key];
                  const money = (v: string | number | undefined) =>
                    c.type === 'money' && v != null ? formatINR(Number(v)) : v;
                  const title = ed
                    ? `${EDIT_ROLE[ed.role].label} edit by ${ed.by ?? EDIT_ROLE[ed.role].label}` +
                      (ed.at ? ` · ${ed.at}` : '') +
                      (ed.from != null ? ` — was ${money(ed.from)}` : '')
                    : over
                      ? 'Over the sanctioned amount'
                      : undefined;
                  return (
                    <td
                      key={c.key}
                      title={title}
                      className={cx(
                        `cc-cell--${c.type ?? 'text'}`,
                        typeClass(c),
                        c.align === 'center' && 'cc-al-center',
                        c.align === 'right' && 'cc-al-right',
                        c.wrap && 'cc-cell--wrap',
                        ed && `cc-cell--edited-${ed.role}`,
                        ed && seen && !seen.has(`${r.id ?? i}:${c.key}`) && 'cc-cell--flash',
                        over && 'cc-cell--over',
                      )}
                    >
                      {ed ? <EditTag role={ed.role} /> : null}
                      {over ? <Icon name="alert" /> : null}
                      {ed && showPrevious && ed.from != null ? (
                        <span className="cc-cell-was">{money(ed.from)}</span>
                      ) : null}
                      {cellValue(c, r.cells[c.key])}
                      {ed ? <span className="cc-sr"> ({title})</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {footKeys.size ? (
            <tfoot>
              <tr>
                {rowNumbers ? <td className="cc-rownum" /> : null}
                {columns.map((c, j) => {
                  if (c.key in totalValues) {
                    return (
                      <td key={c.key} className={cx('figure-md', `cc-cell--${c.type ?? 'text'}`)}>
                        {totalValues[c.key]}
                      </td>
                    );
                  }
                  if (totals.includes(c.key)) {
                    const sum = rows.reduce((t, r) => {
                      const v = r.cells[c.key];
                      return (
                        t + (typeof v === 'number' || typeof v === 'string' ? Number(v) || 0 : 0)
                      );
                    }, 0);
                    return (
                      <td key={c.key} className="figure-md cc-cell--money">
                        {formatINR(sum)}
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="label-lg">
                      {j === 0 ? totalLabel : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

/* ========================= Approvals ========================= */
export interface FlowStep {
  label: string;
  who?: string;
  role?: EditRole | 'member';
  status: 'done' | 'current' | 'returned' | 'rejected' | 'upcoming' | 'skipped';
  at?: string;
  days?: number;
  state?: string;
}
const FLOW: Record<FlowStep['status'], { icon: IconName | null; word: string }> = {
  done: { icon: 'check', word: 'Approved' },
  current: { icon: 'clock', word: 'Waiting' },
  returned: { icon: 'undo', word: 'Returned' },
  rejected: { icon: 'x', word: 'Rejected' },
  upcoming: { icon: null, word: 'Next' },
  skipped: { icon: null, word: 'Not needed' },
};
/** The route: gate holders, "Waiting · 2 days" on the current gate, dashed "Not needed". */
export function ApprovalFlow({
  steps,
  orientation = 'horizontal',
  label = 'Approval chain',
  className,
}: {
  steps: FlowStep[];
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
}) {
  return (
    <ol
      className={cx('cc-flow', orientation === 'vertical' && 'cc-flow--vertical', className)}
      aria-label={label}
    >
      {steps.map((s, i) => {
        const f = FLOW[s.status];
        const reached = i > 0 && steps[i - 1]?.status === 'done' && s.status !== 'skipped';
        const text =
          s.state ??
          f.word +
            (s.status === 'current' && s.days != null
              ? ` · ${plural(s.days, 'day', 'days')}`
              : '') +
            (s.at && s.status !== 'current' && s.status !== 'upcoming' ? ` · ${s.at}` : '');
        return (
          <li
            key={i}
            className={cx(
              'cc-flow-step',
              `cc-flow-step--${s.status}`,
              reached && 'cc-flow-step--reached',
            )}
            aria-current={s.status === 'current' ? 'step' : undefined}
          >
            <span className="cc-flow-dot">{f.icon ? <Icon name={f.icon} size={18} /> : i + 1}</span>
            <span className="cc-flow-label title-sm">{s.label}</span>
            {s.who ? (
              <span className="cc-flow-who caption">
                {s.role === 'admin' || s.role === 'management' ? <EditTag role={s.role} /> : null}
                {s.who}
              </span>
            ) : null}
            <span className="cc-flow-state label-md">{text}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ========================= Scan station ========================= */
export type ScanOutcome =
  | 'ready'
  | 'accepted'
  | 'spot_registered'
  | 'duplicate'
  | 'wrong_event'
  | 'unknown_code'
  | 'not_registered'
  | 'expired'
  | 'cancelled';
const SCAN: Record<
  ScanOutcome,
  { tone: 'ok' | 'warn' | 'bad' | 'idle'; icon: IconName; label: string }
> = {
  accepted: { tone: 'ok', icon: 'check', label: 'Checked in' },
  spot_registered: { tone: 'ok', icon: 'plus', label: 'Registered at the door and checked in' },
  duplicate: { tone: 'warn', icon: 'history', label: 'Already checked in' },
  wrong_event: { tone: 'bad', icon: 'alert', label: 'Pass is for another event' },
  unknown_code: { tone: 'bad', icon: 'x', label: 'Code not recognised' },
  not_registered: { tone: 'bad', icon: 'x', label: 'Not registered and cannot be' },
  expired: { tone: 'bad', icon: 'clock', label: 'Pass expired' },
  cancelled: { tone: 'bad', icon: 'x', label: 'Registration was cancelled' },
  ready: { tone: 'idle', icon: 'search', label: 'Ready to scan' },
};
/** One scan outcome in the station's exact words: success, warning or danger. */
export function ScanResult({
  result,
  label,
  who,
  detail,
  at,
  offline,
  compact,
  big,
  live,
  as: Tag = 'div',
  children,
  className,
}: {
  result: ScanOutcome;
  label?: ReactNode;
  who?: ReactNode;
  detail?: ReactNode;
  at?: string;
  offline?: boolean;
  compact?: boolean;
  /** The station's main verdict: larger icon and padding. */
  big?: boolean;
  live?: boolean;
  as?: 'div' | 'li';
  children?: ReactNode;
  className?: string;
}) {
  const r = SCAN[result] ?? SCAN.ready;
  const sub = [who, detail].filter(Boolean);
  return (
    <Tag
      className={cx(
        'cc-scan',
        `cc-scan--${r.tone}`,
        compact && 'cc-scan--compact',
        big && 'cc-scan--big',
        className,
      )}
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
    >
      <span className="cc-scan-icon">
        <Icon name={r.icon} size={compact ? 16 : big ? 30 : 22} />
      </span>
      <span className="cc-scan-text">
        <span className={cx('cc-scan-label', compact ? 'label-lg' : big ? 'headline' : 'title-md')}>
          {label ?? r.label}
        </span>
        {sub.length ? (
          <span className={cx('cc-scan-sub', compact ? 'caption' : 'body-md')}>
            {sub.map((s, i) => (
              <span key={i}>
                {i ? ' · ' : ''}
                {s}
              </span>
            ))}
          </span>
        ) : null}
        {children}
      </span>
      {offline ? <span className="cc-scan-offline label-md">offline</span> : null}
      {at ? <span className="cc-scan-time caption cc-num">{at}</span> : null}
    </Tag>
  );
}

/** Camera frame: rounded white corner brackets, a moving scan line and a glass hint pill. */
export function Viewfinder({
  children,
  hint,
  scanning = true,
  flash,
  flashKey,
  className,
}: {
  children?: ReactNode;
  hint?: ReactNode;
  scanning?: boolean;
  /** Flash the frame with a result's hue (§7.3): once for ok, twice for warn, held for bad. */
  flash?: ScanOutcome | 'ok' | 'warn' | 'bad' | null;
  /** Changes with every result so the same tone flashes again. */
  flashKey?: string | number;
  className?: string;
}) {
  const tone = flash && flash in SCAN ? SCAN[flash as ScanOutcome].tone : flash;
  return (
    <div className={cx('cc-vf', className)}>
      {children}
      {tone && tone !== 'idle' ? (
        <i key={flashKey} className={`cc-vf-flash cc-vf-flash--${tone}`} aria-hidden="true" />
      ) : null}
      <div className="cc-vf-frame" aria-hidden="true">
        <i className="cc-vf-c cc-vf-c--tl" />
        <i className="cc-vf-c cc-vf-c--tr" />
        <i className="cc-vf-c cc-vf-c--bl" />
        <i className="cc-vf-c cc-vf-c--br" />
        {scanning ? <i className="cc-vf-line" /> : null}
      </div>
      {hint ? <div className="cc-vf-hint label-md">{hint}</div> : null}
    </div>
  );
}

/* ========================= Dashboards ========================= */
/** A labelled figure: dashboards, summaries. Tone colours the number only. */
export function Stat({
  label,
  value,
  note,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'success' | 'warning' | 'danger';
  className?: string;
}) {
  return (
    <dl className={cx('cc-card', 'cc-stat', tone && `cc-stat--${tone}`, 'm-0', className)}>
      <dt className="label-md">{label}</dt>
      <dd className="figure-xl cc-num">{value}</dd>
      {note ? <div className="cc-stat-note caption">{note}</div> : null}
    </dl>
  );
}
