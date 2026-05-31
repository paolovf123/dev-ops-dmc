import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock, Eye, EyeOff, ArrowRight, AlertTriangle } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../auth/AuthContext";
import { Btn } from "../components/ui/kit";

const fieldLabel: React.CSSProperties = {
  font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 7, display: "block",
};
const fieldBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 13px",
  borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)",
};
const fieldInput: React.CSSProperties = {
  flex: 1, border: "none", background: "transparent", outline: "none",
  color: "var(--text)", font: "400 14.5px/1 var(--font-sans)",
};
const fieldHint: React.CSSProperties = {
  font: "400 12px/1 var(--font-sans)", color: "var(--danger)", marginTop: 6, display: "block",
};

export default function SetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/auth/set-password", { token, password: pw });
      return data as { access_token: string; user: AuthUser };
    },
    onSuccess: (data) => {
      login(data.user);
      navigate("/", { replace: true });
    },
  });

  const tokenInvalid = !token;
  const pwTooShort = pw.length > 0 && pw.length < 8;
  const pwMismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit = pw.length >= 8 && pw === pw2 && !mut.isPending;

  const error = useMemo(() => {
    if (tokenInvalid) return "El link es inválido o está incompleto.";
    if (mut.isError) {
      const e = mut.error as { response?: { data?: { detail?: string } }; message?: string };
      return e.response?.data?.detail ?? e.message ?? "Error al activar la cuenta";
    }
    return null;
  }, [tokenInvalid, mut.isError, mut.error]);

  return (
    <div className="og" style={{
      minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 20,
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-4)",
        padding: "32px 36px", width: "min(420px, 95vw)", boxShadow: "var(--shadow-3)",
      }}>
        <span style={{
          display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: "var(--r-3)",
          background: "var(--pri-soft)", color: "var(--accent-pri)", marginBottom: 18,
        }}><Lock size={22} /></span>

        <h1 style={{ margin: "0 0 6px", font: "700 24px/1.1 var(--font-sans)", letterSpacing: "-.02em" }}>
          Activa tu cuenta
        </h1>
        <p style={{ margin: "0 0 24px", font: "400 14px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>
          Define una contraseña para empezar.
        </p>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 12px",
            borderRadius: "var(--r-2)", background: "var(--danger-soft)", color: "var(--danger)",
            font: "500 13px/1.4 var(--font-sans)",
          }}>
            <AlertTriangle size={16} style={{ flex: "none" }} /> <span>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={{ display: "block" }}>
            <span style={fieldLabel}>Nueva contraseña</span>
            <div style={fieldBox}>
              <input type={show ? "text" : "password"} value={pw} placeholder="Mínimo 8 caracteres" autoFocus
                disabled={tokenInvalid || mut.isPending} onChange={(e) => setPw(e.target.value)} style={fieldInput} />
              <button type="button" aria-label={show ? "Ocultar" : "Ver"} onClick={() => setShow((s) => !s)}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)", padding: 2, display: "inline-flex" }}>
                {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              </button>
            </div>
            {pwTooShort && <span style={fieldHint}>Mínimo 8 caracteres</span>}
          </label>

          <label style={{ display: "block" }}>
            <span style={fieldLabel}>Confirmar contraseña</span>
            <div style={fieldBox}>
              <input type={show ? "text" : "password"} value={pw2} placeholder="••••••••"
                disabled={tokenInvalid || mut.isPending}
                onChange={(e) => setPw2(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) mut.mutate(); }}
                style={fieldInput} />
            </div>
            {pwMismatch && <span style={fieldHint}>Las contraseñas no coinciden</span>}
          </label>
        </div>

        <Btn variant="primary" full disabled={!canSubmit} onClick={() => mut.mutate()}
          iconR={!mut.isPending ? <ArrowRight size={17} /> : undefined}
          style={{ marginTop: 22, height: 46 }}>
          {mut.isPending ? "Activando…" : "Activar y entrar"}
        </Btn>
      </div>
    </div>
  );
}
