import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Webhook, Plus, Copy, Check, Trash2, Send } from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/Toast";
import { useWorkspace } from "../workspace/WorkspaceContext";
import AppShell from "../components/chrome/AppShell";

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
  const [tab, setTab] = useState<"tokens" | "webhooks">("tokens");

  const navLink = (key: "tokens" | "webhooks", label: string) => (
    <a
      href={`#${key}`}
      className={`set-nav__link${tab === key ? " is-active" : ""}`}
      onClick={(e) => { e.preventDefault(); setTab(key); }}
    >
      {label}
    </a>
  );

  return (
    <AppShell active="settings">
      <main className="page-main">
        <div className="set-shell">
          <aside className="set-nav">
            {navLink("tokens", "API tokens")}
            {navLink("webhooks", "Webhooks")}
          </aside>

          <div>
            <div className="page-header">
              <div>
                <h1>Integraciones</h1>
                <p>API tokens y webhooks para conectar OpsGrid con otros sistemas.</p>
              </div>
            </div>

            {tab === "tokens" ? <TokensPanel /> : <WebhooksPanel />}
          </div>
        </div>
      </main>
    </AppShell>
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
    <section className="set-section" id="tokens">
      <h3><KeyRound style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 6 }} /> API tokens</h3>
      <p className="help">
        Da acceso programático a tu cuenta. Usá el header <code>Authorization: Bearer {"<token>"}</code> en
        tus requests. No compartas tus tokens.
      </p>

      <div className="set-row">
        <div className="set-row__lbl">
          Tokens activos
          <small>Cada token tiene un alcance de lectura o lectura + escritura.</small>
        </div>
        <div>
          {!creating && !justCreated && (
            <button className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
              <Plus /> Crear token
            </button>
          )}

          {justCreated && (
            <div style={{
              padding: 16, marginBottom: 14,
              background: "var(--accent-pri-soft)", border: "1px solid var(--accent-pri)", borderRadius: "var(--r-3)",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Check style={{ width: 16, height: 16 }} /> Token creado: {justCreated.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-mute)", marginBottom: 8 }}>
                Copialo ahora — no se mostrará de nuevo.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" value={justCreated.token} readOnly
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}
                  onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button className="btn btn--secondary btn--sm"
                  onClick={() => { navigator.clipboard.writeText(justCreated.token); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? <><Check /> Copiado</> : <><Copy /> Copiar</>}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setJustCreated(null)}>Listo</button>
              </div>
            </div>
          )}

          {creating && (
            <div style={{
              padding: 16, marginBottom: 14,
              background: "var(--surface-alt)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)",
            }}>
              <label className="set-row__lbl" style={{ display: "block", marginBottom: 6 }}>Nombre</label>
              <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Integración con Slack" style={{ width: "100%", marginBottom: 12 }} />

              <label className="set-row__lbl" style={{ display: "block", marginBottom: 6 }}>Permisos</label>
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}
                style={{ width: "100%", marginBottom: 12 }}>
                <option value="read">Solo lectura</option>
                <option value="write">Lectura + escritura</option>
              </select>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn--primary btn--sm" disabled={!name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando…" : "Crear"}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => { setCreating(false); setName(""); }}>Cancelar</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="help">Cargando…</p>
          ) : tokens.length === 0 ? (
            <p className="help" style={{ marginTop: 12 }}>
              No tienes tokens. Crea uno para integrar con sistemas externos.
            </p>
          ) : (
            <div style={{ border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)", overflow: "hidden", marginTop: 12 }}>
              {tokens.map((t) => (
                <div key={t.id} style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--border-soft)",
                  display: "flex", alignItems: "center", gap: 12,
                  opacity: t.revoked ? 0.5 : 1,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {t.name} {t.revoked && <span style={{ fontSize: 11, color: "var(--danger)" }}>· revocado</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>
                      <code style={{ fontFamily: "var(--font-mono)" }}>{t.prefix}…</code>
                      · scope: <b>{t.scope}</b>
                      · creado {new Date(t.created_at).toLocaleDateString("es-PE")}
                      {t.last_used_at && ` · último uso ${new Date(t.last_used_at).toLocaleDateString("es-PE")}`}
                    </div>
                  </div>
                  {!t.revoked && (
                    <button className="btn btn--ghost btn--sm" style={{ color: "var(--danger)" }}
                      onClick={() => { if (confirm(`Revocar "${t.name}"? Las requests con este token dejarán de funcionar.`)) revokeMut.mutate(t.id); }}>
                      <Trash2 /> Revocar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
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
    <section className="set-section" id="webhooks">
      <h3><Webhook style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 6 }} /> Webhooks</h3>
      <p className="help">
        {workspace ? <>Webhooks del workspace <b>{workspace.name}</b></> : "Webhooks globales"} ·
        se disparan automáticamente al ocurrir eventos.
      </p>

      <div className="set-row">
        <div className="set-row__lbl">
          Endpoints
          <small>Cada request lleva una firma <code>X-OpsGrid-Signature</code>.</small>
        </div>
        <div>
          {!creating && (
            <button className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
              <Plus /> Crear webhook
            </button>
          )}

          {secretShown && (
            <div style={{
              padding: 14, marginBottom: 14,
              background: "var(--accent-pri-soft)", border: "1px solid var(--accent-pri)", borderRadius: "var(--r-3)",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Check style={{ width: 16, height: 16 }} /> Webhook creado — guarda el secret:
              </div>
              <input className="input" readOnly value={secretShown.secret}
                style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: "100%", marginBottom: 8 }}
                onClick={(e) => (e.target as HTMLInputElement).select()} />
              <div style={{ fontSize: 11, color: "var(--text-mute)" }}>
                Cada request lleva el header <code>X-OpsGrid-Signature: sha256=...</code> generado con este secret.
                <button className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }}
                  onClick={() => setSecretShown(null)}>Ocultar</button>
              </div>
            </div>
          )}

          {creating && (
            <div style={{
              padding: 16, marginBottom: 14,
              background: "var(--surface-alt)", border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)",
            }}>
              <label className="set-row__lbl" style={{ display: "block", marginBottom: 6 }}>URL destino</label>
              <input className="input" value={url} autoFocus onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: "100%", marginBottom: 12 }} />

              <label className="set-row__lbl" style={{ display: "block", marginBottom: 6 }}>Eventos</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                {VALID_EVENTS.map((e) => (
                  <label key={e.value} style={{ display: "flex", gap: 8, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox"
                      checked={events.includes(e.value)}
                      onChange={(ev) => setEvents((prev) => ev.target.checked ? [...prev, e.value] : prev.filter((x) => x !== e.value))}
                    />
                    <code style={{ fontFamily: "var(--font-mono)" }}>{e.value}</code>
                    <span style={{ color: "var(--text-mute)" }}>· {e.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn--primary btn--sm"
                  disabled={!url.trim() || events.length === 0 || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Creando…" : "Crear webhook"}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => { setCreating(false); setUrl(""); }}>Cancelar</button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="help">Cargando…</p>
          ) : hooks.length === 0 ? (
            <p className="help" style={{ marginTop: 12 }}>
              No hay webhooks configurados.
            </p>
          ) : (
            <div style={{ border: "1px solid var(--border-soft)", borderRadius: "var(--r-3)", overflow: "hidden", marginTop: 12 }}>
              {hooks.map((h) => (
                <div key={h.id} style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--border-soft)",
                  display: "flex", alignItems: "center", gap: 12,
                  opacity: h.active ? 1 : 0.5,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.url}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {h.events.map((e) => (
                        <span key={e} style={{
                          padding: "1px 6px", background: "var(--surface-alt)", borderRadius: 4,
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
                        <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                          · {h.fail_count} fallo(s)
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="btn btn--ghost btn--sm"
                    onClick={() => testMut.mutate(h.id)} disabled={testMut.isPending}>
                    <Send /> Test
                  </button>
                  <button className="btn btn--ghost btn--sm" style={{ color: "var(--danger)" }}
                    onClick={() => { if (confirm("Eliminar este webhook?")) deleteMut.mutate(h.id); }}>
                    <Trash2 /> Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
