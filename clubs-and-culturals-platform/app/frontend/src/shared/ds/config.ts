/**
 * Design-system rules that aren't CSS: which colour, icon and word each status
 * gets, which positions wear which role ring, which accents clubs may use.
 * The visual values themselves (colours, sizes …) live in tokens.css.
 */
import type { ClubCategory, IconName } from './icons';

export const ACCENTS = ['coral', 'pink', 'sun', 'sky', 'lime'] as const;
export type Accent = (typeof ACCENTS)[number];

/**
 * A club's accent until clubs carry their own: picked from the club's name
 * (unique, and the one key every API response carries — passes have no id), so
 * the same club is always the same colour on every screen.
 */
export function accentFor(key: string | null | undefined): Accent {
  let h = 0;
  for (const ch of String(key ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length] ?? 'sky';
}

/** Backend club categories (clubs/models.py Club.Category) → club glyphs. */
export const CATEGORY_GLYPH: Record<string, ClubCategory> = {
  cultural: 'art',
  literary: 'literary',
  technical: 'tech',
  sports: 'sports',
  social: 'service',
  committee: 'general',
};

/** Chip tone = the CSS modifier (cc-chip--<tone>), i.e. which status colour. */
export type ChipTone = 'draft' | 'pending' | 'in-review' | 'approved' | 'rejected' | 'neutral';

export type ChipStatus =
  | 'draft'
  | 'submitted'
  | 'in-review'
  | 'pending'
  | 'returned'
  | 'approved'
  | 'sanctioned'
  | 'rejected'
  | 'settled';

/** Every status carries a colour, an icon and a word — never colour alone. */
export const CHIP_STATUS: Record<ChipStatus, { tone: ChipTone; label: string; icon: IconName }> = {
  draft: { tone: 'draft', label: 'Draft', icon: 'draft' },
  submitted: { tone: 'in-review', label: 'Submitted', icon: 'upload' },
  'in-review': { tone: 'in-review', label: 'In review', icon: 'eye' },
  pending: { tone: 'pending', label: 'Pending', icon: 'clock' },
  returned: { tone: 'pending', label: 'Returned', icon: 'undo' },
  approved: { tone: 'approved', label: 'Approved', icon: 'check' },
  sanctioned: { tone: 'approved', label: 'Sanctioned', icon: 'check' },
  rejected: { tone: 'rejected', label: 'Rejected', icon: 'x' },
  settled: { tone: 'neutral', label: 'Settled', icon: 'wallet' },
};

export type Tier = 'management' | 'admin' | 'club' | 'organiser' | null;
export type Position =
  | 'vice-chancellor'
  | 'dean'
  | 'cultural-society'
  | 'student-life-office'
  | 'president'
  | 'vice-president'
  | 'secretary'
  | 'treasurer'
  | 'organiser'
  | 'management'
  | 'admin'
  | 'member'
  | 'student';

/** Role rings: colour = tier, line style = rank, pill = exact position. */
export const POSITIONS: Record<Position, { tier: Tier; short: string; label: string }> = {
  'vice-chancellor': { tier: 'management', short: 'VC', label: 'Vice-Chancellor' },
  dean: { tier: 'admin', short: 'Dean', label: 'Dean of Student Affairs' },
  'cultural-society': { tier: 'admin', short: 'Society', label: 'Cultural Society' },
  'student-life-office': { tier: 'admin', short: 'SLO', label: 'Student Life Office' },
  president: { tier: 'club', short: 'President', label: 'President' },
  'vice-president': { tier: 'club', short: 'VP', label: 'Vice-President' },
  secretary: { tier: 'club', short: 'Secretary', label: 'Secretary' },
  treasurer: { tier: 'club', short: 'Treasurer', label: 'Treasurer' },
  organiser: { tier: 'organiser', short: 'Organiser', label: 'Organiser' },
  management: { tier: 'management', short: 'Mgmt', label: 'Management' },
  admin: { tier: 'admin', short: 'Admin', label: 'Admin' },
  member: { tier: null, short: '', label: 'Club member' },
  student: { tier: null, short: '', label: 'Student' },
};

/** Backend role names (common/roles.py) → design-system positions. */
export const ROLE_POSITION: Record<string, Position> = {
  vice_chancellor: 'vice-chancellor',
  dean: 'dean',
  cultural_society: 'cultural-society',
  admin: 'admin',
  club_president: 'president',
  club_vice_president: 'vice-president',
  club_secretary: 'secretary',
  club_treasurer: 'treasurer',
  event_organiser: 'organiser',
  club_core: 'member',
  club_member: 'member',
  student: 'student',
};

/** The most senior position among a user's role strings ("club_president:<id>" …). */
export function topPosition(roles: readonly string[]): Position | undefined {
  const order = Object.keys(POSITIONS) as Position[];
  return roles
    .map((r) => ROLE_POSITION[r.split(':')[0] ?? ''])
    .filter((p): p is Position => Boolean(p))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}

/** Indian grouping, rupee sign, true minus: ₹1,25,000 · −₹500. */
export function formatINR(n: number | null | undefined, opts?: { decimals?: number }): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const d = opts?.decimals ?? 0;
  const s = Math.abs(Number(n)).toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return (n < 0 ? '−' : '') + '₹' + s;
}

export function initials(name: string | undefined): string {
  const parts = String(name ?? '')
    .replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '')
    .trim()
    .split(/\s+/);
  if (parts.length > 1) return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  const w = parts[0] ?? '';
  return w.charAt(0).toUpperCase() + w.charAt(1).toLowerCase() || '';
}
