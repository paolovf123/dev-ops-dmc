import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from routers import datasets, columns, records
from routers.auth import router as auth_router
from routers.permissions import router as permissions_router
from auth import decode_token
import json


# ── Rate limiter ──────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)


# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
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
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
async def ws_endpoint(websocket: WebSocket, dataset_id: str):
    await websocket.accept()
    # First message must be the JWT token
    try:
        first = await websocket.receive_text()
        payload = decode_token(first.strip())
        if not payload:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    manager._conns.setdefault(dataset_id, set()).add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(dataset_id, websocket)
    except Exception:
        manager.disconnect(dataset_id, websocket)
