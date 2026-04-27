from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from routers import datasets, columns, records
from routers.auth import router as auth_router
from routers.permissions import router as permissions_router
import json


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        # dataset_id (str) → set of active WebSocket connections
        self._conns: dict[str, set[WebSocket]] = {}

    async def connect(self, dataset_id: str, ws: WebSocket):
        await ws.accept()
        self._conns.setdefault(dataset_id, set()).add(ws)

    def disconnect(self, dataset_id: str, ws: WebSocket):
        self._conns.get(dataset_id, set()).discard(ws)

    async def broadcast(self, dataset_id: str, event: dict):
        dead: set[WebSocket] = set()
        for ws in list(self._conns.get(dataset_id, set())):
            try:
                await ws.send_json(event)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._conns.get(dataset_id, set()).discard(ws)


manager = ConnectionManager()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="DataVault API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(datasets.router)
app.include_router(columns.router)
app.include_router(records.router)
app.include_router(permissions_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws/{dataset_id}")
async def ws_endpoint(
    websocket: WebSocket,
    dataset_id: str,
    token: str | None = Query(None),
):
    # Validate token before accepting (optional — prevents unauthorized listening)
    # For now we accept any connection; auth happens at the HTTP layer
    await manager.connect(dataset_id, websocket)
    try:
        while True:
            # Keep the connection alive; clients send pings as plain text
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(dataset_id, websocket)
    except Exception:
        manager.disconnect(dataset_id, websocket)
