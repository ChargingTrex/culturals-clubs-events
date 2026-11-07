/**
 * Render a refusal as itself.
 *
 * A screen that hides a 403 behind "something went wrong" throws away the most
 * useful thing on it. Ported from web-app/src/ui.js `showError`.
 */
import { toProblemDetails } from '../api/client';
import { Icon } from '../ds';

interface Props {
  /** An ApiError, a raw ProblemDetails, or anything thrown. */
  error: unknown;
  className?: string;
}

export function ProblemView({ error, className = '' }: Props) {
  const p = toProblemDetails(error);
  const refused = p.status === 403 || p.status === 404;
  return (
    <div
      role="alert"
      data-testid="problem"
      data-code={p.code}
      className={`my-3 flex gap-3 rounded-md border border-danger bg-danger-soft px-4 py-3.5 text-ink ${className}`}
    >
      <Icon name="alert" className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <strong className="title-sm text-danger">{p.title || 'That did not work'}</strong>
        {p.detail ? <p className="body-md mt-1">{p.detail}</p> : null}
        {p.code ? (
          <p className="mt-2">
            <code className="mono-sm text-ink-muted">
              {p.status ? `${p.status} · ` : ''}
              {p.code}
            </code>
          </p>
        ) : null}
        {refused ? (
          <p className="mt-2.5 text-body-md text-ink-muted">
            This is the rule refusing, not the page hiding a button. Sign in as another role to see
            it allowed.
          </p>
        ) : null}
        {p.errors && p.errors.length > 0 ? (
          <ul className="mt-2.5 ml-4 list-disc text-body-md">
            {p.errors.map((e, i) => (
              <li key={`${e.field}-${i}`}>
                {e.field}: {e.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
