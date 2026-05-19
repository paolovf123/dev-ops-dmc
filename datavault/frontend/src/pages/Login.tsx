import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { AuthUser } from "../auth/AuthContext";

type Mode = "login" | "register";

export default function Login() {
  const { login, user } = useAuth();
  const navigate   = useNavigate();

  if (user) return <Navigate to="/" replace />;
  const [mode, setMode]         = useState<Mode>("login");
  const [email, setEmail]       = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [pending, setPending]   = useState(false);

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
    <div className="login-root">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="app-header-logo" style={{ width: 48, height: 48, fontSize: 22, borderRadius: 12 }}>T</div>
          <div>
            <div className="app-header-name" style={{ fontSize: 22 }}>Trans<em>Excel</em></div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 1 }}>
              Gestión de datos para Paolo Corp
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          <button className={`login-tab${mode === "login" ? " active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}>
            Iniciar sesión
          </button>
          <button className={`login-tab${mode === "register" ? " active" : ""}`}
            onClick={() => { setMode("register"); setError(""); }}>
            Crear cuenta
          </button>
        </div>

        {mode === "register" && (
          <div className="login-info-banner">
            <span style={{ fontSize: 15 }}>ℹ️</span>
            <span>
              El <strong>primer usuario registrado</strong> se convierte automáticamente en administrador.
              Los siguientes usuarios empiezan como <em>viewer</em> hasta que un admin les asigne rol.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" placeholder="tu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>

          {mode === "register" && (
            <div className="form-group">
              <label className="form-label">Nombre de usuario</label>
              <input placeholder="Juan Pérez" value={username}
                onChange={(e) => setUsername(e.target.value)} required />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input type="password" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          {error && (
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          {pending && (
            <div style={{
              background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 10,
              padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>✓</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#15803D" }}>Cuenta creada</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#166534" }}>
                  Un administrador debe aprobarla antes de que puedas iniciar sesión.
                </p>
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: "100%", height: 40, fontSize: 14 }}
            disabled={loading || pending}>
            {loading
              ? (mode === "login" ? "Iniciando sesión…" : "Creando cuenta…")
              : (mode === "login" ? "Iniciar sesión" : "Crear cuenta")}
          </button>
        </form>
      </div>

      {/* Background decoration */}
      <div className="login-bg-decoration" />
    </div>
  );
}
