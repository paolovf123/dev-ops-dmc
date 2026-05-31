// auth.jsx — Login (bifold, tabs Entrar/Crear) + onboarding SetPassword

function AuthField({ label, ph, type, toggle }) {
  const [show, setShow] = useState(false);
  return (
    <label style={{ display: "block" }}>
      <div style={{ font: "500 13px var(--font-sans)", color: "var(--text-soft)", marginBottom: 7 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 13px", borderRadius: "var(--r-2)", border: "1px solid var(--border)", background: "var(--surface)" }}>
        <input type={toggle && !show ? "password" : (type || "text")} placeholder={ph} style={{ flex: 1, border: "none", background: "transparent", outline: "none", color: "var(--text)", font: "400 14.5px var(--font-sans)" }} />
        {toggle && <button onClick={(e) => { e.preventDefault(); setShow(s => !s); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)", padding: 2 }}><Icon name={show ? "x" : "search"} size={16} /></button>}
      </div>
    </label>
  );
}

function Login({ onEnter }) {
  const [mode, setMode] = useState("login"); // login | register | setpw
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", height: "100vh", background: "var(--bg)" }}>
      {/* left visual */}
      <div style={{ position: "relative", overflow: "hidden", background: "linear-gradient(150deg, color-mix(in srgb, var(--accent-pri) 92%, #000), color-mix(in srgb, var(--accent-calc) 80%, #000))", color: "#fff", padding: "56px 56px", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .12, backgroundImage: "radial-gradient(#fff 1.2px, transparent 1.2px)", backgroundSize: "26px 26px" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", font: "800 17px var(--font-sans)", border: "1px solid rgba(255,255,255,.3)" }}>O</span>
          <span style={{ font: "800 20px var(--font-sans)" }}>OpsGrid</span>
        </div>
        <div style={{ position: "relative", marginTop: "auto" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: "var(--r-pill)", background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.25)", font: "600 12.5px var(--font-sans)" }}>
            <Icon name="sparkles" size={14} /> Excel en, tablas relacionadas fuera
          </span>
          <h1 style={{ margin: "20px 0 0", font: "800 44px/1.05 var(--font-sans)", letterSpacing: "-.03em" }}>Tus Excels caóticos,<br /><span style={{ color: "color-mix(in srgb, var(--accent-rel) 70%, #fff)" }}>limpios.</span></h1>
          <p style={{ margin: "16px 0 0", font: "400 16px/1.5 var(--font-sans)", color: "rgba(255,255,255,.85)", maxWidth: 380 }}>Sube un Excel → detectamos relaciones → tablas editables en minutos.</p>
          <div style={{ marginTop: 36, padding: 18, borderRadius: "var(--r-3)", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", maxWidth: 400 }}>
            <p style={{ margin: 0, font: "500 14.5px/1.5 var(--font-sans)" }}>"Migramos 14 planillas dispersas a OpsGrid en una tarde. Nos ahorró semanas."</p>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12 }}>
              <Avatar name="Rosa Quispe" size={28} />
              <span style={{ font: "500 12.5px var(--font-sans)" }}>Rosa Quispe · Ops Lead, Andina SAC</span>
            </div>
          </div>
        </div>
      </div>

      {/* right form */}
      <div style={{ display: "grid", placeItems: "center", padding: 32, overflow: "auto" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {mode !== "setpw" ? (
            <>
              <div style={{ display: "flex", padding: 4, borderRadius: "var(--r-2)", background: "var(--surface-alt)", border: "1px solid var(--border)", marginBottom: 26 }}>
                {[["login", "Entrar"], ["register", "Crear cuenta"]].map(([k, l]) => (
                  <button key={k} onClick={() => setMode(k)} style={{ flex: 1, font: "600 13.5px var(--font-sans)", padding: "9px", borderRadius: 6, border: "none", cursor: "pointer", background: mode === k ? "var(--surface)" : "transparent", color: mode === k ? "var(--text)" : "var(--text-soft)", boxShadow: mode === k ? "var(--shadow-1)" : "none" }}>{l}</button>
                ))}
              </div>
              <h2 style={{ margin: "0 0 22px", font: "700 24px var(--font-sans)", letterSpacing: "-.02em" }}>{mode === "login" ? "Hola de nuevo 👋" : "Crea tu cuenta"}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {mode === "register" && <AuthField label="Usuario" ph="tu.nombre" />}
                <AuthField label="Email" ph="tu@empresa.pe" type="email" />
                <AuthField label="Contraseña" ph="••••••••" toggle />
              </div>
              {mode === "register" && (
                <div style={{ display: "flex", gap: 9, marginTop: 16, padding: 12, borderRadius: "var(--r-2)", background: "var(--pri-soft)", font: "400 12.5px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>
                  <Icon name="bell" size={15} color="var(--accent-pri)" style={{ flex: "none", marginTop: 1 }} />
                  <span>El <strong style={{ color: "var(--text)" }}>primer usuario</strong> se vuelve administrador; los siguientes empiezan como <em>viewer</em> hasta ser aprobados.</span>
                </div>
              )}
              <Btn variant="primary" full iconR="arrowR" onClick={onEnter} style={{ marginTop: 22, height: 46 }}>{mode === "login" ? "Entrar" : "Crear cuenta"}</Btn>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} /><span style={{ font: "400 12px var(--font-sans)", color: "var(--text-mute)" }}>o</span><div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              <Btn variant="soft" full icon="billing" style={{ height: 46 }}>Adquiere OpsGrid para tu empresa</Btn>
              <button onClick={() => setMode("setpw")} style={{ display: "block", width: "100%", textAlign: "center", marginTop: 16, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)", font: "400 12.5px var(--font-sans)" }}>¿Tienes una invitación? Activa tu cuenta →</button>
            </>
          ) : (
            <>
              <span style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: "var(--r-3)", background: "var(--pri-soft)", color: "var(--accent-pri)", marginBottom: 18 }}><Icon name="lock" size={22} /></span>
              <h2 style={{ margin: "0 0 6px", font: "700 24px var(--font-sans)", letterSpacing: "-.02em" }}>Activa tu cuenta</h2>
              <p style={{ margin: "0 0 24px", font: "400 14px/1.5 var(--font-sans)", color: "var(--text-soft)" }}>Invitación para <strong style={{ color: "var(--text)" }}>diego@empresa.pe</strong>. Define tu contraseña para entrar.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <AuthField label="Contraseña" ph="••••••••" toggle />
                <AuthField label="Repetir contraseña" ph="••••••••" toggle />
              </div>
              <Btn variant="primary" full iconR="arrowR" onClick={onEnter} style={{ marginTop: 22, height: 46 }}>Activar y entrar</Btn>
              <button onClick={() => setMode("login")} style={{ display: "block", width: "100%", textAlign: "center", marginTop: 16, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-mute)", font: "400 12.5px var(--font-sans)" }}>← Volver a iniciar sesión</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Login });
