import type { EventStatus } from '../api/types';
import { Chip, type ChipTone, type IconName } from '../ds';

type Tone = 'plain' | 'ok' | 'warn' | 'bad' | 'info';

/* Status colours always come with an icon and a word (design-system rule). */
const TONE: Record<Tone, { tone: ChipTone; icon?: IconName }> = {
  plain: { tone: 'draft' },
  info: { tone: 'in-review' },
  ok: { tone: 'approved', icon: 'check' },
  warn: { tone: 'pending', icon: 'clock' },
  bad: { tone: 'rejected', icon: 'x' },
};

export function Pill({ tone = 'plain', children }: { tone?: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <Chip tone={t.tone} icon={t.icon}>
      {children}
    </Chip>
  );
}

const STATUS: Record<
  EventStatus,
  { label: string; tone: ChipTone; icon?: IconName; live?: boolean }
> = {
  draft: { label: 'Draft', tone: 'draft', icon: 'draft' },
  submitted: { label: 'Awaiting approval', tone: 'in-review', icon: 'upload' },
  returned: { label: 'Returned', tone: 'pending', icon: 'undo' },
  rejected: { label: 'Rejected', tone: 'rejected', icon: 'x' },
  approved: { label: 'Approved', tone: 'approved', icon: 'check' },
  published: { label: 'Published', tone: 'approved', icon: 'calendar' },
  live: { label: 'Live now', tone: 'approved', live: true },
  completed: { label: 'Completed', tone: 'neutral', icon: 'check' },
  reported: { label: 'Reported', tone: 'neutral', icon: 'sheet' },
  cancelled: { label: 'Cancelled', tone: 'rejected', icon: 'x' },
};

export function StatusPill({ status, label }: { status: EventStatus; label?: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'draft' as const };
  return (
    <Chip tone={s.tone} icon={s.icon} live={s.live}>
      {label ?? s.label}
    </Chip>
  );
}
