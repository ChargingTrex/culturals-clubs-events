import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { Me, PassOut, Preferences, ProfileQr } from '../shared/api/types';
import { logout } from '../shared/auth/store';
import { ME_QUERY_KEY, useCapabilities } from '../shared/auth/useCapabilities';
import {
  accentFor,
  Avatar,
  Button,
  buttonClass,
  CATEGORY_GLYPH,
  Chip,
  ClubIcon,
  ListGroup,
  Switch,
  Tabs,
  topPosition,
} from '../shared/ds';
import { fmtDate, roleLabel } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { QrImage } from '../shared/ui/QrImage';
import { useToast } from '../shared/ui/Toast';
import { BrightView } from './BrightView';
import { LeaveControl } from './clubs';
import { clubRoleLabel, useClubs } from './useClubs';
import { useWallet } from './wallet';
import { WALLET_KEY } from './useRegistration';

// Labels never wrap: four equal tabs at 390px leave "My clubs" one word per line otherwise.
const TABS = [
  { value: 'qr', label: 'QR' },
  { value: 'clubs', label: <span className="whitespace-nowrap">My clubs</span> },
  { value: 'attendance', label: 'Attendance' },
  { value: 'settings', label: 'Settings' },
];

/** F-08.2 "My clubs": memberships with the role held, Leave, and requests still waiting. */
function MyClubsTab() {
  const clubs = useClubs();
  if (clubs.isPending) return <Loading />;
  if (clubs.error) return <ProblemView error={clubs.error} />;
  const mine = clubs.data.results.filter((c) => c.my_role);
  const pending = clubs.data.results.filter((c) => c.my_join_request_state === 'pending');
  const explore = (
    <Link to="/clubs" className={buttonClass('tonal', 'sm')}>
      Explore clubs
    </Link>
  );
  return (
    <div className="flex flex-col gap-3.5">
      {mine.length === 0 ? (
        <Empty action={explore}>You haven&apos;t joined any clubs yet</Empty>
      ) : (
        <ul className="m-0 list-none p-0" data-testid="my-clubs">
          {mine.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ClubIcon
                  name={c.name}
                  accent={accentFor(c.name)}
                  category={CATEGORY_GLYPH[c.category]}
                  size="sm"
                />
                <div className="min-w-0">
                  <strong>{c.name}</strong>
                  <span className="block text-body-md text-ink-muted">
                    {clubRoleLabel(c.my_role ?? 'club_member')}
                    {c.tag ? ` · ${c.tag}` : ''}
                  </span>
                </div>
              </div>
              <LeaveControl club={c} />
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 ? (
        <section className="panel" aria-label="Pending requests">
          <h3>Pending requests</h3>
          <ul className="mt-2 m-0 list-none p-0">
            {pending.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span>{c.name}</span>
                <Chip tone="pending" icon="clock">
                  Requested
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mine.length > 0 ? <div>{explore}</div> : null}
    </div>
  );
}

/** Own attendance only: the passes the door has already scanned. */
function AttendanceTab({ passes }: { passes: PassOut[] }) {
  const attended = passes
    .filter((p) => p.attended)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  if (attended.length === 0) return <Empty>No events attended yet</Empty>;
  return (
    <ListGroup
      items={attended.map((p) => ({
        label: p.title,
        detail: `${p.club} · ${fmtDate(p.starts_at)}`,
        value: (
          <Chip tone="approved" icon="check">
            Checked in
          </Chip>
        ),
      }))}
    />
  );
}

function SettingsTab({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const patch = (prefs: Preferences) =>
    queryClient.setQueryData<Me>(ME_QUERY_KEY, (m) => (m ? { ...m, preferences: prefs } : m));
  const update = useMutation<Preferences, ApiError, boolean, { previous: Preferences }>({
    mutationFn: (on) => api.auth.setPreferences({ personalised_feed: on }),
    onMutate: (on) => {
      const previous = me.preferences;
      patch({ ...previous, personalised_feed: on });
      return { previous };
    },
    onError: (_error, _on, context) => context && patch(context.previous),
    onSuccess: patch,
  });
  const signOut = async () => {
    await logout();
    queryClient.clear();
    navigate('/signin', { replace: true });
  };
  return (
    <div className="flex flex-col gap-3.5">
      <div className="panel">
        <Switch
          checked={me.preferences.personalised_feed}
          disabled={update.isPending}
          onChange={(on) => update.mutate(on)}
          label="Personalised feed"
        />
        <p className="mt-1.5 text-body-md text-ink-muted">
          Show events from your clubs first on the Feed. Off, the Feed is campus-wide in date order.
        </p>
        {update.error ? <ProblemView error={update.error} /> : null}
      </div>
      <div className="panel">
        <Button variant="outlined" icon="logout" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { me } = useCapabilities();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [bright, setBright] = useState(false);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'qr';
  // When the page opened: "upcoming" is judged against this, not re-read each render.
  const [openedAt] = useState(() => Date.now());

  // Desktop side panel: the student's own passes at a glance.
  const passes = wallet.data?.passes;
  const stats = useMemo(() => {
    const all = passes ?? [];
    return {
      total: all.length,
      attended: all.filter((p) => p.attended).length,
      upcoming: all.filter((p) => p.token && new Date(p.starts_at).getTime() > openedAt).length,
      recent: [...all]
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
        .slice(0, 4),
    };
  }, [passes, openedAt]);

  const reissue = useMutation<ProfileQr, ApiError>({
    mutationFn: () => api.participation.reissueProfileQr(),
    onSuccess: async () => {
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: WALLET_KEY });
      toast.show('Reissued — the old code no longer works');
    },
  });

  if (wallet.isPending) return <Loading />;
  if (wallet.error) return <ProblemView error={wallet.error} />;
  const qr = wallet.data.profile_qr;
  const roles = me?.roles ?? [];
  const roleNames = roles
    .map((r) => roleLabel(r))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' · ');

  return (
    <>
      {/* Phones: a heading. Desktop: the same heading as an ID-style banner. */}
      <div className="mb-5 lg:mb-6 lg:flex lg:items-center lg:gap-6 lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:px-7 lg:py-6 lg:shadow-elevation-1">
        <span className="hidden lg:inline-block">
          <Avatar
            name={me?.display_name || undefined}
            size="xl"
            position={topPosition(roles)}
            showPosition
          />
        </span>
        <div className="min-w-0">
          <h1>{me?.display_name ?? ''}</h1>
          <p className="mt-1.5 text-ink-muted">
            {[me?.prn, me?.programme, me?.year != null ? `Year ${me.year}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {roleNames ? (
            <p className="mt-1 hidden text-body-md text-ink-muted lg:block">{roleNames}</p>
          ) : null}
        </div>
      </div>

      <Tabs
        items={TABS}
        value={tab}
        label="Profile sections"
        className="mb-5"
        onChange={(next) =>
          setParams(
            (p) => {
              p.set('tab', next);
              return p;
            },
            { replace: true },
          )
        }
      />

      {tab === 'clubs' ? (
        <MyClubsTab />
      ) : tab === 'attendance' ? (
        <AttendanceTab passes={passes ?? []} />
      ) : tab === 'settings' ? (
        me ? (
          <SettingsTab me={me} />
        ) : (
          <Loading />
        )
      ) : !qr ? (
        <Empty>Only a student holds a profile QR.</Empty>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6">
          <div className="panel text-center">
            <button
              type="button"
              className="inline-flex cursor-pointer rounded-md border border-line bg-qr-paper p-2.5"
              onClick={() => setBright(true)}
              aria-label="Show profile QR full screen"
            >
              <QrImage value={qr.token} size={220} alt="Profile QR" fallback={qr.image} />
            </button>
            <p className="mt-3.5 font-semibold" data-testid="profile-version">
              Your profile QR · v{qr.version}
            </p>
            <p className="text-body-md text-ink-muted">
              Works at any event, including walk-ins — one scan registers you and checks you in.
            </p>

            {!confirming ? (
              <button type="button" className="btn mt-3" onClick={() => setConfirming(true)}>
                Lost your phone? Reissue
              </button>
            ) : (
              <div className="note mt-3 text-left" role="group" aria-label="Confirm reissue">
                <p>
                  Reissue it? The code on this screen stops working at the door immediately, and
                  every copy of it with it. Your event passes are unaffected.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={reissue.isPending}
                    onClick={() => reissue.mutate()}
                  >
                    {reissue.isPending ? 'Reissuing…' : 'Yes, reissue'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => setConfirming(false)}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            )}
            {reissue.error ? <ProblemView error={reissue.error} /> : null}
          </div>

          <div className="flex flex-col gap-3.5 lg:gap-5">
            <dl className="m-0 hidden grid-cols-3 gap-4 lg:grid" data-testid="profile-stats">
              {(
                [
                  ['Passes', stats.total],
                  ['Checked in', stats.attended],
                  ['Upcoming', stats.upcoming],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="panel">
                  <dt className="label-md text-ink-muted">{label}</dt>
                  <dd className="m-0 figure-xl">{value}</dd>
                </div>
              ))}
            </dl>
            {stats.recent.length ? (
              <ListGroup
                className="hidden lg:block"
                header="Recent passes"
                items={stats.recent.map((p) => ({
                  label: p.title,
                  detail: `${p.club} · ${fmtDate(p.starts_at)}`,
                  value: p.attended ? (
                    <Chip tone="approved" icon="check">
                      Checked in
                    </Chip>
                  ) : p.token ? (
                    <Chip tone="in-review">Valid</Chip>
                  ) : (
                    <Chip tone="draft">Spent</Chip>
                  ),
                  chevron: true,
                  onClick: () => navigate('/passes'),
                }))}
              />
            ) : null}
            {wallet.data.note ? <div className="note">{wallet.data.note}</div> : null}
            <div className="panel">
              <h3>Why this is not your PRN</h3>
              <p className="mt-1.5 text-body-md text-ink-muted">
                The code holds a signed reference. Someone photographing it learns nothing about
                you, and reissuing it stops the old one working at the door immediately.
              </p>
            </div>
            <div className="tokenbox" data-testid="profile-token">
              {qr.token}
            </div>
          </div>
        </div>
      )}

      {bright && qr ? (
        <BrightView
          value={qr.token}
          title="Profile QR"
          subtitle={me?.display_name}
          onClose={() => setBright(false)}
        />
      ) : null}
    </>
  );
}
