import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function SetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/auth/set-password", { token, password: pw });
      return data as { access_token: string; user: { id: string; email: string; username: string; role: string } };
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
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--color-bg)", padding: 20,
    }}>
      <div style={{
        background: "var(--color-surface)", borderRadius: 14, padding: "32px 36px",
        width: "min(420px, 95vw)", boxShadow: "0 12px 36px rgba(0,0,0,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <img src="/opsgrid-logo.svg" alt="OpsGrid" style={{ width: 36, height: 36 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Activa tu cuenta</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              Define una contraseña para empezar
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            padding: 10, background: "var(--pm-red-50, #fff5f5)",
            border: "1px solid var(--pm-red-200, #fecaca)", color: "var(--pm-red-600, #b91c1c)",
            borderRadius: 8, fontSize: 13, marginBottom: 14,
          }}>
            ⚠ {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Nueva contraseña</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="Mínimo 8 caracteres" autoFocus
            disabled={tokenInvalid || mut.isPending} />
          {pwTooShort && <span style={{ fontSize: 12, color: "var(--pm-red-500)" }}>Mínimo 8 caracteres</span>}
        </div>

        <div className="form-group">
          <label className="form-label">Confirmar contraseña</label>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) mut.mutate(); }}
            disabled={tokenInvalid || mut.isPending} />
          {pwMismatch && <span style={{ fontSize: 12, color: "var(--pm-red-500)" }}>Las contraseñas no coinciden</span>}
        </div>

        <button className="btn btn-primary"
          disabled={!canSubmit}
          onClick={() => mut.mutate()}
          style={{ width: "100%", marginTop: 8 }}>
          {mut.isPending ? "Activando…" : "Activar cuenta"}
        </button>
      </div>
    </div>
  );
}
