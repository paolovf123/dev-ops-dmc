import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error:   "✕",
  warning: "⚠",
  info:    "ℹ",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.variant}`} onClick={() => dismiss(t.id)}>
            <span className={`toast-icon toast-icon--${t.variant}`}>{ICONS[t.variant]}</span>
            <span className="toast-message">{t.message}</span>
            <button className="toast-close">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
