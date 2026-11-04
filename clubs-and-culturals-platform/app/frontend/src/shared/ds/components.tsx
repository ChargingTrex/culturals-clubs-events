/**
 * Culturals design system — phase 1 components (the general UI kit).
 * Ported from the design system's component bundle; same props and markup
 * (cc-* classes styled in components.css), typed, using React's own hooks.
 */
import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  CHIP_STATUS,
  POSITIONS,
  initials,
  type Accent,
  type ChipStatus,
  type ChipTone,
  type Position,
} from './config';
import { buttonClass, cx, type ButtonVariant } from './classes';
import { GLYPHS, ICONS, SQUIRCLE, type ClubCategory, type IconName } from './icons';

export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

function Shapes({ els }: { els: ReadonlyArray<readonly [string, Record<string, string>]> }) {
  return (
    <>
      {els.map(([Tag, attrs], i) => {
        const T = Tag as 'path';
        return <T key={i} {...(attrs as object)} />;
      })}
    </>
  );
}

/* ---------- Icon ---------- */
export function Icon({
  name,
  size = 20,
  label,
  strokeWidth = 1.75,
  className,
}: {
  name: IconName;
  size?: number;
  label?: string;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      className={cx('cc-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <Shapes els={ICONS[name]} />
    </svg>
  );
}

/* ---------- Button ---------- */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
}
export function Button({
  variant = 'filled',
  size = 'md',
  icon,
  iconRight,
  block,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} {...rest} className={buttonClass(variant, size, block, className)}>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} className="cc-icon--right" /> : null}
    </button>
  );
}

/* ---------- IconButton ---------- */
function Badge({ value }: { value?: number | boolean }) {
  if (value == null || value === false || value === 0) return null;
  return (
    <span className={cx('cc-badge', 'label-sm', value === true && 'cc-badge--dot')}>
      {value === true ? null : value > 99 ? '99+' : value}
    </span>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  variant?: 'standard' | 'tint' | 'tonal' | 'filled' | 'glass';
  size?: 'sm' | 'md';
  selected?: boolean;
  badge?: number | boolean;
}
export function IconButton({
  icon,
  label,
  variant = 'standard',
  size = 'md',
  selected,
  badge,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'cc-ibtn',
        `cc-ibtn--${variant}`,
        size === 'sm' && 'cc-ibtn--sm',
        selected && 'cc-ibtn--selected',
        className,
      )}
      aria-pressed={selected != null ? selected : undefined}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 22} />
      <Badge value={badge} />
    </button>
  );
}

/* ---------- Chips ---------- */
/** A status chip from the shared vocabulary (config.ts CHIP_STATUS). */
export function StatusChip({
  status,
  days,
  icon,
  title,
  children,
  className,
}: {
  status: ChipStatus;
  days?: number;
  icon?: IconName;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const s = CHIP_STATUS[status] ?? CHIP_STATUS.draft;
  return (
    <Chip tone={s.tone} icon={icon ?? s.icon} title={title} className={className}>
      {children ?? s.label}
      {days != null ? ` · ${days} ${days === 1 ? 'day' : 'days'}` : null}
    </Chip>
  );
}

/** Low-level chip: any tone, any icon (or a live dot). */
export function Chip({
  tone,
  icon,
  live,
  title,
  children,
  className,
}: {
  tone: ChipTone;
  icon?: IconName;
  live?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('cc-chip', `cc-chip--${tone}`, 'label-md', className)} title={title}>
      {live ? (
        <span className="cc-live-dot" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={16} />
      ) : null}
      <span>{children}</span>
    </span>
  );
}

