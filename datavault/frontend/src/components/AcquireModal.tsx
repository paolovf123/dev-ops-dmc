import { useState } from "react";
import { X, Mail, Building2, User, MessageSquare, Send, Check } from "lucide-react";

const SALES_EMAIL = "ventas@opsgrid.com"; // TODO: configurar correo real de ventas

interface Props { open: boolean; onClose: () => void; }

/**
 * AcquireModal — captura interés de compra del software.
 * Sin backend: arma un mailto con los datos pre-llenados. Si quieres CRM real,
 * reemplaza el `handleSubmit` por un POST a /sales/leads (cuando exista).
 */
export default function AcquireModal({ open, onClose }: Props) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [equipo, setEquipo] = useState("10-50");
  const [mensaje, setMensaje] = useState("");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = `Adquirir OpsGrid — ${empresa || nombre}`;
    const body =
      `Hola equipo OpsGrid,\n\nQuiero adquirir OpsGrid para mi empresa.\n\n` +
      `Nombre: ${nombre}\nEmpresa: ${empresa}\nEmail: ${email}\nTamaño de equipo: ${equipo}\n\n` +
      `Mensaje:\n${mensaje}\n`;
    window.location.href = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-v2" style={{ maxWidth: 520, width: "100%" }}>
        <div className="modal-accent" style={{ background: "linear-gradient(90deg, var(--accent-pri), var(--accent-calc))" }} />

        <div className="modal-header" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 22px 16px", borderBottom: "1px solid var(--border-soft)" }}>
          <div className="modal-header-icon" style={{ background: "var(--accent-pri-soft)", color: "var(--accent-pri)" }}>
            <Send size={18} strokeWidth={1.75} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: "var(--fs-15)", fontWeight: 600 }}>Adquiere OpsGrid</h3>
            <p style={{ margin: "2px 0 0", fontSize: "var(--fs-12)", color: "var(--text-soft)" }}>
              Conversemos sobre tu equipo. Te respondemos en menos de 24h.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field icon={<User size={14} />} label="Tu nombre">
            <input className="input" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
          </Field>
          <Field icon={<Building2 size={14} />} label="Empresa">
            <input className="input" required value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Mi Empresa S.A.C." />
          </Field>
          <Field icon={<Mail size={14} />} label="Correo de trabajo">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
          </Field>
          <Field label="Tamaño del equipo">
            <select className="input" value={equipo} onChange={(e) => setEquipo(e.target.value)}>
              <option value="1-10">1 – 10 personas</option>
              <option value="10-50">10 – 50 personas</option>
              <option value="50-200">50 – 200 personas</option>
              <option value="200+">Más de 200</option>
            </select>
          </Field>
          <Field icon={<MessageSquare size={14} />} label="Cuéntanos qué buscas">
            <textarea className="input" rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)}
              placeholder="¿Qué Excels o procesos quieres digitalizar? ¿Cuánto data manejan?"
              style={{ height: "auto", padding: "8px 12px", resize: "vertical", minHeight: 80, fontFamily: "inherit" }} />
          </Field>

          <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: "var(--fs-12)", color: "var(--text-soft)" }}>
            <li style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={12} color="var(--success)" /> Demo personalizada</li>
            <li style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={12} color="var(--success)" /> Precios por volumen</li>
            <li style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={12} color="var(--success)" /> Hosting en tu infra</li>
            <li style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={12} color="var(--success)" /> Onboarding del equipo</li>
          </ul>

          <div className="modal-footer" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, padding: "14px 22px", background: "var(--surface-alt)", borderTop: "1px solid var(--border-soft)", borderBottomLeftRadius: "var(--r-4)", borderBottomRightRadius: "var(--r-4)" }}>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn--primary">
              <Send size={14} strokeWidth={1.75} /> Enviar a ventas
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: "var(--fs-12)", color: "var(--text-soft)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}>
        {icon}{label}
      </label>
      {children}
    </div>
  );
}
