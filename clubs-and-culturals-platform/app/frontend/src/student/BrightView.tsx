import { useEffect } from 'react';
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white p-6 text-black"
      style={{ filter: 'brightness(1.08)', colorScheme: 'light' }}
      onClick={onClose}
    >
      <div className="text-center">
        <h2 className="text-black">{title}</h2>
        {subtitle ? <p className="text-[0.9rem] text-neutral-600">{subtitle}</p> : null}
      </div>
      <div className="w-[min(88vw,64vh)] rounded-md bg-white p-3 [&>img]:h-auto [&>img]:w-full">
        <QrImage value={value} size={640} alt={`${title} QR`} />
      </div>
      <button type="button" className="btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
