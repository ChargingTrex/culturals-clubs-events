import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isApiError, request } from '../shared/api/client';
import type { components } from '../shared/api/schema';
import type { Me } from '../shared/api/types';
import { login, useSession } from '../shared/auth/store';
import { meQuery } from '../shared/auth/useCapabilities';
import { firstAllowedPath } from '../shared/nav/pages';
import {
  Avatar,
  buttonClass,
  Chip,
  ClubIcon,
  Icon,
  type Accent,
  type ClubCategory,
  type IconName,
  type Position,
} from '../shared/ds';
import { ProblemView } from '../shared/ui/ProblemView';
import { ThemeToggle } from '../shared/ui/ThemeToggle';

type DemoPersona = components['schemas']['DemoPersona'];
type DemoPersonas = components['schemas']['DemoPersonas'];

/** Persona → the role ring its avatar wears. */
const PERSONA_POSITION: Record<string, Position> = {
  student: 'student',
  member: 'member',
  organiser: 'organiser',
  president: 'president',
  treasurer: 'treasurer',
  secretary: 'secretary',
  society: 'cultural-society',
  dean: 'dean',
  vc: 'vice-chancellor',
};

/**
 * The pilot accounts, one per role — only on a demo server (the endpoint is a
 * 404 anywhere else, and then this renders nothing). Picking one fills the
 * form; signing in still runs the real login, second factor included.
 */
function PilotAccounts({ onPick }: { onPick: (p: DemoPersona) => void }) {
  const personas = useQuery<DemoPersonas>({
    queryKey: ['auth', 'demo-personas'],
    queryFn: () => request<DemoPersonas>('/module/auth/demo/personas'),
    retry: false,
    staleTime: Infinity,
  });
  const list = (personas.data?.personas ?? []).filter((p) => p.available && p.email);
  if (list.length === 0) return null;
  return (
    <section
      className="cc-card p-5 sm:p-6"
      aria-label="Pilot accounts"
      data-testid="pilot-accounts"
    >
      <h2 className="title-lg">Pilot accounts</h2>
      <p className="body-md mt-1 text-ink-muted">
        {list.length} accounts, one per role. Pick one to fill the form — it still signs in
        properly, so you see the same checks a real login makes.
      </p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
        {list.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-sunken focus-visible:shadow-focus focus-visible:outline-none"
              onClick={() => onPick(p)}
              aria-label={`Use the ${p.label} account (${p.email})`}
            >
              <Avatar name={p.name ?? p.label} size="sm" position={PERSONA_POSITION[p.key]} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="title-sm">{p.label}</span>
                  {p.mfa_required ? (
                    <Chip tone="neutral" icon="admin">
                      2FA
                    </Chip>
                  ) : null}
                </span>
                <span className="mono-sm block truncate text-ink-muted">{p.email}</span>
                <span className="caption block text-ink-muted">
                  {p.sub}
                  {p.name ? ` · ${p.name}` : ''}
                </span>
              </span>
              <Icon name="chevron-right" size={16} className="shrink-0 text-ink-subtle" />
            </button>
          </li>
        ))}
      </ul>
      <p className="caption mt-4 text-ink-muted">
        Every pilot account uses the same password. Staff accounts ask for an authenticator code —
        on the demo server any code works, for example <span className="mono-sm">123456</span>.
      </p>
    </section>
  );
}

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
  const submitRef = useRef<HTMLButtonElement>(null);
  const [picked, setPicked] = useState<DemoPersona | null>(null);

  const pick = (p: DemoPersona) => {
    setEmail(p.email ?? '');
    setPassword(p.password ?? '');
    setMfaCode('');
    setError(null);
    setPicked(p);
    if (p.mfa_required) setShowMfa(true);
    else {
      setShowMfa(false);
      submitRef.current?.focus();
    }
    // A staff pick moves focus to the code field (the effect below).
    if (p.mfa_required) mfaRef.current?.focus();
  };

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
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
      {/* Brand panel: always on the dark surface, like the design system's ID card. */}
      <aside
        data-theme="dark"
        className="relative hidden overflow-hidden bg-surface px-12 py-16 text-ink lg:flex lg:flex-col lg:justify-between"
      >
        <div>
          <p className="label-md tracking-[0.08em] text-primary uppercase">Clubs &amp; events</p>
          <p className="large-title mt-2 !text-[48px] !leading-[54px]">Culturals</p>
          <p className="body-lg mt-3 max-w-[36ch] text-ink-muted">
            Clubs and events for a college student portal — proposals, budget approvals through the
            gates, and QR attendance at the door.
          </p>
          <div className="mt-8 flex flex-wrap gap-3" aria-hidden="true">
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

      <main className="relative px-4 pt-14 pb-20 lg:px-10 lg:py-16">
        <div className="absolute top-3 right-3 lg:top-5 lg:right-6">
          <ThemeToggle variant="tonal" />
        </div>

        {/* Phones: the wordmark above the card (the brand panel is desktop-only). */}
        <div className="mb-6 text-center lg:hidden">
          <p className="large-title text-navy">Culturals</p>
          <p className="body-md mt-1 text-ink-muted">Clubs and events at your college</p>
        </div>

        <div className="mx-auto grid max-w-[980px] items-start gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className="grid gap-5 xl:sticky xl:top-8">
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
                <p className="body-md mt-1 text-ink-muted">
                  {picked
                    ? `Filled in for the ${picked.label} account.`
                    : 'Use your institutional account.'}
                </p>
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
                  {picked?.mfa_required ? (
                    <p className="caption mt-1.5 text-ink-muted">
                      Pilot account: any code works on the demo server, e.g. 123456.
                    </p>
                  ) : null}
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

              <button
                ref={submitRef}
                type="submit"
                className={buttonClass('filled', 'lg', true)}
                disabled={busy}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="flex items-start gap-2 border-t border-line pt-4 caption text-ink-muted">
                <Icon name="admin" size={16} className="mt-px shrink-0" />A second factor is
                mandatory for the Dean, Management and the Cultural Society. Everyone else signs in
                with just an email and password.
              </p>
            </form>
          </div>

          <div className="grid gap-5">
            <PilotAccounts onPick={pick} />
            <div className="note">
              <strong>What you are looking at</strong>
              <p className="mt-2">
                A demo server with seeded clubs, events and budgets. The workflow rules are the real
                ones — who may approve what, who may see a budget, who may work a door — so if a
                page refuses you, that is the rule and not a missing button.
              </p>
              <p className="mt-2 text-body-md">
                Sign in as different roles to see the same proposal from both sides: a Treasurer
                raising a budget, then the approvers deciding on it.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
