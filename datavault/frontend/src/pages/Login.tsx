import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import { Sparkles, Eye, EyeOff, ArrowRight, Info, CheckCircle2, AlertTriangle, Briefcase } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../auth/AuthContext";
import AcquireModal from "../components/AcquireModal";

type Mode = "login" | "register";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [showAcquire, setShowAcquire] = useState(false);

  const switchMode = (m: Mode) => { setMode(m); setError(""); setPending(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(false);
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login"
        ? { email, password }
        : { email, username, password };

      const { data } = await api.post<{ access_token: string; user: AuthUser }>(url, body);

      if (!data.user.is_active) {
        setPending(true);
        return;
      }

      // El backend ya seteó la cookie httpOnly `dv_token`; solo guardamos el user
      login(data.user);
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
    <div className="og og-fill">
    <div className="auth">
      {/* ─── Lado visual / marca ─── */}
      <aside className="auth__visual">
        <div className="auth__logo">
          <span className="auth__logo-mark" />
          OpsGrid
        </div>

        <div className="auth__body">
          <span className="auth__eyebrow"><Sparkles /> Excel en, tablas relacionadas fuera</span>
          <h1>Tus Excels<br />caóticos, <em>limpios.</em></h1>
          <p>
            Sube tu hoja desordenada: OpsGrid detecta relaciones, limpia los datos
            y te deja tablas conectadas en minutos.
          </p>
        </div>

        <div className="auth__quote">
          <p>"De 14 Excels que nadie entendía a un dataset con tablas relacionadas y scripts de cálculo, en una mañana."</p>
          <div className="auth__quote-attr">
            <span>Gestión de datos para Paolo Corp · soles peruanos</span>
          </div>
        </div>
      </aside>

      {/* ─── Lado del formulario ─── */}
      <main className="auth__form-wrap">
        <div className="auth__form">
          <div className="auth__tabs" role="tablist">
            <label>
              <input type="radio" name="mode" checked={mode === "login"} onChange={() => switchMode("login")} />
              <span>Entrar</span>
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === "register"} onChange={() => switchMode("register")} />
              <span>Crear cuenta</span>
            </label>
          </div>

          <h2>{mode === "login" ? "Hola de nuevo 👋" : "Crea tu cuenta"}</h2>
          <p className="auth__intro">
            {mode === "login"
              ? "Entra a tu workspace para seguir limpiando datos."
              : "Empieza a convertir tus Excels en tablas relacionadas."}
          </p>

          {mode === "register" && (
            <div className="auth__note auth__note--info">
              <Info />
              <span>
                El <b>primer usuario registrado</b> se vuelve administrador automáticamente.
                Los siguientes empiezan como <em>viewer</em> hasta que un admin les asigne rol.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="auth__field">
              <label htmlFor="email">Correo del trabajo</label>
              <input
                className="input" id="email" type="email" placeholder="tu@email.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
              />
            </div>

            {mode === "register" && (
              <div className="auth__field">
                <label htmlFor="username">Nombre de usuario</label>
                <input
                  className="input" id="username" type="text" placeholder="Juan Pérez"
                  value={username} onChange={(e) => setUsername(e.target.value)} required
                />
              </div>
            )}

            <div className="auth__field">
              <label htmlFor="pw">Contraseña</label>
              <span className="input-affix">
                <input
                  className="input" id="pw" type={showPw ? "text" : "password"} placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button" aria-label={showPw ? "Ocultar contraseña" : "Ver contraseña"}
                  onClick={() => setShowPw((v) => !v)}
                  style={{
                    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                    width: 28, height: 28,
                    border: 0, background: "transparent", color: "var(--text-mute)",
                    cursor: "pointer", padding: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "var(--r-1)",
                  }}
                >
                  {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                </button>
              </span>
            </div>

            {error && (
              <div className="auth__note auth__note--err">
                <AlertTriangle /> <span>{error}</span>
              </div>
            )}

            {pending && (
              <div className="auth__note auth__note--ok">
                <CheckCircle2 />
                <span>
                  <b>Cuenta creada.</b> Un administrador debe aprobarla antes de que puedas iniciar sesión.
                </span>
              </div>
            )}

            <button className="btn btn--primary auth__submit" type="submit" disabled={loading || pending}>
              {loading
                ? (mode === "login" ? "Iniciando sesión…" : "Creando cuenta…")
                : (<>{mode === "login" ? "Entrar" : "Crear cuenta"} <ArrowRight /></>)}
            </button>
          </form>

          <p className="auth__footer">
            {mode === "login" ? (
              <>¿No tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); switchMode("register"); }}>Crea una en 30 segundos</a></>
            ) : (
              <>¿Ya tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); switchMode("login"); }}>Inicia sesión</a></>
            )}
            <br />
            <span style={{ opacity: 0.7 }}>Tu data vive en infraestructura propia · soles peruanos</span>
          </p>

          {/* CTA comercial: adquirir el software para empresas */}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setShowAcquire(true)}
            style={{ width: "100%", marginTop: "var(--sp-3)", gap: 8 }}
          >
            <Briefcase size={14} strokeWidth={1.75} /> Adquiere OpsGrid para tu empresa
          </button>
        </div>
      </main>

      <AcquireModal open={showAcquire} onClose={() => setShowAcquire(false)} />
    </div>
    </div>
  );
}
