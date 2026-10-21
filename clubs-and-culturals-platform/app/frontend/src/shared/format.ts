export const inr = (n: number | string | null | undefined): string =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const fmtDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtTime = (d: string | Date): string =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export const dateParts = (d: string | Date): { day: number; month: string } => {
  const date = new Date(d);
  return { day: date.getDate(), month: date.toLocaleDateString('en-IN', { month: 'short' }) };
};

/** `club_president:<uuid>` → "Club president"; `dean` → "Dean". */
export const roleLabel = (role: string): string => {
  const name = role.split(':')[0] ?? role;
  const words = name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
