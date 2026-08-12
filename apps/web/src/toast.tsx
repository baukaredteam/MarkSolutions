import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "info" | "success" | "error" | "warn";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastCtx {
  push: (text: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, kind: ToastKind = "info") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, text }]);
    // UI-SPEC §2: 2.3s
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2300);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}
