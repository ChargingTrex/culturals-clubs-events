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

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="body-md p-11 text-center text-ink-muted">
      {label}
    </p>
  );
}
