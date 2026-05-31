import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Check, Plus, LayoutGrid } from "lucide-react";
import { useWorkspace } from "./WorkspaceContext";
import type { Workspace } from "./WorkspaceContext";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";
import { Avatar, Badge, type Tone } from "../components/ui/kit";

function roleTone(role?: string | null): Tone {
  return role === "owner" ? "violet" : role === "admin_ws" ? "primary" : "success";
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
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (ws: Workspace) => {
    setOpen(false);
    const role = ws.my_role;
    if (isAdmin || role === "owner" || role === "admin_ws") navigate(`/ws/${ws.id}`);
    else setCurrent(ws);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post("/workspaces", { name: newName.trim(), description: newDesc.trim() || null });
      await reload();
      setCreating(false); setNewName(""); setNewDesc("");
    } finally { setSaving(false); }
  };

  const menuItem: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
    borderRadius: "var(--r-2)", cursor: "pointer", border: "none", background: "transparent",
    width: "100%", textAlign: "left",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger */}
      <button
        className="og-wsbtn"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 9, padding: "5px 9px 5px 6px",
          borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)",
          cursor: "pointer", color: "var(--text)", boxShadow: "var(--shadow-1)", maxWidth: 240,
        }}
      >
        {current ? (
          <Avatar name={current.name} size={26} square />
        ) : (
          <span style={{
            width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", flex: "none",
            background: "linear-gradient(135deg, var(--accent-pri), var(--accent-calc))", color: "#fff",
          }}><LayoutGrid size={14} /></span>
        )}
        <span style={{ font: "600 14px/1 var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
          {current ? current.name : isAdmin ? "Todos" : "Sin workspace"}
        </span>
        {current?.my_role && <Badge tone={roleTone(current.my_role)}>{current.my_role}</Badge>}
        <ChevronDown size={15} style={{ color: "var(--text-mute)", flex: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--t-mid)" }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="og-pop" style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, minWidth: 270, zIndex: 1000,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
          boxShadow: "var(--shadow-3)", padding: 6,
        }}>
          {isAdmin && (
            <button className="og-menu-item" onClick={() => { setCurrent(null); setOpen(false); navigate("/"); }}
              style={{ ...menuItem, color: !current ? "var(--accent-pri)" : "var(--text)", background: !current ? "var(--pri-soft)" : undefined }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", flex: "none", background: !current ? "var(--accent-pri)" : "var(--surface-alt)", color: !current ? "#fff" : "var(--text-soft)" }}>
                <LayoutGrid size={15} />
              </span>
              <span style={{ flex: 1, font: "600 13.5px/1 var(--font-sans)" }}>Dashboard general</span>
              {!current && <Check size={16} style={{ color: "var(--accent-pri)" }} />}
            </button>
          )}

          <div style={{ padding: "7px 10px 6px", font: "600 11px/1 var(--font-sans)", letterSpacing: ".06em", color: "var(--text-mute)", textTransform: "uppercase" }}>
            Workspaces
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {workspaces.map((ws) => {
              const isActive = current?.id === ws.id;
              return (
                <button key={ws.id} className="og-menu-item" onClick={() => handleSelect(ws)}
                  style={{ ...menuItem, background: isActive ? "var(--pri-soft)" : undefined }}>
                  <Avatar name={ws.name} size={28} square />
                  <span style={{ flex: 1, font: "600 13.5px/1 var(--font-sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name}</span>
                  {ws.my_role && <Badge tone={roleTone(ws.my_role)}>{ws.my_role}</Badge>}
                  {isActive && <Check size={16} style={{ color: "var(--accent-pri)", flex: "none" }} />}
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
              {!creating ? (
                <button className="og-menu-item" onClick={() => setCreating(true)}
                  style={{ ...menuItem, color: "var(--accent-pri)", font: "600 13.5px/1 var(--font-sans)" }}>
                  <Plus size={16} /> Nuevo workspace
                </button>
              ) : (
                <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 7, padding: 4 }}>
                  <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre del equipo *"
                    style={{ padding: "7px 10px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", font: "400 13px/1 var(--font-sans)", outline: "none" }} />
                  <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descripción (opcional)"
                    style={{ padding: "7px 10px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", font: "400 13px/1 var(--font-sans)", outline: "none" }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="submit" disabled={saving || !newName.trim()}
                      style={{ flex: 1, padding: "7px", background: "var(--accent-pri)", border: "none", borderRadius: "var(--r-2)", color: "#fff", cursor: "pointer", font: "600 13px/1 var(--font-sans)" }}>
                      {saving ? "Creando…" : "Crear"}
                    </button>
                    <button type="button" onClick={() => setCreating(false)}
                      style={{ padding: "7px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--r-2)", color: "var(--text-mute)", cursor: "pointer", font: "500 13px/1 var(--font-sans)" }}>✕</button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
