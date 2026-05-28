import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.VITE_BACKEND_PROXY ?? 'http://backend:8000'
const backendWs = backend.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/auth': backend,
      '/datasets': backend,
      '/permissions': backend,
      '/groups': backend,
      '/workspaces': backend,
      '/records': backend,
      '/billing': backend,
      '/api-tokens': backend,
      '/webhooks': backend,
      '/health': backend,
      '/ws': { target: backendWs, ws: true, changeOrigin: true },
    },
  },
})
