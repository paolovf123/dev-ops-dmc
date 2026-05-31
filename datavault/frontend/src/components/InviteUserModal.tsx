import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, X, Check, Copy, ArrowRight, Info } from "lucide-react";
import api from "../api/client";
import { useToast } from "./Toast";
import { useEscapeKey } from "../utils/useEscapeKey";
import { Btn, TONE } from "./ui/kit";

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

// ── estilos de campo (tokens, fieles al frame del handoff) ────────────────────
const fieldLabel: React.CSSProperties = {
  font: "500 12.5px/1 var(--font-sans)", color: "var(--text-soft)",
  marginBottom: 6, display: "block",
};
const fieldInput: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 11px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)",
  font: "400 13.5px/1 var(--font-sans)", color: "var(--text)", outline: "none",
};

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
    toast("Link copiado", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  const [iconFg, iconBg] = TONE.primary;
  const [okFg] = TONE.success;
  const [warnFg, warnBg] = TONE.warn;

  return (
    <div
      onMouseDown={handleClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "var(--overlay)", backdropFilter: "blur(5px)",
        display: "grid", placeItems: "center", padding: 24,
        animation: "ogFade var(--t-mid)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 500, maxHeight: "90vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-4)", boxShadow: "var(--shadow-4)",
          animation: "ogPop var(--t-slow)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{
            display: "grid", placeItems: "center", width: 38, height: 38,
            borderRadius: "var(--r-2)", background: iconBg, color: iconFg, flex: "none",
          }}>
            <Mail size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", color: "var(--text)" }}>Invitar usuario</div>
            <div style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)", marginTop: 3 }}>
              Crea la cuenta y envíale un link para establecer su contraseña
            </div>
          </div>
          <button onClick={handleClose} className="og-iconbtn" style={{
            width: 32, height: 32, display: "grid", placeItems: "center", flex: "none",
            border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "var(--text-mute)",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflow: "auto" }}>
          {!result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Email</span>
                <input
                  type="email" value={email} autoFocus
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="persona@empresa.com"
                  style={fieldInput}
                />
                {cfg?.allowed_email_domains?.length ? (
                  <span style={{ display: "block", marginTop: 6, font: "400 11.5px/1.4 var(--font-sans)", color: "var(--text-mute)" }}>
                    Auto-activación: {cfg.allowed_email_domains.map((d) => `@${d}`).join(", ")}
                  </span>
                ) : null}
              </label>

              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Nombre (opcional)</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && email.trim() && !mut.isPending) mut.mutate(); }}
                  placeholder="Por defecto: parte antes del @"
                  style={fieldInput}
                />
              </label>

              {!cfg?.smtp_configured && (
                <div style={{
                  display: "flex", gap: 9, alignItems: "flex-start",
                  padding: "10px 12px", borderRadius: "var(--r-2)",
                  background: warnBg, color: warnFg,
                  border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                  font: "400 12px/1.5 var(--font-sans)",
                }}>
                  <Info size={15} style={{ flex: "none", marginTop: 1 }} />
                  <span>
                    SMTP no configurado. Después de invitar, copiá el link y envíalo tú.
                    Para habilitar el envío automático, define SMTP_HOST, SMTP_USER, SMTP_PASS en el backend.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{
                padding: 14, borderRadius: "var(--r-3)",
                background: "var(--success-soft)",
                border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13.5px/1 var(--font-sans)", color: okFg }}>
                  <Check size={16} /> Cuenta creada para {result.email}
                </div>
                <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--text-soft)", marginTop: 6 }}>
                  {result.email_sent
                    ? "Email enviado con el link de activación."
                    : "SMTP no configurado: copia el link y envíalo manualmente."}
                </div>
              </div>

              <div>
                <span style={fieldLabel}>Link de activación (válido 72h)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={result.invite_link} readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{ ...fieldInput, flex: 1, font: "500 12px/1 var(--font-mono)" }}
                    className="mono"
                  />
                  <Btn variant="soft" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copyLink}>
                    {copied ? "Copiado" : "Copiar"}
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px",
          borderTop: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          {!result ? (
            <>
              <Btn variant="ghost" onClick={handleClose}>Cancelar</Btn>
              <Btn
                variant="primary"
                iconR={<ArrowRight size={15} />}
                disabled={!email.trim() || mut.isPending}
                onClick={() => mut.mutate()}
              >
                {mut.isPending ? "Enviando…" : "Invitar"}
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="ghost" onClick={reset}>Invitar a otro</Btn>
              <Btn variant="primary" icon={<Check size={15} />} onClick={handleClose}>Listo</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
