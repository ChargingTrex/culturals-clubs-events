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
  return (
    <div className="min-w-[200px]">
      <label className="label" htmlFor="club-picker">
        Club
      </label>
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
  );
}
