import { useRef, useState } from 'react';
import { cx } from './classes';
import { Icon } from './components';

type Held = { name: string; size: number };

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * A file input drawn as a drop zone. The real <input type="file"> covers the
 * zone, so a click opens the chooser, a dropped file lands on it, and labels,
 * `key` resets and `e.target.value = ''` all behave as on a bare input. Every
 * input prop passes through; `className` goes on the zone.
 */
export function FileDrop({
  className,
  onChange,
  multiple,
  disabled,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const input = useRef<HTMLInputElement>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [over, setOver] = useState(false);

  const clear = () => {
    const el = input.current;
    if (!el) return;
    el.value = '';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
  };

  const total = held.reduce((sum, f) => sum + f.size, 0);
  return (
    <div
      className={cx('cc-file', className)}
      data-has-file={held.length > 0 || undefined}
      data-over={(over && !disabled) || undefined}
      data-disabled={disabled || undefined}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && setOver(true)}
      onDragLeave={() => setOver(false)}
      onDrop={() => setOver(false)}
    >
      <input
        {...rest}
        ref={input}
        type="file"
        multiple={multiple}
        disabled={disabled}
        className="cc-file-input"
        onChange={(e) => {
          onChange?.(e);
          // Read after the caller: one that uploads at once empties the input.
          setHeld([...(e.target.files ?? [])].map((f) => ({ name: f.name, size: f.size })));
        }}
      />
      <span className="cc-file-icon" aria-hidden="true">
        <Icon name="upload" />
      </span>
      {held.length > 0 ? (
        <>
          <span className="cc-file-text" data-testid="file-held">
            <span className="cc-file-name body-md">
              {held.length === 1 ? held[0]?.name : `${held.length} files`}
            </span>
            <span className="cc-file-meta caption">{fileSize(total)}</span>
          </span>
          <button
            type="button"
            className="cc-file-clear"
            aria-label={held.length === 1 ? `Remove ${held[0]?.name}` : 'Remove these files'}
            onClick={clear}
          >
            <Icon name="x" size={18} />
          </button>
        </>
      ) : (
        <span className="cc-file-text" aria-hidden="true">
          <span className="cc-file-prompt body-md">
            <span className="cc-file-cta">{multiple ? 'Choose files' : 'Choose a file'}</span>
            <span className="cc-file-or">
              {multiple ? ' or drop them here' : ' or drop it here'}
            </span>
          </span>
        </span>
      )}
    </div>
  );
}