export function ClubTag({
  accent = 'sky',
  children,
  className,
}: {
  accent?: Accent;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx('cc-tag', `cc-acc--${accent}`, 'label-md', className)}>
      <span className="cc-tag-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ---------- ClubIcon ---------- */
export interface ClubIconProps {
  name?: string;
  accent?: Accent;
  category?: ClubCategory;
  src?: string;
  variant?: 'filled' | 'tonal';
  size?: Size;
  className?: string;
}
function ClubIconParts({ name, category, src, clipId }: ClubIconProps & { clipId: string }) {
  const cat: ClubCategory | null =
    category && GLYPHS[category] ? category : name || src ? null : 'general';
  return (
    <>
      <path d={SQUIRCLE} className="cc-ci-tile" />
      {src ? (
        <>
          <clipPath id={clipId}>
            <path d={SQUIRCLE} />
          </clipPath>
          <image
            href={src}
            x={0}
            y={0}
            width={100}
            height={100}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : cat ? (
        <g
          transform="translate(22 22) scale(2.3333)"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Shapes els={GLYPHS[cat]} />
        </g>
      ) : (
        <text x={50} y={52} textAnchor="middle" dominantBaseline="middle" className="cc-ci-mono">
          {initials(name)}
        </text>
      )}
    </>
  );
}
/** Clubs are continuous-corner tiles (people are circles — see Avatar). */
export function ClubIcon(props: ClubIconProps) {
  const { name, accent, category, variant, size = 'md', className } = props;
  const clipId = useId();
  return (
    <svg
      className={cx(
        'cc-ci',
        `cc-ci--${size}`,
        accent ? `cc-acc--${accent}` : 'cc-ci--neutral',
        variant === 'tonal' && 'cc-ci--tonal',
        className,
      )}
      viewBox="0 0 100 100"
      role="img"
      aria-label={name ? name + (category ? ` (${category})` : '') : 'Club'}
    >
      <ClubIconParts {...props} clipId={clipId} />
    </svg>
  );
}

/* ---------- Avatar ---------- */
export interface AvatarProps {
  name?: string;
  src?: string;
  anonymous?: boolean;
  size?: Size;
  position?: Position;
  positionLabel?: string;
  positionShort?: string;
  showPosition?: boolean;
  badge?: 'admin' | 'management' | 'checked-in' | null;
  ring?: boolean;
  className?: string;
}
/** People are neutral circles; only the role ring carries colour. */
export function Avatar({
  name,
  src,
  anonymous,
  size = 'md',
  position,
  positionLabel,
  positionShort,
  showPosition,
  badge,
  ring,
  className,
}: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const pos = position ? POSITIONS[position] : null;
  const tier = pos?.tier ?? null;
  const posLabel = pos ? (positionLabel ?? pos.label) : '';
  const showPos =
    !!tier &&
    (showPosition === true || (showPosition !== false && (size === 'lg' || size === 'xl')));

  let face: ReactNode;
  if (src && !broken) face = <img src={src} alt="" onError={() => setBroken(true)} />;
  else if (name && !anonymous) face = <span className="cc-av-initials">{initials(name)}</span>;
  else
    face = (
      <svg className="cc-av-silhouette" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx={50} cy={39} r={17} />
        <path d="M50 62c-17.5 0-31 9.6-34 25a50 50 0 0 0 68 0c-3-15.4-16.5-25-34-25z" />
      </svg>
    );

  let badgeEl: ReactNode = null;
  let badgeText = '';
  if ((badge === 'admin' || badge === 'management') && !showPos) {
    badgeEl = (
      <span
        className={cx('cc-role-mark', `cc-role-mark--${badge}`, 'label-sm', 'cc-av-badge')}
        aria-hidden="true"
      >
        {badge === 'admin' ? 'A' : 'M'}
      </span>
    );
    badgeText = pos ? '' : badge === 'admin' ? ', Admin' : ', Management';
  } else if (badge === 'checked-in') {
    badgeEl = (
      <span className="cc-av-badge cc-av-badge--ok">
        <Icon name="check" size={12} strokeWidth={3} />
      </span>
    );
    badgeText = ', checked in';
  }

  const who = name || 'No profile picture';
  return (
    <span
      className={cx(
        'cc-av',
        `cc-av--${size}`,
        ring && !tier && 'cc-av--ring',
        tier && `cc-av--tier-${tier}`,
        showPos && 'cc-av--pos',
        className,
      )}
      role="img"
      aria-label={who + (posLabel ? `, ${posLabel}` : '') + badgeText}
      title={name ? name + (posLabel ? ` — ${posLabel}` : '') : undefined}
    >
      <span className="cc-av-face">{face}</span>
      {showPos && pos ? (
        <span className="cc-av-pos label-sm" aria-hidden="true">
          {positionShort ?? pos.short}
        </span>
      ) : null}
      {badgeEl}
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('cc-card', className)}>
      {title || actions ? (
        <div className="cc-card-head">
          <div className="cc-card-titles">
            {title ? <h3 className="cc-card-title title-md">{title}</h3> : null}
            {subtitle ? <p className="cc-card-subtitle caption">{subtitle}</p> : null}
          </div>
          {actions ? <div className="cc-card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="cc-card-body">{children}</div>
    </section>
  );
}

/* ---------- ListGroup (inset grouped list) ---------- */
export interface ListItem {
  icon?: IconName;
  accent?: Accent;
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
}
export function ListGroup({
  header,
  footer,
  items,
  className,
}: {
  header?: string;
  footer?: string;
  items: ListItem[];
  className?: string;
}) {
  return (
    <div className={cx('cc-listgroup', className)}>
      {header ? <p className="cc-listgroup-header label-md">{header}</p> : null}
      <ul className="cc-list">
        {items.map((it, i) => (
          <li
            key={i}
            className={cx(
              'cc-list-row',
              it.icon && 'cc-list-row--icon',
              (it.onClick || it.chevron) && 'cc-list-row--button',
            )}
            onClick={it.onClick}
            onKeyDown={
              it.onClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      it.onClick?.();
                    }
                  }
                : undefined
            }
            tabIndex={it.onClick ? 0 : undefined}
            role={it.onClick ? 'button' : undefined}
          >
            {it.icon ? (
              <svg
                className={cx('cc-list-icon', `cc-acc--${it.accent ?? 'sky'}`)}
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                <path d={SQUIRCLE} className="cc-ci-tile" />
                <g
                  transform="translate(20 20) scale(2.5)"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Shapes els={ICONS[it.icon]} />
                </g>
              </svg>
            ) : null}
            <span className="cc-list-label body-md">
              {it.label}
              {it.detail ? <span className="cc-list-detail caption">{it.detail}</span> : null}
            </span>
            {it.value != null ? <span className="cc-list-value body-md">{it.value}</span> : null}
            {it.chevron ? <Icon name="chevron-right" className="cc-list-chevron" /> : null}
          </li>
        ))}
      </ul>
      {footer ? <p className="cc-listgroup-footer caption">{footer}</p> : null}
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  title,
  children,
  action,
  category = 'general',
  accent,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  category?: ClubCategory;
  accent?: Accent;
  className?: string;
}) {
  return (
    <div className={cx('cc-empty', className)}>
      <ClubIcon
        category={category}
        accent={accent}
        size="xl"
        name={typeof title === 'string' ? title : undefined}
      />
      <h3 className="title-md cc-empty-title">{title}</h3>
      {children ? <p className="body-md cc-empty-body">{children}</p> : null}
      {action ?? null}
    </div>
  );
}

/* ---------- TextField ---------- */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  helper?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  icon?: IconName;
  money?: boolean;
}
export function TextField({
  label,
  helper,
  error,
  prefix,
  suffix,
  icon,
  money,
  className,
  id: idProp,
  disabled,
  ...input
}: TextFieldProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const help = error ?? helper;
  return (
    <div
      className={cx(
        'cc-field',
        money && 'cc-field--money',
        error && 'cc-field--error',
        disabled && 'cc-field--disabled',
        className,
      )}
    >
      {label ? (
        <label htmlFor={id} className="cc-field-label label-md">
          {label}
        </label>
      ) : null}
      <div className="cc-field-box">
        {icon ? <Icon name={icon} /> : null}
        {prefix ? <span className="body-md cc-field-affix">{prefix}</span> : null}
        <input
          id={id}
          disabled={disabled}
          className={money ? 'figure-md' : 'body-md'}
          aria-invalid={error ? true : undefined}
          aria-describedby={help ? `${id}-help` : undefined}
          {...input}
        />
        {suffix ? <span className="body-md cc-field-affix">{suffix}</span> : null}
      </div>
      {help ? (
        <div id={`${id}-help`} className="cc-field-help caption">
          {error ? <Icon name="alert" /> : null}
          {help}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- SegmentedControl, Tabs, Switch ---------- */
type Option = string | { value: string; label: ReactNode; count?: number };
const norm = (o: Option) => (typeof o === 'string' ? { value: o, label: o as ReactNode } : o);

function useControlled<T>(value: T | undefined, initial: T, onChange?: (v: T) => void) {
  const [own, setOwn] = useState<T>(initial);
  const current = value !== undefined ? value : own;
  const set = (v: T) => {
    if (value === undefined) setOwn(v);
    onChange?.(v);
  };
  return [current, set] as const;
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onChange,
  label,
  block,
  className,
}: {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  block?: boolean;
  className?: string;
}) {
  const opts = options.map(norm);
  const [val, pick] = useControlled(value, defaultValue ?? opts[0]?.value ?? '', onChange);
  return (
    <div
      className={cx('cc-seg', block && 'cc-seg--block', className)}
      role="radiogroup"
      aria-label={label}
    >
      {opts.map((o) => {
        const on = o.value === val;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="cc-seg-btn label-lg"
            onClick={() => pick(o.value)}
          >
            {o.label}
            {'count' in o && o.count != null ? (
              <span className="cc-seg-count">{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  label,
  block = true,
  className,
}: {
  items: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: string;
  block?: boolean;
  className?: string;
}) {
  const opts = items.map(norm);
  const [val, pick] = useControlled(value, defaultValue ?? opts[0]?.value ?? '', onChange);
  return (
    <div
      className={cx('cc-tabs', block && 'cc-tabs--block', className)}
      role="tablist"
      aria-label={label}
    >
      {opts.map((o) => {
        const on = o.value === val;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={cx('cc-tab label-lg', on && 'cc-tab--on')}
            onClick={() => pick(o.value)}
          >
            <span className="cc-tab-inner">
              {o.label}
              {'count' in o && o.count != null ? (
                <span className="cc-tab-count label-sm">{o.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  defaultChecked,
  onChange,
  label,
  ariaLabel,
  disabled,
  id: idProp,
  className,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const [on, set] = useControlled(checked, !!defaultChecked, onChange);
  const btn = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      className="cc-switch-track"
      onClick={() => !disabled && set(!on)}
      disabled={disabled}
      aria-label={label ? undefined : ariaLabel}
    >
      <span className="cc-switch-thumb" />
    </button>
  );
  if (!label) return btn;
  return (
    <span className={cx('cc-switch', className)}>
      {btn}
      <label htmlFor={id} className="body-md">
        {label}
      </label>
    </span>
  );
}

/* ---------- TopAppBar ---------- */
/** iOS large title that collapses into the row on scroll; `small` for desktop. */
export function TopAppBar({
  variant = 'large',
  title,
  eyebrow,
  subtitle,
  back,
  onBack,
  leading,
  actions,
  collapsed: collapsedProp,
  collapseOnScroll,
  align,
  children,
  className,
}: {
  variant?: 'large' | 'small';
  title: string;
  eyebrow?: string;
  subtitle?: string;
  back?: string;
  onBack?: () => void;
  leading?: ReactNode;
  actions?: ReactNode;
  collapsed?: boolean;
  collapseOnScroll?: boolean;
  align?: 'center' | 'start';
  children?: ReactNode;
  className?: string;
}) {
  const [auto, setAuto] = useState(false);
  const collapsed = collapsedProp ?? auto;
  useEffect(() => {
    if (!collapseOnScroll || collapsedProp != null) return;
    const onScroll = () => setAuto(window.scrollY > 44);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [collapseOnScroll, collapsedProp]);
  const inlineShown = variant === 'small' || collapsed;
  const lead = back ? (
    <button type="button" className="cc-bar-back label-lg" onClick={onBack}>
      <Icon name="chevron-left" size={24} strokeWidth={2.25} />
      <span>{back}</span>
    </button>
  ) : (
    (leading ?? null)
  );
  return (
    <header
      className={cx(
        'cc-bar',
        `cc-bar--${variant}`,
        collapsed && 'cc-bar--collapsed',
        align === 'start' && 'cc-bar--start',
        className,
      )}
    >
      <div className="cc-bar-row">
        <div className="cc-bar-lead">{lead}</div>
        <div
          className={cx('cc-bar-inline', variant === 'small' ? 'title-lg' : 'title-sm')}
          role={inlineShown ? 'heading' : undefined}
          aria-level={inlineShown ? 1 : undefined}
          aria-hidden={inlineShown ? undefined : true}
        >
          {variant === 'small' && eyebrow ? (
            <span className="cc-bar-inline-eyebrow caption">{eyebrow}</span>
          ) : null}
          {title}
        </div>
        <div className="cc-bar-trail">{actions}</div>
      </div>
      {variant === 'large' ? (
        <div className="cc-bar-large" aria-hidden={collapsed ? true : undefined}>
          {eyebrow ? <p className="cc-bar-eyebrow label-md">{eyebrow}</p> : null}
          <h1 className="cc-bar-title large-title">{title}</h1>
          {subtitle ? <p className="cc-bar-sub body-md">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </header>
  );
}

/* ---------- BottomSheet ---------- */
export function BottomSheet({
  title,
  children,
  onClose,
  className,
}: {
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="cc-sheet-layer">
      <div className="cc-scrim" onClick={onClose} />
      <div
        className={cx('cc-sheet-panel', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <span className="cc-sheet-grabber" aria-hidden="true" />
        {title || onClose ? (
          <div className="cc-sheet-head">
            <h2 className="title-lg">{title}</h2>
            {onClose ? (
              <IconButton icon="x" label="Close" size="sm" variant="tonal" onClick={onClose} />
            ) : null}
          </div>
        ) : null}
        <div className="cc-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export { Badge };

/* ---------- PosterArt: generated poster when a club has not uploaded one ---------- */
export function PosterArt({
  headline,
  kicker,
  sub,
  accent = 'sky',
  category = 'general',
  ratio,
  className,
  headlineClassName = 'poster',
}: {
  headline: string;
  kicker?: string;
  sub?: string;
  accent?: Accent;
  category?: ClubCategory;
  ratio?: string;
  className?: string;
  /** Type role for the headline; `poster` by default, smaller on dense grids. */
  headlineClassName?: string;
}) {
  return (
    <div
      className={cx('cc-poster', `cc-acc--${accent}`, className)}
      style={ratio ? { aspectRatio: ratio } : undefined}
      aria-hidden="true"
    >
      <svg
        className="cc-poster-glyph"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Shapes els={GLYPHS[category]} />
      </svg>
      <div className="cc-poster-type">
        {kicker ? <span className="cc-poster-kicker label-md">{kicker}</span> : null}
        <span className={cx('cc-poster-head', headlineClassName)}>{headline}</span>
        {sub ? <span className="cc-poster-sub label-lg">{sub}</span> : null}
      </div>
    </div>
  );
}
