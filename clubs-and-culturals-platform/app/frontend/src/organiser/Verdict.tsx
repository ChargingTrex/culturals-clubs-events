import type { ScanOutcome } from './api';

export type LastScan =
  | { kind: 'outcome'; outcome: ScanOutcome; at: number }
  | { kind: 'queued'; token: string; at: number };

const TONE = {
  ok: { box: 'border-ok bg-ok-soft text-ok', mark: '✓' },
  warn: { box: 'border-warn bg-warn-soft text-warn', mark: '!' },
  bad: { box: 'border-bad bg-bad-soft text-bad', mark: '✕' },
} as const;

/**
 * The answer at the door, sized to be read at arm's length: one word-sized
 * verdict, a colour, a mark, then who it is. The backend chooses the tone.
 */
export function Verdict({ last }: { last: LastScan | null }) {
  if (!last) {
    return (
      <div
        data-testid="verdict"
        data-result="idle"
        className="flex min-h-[176px] flex-col items-center justify-center rounded-md border-2 border-dashed border-line p-6 text-center text-muted"
      >
        <p className="font-display text-[1.6rem] font-bold">Ready to scan</p>
        <p className="mt-1 text-[0.9rem]">Hold the pass or profile QR up to the camera.</p>
      </div>
    );
  }

  if (last.kind === 'queued') {
    const t = TONE.warn;
    return (
      <div
        key={last.at}
        role="status"
        aria-live="assertive"
        data-testid="verdict"
        data-result="queued"
        className={`flex min-h-[176px] flex-col justify-center rounded-md border-2 p-6 ${t.box}`}
      >
        <p className="flex items-center gap-3 font-display text-[clamp(2rem,6vw,3rem)] leading-none font-extrabold">
          <span aria-hidden="true">⏳</span> Saved offline
        </p>
        <p className="mt-3 text-[1rem] text-ink">
          No connection. The scan is queued on this device and will be checked when the network is
          back. Let them in only if the pass looks right.
        </p>
      </div>
    );
  }

  const o = last.outcome;
  const t = TONE[o.tone] ?? TONE.warn;
  const s = o.student;
  return (
    <div
      key={last.at}
      role="status"
      aria-live="assertive"
      data-testid="verdict"
      data-result={o.result}
      className={`flex min-h-[176px] flex-col justify-center rounded-md border-2 p-6 ${t.box}`}
    >
      <p className="flex items-center gap-3 font-display text-[clamp(2rem,6vw,3rem)] leading-none font-extrabold">
        <span aria-hidden="true">{t.mark}</span> {o.verdict}
      </p>
      {s ? (
        <div className="mt-3 text-ink">
          <p className="font-display text-[1.45rem] font-bold">{s.full_name}</p>
          <p className="text-[0.95rem] text-ink-2">
            <span className="font-mono">{s.prn}</span> · {s.programme} · Year {s.year} ·{' '}
            {s.department}
          </p>
        </div>
      ) : null}
      {o.detail ? <p className="mt-2 text-[0.95rem] text-ink-2">{o.detail}</p> : null}
    </div>
  );
}
