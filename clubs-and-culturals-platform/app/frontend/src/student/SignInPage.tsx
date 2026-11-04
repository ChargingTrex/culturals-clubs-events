import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../shared/api/client';
import type { Me } from '../shared/api/types';
import { login, useSession } from '../shared/auth/store';
import { meQuery } from '../shared/auth/useCapabilities';
import { firstAllowedPath } from '../shared/nav/pages';
import {
  Button,
  ClubIcon,
  Icon,
  type Accent,
  type ClubCategory,
  type IconName,
} from '../shared/ds';
import { ProblemView } from '../shared/ui/ProblemView';

/** A safe in-app path to return to after sign-in; anything else is ignored. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/signin'))
    return null;
  return raw;
}

const CLUBS: Array<{ category: ClubCategory; accent: Accent; name: string }> = [
  { category: 'music', accent: 'coral', name: 'Music' },
  { category: 'dance', accent: 'pink', name: 'Dance' },
  { category: 'literary', accent: 'sun', name: 'Literary' },
  { category: 'photography', accent: 'sky', name: 'Photography' },
  { category: 'theatre', accent: 'lime', name: 'Theatre' },
];

const POINTS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'calendar',
    title: 'Events and passes',
    body: 'Register once; your pass and profile QR get you in at the door.',
  },
  {
    icon: 'approval',
    title: 'Approvals through the gates',
    body: 'Cultural Society, Dean, Vice-Chancellor — every decision on the record.',
  },
  {
    icon: 'wallet',
    title: 'Budgets that add up',
    body: 'Priced line by line, sanctioned, spent and settled with receipts.',
  },
];

export function SignInPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const existing = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mfaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showMfa) mfaRef.current?.focus();
  }, [showMfa]);

  const landing = async (): Promise<string> => {
    if (next) return next;
    const me = await queryClient.fetchQuery<Me>(meQuery);
    return firstAllowedPath(me.capabilities);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      queryClient.clear();
      await login({ email, password, mfaCode: showMfa ? mfaCode : undefined });
      navigate(await landing(), { replace: true });
    } catch (err) {
      // A missing second factor is not a failed sign-in: reveal the field and
      // let them finish, rather than making them start again.
      if (isApiError(err) && err.code === 'AUTH_MFA_REQUIRED') setShowMfa(true);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel: always on the dark surface, like the design system's ID card. */}
      <aside
        data-theme="dark"
        className="relative hidden overflow-hidden bg-surface px-14 py-16 text-ink lg:flex lg:flex-col lg:justify-between"
      >
        <div>
          <p className="label-md tracking-[0.08em] text-primary uppercase">Clubs &amp; events</p>
          <p className="large-title mt-2 !text-[48px] !leading-[54px]">Culturals</p>
          <p className="body-lg mt-3 max-w-[40ch] text-ink-muted">
            Clubs and events for a college student portal — proposals, budget approvals through the
            gates, and QR attendance at the door.
          </p>
          <div className="mt-8 flex gap-3" aria-hidden="true">
            {CLUBS.map((c) => (
              <ClubIcon
                key={c.name}
                category={c.category}
                accent={c.accent}
                size="lg"
                name={c.name}
              />
            ))}
          </div>
        </div>
        <ul className="m-0 mt-12 flex list-none flex-col gap-5 p-0">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-soft text-on-primary-soft">
                <Icon name={p.icon} />
              </span>
              <span>
                <span className="title-sm block">{p.title}</span>
                <span className="body-md text-ink-muted">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex items-center justify-center px-4 pt-12 pb-20 lg:px-10 lg:py-16">
        <div className="grid w-full max-w-[440px] gap-5">
          {/* Phones: the wordmark above the card (the brand panel is desktop-only). */}
          <div className="text-center lg:hidden">
            <p className="large-title text-navy">Culturals</p>
            <p className="body-md mt-1 text-ink-muted">Clubs and events at your college</p>
          </div>

          {existing && !next ? (
            <div className="note">
              Still signed in as <strong>{existing.claims.display_name}</strong>.{' '}
              <Link to="/" className="underline">
                Continue
              </Link>
              , or sign in as somebody else below.
            </div>
          ) : null}

          <form className="cc-card flex flex-col gap-4 p-6 sm:p-8" onSubmit={submit} noValidate>
            <div>
              <h1 className="headline">Sign in</h1>
              <p className="body-md mt-1 text-ink-muted">Use your institutional account.</p>
            </div>

            <div>
              <label className="label" htmlFor="email">
                Institutional email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="field"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="field"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {showMfa ? (
              <div data-testid="mfa-row">
                <label className="label" htmlFor="mfaCode">
                  Authenticator code{' '}
                  <span className="font-normal text-ink-muted">(staff roles)</span>
                </label>
                <input
                  id="mfaCode"
                  name="mfaCode"
                  ref={mfaRef}
                  className="field mono-md tracking-[0.2em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 digits"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </div>
            ) : (
              <button
                type="button"
                className="self-start cursor-pointer text-body-md text-link hover:underline"
                onClick={() => setShowMfa(true)}
              >
                I have an authenticator code
              </button>
            )}

            {error ? <ProblemView error={error} /> : null}

            <Button type="submit" size="lg" block disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>

            <p className="flex items-start gap-2 border-t border-line pt-4 caption text-ink-muted">
              <Icon name="admin" size={16} className="mt-px shrink-0" />A second factor is mandatory
              for the Dean, Management and the Cultural Society. Everyone else signs in with just an
              email and password.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
