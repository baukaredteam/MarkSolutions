import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface Toast {
  id: number;
  text: string;
}

interface ToastCtx {
  push: (text: string) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}
