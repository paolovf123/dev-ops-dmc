import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2, Bell, Check, AlertTriangle } from "lucide-react";
import { Btn, TONE, type Tone } from "./ui/kit";

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

// ── Tono + icono por variante ─────────────────────────────────────────────────
const VARIANTS: Record<
  NonNullable<ConfirmOptions["variant"]>,
  { tone: Tone; Icon: typeof Trash2 }
> = {
  danger: { tone: "danger", Icon: Trash2 },
  warning: { tone: "warn", Icon: AlertTriangle },
  default: { tone: "primary", Icon: Bell },
};

function ConfirmCard({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: (result: boolean) => void;
}) {
  // Cierra con Esc (resuelve como cancelado).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const variant = dialog.variant ?? "default";
  const { tone, Icon } = VARIANTS[variant];
  const [fg, bg] = TONE[tone];
  const isDanger = variant === "danger";

  return (
    <div
      onMouseDown={() => onClose(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 220,
        background: "var(--overlay)",
        backdropFilter: "blur(5px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        animation: "ogFade var(--t-mid)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-4)",
          boxShadow: "var(--shadow-4)",
          padding: 22,
          animation: "ogPop var(--t-slow)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 38,
              height: 38,
              flex: "none",
              borderRadius: "var(--r-2)",
              background: bg,
              color: fg,
            }}
          >
            <Icon size={19} />
          </span>
          <div style={{ font: "700 16px var(--font-sans)", color: "var(--text)" }}>
            {dialog.title}
          </div>
        </div>

        {dialog.message && (
          <p
            style={{
              margin: "0 0 18px",
              font: "400 13.5px/1.5 var(--font-sans)",
              color: "var(--text-soft)",
            }}
          >
            {dialog.message}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => onClose(false)}>
            {dialog.cancelLabel ?? "Cancelar"}
          </Btn>
          <Btn
            variant="primary"
            tone={tone}
            icon={isDanger ? <Trash2 size={16} /> : <Check size={16} />}
            onClick={() => onClose(true)}
          >
            {dialog.confirmLabel ?? "Confirmar"}
          </Btn>
        </div>
      </div>
    </div>
  );
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

  const handleClose = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog &&
        createPortal(
          <ConfirmCard dialog={dialog} onClose={handleClose} />,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}
