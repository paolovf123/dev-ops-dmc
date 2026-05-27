"""Servicio HTTP del executor de scripts (reemplaza AWS Lambda en self-hosted).

Recibe POST /run {code, dataframes} y corre el código en un SUBPROCESO aislado
(runner.py) con timeout de pared. Devuelve {columns, records} o {error, traceback}.
El contenedor corre sin acceso a la base de datos ni a internet (ver docker-compose).
"""
import json
import os
import subprocess
import sys

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="DataVault Executor")

WALL_TIMEOUT = int(os.getenv("EXECUTOR_WALL_SECONDS", "30"))
RUNNER = os.path.join(os.path.dirname(__file__), "runner.py")


class Job(BaseModel):
    code: str
    dataframes: dict = {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run")
def run(job: Job):
    payload = json.dumps({"code": job.code, "dataframes": job.dataframes})
    try:
        proc = subprocess.run(
            [sys.executable, RUNNER],
            input=payload, capture_output=True, text=True, timeout=WALL_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return {"error": f"El script superó el tiempo límite de {WALL_TIMEOUT}s.", "traceback": ""}

    out = (proc.stdout or "").strip()
    if not out:
        # El runner no devolvió nada: probablemente OOM (killed) o crash duro.
        err = (proc.stderr or "").strip()
        if proc.returncode and proc.returncode < 0:
            return {"error": "El script fue terminado (memoria o señal del sistema).", "traceback": err[-2000:]}
        return {"error": "El executor no devolvió resultado.", "traceback": err[-2000:]}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"error": "Respuesta inválida del executor.", "traceback": out[-2000:]}
