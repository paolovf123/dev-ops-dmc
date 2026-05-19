import os
print("DataVault backend starting... [deploy us-east-1]")
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from routers import datasets, columns, records
from routers.auth import router as auth_router
from routers.permissions import router as permissions_router
from routers.groups import router as groups_router
from routers.workspaces import router as workspaces_router
from auth import decode_token
import json

logger = logging.getLogger("datavault")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"


# ── Rate limiter ──────────────────────────────────────────────────────────────

from limiter import limiter


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
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    expose_headers=["X-Total-Count"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(datasets.router)
app.include_router(columns.router)
app.include_router(records.router)
app.include_router(permissions_router)
app.include_router(groups_router)


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
            logger.warning("WebSocket auth failed for dataset %s: invalid token", dataset_id)
            await websocket.close(code=4001)
            return
    except Exception as e:
        logger.warning("WebSocket auth error for dataset %s: %s", dataset_id, e)
        await websocket.close(code=4001)
        return

    manager._conns.setdefault(dataset_id, set()).add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(dataset_id, websocket)
    except Exception as e:
        logger.error("WebSocket error on dataset %s: %s", dataset_id, e, exc_info=True)
        manager.disconnect(dataset_id, websocket)
