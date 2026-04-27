import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";

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

    function connect() {
      if (!active) return;
      const token = localStorage.getItem("dv_token") ?? "";
      const url = `${WS_BASE}/ws/${datasetId}${token ? `?token=${token}` : ""}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (active) setConnected(true);
        // Heartbeat every 25s to keep the connection alive through proxies
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
