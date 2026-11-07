import { useEffect, useState } from 'react';
import { qrDataUrl } from './qr';

interface Props {
  /** What the code holds. Rendered client-side. */
  value: string;
  size?: number;
  alt: string;
  /** Server-rendered fallback (data URI) if local drawing fails. */
  fallback?: string | null;
  className?: string;
}

interface Drawn {
  key: string;
  src: string | null;
}

export function QrImage({ value, size = 160, alt, fallback, className }: Props) {
  const key = `${size}|${value}`;
  const [drawn, setDrawn] = useState<Drawn | null>(null);

  useEffect(() => {
    let cancelled = false;
    qrDataUrl(value, size)
      .then((src) => {
        if (!cancelled) setDrawn({ key, src });
      })
      .catch(() => {
        if (!cancelled) setDrawn({ key, src: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, value, size]);

  const current = drawn?.key === key ? drawn : null;
  if (current === null) {
    return (
      <div
        aria-busy="true"
        className={className}
        style={{ width: size, height: size }}
        data-testid="qr-pending"
      />
    );
  }
  const src = current.src ?? fallback ?? null;
  if (!src) {
    return (
      <div className="tokenbox" data-testid="qr-token-fallback">
        {value}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      data-qr-value={value}
    />
  );
}
