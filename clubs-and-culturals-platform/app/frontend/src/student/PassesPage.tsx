import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassOut } from '../shared/api/types';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { QrImage } from '../shared/ui/QrImage';
import { BrightView } from './BrightView';
import { useWallet } from './wallet';

function Ticket({ pass, onShow }: { pass: PassOut; onShow: (pass: PassOut) => void }) {
  return (
    <div
      data-testid="pass"
      className="grid overflow-hidden rounded-md border border-line bg-surface sm:grid-cols-[1fr_170px]"
    >
      <div className="border-b-2 border-dashed border-line px-5 py-5 sm:border-r-2 sm:border-b-0">
        <span className="text-[0.875rem] text-muted">{pass.club} presents</span>
        <h3 className="mt-1.5 mb-2.5 text-[1.3rem]">{pass.title}</h3>
        <p>
          {fmtDate(pass.starts_at)}, {fmtTime(pass.starts_at)}–{fmtTime(pass.ends_at)}
        </p>
        <p className="text-muted">{pass.venue}</p>
        <p className="mt-2.5">
          {pass.attended ? (
            <Pill tone="ok">Checked in</Pill>
          ) : pass.token ? (
            <Pill tone="gold">Valid — not yet used</Pill>
          ) : (
            <Pill>Pass spent</Pill>
          )}
        </p>
      </div>
      <div className="grid place-items-center bg-sunk p-3.5">
        {pass.token ? (
          <button
            type="button"
            className="cursor-pointer rounded-[12px] border border-line bg-white p-2.5"
            onClick={() => onShow(pass)}
            aria-label={`Show pass for ${pass.title} full screen`}
          >
            <QrImage
              value={pass.token}
              size={132}
              alt={`Pass QR for ${pass.title}`}
              fallback={pass.image}
            />
          </button>
        ) : (
          <span className="text-[0.875rem] text-muted">pass spent</span>
        )}
      </div>
    </div>
  );
}

export function PassesPage() {
  const wallet = useWallet();
  const [shown, setShown] = useState<PassOut | null>(null);

  return (
    <>
      <div className="mb-5">
        <h1>My passes</h1>
        <p className="mt-1.5 max-w-[62ch] text-muted">
          Each pass works once, for that event only. A second scan is reported as a duplicate rather
          than quietly counted twice. Tap a code to show it full screen.
        </p>
      </div>

      {wallet.isPending ? (
        <Loading />
      ) : wallet.error ? (
        <ProblemView error={wallet.error} />
      ) : wallet.data.passes.length === 0 ? (
        <Empty
          action={
            <Link className="btn btn-primary" to="/events">
              Find an event
            </Link>
          }
        >
          No passes yet.
        </Empty>
      ) : (
        <div className="flex flex-col gap-3.5">
          {wallet.data.passes.map((p) => (
            <Ticket key={p.registration_id} pass={p} onShow={setShown} />
          ))}
        </div>
      )}

      {wallet.data?.note ? (
        <p className="mt-4 text-[0.875rem] text-muted">{wallet.data.note}</p>
      ) : null}

      {shown?.token ? (
        <BrightView
          value={shown.token}
          title={shown.title}
          subtitle={`${shown.club} · ${shown.venue}`}
          onClose={() => setShown(null)}
        />
      ) : null}
    </>
  );
}
