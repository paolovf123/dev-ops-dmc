import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:5173");

interface RealtimeEvent {
  type: "record_create" | "record_update" | "record_delete";
  dataset_id: string;
  record_id?: string;
}

export function useRealtimeSync(datasetId: string | undefined) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    let active = true;

    async function connect() {
      if (!active) return;

      // Pedir ticket WS al backend; la cookie httpOnly autentica esta llamada
      let ticket = "";
      try {
        const r = await api.post<{ ticket: string }>("/auth/ws-ticket");
        ticket = r.data.ticket;
      } catch {
        // Sin ticket no podemos autenticar el WS; reintentar más tarde
        if (active) reconnectTimer.current = setTimeout(connect, 5000);
        return;
      }
      if (!active) return;

      const url = `${WS_BASE}/ws/${datasetId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(ticket);
        if (active) setConnected(true);
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
          else clearInterval(ping);
        }, 25_000);
      };

      ws.onmessage = (e) => {
        try {
          const event: RealtimeEvent = JSON.parse(e.data);
          if (event.type.startsWith("record_")) {
            qc.invalidateQueries({ queryKey: ["records", datasetId] });
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        if (active) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      setConnected(false);
    };
  }, [datasetId, qc]);

  return { connected };
}
