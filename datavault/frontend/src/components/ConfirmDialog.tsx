import { createContext, useContext, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
}

type ResolveFn = (value: boolean) => void;

interface DialogState extends ConfirmOptions {
  resolve: ResolveFn;
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  async () => false
);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolveRef = useRef<ResolveFn | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialog({ ...opts, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    resolveRef.current?.(result);
    setDialog(null);
  };

  const VARIANT_STYLES = {
    danger:  { icon: "🗑", iconBg: "#FEE2E2", iconColor: "#EF4444", btnClass: "btn-danger" },
    warning: { icon: "⚠️", iconBg: "#FEF3C7", iconColor: "#D97706", btnClass: "btn-warning" },
    default: { icon: "❓", iconBg: "var(--color-border-light)", iconColor: "var(--color-text-secondary)", btnClass: "btn-primary" },
  };

  const v = VARIANT_STYLES[dialog?.variant ?? "default"];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && createPortal(
        <div className="modal-overlay confirm-overlay"
          onClick={(e) => e.target === e.currentTarget && handleClose(false)}>
          <div className="modal modal-v2 confirm-modal">
            <div className="modal-accent" style={{
              background: dialog.variant === "danger" ? "var(--pm-red-500)"
                : dialog.variant === "warning" ? "#F59E0B"
                : "var(--color-primary)",
            }} />

            <div className="confirm-body">
              <div className="confirm-icon" style={{ background: v.iconBg, color: v.iconColor }}>
                {v.icon}
              </div>
              <h3 className="confirm-title">{dialog.title}</h3>
              {dialog.message && (
                <p className="confirm-message">{dialog.message}</p>
              )}
            </div>

            <div className="confirm-footer">
              <button className="btn btn-secondary" onClick={() => handleClose(false)}
                autoFocus>
                {dialog.cancelLabel ?? "Cancelar"}
              </button>
              <button
                className={`btn ${dialog.variant === "danger" ? "btn-danger-solid" : "btn-primary"}`}
                onClick={() => handleClose(true)}>
                {dialog.confirmLabel ?? "Aceptar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}
