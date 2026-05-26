import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useToast } from "../components/Toast";
import { useWorkspace } from "../workspace/WorkspaceContext";
import UserMenu from "../components/UserMenu";

interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  workspace_id: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

interface WebhookRow {
  id: string;
  workspace_id: string | null;
  dataset_id: string | null;
  url: string;
  events: string[];
  active: boolean;
  has_secret: boolean;
  created_at: string;
  last_fired_at: string | null;
  last_status: number | null;
  fail_count: number;
}

const VALID_EVENTS = [
  { value: "record.create", label: "Registro creado" },
  { value: "record.update", label: "Registro actualizado" },
  { value: "record.delete", label: "Registro eliminado" },
  { value: "dataset.create", label: "Dataset creado" },
  { value: "dataset.delete", label: "Dataset eliminado" },
];

export default function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"tokens" | "webhooks">("tokens");

  return (
    <>
      <header className="app-header">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}
          style={{ padding: "5px 8px", fontSize: 18 }}>←</button>
        <button className="app-brand-btn" onClick={() => navigate("/")}>
          <div className="app-header-logo"><img src="/opsgrid-logo.svg" alt="OpsGrid" /></div>
          <span className="app-header-name">Ops<em>Grid</em></span>
        </button>
        <div className="app-header-spacer" />
        <UserMenu />
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Integraciones</h1>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 20px" }}>
          API tokens y webhooks para conectar OpsGrid con otros sistemas
        </p>

        <div style={{ display: "flex", borderBottom: "1.5px solid var(--color-border)", marginBottom: 18 }}>
          {([["tokens", "🔑 API tokens"], ["webhooks", "🔔 Webhooks"]] as const).map(([k, label]) => (
            <button key={k}
              onClick={() => setTab(k)}
              style={{
                padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                border: "none", background: "transparent",
                color: tab === k ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: tab === k ? "2.5px solid var(--color-primary)" : "2.5px solid transparent",
                marginBottom: "-1.5px",
              }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "tokens" ? <TokensPanel /> : <WebhooksPanel />}
      </div>
    </>
  );
}

function TokensPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [justCreated, setJustCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: tokens = [], isLoading } = useQuery<ApiTokenRow[]>({
    queryKey: ["api-tokens"],
    queryFn: () => api.get<ApiTokenRow[]>("/api-tokens").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/api-tokens", { name: name.trim(), scope });
      return data as ApiTokenRow & { token: string };
    },
    onSuccess: (data) => {
      setJustCreated({ token: data.token, name: data.name });
      setCreating(false); setName(""); setScope("read");
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (e: Error) => toast(e.message ?? "Error al crear token", "error"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api-tokens/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-tokens"] }); toast("Token revocado", "success"); },
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
          Usá el header <code>Authorization: Bearer {"<token>"}</code> en tus requests.
        </p>
        {!creating && !justCreated && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Crear token</button>
        )}
      </div>

      {justCreated && (
        <div style={{
          padding: 16, marginBottom: 14,
          background: "var(--color-primary-bg)", border: "1px solid var(--color-primary-border)", borderRadius: 10,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Token creado: {justCreated.name}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
            Copialo ahora — no se mostrará de nuevo.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={justCreated.token} readOnly
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}
              onClick={(e) => (e.target as HTMLInputElement).select()} />
            <button className="btn btn-secondary"
              onClick={() => { navigator.clipboard.writeText(justCreated.token); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
            <button className="btn btn-ghost" onClick={() => setJustCreated(null)}>Listo</button>
          </div>
        </div>
      )}

      {creating && (
        <div style={{
          padding: 16, marginBottom: 14,
          background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10,
        }}>
          <div className="form-group" style={{ margin: 0, marginBottom: 10 }}>
            <label className="form-label">Nombre</label>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Integración con Slack" />
          </div>
          <div className="form-group" style={{ margin: 0, marginBottom: 12 }}>
            <label className="form-label">Permisos</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}>
              <option value="read">Solo lectura</option>
              <option value="write">Lectura + escritura</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Creando…" : "Crear"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setName(""); }}>Cancelar</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Cargando…</p>
      ) : tokens.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 40 }}>
          No tienes tokens. Crea uno para integrar con sistemas externos.
        </p>
      ) : (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          {tokens.map((t) => (
            <div key={t.id} style={{
              padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)",
              display: "flex", alignItems: "center", gap: 12,
              opacity: t.revoked ? 0.5 : 1,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {t.name} {t.revoked && <span style={{ fontSize: 11, color: "var(--pm-red-500)" }}>· revocado</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                  <code style={{ fontFamily: "var(--font-mono)" }}>{t.prefix}…</code>
                  · scope: <b>{t.scope}</b>
                  · creado {new Date(t.created_at).toLocaleDateString("es-PE")}
                  {t.last_used_at && ` · último uso ${new Date(t.last_used_at).toLocaleDateString("es-PE")}`}
                </div>
              </div>
              {!t.revoked && (
                <button className="btn btn-ghost" style={{ color: "var(--pm-red-500)", fontSize: 12 }}
                  onClick={() => { if (confirm(`Revocar "${t.name}"? Las requests con este token dejarán de funcionar.`)) revokeMut.mutate(t.id); }}>
                  Revocar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhooksPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { current: workspace } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["record.create", "record.update", "record.delete"]);
  const [secretShown, setSecretShown] = useState<{ id: string; secret: string } | null>(null);

  const { data: hooks = [], isLoading } = useQuery<WebhookRow[]>({
    queryKey: ["webhooks", workspace?.id],
    queryFn: () => api.get<WebhookRow[]>("/webhooks", {
      params: workspace ? { workspace_id: workspace.id } : {},
    }).then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/webhooks", {
        url: url.trim(), events,
        workspace_id: workspace?.id ?? null,
      });
      return data as { id: string; secret: string };
    },
    onSuccess: (data) => {
      setSecretShown({ id: data.id, secret: data.secret });
      setCreating(false); setUrl("");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (e: Error) => toast(e.message ?? "Error al crear webhook", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); toast("Webhook eliminado", "success"); },
  });

  const testMut = useMutation({
    mutationFn: (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: (r) => { toast(`Test enviado · status ${r.data.status ?? "n/a"}`, "success"); qc.invalidateQueries({ queryKey: ["webhooks"] }); },
    onError: (e: Error) => toast(e.message ?? "Error en test", "error"),
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
          {workspace ? <>Webhooks del workspace <b>{workspace.name}</b></> : "Webhooks globales"} · disparados al ocurrir eventos
        </p>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Crear webhook</button>
        )}
      </div>

      {secretShown && (
        <div style={{
          padding: 14, marginBottom: 14,
          background: "var(--color-primary-bg)", border: "1px solid var(--color-primary-border)", borderRadius: 10,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ Webhook creado — guarda el secret:</div>
          <input readOnly value={secretShown.secret}
            style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: "100%", marginBottom: 8 }}
            onClick={(e) => (e.target as HTMLInputElement).select()} />
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            Cada request lleva el header <code>X-OpsGrid-Signature: sha256=...</code> generado con este secret.
            <button className="btn btn-ghost" style={{ marginLeft: 8, fontSize: 11 }}
              onClick={() => setSecretShown(null)}>Ocultar</button>
          </div>
        </div>
      )}

      {creating && (
        <div style={{
          padding: 16, marginBottom: 14,
          background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10,
        }}>
          <div className="form-group" style={{ margin: 0, marginBottom: 10 }}>
            <label className="form-label">URL destino</label>
            <input value={url} autoFocus onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..." style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} />
          </div>
          <div className="form-group" style={{ margin: 0, marginBottom: 12 }}>
            <label className="form-label">Eventos</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {VALID_EVENTS.map((e) => (
                <label key={e.value} style={{ display: "flex", gap: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox"
                    checked={events.includes(e.value)}
                    onChange={(ev) => setEvents((prev) => ev.target.checked ? [...prev, e.value] : prev.filter((x) => x !== e.value))}
                  />
                  <code style={{ fontFamily: "var(--font-mono)" }}>{e.value}</code>
                  <span style={{ color: "var(--color-text-muted)" }}>· {e.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary"
              disabled={!url.trim() || events.length === 0 || createMut.isPending}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Creando…" : "Crear webhook"}
            </button>
            <button className="btn btn-ghost" onClick={() => { setCreating(false); setUrl(""); }}>Cancelar</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Cargando…</p>
      ) : hooks.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: 40 }}>
          No hay webhooks configurados.
        </p>
      ) : (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden" }}>
          {hooks.map((h) => (
            <div key={h.id} style={{
              padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)",
              display: "flex", alignItems: "center", gap: 12,
              opacity: h.active ? 1 : 0.5,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.url}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {h.events.map((e) => (
                    <span key={e} style={{
                      padding: "1px 6px", background: "var(--color-bg)", borderRadius: 4,
                      fontFamily: "var(--font-mono)",
                    }}>{e}</span>
                  ))}
                  {h.last_status != null && (
                    <span style={{
                      padding: "1px 6px",
                      background: h.last_status >= 200 && h.last_status < 300 ? "#DCFCE7" : "#FEE2E2",
                      color: h.last_status >= 200 && h.last_status < 300 ? "#15803D" : "#B91C1C",
                      borderRadius: 4, fontWeight: 700,
                    }}>último: {h.last_status}</span>
                  )}
                  {h.fail_count > 0 && (
                    <span style={{ color: "var(--pm-red-500)", fontWeight: 600 }}>
                      · {h.fail_count} fallo(s)
                    </span>
                  )}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => testMut.mutate(h.id)} disabled={testMut.isPending}>
                Test
              </button>
              <button className="btn btn-ghost" style={{ color: "var(--pm-red-500)", fontSize: 12 }}
                onClick={() => { if (confirm("Eliminar este webhook?")) deleteMut.mutate(h.id); }}>
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
