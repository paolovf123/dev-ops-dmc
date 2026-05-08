import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "./WorkspaceContext";
import type { Workspace } from "./WorkspaceContext";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";

const WS_COLORS = [
  ["#6366F1","#818CF8"], ["#8B5CF6","#A78BFA"], ["#EC4899","#F472B6"],
  ["#F59E0B","#FCD34D"], ["#10B981","#34D399"], ["#0EA5E9","#38BDF8"],
  ["#EF4444","#F87171"], ["#009A44","#34D399"],
];
function wsColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % WS_COLORS.length;
  return WS_COLORS[h];
}

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  owner:   { bg: "#EDE9FE", color: "#7C3AED" },
  manager: { bg: "#E0F2FE", color: "#0284C7" },
  editor:  { bg: "#FEF3C7", color: "#D97706" },
  viewer:  { bg: "#DCFCE7", color: "#16A34A" },
};

function WsAvatar({ name, size = 22 }: { name: string; size?: number }) {
  const [from, to] = wsColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.44, flexShrink: 0,
    }}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function WorkspaceSwitcher() {
  const { workspaces, current, setCurrent, reload } = useWorkspace();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (ws: Workspace) => {
    setOpen(false);
    if (isAdmin) navigate(`/ws/${ws.id}`);
    else setCurrent(ws);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post("/workspaces", { name: newName.trim(), description: newDesc.trim() || null });
      await reload();
      setCreating(false);
      setNewName("");
      setNewDesc("");
    } finally {
      setSaving(false);
    }
  };

  const [fromC] = current ? wsColor(current.name) : ["#009A44"];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 10px 5px 7px",
          background: open ? "var(--color-border-light)" : "transparent",
          border: "1.5px solid " + (open ? "var(--color-border)" : "transparent"),
          borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
          maxWidth: 220,
        }}
        onMouseEnter={(e) => { if (!open) { (e.currentTarget as HTMLElement).style.background = "var(--color-border-light)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)"; } }}
        onMouseLeave={(e) => { if (!open) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; } }}
      >
        {current ? (
          <WsAvatar name={current.name} size={22} />
        ) : (
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: "linear-gradient(135deg, #009A44, #007A36)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
        )}
        <span style={{
          fontSize: 13, fontWeight: 600, color: "var(--color-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140,
        }}>
          {current ? current.name : isAdmin ? "Todos" : "Sin workspace"}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, minWidth: 260,
          background: "var(--color-surface)", border: "1.5px solid var(--color-border)",
          borderRadius: 12, zIndex: 1000, boxShadow: "0 12px 36px rgba(0,0,0,0.14)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--color-border-light)" }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: 0.6, textTransform: "uppercase" }}>
              Workspaces
            </p>
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {/* Ver todos (admin) */}
            {isAdmin && (
              <button
                onClick={() => { setCurrent(null); setOpen(false); navigate("/"); }}
                style={{
                  width: "100%", padding: "9px 14px", background: !current ? "var(--color-primary-bg, #E8F7EE)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 10, transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (current) (e.currentTarget as HTMLElement).style.background = "var(--color-border-light)"; }}
                onMouseLeave={(e) => { if (current) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: !current ? "var(--color-primary, #009A44)" : "var(--color-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: !current ? "var(--color-primary, #009A44)" : "var(--color-text)" }}>
                  Dashboard general
                </span>
                {!current && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #009A44)" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            )}

            {/* Workspaces list */}
            {workspaces.map((ws) => {
              const role = ws.my_role;
              const rs = ROLE_STYLE[role] ?? { bg: "#F1F5F9", color: "#64748B" };
              const isActive = current?.id === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => handleSelect(ws)}
                  style={{
                    width: "100%", padding: "9px 14px",
                    background: isActive ? "var(--color-primary-bg, #E8F7EE)" : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 10, transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--color-border-light)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <WsAvatar name={ws.name} size={22} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ws.name}
                  </span>
                  {isActive && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary, #009A44)" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {role && (
                    <span style={{
                      fontSize: 10, padding: "1px 7px", borderRadius: 99, fontWeight: 700,
                      background: rs.bg, color: rs.color, flexShrink: 0,
                    }}>{role}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer: crear */}
          {isAdmin && (
            <div style={{ borderTop: "1px solid var(--color-border-light)", padding: 10 }}>
              {!creating ? (
                <button
                  onClick={() => setCreating(true)}
                  style={{
                    width: "100%", padding: "7px 12px", display: "flex", alignItems: "center", gap: 7,
                    background: "transparent", border: "1.5px dashed var(--color-border)",
                    borderRadius: 8, cursor: "pointer", color: "var(--color-primary, #009A44)",
                    fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-primary-bg, #E8F7EE)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Nuevo workspace
                </button>
              ) : (
                <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <input
                    autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre del equipo *"
                    style={{ padding: "7px 10px", borderRadius: 7, border: "1.5px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13 }}
                  />
                  <input
                    value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Descripción (opcional)"
                    style={{ padding: "7px 10px", borderRadius: 7, border: "1.5px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13 }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="submit" disabled={saving || !newName.trim()}
                      style={{
                        flex: 1, padding: "7px", background: "var(--color-primary, #009A44)",
                        border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      }}>
                      {saving ? "Creando…" : "Crear"}
                    </button>
                    <button type="button" onClick={() => setCreating(false)}
                      style={{ padding: "7px 12px", background: "transparent", border: "1.5px solid var(--color-border)", borderRadius: 7, color: "var(--color-text-muted)", cursor: "pointer", fontSize: 13 }}>
                      ✕
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
