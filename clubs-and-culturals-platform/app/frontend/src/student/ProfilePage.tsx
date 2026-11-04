import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { ProfileQr } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import { Avatar, Chip, ListGroup, topPosition } from '../shared/ds';
import { fmtDate, roleLabel } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { QrImage } from '../shared/ui/QrImage';
import { useToast } from '../shared/ui/Toast';
import { BrightView } from './BrightView';
import { useWallet } from './wallet';
import { WALLET_KEY } from './useRegistration';

export function ProfilePage() {
  const { me } = useCapabilities();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [bright, setBright] = useState(false);
  const navigate = useNavigate();
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

      {!qr ? (
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
