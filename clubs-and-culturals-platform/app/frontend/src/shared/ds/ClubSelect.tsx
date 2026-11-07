import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from './classes';
import { ClubIcon, Icon } from './components';
import { CATEGORY_GLYPH, accentFor } from './config';

export interface ClubChoice {
  id: string;
  name: string;
  category?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  cultural: 'Cultural',
  literary: 'Literary',
  technical: 'Technical',
  sports: 'Sports',
  social: 'Social',
  committee: 'Committees',
};
const groupOf = (c?: string) =>
  c ? (CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1)) : 'Other';

/**
 * A club picker that looks like a field and opens a searchable list grouped by
 * category, each club wearing its tile. A popover on desktop, a sheet on phones
 * (CSS decides; one DOM). `value` '' means every club.
 */
export function ClubSelect({
  id,
  clubs,
  value,
  onChange,
  allLabel = 'All clubs',
  className,
}: {
  id?: string;
  clubs: ClubChoice[];
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
  className?: string;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const current = clubs.find((c) => c.id === value);
  const needle = query.trim().toLowerCase();
  const options = useMemo<ClubChoice[]>(() => {
    const hits = clubs
      .filter(
        (c) =>
          !needle ||
          c.name.toLowerCase().includes(needle) ||
          groupOf(c.category).toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          groupOf(a.category).localeCompare(groupOf(b.category)) || a.name.localeCompare(b.name),
      );
    return needle ? hits : [{ id: '', name: allLabel }, ...hits];
  }, [clubs, needle, allLabel]);

  const show = () => {
    setQuery('');
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.id === value),
      ),
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  };
  const pick = (clubId: string) => {
    onChange(clubId);
    close();
  };

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const onKey = (e: React.KeyboardEvent) => {
    const n = options.length;
    if (e.key === 'ArrowDown') setActive((a) => (n ? (a + 1) % n : 0));
    else if (e.key === 'ArrowUp') setActive((a) => (n ? (a - 1 + n) % n : 0));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(Math.max(0, n - 1));
    else if (e.key === 'Enter') {
      const o = options[active];
      if (o) pick(o.id);
    } else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') return close();
    else return;
    e.preventDefault();
  };

  const tile = (c: ClubChoice | undefined, size: 'xs' | 'sm') => (
    <span aria-hidden="true" className="flex">
      {c?.id ? (
        <ClubIcon
          size={size}
          name={c.name}
          accent={accentFor(c.name)}
          category={CATEGORY_GLYPH[c.category ?? '']}
        />
      ) : (
        <ClubIcon size={size} name={allLabel} category="general" />
      )}
    </span>
  );

  return (
    <div className={cx('cc-clubsel', className)}>
      <button
        type="button"
        id={id}
        ref={trigger}
        className="field cc-clubsel-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            show();
          }
        }}
      >
        {tile(current, 'xs')}
        <span className="cc-clubsel-value body-md">{current?.name ?? allLabel}</span>
        <Icon name="chevron-down" size={18} className="cc-clubsel-caret" />
      </button>
      {open ? (
        <>
          <div className="cc-clubsel-scrim" onClick={close} />
          <div className="cc-clubsel-panel">
            <span className="cc-clubsel-grabber" aria-hidden="true" />
            <div className="cc-field cc-clubsel-search">
              <div className="cc-field-box">
                <Icon name="search" />
                <input
                  ref={input}
                  role="combobox"
                  aria-label="Find a club"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={options[active] ? optId(active) : undefined}
                  className="body-md"
                  placeholder="Find a club"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                />
              </div>
            </div>
            <ul id={listId} role="listbox" aria-label="Clubs" className="cc-clubsel-list">
              {options.length === 0 ? (
                <li className="cc-clubsel-empty body-md">No club matches “{query.trim()}”.</li>
              ) : (
                options.map((o, i) => {
                  const prev = options[i - 1];
                  const heading =
                    o.id !== '' &&
                    (!prev || !prev.id || groupOf(prev.category) !== groupOf(o.category));
                  return (
                    <Fragment key={o.id || 'all'}>
                      {heading ? (
                        <li role="presentation" className="cc-clubsel-group label-md">
                          {groupOf(o.category)}
                        </li>
                      ) : null}
                      <li
                        role="option"
                        id={optId(i)}
                        aria-selected={o.id === value}
                        data-active={i === active || undefined}
                        className="cc-clubsel-opt"
                        onClick={() => pick(o.id)}
                        onMouseMove={() => active !== i && setActive(i)}
                      >
                        {tile(o, 'sm')}
                        <span className="cc-clubsel-opt-name body-md">{o.name}</span>
                        {o.id === value ? (
                          <Icon name="check" size={18} className="cc-clubsel-check" />
                        ) : null}
                      </li>
                    </Fragment>
                  );
                })
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
