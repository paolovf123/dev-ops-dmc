import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import { Sparkles, Eye, EyeOff, ArrowRight, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../auth/AuthContext";
import AcquireModal from "../components/AcquireModal";
import { Avatar, Btn } from "../components/ui/kit";

type Mode = "login" | "register";

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

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [showAcquire, setShowAcquire] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const switchMode = (m: Mode) => { setMode(m); setError(""); setPending(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(false);
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, username, password };
      const { data } = await api.post<{ access_token: string; user: AuthUser }>(url, body);
      if (!data.user.is_active) { setPending(true); return; }
      login(data.user); // la cookie httpOnly ya la setea el backend
      navigate("/");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Error al iniciar sesión");
      } else {
        setError("Error de conexión");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="og og-auth" style={{
      display: "grid", gridTemplateColumns: "1.05fr 1fr", minHeight: "100vh", background: "var(--bg)",
    }}>
      <style>{`@media (max-width: 880px){ .og-auth{ grid-template-columns:1fr !important; } .og-auth__visual{ display:none !important; } }`}</style>

      {/* ─── Lado visual / marca ─── */}
      <aside className="og-auth__visual" style={{
        position: "relative", overflow: "hidden", color: "#fff", padding: 56,
        display: "flex", flexDirection: "column",
        background: "linear-gradient(150deg, color-mix(in srgb, var(--accent-pri) 92%, #000), color-mix(in srgb, var(--accent-calc) 80%, #000))",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.12,
          backgroundImage: "radial-gradient(#fff 1.2px, transparent 1.2px)", backgroundSize: "26px 26px",
        }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.18)",
            display: "grid", placeItems: "center", font: "800 17px/1 var(--font-sans)",
            border: "1px solid rgba(255,255,255,.3)",
          }}>O</span>
          <span style={{ font: "800 20px/1 var(--font-sans)" }}>OpsGrid</span>
        </div>

        <div style={{ position: "relative", marginTop: "auto" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px",
            borderRadius: "var(--r-pill)", background: "rgba(255,255,255,.16)",
            border: "1px solid rgba(255,255,255,.25)", font: "600 12.5px/1 var(--font-sans)",
          }}>
            <Sparkles size={14} /> Excel en, tablas relacionadas fuera
          </span>
          <h1 style={{ margin: "20px 0 0", font: "800 44px/1.05 var(--font-sans)", letterSpacing: "-.03em" }}>
            Tus Excels caóticos,<br />
            <span style={{ color: "color-mix(in srgb, var(--accent-rel) 70%, #fff)" }}>limpios.</span>
          </h1>
          <p style={{ margin: "16px 0 0", font: "400 16px/1.5 var(--font-sans)", color: "rgba(255,255,255,.85)", maxWidth: 380 }}>
            Sube un Excel → detectamos relaciones → tablas editables en minutos.
          </p>
          <div style={{
            marginTop: 36, padding: 18, borderRadius: "var(--r-3)",
            background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", maxWidth: 400,
          }}>
            <p style={{ margin: 0, font: "500 14.5px/1.5 var(--font-sans)" }}>
              "Migramos 14 planillas dispersas a OpsGrid en una tarde. Nos ahorró semanas."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12 }}>
              <Avatar name="Rosa Quispe" size={28} />
              <span style={{ font: "500 12.5px/1 var(--font-sans)" }}>Rosa Quispe · Ops Lead, Andina SAC</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Lado del formulario ─── */}
      <main style={{ display: "grid", placeItems: "center", padding: 32, overflow: "auto" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {/* Tabs segmentados */}
          <div style={{
            display: "flex", padding: 4, borderRadius: "var(--r-2)", background: "var(--surface-alt)",
            border: "1px solid var(--border)", marginBottom: 26,
          }} role="tablist">
            {([["login", "Entrar"], ["register", "Crear cuenta"]] as [Mode, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={mode === k} onClick={() => switchMode(k)} style={{
                flex: 1, font: "600 13.5px/1 var(--font-sans)", padding: "9px", borderRadius: 6,
                border: "none", cursor: "pointer",
                background: mode === k ? "var(--surface)" : "transparent",
                color: mode === k ? "var(--text)" : "var(--text-soft)",
                boxShadow: mode === k ? "var(--shadow-1)" : "none", transition: "all var(--t-fast)",
              }}>{l}</button>
            ))}
          </div>

          <h2 style={{ margin: "0 0 6px", font: "700 24px/1.1 var(--font-sans)", letterSpacing: "-.02em" }}>
            {mode === "login" ? "Hola de nuevo 👋" : "Crea tu cuenta"}
          </h2>
          <p style={{ margin: "0 0 22px", font: "400 14px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>
            {mode === "login"
              ? "Entra a tu workspace para seguir limpiando datos."
              : "Empieza a convertir tus Excels en tablas relacionadas."}
          </p>

          {mode === "register" && (
            <div style={{
              display: "flex", gap: 9, marginBottom: 18, padding: 12, borderRadius: "var(--r-2)",
              background: "var(--pri-soft)", font: "400 12.5px/1.5 var(--font-sans)", color: "var(--text-soft)",
            }}>
              <Info size={15} style={{ color: "var(--accent-pri)", flex: "none", marginTop: 1 }} />
              <span>
                El <b style={{ color: "var(--text)" }}>primer usuario registrado</b> se vuelve administrador
                automáticamente. Los siguientes empiezan como <em>viewer</em> hasta que un admin les asigne rol.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Correo del trabajo</span>
                <div style={fieldBox}>
                  <input type="email" placeholder="tu@empresa.pe" value={email} required autoFocus
                    onChange={(e) => setEmail(e.target.value)} style={fieldInput} />
                </div>
              </label>

              {mode === "register" && (
                <label style={{ display: "block" }}>
                  <span style={fieldLabel}>Nombre de usuario</span>
                  <div style={fieldBox}>
                    <input type="text" placeholder="Juan Pérez" value={username} required
                      onChange={(e) => setUsername(e.target.value)} style={fieldInput} />
                  </div>
                </label>
              )}

              <label style={{ display: "block" }}>
                <span style={fieldLabel}>Contraseña</span>
                <div style={fieldBox}>
                  <input type={showPw ? "text" : "password"} placeholder="••••••••" value={password}
                    required minLength={6} onChange={(e) => setPassword(e.target.value)} style={fieldInput} />
                  <button type="button" aria-label={showPw ? "Ocultar contraseña" : "Ver contraseña"}
                    onClick={() => setShowPw((v) => !v)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)", padding: 2, display: "inline-flex" }}>
                    {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                </div>
              </label>
            </div>

            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 12px",
                borderRadius: "var(--r-2)", background: "var(--danger-soft)", color: "var(--danger)",
                font: "500 13px/1.4 var(--font-sans)",
              }}>
                <AlertTriangle size={16} style={{ flex: "none" }} /> <span>{error}</span>
              </div>
            )}

            {pending && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 12px",
                borderRadius: "var(--r-2)", background: "var(--success-soft)", color: "var(--success)",
                font: "500 13px/1.4 var(--font-sans)",
              }}>
                <CheckCircle2 size={16} style={{ flex: "none" }} />
                <span><b>Cuenta creada.</b> Un administrador debe aprobarla antes de que puedas iniciar sesión.</span>
              </div>
            )}

            <Btn variant="primary" full type="submit" disabled={loading || pending}
              iconR={!loading ? <ArrowRight size={17} /> : undefined} style={{ marginTop: 22, height: 46 }}>
              {loading ? (mode === "login" ? "Iniciando sesión…" : "Creando cuenta…") : (mode === "login" ? "Entrar" : "Crear cuenta")}
            </Btn>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--text-mute)" }}>o</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <Btn variant="soft" full onClick={() => setShowAcquire(true)} style={{ height: 46 }}>
            Adquiere OpsGrid para tu empresa
          </Btn>

          <p style={{ margin: "16px 0 0", textAlign: "center", font: "400 12.5px/1.6 var(--font-sans)", color: "var(--text-mute)" }}>
            {mode === "login"
              ? <>¿No tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); switchMode("register"); }} style={{ color: "var(--accent-pri)", fontWeight: 600 }}>Crea una en 30 segundos</a></>
              : <>¿Ya tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); switchMode("login"); }} style={{ color: "var(--accent-pri)", fontWeight: 600 }}>Inicia sesión</a></>}
            <br />
            <span style={{ opacity: 0.8 }}>Tu data vive en infraestructura propia · soles peruanos</span>
          </p>
        </div>
      </main>

      <AcquireModal open={showAcquire} onClose={() => setShowAcquire(false)} />
    </div>
  );
}
