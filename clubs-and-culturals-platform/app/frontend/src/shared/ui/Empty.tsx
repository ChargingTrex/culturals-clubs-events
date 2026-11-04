import type { ReactNode } from 'react';
import { EmptyState } from '../ds';

/** Empty list or page: the design system's EmptyState (glyph tile, message, action). */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <EmptyState
      title={children}
      action={action ? <div className="mt-1">{action}</div> : undefined}
      className="rounded-lg border border-dashed border-line"
    />
  );
}

/** Nothing for --skeleton-delay, then shimmering skeleton rows (motion.css .cc-skel). */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="cc-skel p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="cc-skel-row">
          <i className="cc-skel-line" />
          <div>
            <i className="cc-skel-line w-3/5" />
            <i className="cc-skel-line w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
