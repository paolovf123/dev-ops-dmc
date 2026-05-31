import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TONE } from "./ui/kit";
import type { Tone } from "./ui/kit";

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

// variant → [icono lucide, tono del kit]
const META: Record<ToastVariant, [LucideIcon, Tone]> = {
  success: [CheckCircle2, "success"],
  error:   [XCircle, "danger"],
  warning: [AlertTriangle, "warn"],
  info:    [Info, "primary"],
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
      <div
        style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 240,
          display: "flex", flexDirection: "column", gap: 10,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const [IconCmp, tone] = META[t.variant] || META.info;
          const [fg] = TONE[tone];
          return (
            <div
              key={t.id}
              className="og-slide"
              onClick={() => dismiss(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 15px", minWidth: 240, maxWidth: 360,
                borderRadius: "var(--r-3)", background: "var(--surface)",
                border: "1px solid var(--border)", boxShadow: "var(--shadow-3)",
                cursor: "pointer", pointerEvents: "auto",
              }}
            >
              <span
                style={{
                  display: "grid", placeItems: "center", width: 22, height: 22,
                  borderRadius: 999, background: fg, color: "#fff", flex: "none",
                }}
              >
                <IconCmp size={13} />
              </span>
              <span style={{ font: "500 13px var(--font-sans)", color: "var(--text)", flex: 1 }}>
                {t.message}
              </span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
