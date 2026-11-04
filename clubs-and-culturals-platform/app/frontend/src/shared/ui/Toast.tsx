import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../ds';

interface Toast {
  id: number;
  text: string;
}

interface ToastApi {
  show: (text: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3400);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-[calc(var(--navbar-height)+var(--space-5)+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex w-[min(460px,92vw)] -translate-x-1/2 flex-col gap-2 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="flex items-center gap-2.5 rounded-md border border-line bg-surface-raised px-4 py-3 text-body-md text-ink shadow-elevation-3"
          >
            <Icon name="check" size={18} className="shrink-0 text-success" />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
