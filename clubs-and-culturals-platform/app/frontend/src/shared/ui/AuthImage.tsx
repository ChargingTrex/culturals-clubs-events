import { useEffect, useState } from 'react';
import { fileUrl } from '../api/files';

/** An image served behind the bearer token, fetched once and shown from an object URL. */
export function AuthImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    fileUrl(src)
      .then((u) => {
        made = u;
        if (live) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  return url ? (
    <img src={url} alt={alt} className={`object-cover ${className}`} />
  ) : (
    <div className={`bg-surface-sunken ${className}`} role="img" aria-label={alt} />
  );
}
