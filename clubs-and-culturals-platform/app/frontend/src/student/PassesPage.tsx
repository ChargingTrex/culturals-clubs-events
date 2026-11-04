import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PassOut } from '../shared/api/types';
import { ClubIcon, Icon, accentFor, buttonClass, cx } from '../shared/ds';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { QrImage } from '../shared/ui/QrImage';
import { BrightView } from './BrightView';
import { useWallet } from './wallet';

/** One pass, as the design system's wallet pass: club on its accent, facts, perforation, QR. */
function Ticket({ pass, onShow }: { pass: PassOut; onShow: (pass: PassOut) => void }) {
  const state = pass.attended ? 'used' : pass.token ? 'valid' : 'spent';
  return (
    <article
      data-testid="pass"
      className={cx(
        'cc-pass',
        `cc-acc--${accentFor(pass.club)}`,
        state === 'used' && 'cc-pass--used',
      )}
      aria-label={`Event pass, ${pass.title}`}
    >
      <div className="cc-pass-top">
        <ClubIcon name={pass.club} accent={accentFor(pass.club)} size="sm" />
        <span className="cc-pass-club title-sm">{pass.club} presents</span>
        {pass.attended ? (
          <Pill tone="ok">Checked in</Pill>
        ) : pass.token ? (
          <Pill tone="info">Valid — not yet used</Pill>
        ) : (
          <Pill>Pass spent</Pill>
        )}
      </div>
      <div className="cc-pass-body">
        <h3 className="cc-pass-title title-lg">{pass.title}</h3>
        <dl className="cc-pass-facts">
          <div>
            <dt className="label-md">Date</dt>
            <dd className="title-sm">{fmtDate(pass.starts_at)}</dd>
          </div>
          <div>
            <dt className="label-md">Time</dt>
            <dd className="title-sm">
              {fmtTime(pass.starts_at)}–{fmtTime(pass.ends_at)}
            </dd>
          </div>
          <div>
            <dt className="label-md">Venue</dt>
            <dd className="title-sm">{pass.venue}</dd>
          </div>
        </dl>
      </div>
      <div className="cc-pass-tear" aria-hidden="true" />
      <div className="cc-pass-qr">
        {pass.token ? (
          <button
            type="button"
            className="cursor-pointer rounded-md border border-line bg-qr-paper p-2.5"
            onClick={() => onShow(pass)}
            aria-label={`Show pass for ${pass.title} full screen`}
          >
            <QrImage
              value={pass.token}
              size={168}
              alt={`Pass QR for ${pass.title}`}
              fallback={pass.image}
            />
          </button>
        ) : (
          <div className="cc-pass-void body-md">
            <Icon name="check" size={24} />
            pass spent
          </div>
        )}
      </div>
      <div className="cc-pass-foot caption">
        <Icon name={state === 'valid' ? 'flash' : 'check'} size={16} />
        {state === 'valid'
          ? 'Show this at the entrance — tap the code for full screen, brightness up'
          : state === 'used'
            ? 'Checked in · this pass cannot be used again'
            : 'This pass has been used'}
      </div>
    </article>
  );
}

export function PassesPage() {
  const wallet = useWallet();
  const [shown, setShown] = useState<PassOut | null>(null);

  return (
    <>
      <div className="mb-5">
        <h1>My passes</h1>
        <p className="mt-1.5 max-w-[62ch] text-ink-muted">
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
            <Link className={buttonClass('filled')} to="/events">
              Find an event
            </Link>
          }
        >
          No passes yet.
        </Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {wallet.data.passes.map((p) => (
            <Ticket key={p.registration_id} pass={p} onShow={setShown} />
          ))}
        </div>
      )}

      {wallet.data?.note ? (
        <p className="mt-4 text-body-md text-ink-muted">{wallet.data.note}</p>
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
