import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { ProfileQr } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
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

  return (
    <>
      <div className="mb-5">
        <h1>{me?.display_name ?? ''}</h1>
        <p className="mt-1.5 text-muted">
          {[me?.prn, me?.programme, me?.year != null ? `Year ${me.year}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {!qr ? (
        <Empty>Only a student holds a profile QR.</Empty>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          <div className="panel text-center">
            <button
              type="button"
              className="inline-flex cursor-pointer rounded-[12px] border border-line bg-white p-2.5"
              onClick={() => setBright(true)}
              aria-label="Show profile QR full screen"
            >
              <QrImage value={qr.token} size={220} alt="Profile QR" fallback={qr.image} />
            </button>
            <p className="mt-3.5 font-semibold" data-testid="profile-version">
              Your profile QR · v{qr.version}
            </p>
            <p className="text-[0.875rem] text-muted">
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

          <div className="flex flex-col gap-3.5">
            {wallet.data.note ? <div className="note">{wallet.data.note}</div> : null}
            <div className="panel">
              <h3>Why this is not your PRN</h3>
              <p className="mt-1.5 text-[0.875rem] text-muted">
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
