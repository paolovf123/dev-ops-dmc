"""Cliente del executor de scripts. Aísla del router cómo/dónde se ejecuta el código.

Dos backends de ejecución, elegidos por entorno:
  1. EXECUTOR_URL        → contenedor executor local (self-hosted / VPS) vía HTTP.  [preferido]
  2. LAMBDA_EXECUTOR_ARN → AWS Lambda (boto3).                                    [fallback]

Contrato común: recibe {code, dataframes} y devuelve (columns, records).
Traduce fallos a excepciones tipadas que el router mapea a códigos HTTP.
(Los nombres Lambda* se conservan por compatibilidad con el router.)
"""
import json
import os

DEFAULT_REGION = "us-east-1"


class LambdaNotConfigured(Exception):
    """No hay executor configurado (EXECUTOR_URL ni LAMBDA_EXECUTOR_ARN) (→ 503)."""


class LambdaInvocationError(Exception):
    """Fallo invocando el executor: red, permisos, payload inválido (→ 502)."""


class LambdaExecutionError(Exception):
    """El código del usuario falló dentro del executor (→ 422)."""

    def __init__(self, message: str, traceback: str = ""):
        super().__init__(message)
        self.message = message
        self.traceback = traceback


def _unpack(result) -> tuple[list[dict], list[dict]]:
    if isinstance(result, dict) and result.get("error"):
        raise LambdaExecutionError(result["error"], traceback=result.get("traceback", ""))
    columns = result.get("columns", []) if isinstance(result, dict) else []
    records = result.get("records", []) if isinstance(result, dict) else []
    return columns, records


def _run_via_http(url: str, payload: dict) -> tuple[list[dict], list[dict]]:
    import httpx
    try:
        with httpx.Client(timeout=httpx.Timeout(connect=5.0, read=120.0, write=30.0, pool=5.0)) as client:
            r = client.post(url, json=payload)
        r.raise_for_status()
        result = r.json()
    except Exception as e:  # noqa: BLE001 — cualquier fallo de invocación → 502
        raise LambdaInvocationError(str(e)) from e
    return _unpack(result)


def _run_via_lambda(arn: str, payload: dict) -> tuple[list[dict], list[dict]]:
    import boto3
    try:
        client = boto3.client("lambda", region_name=os.getenv("AWS_REGION", DEFAULT_REGION))
        response = client.invoke(FunctionName=arn, InvocationType="RequestResponse", Payload=json.dumps(payload))
        result = json.loads(response["Payload"].read())
    except Exception as e:  # noqa: BLE001
        raise LambdaInvocationError(str(e)) from e
    if response.get("FunctionError"):
        detail = result.get("errorMessage", str(result)) if isinstance(result, dict) else str(result)
        raise LambdaExecutionError(detail)
    return _unpack(result)


def run_executor(code: str, dataframes: dict[str, list[dict]]) -> tuple[list[dict], list[dict]]:
    """Ejecuta `code` con los `dataframes` dados y devuelve (columns, records).

    Lanza LambdaNotConfigured / LambdaInvocationError / LambdaExecutionError.
    """
    payload = {"code": code, "dataframes": dataframes}
    executor_url = os.getenv("EXECUTOR_URL")
    if executor_url:
        return _run_via_http(executor_url, payload)
    lambda_arn = os.getenv("LAMBDA_EXECUTOR_ARN")
    if lambda_arn:
        return _run_via_lambda(lambda_arn, payload)
    raise LambdaNotConfigured("No hay executor configurado. Define EXECUTOR_URL (local) o LAMBDA_EXECUTOR_ARN (AWS).")
