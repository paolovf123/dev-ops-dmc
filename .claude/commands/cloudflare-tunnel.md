Expone DataVault (frontend en localhost:5173) a Internet mediante un quick tunnel de Cloudflare. Útil para probar la app desde otra red o compartir un link temporal con el equipo.

⚠️ Importante:
- El "quick tunnel" no requiere cuenta de Cloudflare ni dominio.
- La URL pública es **aleatoria y cambia en cada arranque** del túnel.
- Si la PC se apaga o el túnel se detiene, el link deja de funcionar.

Ejecuta los siguientes pasos en orden:

1. Verifica que `cloudflared` esté instalado:
   ```
   cloudflared --version
   ```
   Si NO está instalado (comando no encontrado), instalalo con winget:
   ```
   winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements
   ```
   Después de instalar, busca el ejecutable (winget no lo agrega al PATH inmediatamente):
   ```
   Get-Command cloudflared -ErrorAction SilentlyContinue
   ```
   Si no lo encuentra, usa la ruta completa de winget:
   ```
   C:\Users\<usuario>\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe
   ```

2. Verifica que DataVault esté corriendo:
   ```
   docker compose -f "<ruta-al-proyecto>/datavault/docker-compose.yml" ps
   ```
   Si el contenedor `datavault-frontend-1` NO está en `Up`, levantá los servicios primero invocando la skill `/datavault-start`.

   Verificá también que el frontend responde:
   ```
   curl http://localhost:5173 -o NUL -w "%{http_code}"
   ```
   Si no devuelve `200`, espera 5 segundos y reintenta. Si sigue fallando, revisar logs:
   ```
   docker compose -f "<ruta>/datavault/docker-compose.yml" logs frontend --tail=30
   ```

3. Verifica que Vite acepta hosts externos. El archivo `datavault/frontend/vite.config.ts` debe tener `allowedHosts: true` dentro del bloque `server`. Si no lo tiene, agregalo (o avisar al usuario que sin esto Vite rechazará el túnel con un 403 "Blocked request").

4. **Importante: no usar `Bash`** para lanzar el túnel. El proceso debe quedar corriendo y emitir su URL en stdout — usar la herramienta `Monitor` con `persistent: true`:
   - command: `cloudflared tunnel --url http://localhost:5173 --no-autoupdate 2>&1 | grep -E --line-buffered "trycloudflare\.com|ERR |FATAL|Registered tunnel connection|error|unable|failed"`
   - description: `cloudflared quick tunnel — emite URL pública`
   - timeout_ms: `3600000`
   - persistent: `true`

   Si `cloudflared` no está en el PATH del shell que usa Monitor, pasá la ruta completa entre comillas dobles.

5. Esperá las notificaciones del Monitor. La URL pública aparece en una línea como:
   ```
   INF |  https://nombre-aleatorio.trycloudflare.com                                        |
   ```
   Cuando llegue ese evento, extraé la URL `https://*.trycloudflare.com` y comunicásela al usuario.

   Después llega un segundo evento `Registered tunnel connection` que confirma que la conexión quedó establecida en algún nodo (ej. `scl06`, `bog04`).

6. Validá rápido que el túnel funciona desde afuera:
   ```
   curl <URL>/health -o NUL -w "%{http_code}"
   ```
   Debería devolver `200` (el endpoint `/health` del backend responde por el proxy de Vite).

7. Informá al usuario:
   - **URL pública:** la `https://*.trycloudflare.com` obtenida
   - **Cómo usarla:** la app está disponible en esa URL para cualquiera que la abra
   - **Limitaciones:**
     - La URL cambia si reinician el túnel
     - Si apagan la PC o paran el túnel, el link muere
     - Sin auth extra: cualquiera con el link entra a la pantalla de login (las credenciales siguen siendo las normales)
   - **Para detener el túnel:** usar la herramienta `TaskStop` con el `task_id` que devolvió el Monitor

8. Si el usuario quiere una URL **fija** y persistente (porque va a compartirla con el equipo de forma estable), recomendale:
   - Configurar un Cloudflare Tunnel con cuenta + dominio propio (`cloudflared tunnel login` + `cloudflared tunnel create`), o
   - Hacer deploy a AWS staging vía el pipeline existente (push a `develop` → CloudFront URL estable)

   No procedas con estos pasos automáticamente — solo mencionalos como alternativa.
