import { useEffect } from 'react';
import { Button } from '../shared/ds';
import { QrImage } from '../shared/ui/QrImage';

/**
 * Full-screen, white, large: the code has to scan in a dark hall from a
 * phone held at arm's length. A browser cannot turn the backlight up, so this
 * is the brightest the page itself can be.
 */
export function BrightView({
  value,
  title,
  subtitle,
  onClose,
}: {
  value: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — full screen`}
      data-testid="bright-view"
      data-theme="light"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-qr-paper p-6 text-qr-ink"
      style={{ filter: 'brightness(1.08)', colorScheme: 'light' }}
      onClick={onClose}
    >
      <div className="text-center">
        <p className="label-md tracking-[0.08em] text-qr-ink/70 uppercase">Show at the door</p>
        <h2 className="headline mt-1 text-qr-ink">{title}</h2>
        {subtitle ? <p className="body-md text-qr-ink/70">{subtitle}</p> : null}
      </div>
      <div className="w-[min(88vw,64vh)] rounded-xl bg-qr-paper p-3 shadow-elevation-3 [&>img]:h-auto [&>img]:w-full">
        <QrImage value={value} size={640} alt={`${title} QR`} />
      </div>
      <Button variant="outlined" icon="x" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
