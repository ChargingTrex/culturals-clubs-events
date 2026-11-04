import { ClubIcon, accentFor } from '../shared/ds';
import type { MyClub } from './useMyClubs';

export function ClubPicker({
  clubs,
  value,
  onChange,
}: {
  clubs: MyClub[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  if (clubs.length < 2) return null;
  const current = clubs.find((c) => c.id === value);
  return (
    <div className="min-w-[220px]">
      <label className="label" htmlFor="club-picker">
        Club
      </label>
      <div className="flex items-center gap-2.5">
        {current ? (
          <ClubIcon name={current.name} accent={accentFor(current.name)} size="sm" />
        ) : null}
        <select
          id="club-picker"
          className="field"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
