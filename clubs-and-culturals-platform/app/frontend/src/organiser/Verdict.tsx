import { Icon, ScanResult } from '../shared/ds';
import type { ScanOutcome } from './api';

export type LastScan =
  | { kind: 'outcome'; outcome: ScanOutcome; at: number }
  | { kind: 'queued'; token: string; at: number };

/**
 * The answer at the door, sized to be read at arm's length: the design
 * system's ScanResult in its large form — the station's exact words, a colour
 * and an icon per outcome, then who it is. The backend chooses the outcome.
 */
export function Verdict({ last }: { last: LastScan | null }) {
  if (!last) {
    return (
      <div data-testid="verdict" data-result="idle">
        <ScanResult result="ready" big detail="Hold the pass or profile QR up to the camera." />
      </div>
    );
  }

  if (last.kind === 'queued') {
    return (
      <div key={last.at} data-testid="verdict" data-result="queued">
        <div
          className="cc-scan cc-scan--warn cc-scan--big cc-rise"
          role="status"
          aria-live="assertive"
        >
          <span className="cc-scan-icon">
            <Icon name="upload" size={30} />
          </span>
          <span className="cc-scan-text">
            <span className="cc-scan-label headline">Saved offline</span>
            <span className="cc-scan-sub body-md">
              No connection. The scan is queued on this device and will be checked when the network
              is back. Let them in only if the pass looks right.
            </span>
          </span>
          <span className="cc-scan-offline label-md">offline</span>
        </div>
      </div>
    );
  }

  const o = last.outcome;
  const s = o.student;
  return (
    <div key={last.at} data-testid="verdict" data-result={o.result}>
      <div role="status" aria-live="assertive">
        <ScanResult
          result={o.result}
          label={o.verdict}
          big
          className="cc-rise"
          who={s ? <b className="title-md text-ink">{s.full_name}</b> : undefined}
        >
          {s ? (
            <span className="body-md text-ink">
              <span className="mono-md">{s.prn}</span> · {s.programme} · Year {s.year} ·{' '}
              {s.department}
            </span>
          ) : null}
          {o.detail ? <span className="body-md text-ink">{o.detail}</span> : null}
        </ScanResult>
      </div>
    </div>
  );
}
