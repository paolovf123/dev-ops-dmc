import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface InviteResponse {
  user_id: string;
  email: string;
  invite_link: string;
  email_sent: boolean;
}

interface SignupConfig {
  allowed_email_domains: string[];
  smtp_configured: boolean;
}

export default function InviteUserModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);
  useEscapeKey(onClose, open);

  const { data: cfg } = useQuery<SignupConfig>({
    queryKey: ["signup-config"],
    queryFn: () => api.get<SignupConfig>("/auth/signup-config").then((r) => r.data),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<InviteResponse>("/auth/invite", { email: email.trim().toLowerCase(), username: username.trim() });
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["users"] });
      toast(data.email_sent ? `Invitación enviada a ${data.email}` : "Invitación creada (SMTP no configurado — copia el link manualmente)", "success");
    },
    onError: (e: Error & { response?: { data?: { detail?: string } } }) => {
      toast(e.response?.data?.detail ?? e.message ?? "Error al invitar", "error");
    },
  });

  const reset = () => {
    setEmail(""); setUsername(""); setResult(null); setCopied(false);
    mut.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  const copyLink = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "24px 28px",
        width: "min(520px, 95vw)", display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>📨</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Invitar usuario</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
              Crea la cuenta y envíale un link para establecer su contraseña
            </p>
          </div>
          <button className="btn btn-ghost" onClick={handleClose}
            style={{ marginLeft: "auto", padding: "4px 8px", fontSize: 18 }}>×</button>
        </div>

        {!result ? (
          <>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Email</label>
              <input type="email" value={email} autoFocus
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@empresa.com" />
              {cfg?.allowed_email_domains?.length ? (
                <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                  Auto-activación: {cfg.allowed_email_domains.map((d) => `@${d}`).join(", ")}
                </span>
              ) : null}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre (opcional)</label>
              <input value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email.trim() && !mut.isPending) mut.mutate(); }}
                placeholder="Por defecto: parte antes del @" />
            </div>

            {!cfg?.smtp_configured && (
              <p style={{
                margin: 0, fontSize: 12, color: "var(--pm-orange-700, #a16207)",
                background: "var(--pm-orange-50, #fefce8)",
                border: "1px solid var(--pm-orange-200, #fde68a)",
                padding: "8px 12px", borderRadius: 8,
              }}>
                ℹ SMTP no configurado. Después de invitar, copiá el link y envíalo tú.
                Para habilitar el envío automático, define SMTP_HOST, SMTP_USER, SMTP_PASS en el backend.
              </p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
              paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
              <button className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
              <button className="btn btn-primary"
                disabled={!email.trim() || mut.isPending}
                onClick={() => mut.mutate()}>
                {mut.isPending ? "Enviando…" : "Invitar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              padding: 14, background: "var(--color-primary-bg)",
              border: "1px solid var(--color-primary-border)", borderRadius: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                ✓ Cuenta creada para {result.email}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {result.email_sent
                  ? "Email enviado con el link de activación."
                  : "SMTP no configurado: copia el link y envíalo manualmente."}
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Link de activación (válido 72h)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={result.invite_link} readOnly
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}
                  onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button className="btn btn-secondary" onClick={copyLink} style={{ whiteSpace: "nowrap" }}>
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end",
              paddingTop: 12, borderTop: "1px solid var(--color-border-light)" }}>
              <button className="btn btn-secondary" onClick={reset}>Invitar a otro</button>
              <button className="btn btn-primary" onClick={handleClose}>Listo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
