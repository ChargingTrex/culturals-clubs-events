import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError } from '../shared/api/client';
import type { Me } from '../shared/api/types';
import { login, useSession } from '../shared/auth/store';
import { meQuery } from '../shared/auth/useCapabilities';
import { firstAllowedPath } from '../shared/nav/pages';
import { ProblemView } from '../shared/ui/ProblemView';

/** A safe in-app path to return to after sign-in; anything else is ignored. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/signin'))
    return null;
  return raw;
}

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
    <div className="mx-auto max-w-[1000px] px-4 pt-11 pb-20">
      <div className="mb-8 text-center">
        <h1 className="mb-2.5 text-[2rem]">Culturals</h1>
        <p className="mx-auto max-w-[58ch] text-muted">
          Clubs and events for a college student portal — proposals, budget approvals through the
          gates, and QR attendance at the door.
        </p>
      </div>

      <div className="mx-auto grid max-w-[460px] gap-5">
        {existing && !next ? (
          <div className="note">
            Still signed in as <strong>{existing.claims.display_name}</strong>.{' '}
            <Link to="/" className="underline">
              Continue
            </Link>
            , or sign in as somebody else below.
          </div>
        ) : null}

        <form className="panel" onSubmit={submit} noValidate>
          <h2 className="mb-1 text-[1.05rem]">Sign in</h2>
          <p className="mb-4 text-[0.875rem] text-muted">Use your institutional account.</p>

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

          <label className="label mt-3" htmlFor="password">
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

          {showMfa ? (
            <div data-testid="mfa-row">
              <label className="label mt-3" htmlFor="mfaCode">
                Authenticator code <span className="font-normal text-muted">(staff roles)</span>
              </label>
              <input
                id="mfaCode"
                name="mfaCode"
                ref={mfaRef}
                className="field"
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
              className="mt-2 cursor-pointer text-[0.8rem] text-muted underline"
              onClick={() => setShowMfa(true)}
            >
              I have an authenticator code
            </button>
          )}

          {error ? <ProblemView error={error} /> : null}

          <button
            type="submit"
            className="btn btn-primary mt-4 w-full justify-center"
            disabled={busy}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-3.5 text-[0.875rem] text-muted">
            A second factor is mandatory for the Dean, Management and the Cultural Society. Everyone
            else signs in with just an email and password.
          </p>
        </form>
      </div>
    </div>
  );
}
