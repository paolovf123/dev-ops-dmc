import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon, KeyRound, Webhook, Plus, Copy, Check,
  Trash2, Send,
} from "lucide-react";
import api from "../api/client";
import { useToast } from "../components/Toast";
import { useWorkspace } from "../workspace/WorkspaceContext";
import AppShell from "../components/chrome/AppShell";
import { Badge, Btn } from "../components/ui/kit";

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

type Pane = "tokens" | "webhooks";

// ── estilos compartidos ───────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-3)",
  padding: 18, boxShadow: "var(--shadow-1)",
};
const fieldLabel: React.CSSProperties = {
  font: "500 13px/1 var(--font-sans)", color: "var(--text-soft)", marginBottom: 6, display: "block",
};
const fieldInput: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px", borderRadius: "var(--r-2)",
  border: "1px solid var(--border)", background: "var(--surface)",
  font: "400 14px/1 var(--font-sans)", color: "var(--text)", outline: "none",
};
const help: React.CSSProperties = {
  margin: 0, font: "400 13px/1.5 var(--font-sans)", color: "var(--text-soft)",
};

export default function Settings() {
  const [pane, setPane] = useState<Pane>("tokens");

  const navItems: [Pane, string, React.ReactNode][] = [
    ["tokens", "API tokens", <KeyRound size={17} key="t" />],
    ["webhooks", "Webhooks", <Webhook size={17} key="w" />],
  ];

  return (
    <AppShell active="settings">
      <main className="page-main" style={{ overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 32px 80px" }}>
          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ margin: 0, font: "700 28px/1.1 var(--font-sans)", letterSpacing: "-.02em", color: "var(--text)", display: "flex", alignItems: "center", gap: 10 }}>
              <SettingsIcon size={25} style={{ color: "var(--accent-pri)" }} /> Integraciones
            </h1>
            <p style={{ margin: "7px 0 0", font: "400 15px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
              Tokens de API y webhooks para conectar OpsGrid con otros sistemas.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "start" }}>
            {/* side nav */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {navItems.map(([k, label, icon]) => {
                const isActive = pane === k;
                return (
                  <button key={k} onClick={() => setPane(k)} className="og-navitem" style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: "var(--r-2)", border: "none", cursor: "pointer", textAlign: "left",
                    background: isActive ? "var(--pri-soft)" : undefined,
                    color: isActive ? "var(--accent-pri)" : "var(--text-soft)",
                    font: "600 13.5px/1 var(--font-sans)", transition: "all var(--t-fast)",
                  }}>
                    {icon}{label}
                  </button>
                );
              })}
            </div>

            {/* panel */}
            {pane === "tokens" ? <TokensPanel /> : <WebhooksPanel />}
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
    <div id="tokens">
      {/* token recién creado — se muestra UNA vez */}
      {justCreated && (
        <div className="og-rise" style={{
          padding: 16, borderRadius: "var(--r-3)", marginBottom: 22,
          background: "var(--success-soft)",
          border: "1px solid color-mix(in srgb, var(--success) 32%, transparent)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13.5px/1 var(--font-sans)", color: "var(--success)" }}>
            <Check size={16} /> Token creado: {justCreated.name} — cópialo ahora, no se vuelve a mostrar
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <input className="mono" readOnly value={justCreated.token}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: "var(--r-2)", background: "var(--surface)",
                border: "1px solid var(--border)", font: "500 13px/1 var(--font-mono)", color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", outline: "none",
              }} />
            <Btn variant="soft" size="sm" icon={copied ? <Check size={15} /> : <Copy size={15} />}
              onClick={() => { navigator.clipboard.writeText(justCreated.token); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? "Copiado" : "Copiar"}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setJustCreated(null)}>Listo</Btn>
          </div>
        </div>
      )}

      {/* crear token */}
      <div style={{ ...card, marginBottom: 22 }}>
        <div style={{ font: "600 14px/1 var(--font-sans)", marginBottom: 14 }}>Crear token</div>
        <p style={{ ...help, marginBottom: 14 }}>
          Da acceso programático a tu cuenta vía el header{" "}
          <code className="mono" style={{ font: "500 12.5px/1 var(--font-mono)", color: "var(--text)" }}>Authorization: Bearer {"<token>"}</code>.
          No compartas tus tokens.
        </p>

        {!creating ? (
          <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Crear token</Btn>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 200px" }}>
              <span style={fieldLabel}>Nombre</span>
              <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
                placeholder="p.ej. CI deploy" style={fieldInput} />
            </label>

            <label style={{ width: 240 }}>
              <span style={fieldLabel}>Permisos</span>
              <div style={{
                display: "flex", padding: 3, borderRadius: "var(--r-2)",
                background: "var(--surface-alt)", border: "1px solid var(--border)",
              }}>
                {([["read", "Solo lectura"], ["write", "Lectura + escritura"]] as ["read" | "write", string][]).map(([val, lbl]) => {
                  const on = scope === val;
                  return (
                    <button key={val} type="button" onClick={() => setScope(val)} style={{
                      flex: 1, textAlign: "center", font: "600 12px/1 var(--font-sans)", padding: "9px 6px",
                      borderRadius: 6, border: "none", cursor: "pointer",
                      background: on ? "var(--surface)" : "transparent",
                      color: on ? "var(--text)" : "var(--text-soft)",
                      boxShadow: on ? "var(--shadow-1)" : "none", transition: "all var(--t-fast)",
                    }}>{lbl}</button>
                  );
                })}
              </div>
            </label>

            <Btn variant="primary" icon={<Plus size={16} />}
              disabled={!name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Creando…" : "Crear"}
            </Btn>
            <Btn variant="ghost" onClick={() => { setCreating(false); setName(""); }}>Cancelar</Btn>
          </div>
        )}
      </div>

      {/* lista de tokens */}
      {isLoading ? (
        <p style={help}>Cargando…</p>
      ) : tokens.length === 0 ? (
        <p style={help}>No tienes tokens. Crea uno para integrar con sistemas externos.</p>
      ) : (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden",
          background: "var(--surface)", boxShadow: "var(--shadow-1)",
        }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1.3fr 1.4fr 110px 1fr 96px", padding: "10px 16px",
            background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
            font: "600 12px/1 var(--font-sans)", color: "var(--text-mute)",
          }}>
            <span>Nombre</span><span>Prefijo</span><span>Permisos</span><span>Último uso</span><span />
          </div>
          {tokens.map((t, i) => (
            <div key={t.id} style={{
              display: "grid", gridTemplateColumns: "1.3fr 1.4fr 110px 1fr 96px", alignItems: "center",
              padding: "12px 16px", gap: 8,
              borderBottom: i < tokens.length - 1 ? "1px solid var(--border)" : "none",
              opacity: t.revoked ? 0.5 : 1,
            }}>
              <span style={{ font: "600 13.5px/1.3 var(--font-sans)", color: "var(--text)" }}>
                {t.name}
                {t.revoked && <span style={{ font: "500 11px/1 var(--font-sans)", color: "var(--danger)", marginLeft: 6 }}>· revocado</span>}
              </span>
              <span className="mono" style={{ font: "400 12.5px/1 var(--font-mono)", color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.prefix}…
              </span>
              <span>
                <Badge tone={t.scope === "write" ? "primary" : "neutral"}>
                  {t.scope === "write" ? "escritura" : "lectura"}
                </Badge>
              </span>
              <span className="mono" style={{ font: "400 12.5px/1 var(--font-mono)", color: "var(--text-mute)" }}>
                {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString("es-PE") : "—"}
              </span>
              <span style={{ textAlign: "right" }}>
                {!t.revoked && (
                  <Btn variant="danger" size="sm"
                    onClick={() => { if (confirm(`Revocar "${t.name}"? Las requests con este token dejarán de funcionar.`)) revokeMut.mutate(t.id); }}>
                    Revocar
                  </Btn>
                )}
              </span>
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

  const toggleEvent = (value: string, checked: boolean) =>
    setEvents((prev) => checked ? [...prev, value] : prev.filter((x) => x !== value));

  return (
    <div id="webhooks">
      {/* contexto del workspace */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Badge tone="primary" dot>{workspace ? workspace.name : "Global"}</Badge>
        <span style={{ font: "400 13px/1.4 var(--font-sans)", color: "var(--text-soft)" }}>
          Se disparan automáticamente al ocurrir eventos. Cada request lleva una firma{" "}
          <code className="mono" style={{ font: "500 12px/1 var(--font-mono)", color: "var(--text)" }}>X-OpsGrid-Signature</code>.
        </span>
      </div>

      {/* secret recién creado — se muestra UNA vez */}
      {secretShown && (
        <div className="og-rise" style={{
          padding: 16, borderRadius: "var(--r-3)", marginBottom: 22,
          background: "var(--success-soft)",
          border: "1px solid color-mix(in srgb, var(--success) 32%, transparent)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13.5px/1 var(--font-sans)", color: "var(--success)" }}>
            <Check size={16} /> Webhook creado — guarda el secret, no se vuelve a mostrar
          </div>
          <input className="mono" readOnly value={secretShown.secret}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            style={{
              width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: "var(--r-2)",
              background: "var(--surface)", border: "1px solid var(--border)",
              font: "500 13px/1 var(--font-mono)", color: "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", outline: "none",
            }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <span style={{ flex: 1, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--text-mute)" }}>
              Cada request lleva el header{" "}
              <code className="mono" style={{ font: "500 11px/1 var(--font-mono)" }}>X-OpsGrid-Signature: sha256=…</code>{" "}
              generado con este secret.
            </span>
            <Btn variant="ghost" size="sm" onClick={() => setSecretShown(null)}>Ocultar</Btn>
          </div>
        </div>
      )}

      {/* nuevo webhook */}
      <div style={{ ...card, marginBottom: 22 }}>
        <div style={{ font: "600 14px/1 var(--font-sans)", marginBottom: 14 }}>Nuevo webhook</div>

        {!creating ? (
          <Btn variant="primary" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Crear webhook</Btn>
        ) : (
          <>
            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={fieldLabel}>URL de destino</span>
              <input value={url} autoFocus onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.empresa.pe/opsgrid"
                className="mono"
                style={{ ...fieldInput, font: "400 13px/1 var(--font-mono)" }} />
            </label>

            <div style={fieldLabel}>Eventos</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {VALID_EVENTS.map((e) => {
                const on = events.includes(e.value);
                return (
                  <button key={e.value} type="button" title={e.label}
                    onClick={() => toggleEvent(e.value, !on)} style={{
                      display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px",
                      borderRadius: "var(--r-pill)", cursor: "pointer",
                      border: `1px solid ${on ? "color-mix(in srgb, var(--accent-pri) 35%, transparent)" : "var(--border)"}`,
                      background: on ? "var(--pri-soft)" : "var(--surface)",
                      color: on ? "var(--accent-pri)" : "var(--text-soft)",
                      font: "500 12.5px/1 var(--font-mono)", transition: "all var(--t-fast)",
                    }}>
                    {on && <Check size={13} />}{e.value}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn variant="primary" icon={<Plus size={16} />}
                disabled={!url.trim() || events.length === 0 || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Creando…" : "Crear webhook"}
              </Btn>
              <Btn variant="ghost" onClick={() => { setCreating(false); setUrl(""); }}>Cancelar</Btn>
            </div>
          </>
        )}
      </div>

      {/* lista de webhooks */}
      {isLoading ? (
        <p style={help}>Cargando…</p>
      ) : hooks.length === 0 ? (
        <p style={help}>No hay webhooks configurados.</p>
      ) : (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "var(--r-3)", overflow: "hidden",
          background: "var(--surface)", boxShadow: "var(--shadow-1)",
        }}>
          {hooks.map((h, i) => {
            const ok = h.last_status != null && h.last_status >= 200 && h.last_status < 300;
            return (
              <div key={h.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                borderBottom: i < hooks.length - 1 ? "1px solid var(--border)" : "none",
                opacity: h.active ? 1 : 0.5,
              }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="mono" style={{
                    display: "block", font: "500 13px/1 var(--font-mono)", color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{h.url}</span>
                  <span style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {h.events.map((e) => (
                      <span key={e} className="mono" style={{
                        font: "400 10.5px/1 var(--font-mono)", padding: "3px 6px", borderRadius: 5,
                        background: "var(--surface-alt)", color: "var(--text-soft)",
                      }}>{e}</span>
                    ))}
                    {h.fail_count > 0 && (
                      <span style={{ font: "600 11px/1 var(--font-sans)", color: "var(--danger)" }}>
                        · {h.fail_count} fallo(s)
                      </span>
                    )}
                  </span>
                </span>

                {h.last_status != null && (
                  <span className="mono" style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    font: "600 12px/1 var(--font-mono)", color: ok ? "var(--success)" : "var(--danger)",
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: 9, background: ok ? "var(--success)" : "var(--danger)" }} />
                    {h.last_status}
                  </span>
                )}

                <Btn variant="soft" size="sm" icon={<Send size={15} />}
                  onClick={() => testMut.mutate(h.id)} disabled={testMut.isPending}>
                  Test
                </Btn>
                <Btn variant="danger" size="sm" icon={<Trash2 size={15} />}
                  onClick={() => { if (confirm("Eliminar este webhook?")) deleteMut.mutate(h.id); }}>
                  Eliminar
                </Btn>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
