import type { EventStatus } from '../api/types';

type Tone = 'plain' | 'ok' | 'warn' | 'bad' | 'gold';

export function Pill({ tone = 'plain', children }: { tone?: Tone; children: React.ReactNode }) {
  const toneClass = tone === 'plain' ? '' : `pill-${tone}`;
  return <span className={`pill ${toneClass}`}>{children}</span>;
}

const STATUS: Record<EventStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'plain' },
  submitted: { label: 'Awaiting approval', tone: 'warn' },
  returned: { label: 'Returned', tone: 'bad' },
  rejected: { label: 'Rejected', tone: 'bad' },
  approved: { label: 'Approved', tone: 'ok' },
  published: { label: 'Published', tone: 'ok' },
  live: { label: 'Live now', tone: 'gold' },
  completed: { label: 'Completed', tone: 'plain' },
  reported: { label: 'Reported', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
};

export function StatusPill({ status, label }: { status: EventStatus; label?: string }) {
  const entry = STATUS[status];
  return <Pill tone={entry?.tone ?? 'plain'}>{label ?? entry?.label ?? status}</Pill>;
}
