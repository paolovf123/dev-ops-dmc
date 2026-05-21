"""Lambda executor — corre scripts Python de usuario en un sandbox restringido.

Seguridad por capas:
  1. AST validation: rechaza imports prohibidos y atributos privados (__dunder__)
  2. signal.SIGALRM: corta la ejecución después de MAX_EXEC_SECONDS
  3. resource.RLIMIT_AS: limita el espacio de direcciones (evita memory bombs)
  4. __builtins__ reducidos: solo builtins seguros disponibles en el namespace

Payload esperado:
  {
    "code": "<python source>",
    "dataframes": { "nombre_dataset": [{"col": "val", ...}, ...] }
  }

Respuesta:
  { "records": [...], "columns": [...], "error": null | "<msg>" }
"""
import ast
import json
import resource
import signal
import traceback

import pandas as pd

MAX_EXEC_SECONDS = 60
MAX_MEMORY_BYTES = 1_500_000_000  # 1.5 GB

FORBIDDEN_MODULES = {
    "os", "subprocess", "sys", "socket", "shutil", "pathlib",
    "builtins", "importlib", "ctypes", "pickle", "shelve",
    "tempfile", "glob", "fnmatch", "io", "pty", "tty",
    "signal", "resource", "platform", "sysconfig",
}

_SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool,
    "dict": dict, "divmod": divmod, "enumerate": enumerate,
    "filter": filter, "float": float, "format": format,
    "frozenset": frozenset, "getattr": getattr, "hasattr": hasattr,
    "hash": hash, "int": int, "isinstance": isinstance,
    "issubclass": issubclass, "iter": iter, "len": len,
    "list": list, "map": map, "max": max, "min": min,
    "next": next, "object": object, "print": print,
    "range": range, "repr": repr, "reversed": reversed,
    "round": round, "set": set, "slice": slice, "sorted": sorted,
    "str": str, "sum": sum, "tuple": tuple, "type": type,
    "zip": zip,
    # Exceptions
    "Exception": Exception, "ValueError": ValueError,
    "KeyError": KeyError, "IndexError": IndexError,
    "TypeError": TypeError, "RuntimeError": RuntimeError,
    "StopIteration": StopIteration,
}


def _validate_ast(code: str) -> None:
    """Rechaza código con imports prohibidos o acceso a atributos dunder."""
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in FORBIDDEN_MODULES:
                    raise ValueError(f"Import prohibido: '{alias.name}'")
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise ValueError(
                f"Acceso a atributo privado prohibido: '.{node.attr}'. "
                "Usa solo atributos públicos."
            )


def _timeout_handler(_signum, _frame):
    raise TimeoutError(f"El script superó el límite de {MAX_EXEC_SECONDS}s de ejecución")


def handler(event, context):
    code: str = event.get("code", "").strip()
    raw_frames: dict = event.get("dataframes", {})

    if not code:
        return {"error": "El campo 'code' está vacío", "records": [], "columns": []}

    # ── 1. Validación AST ────────────────────────────────────────────────────
    try:
        _validate_ast(code)
    except SyntaxError as e:
        return {"error": f"Error de sintaxis en línea {e.lineno}: {e.msg}", "records": [], "columns": []}
    except ValueError as e:
        return {"error": str(e), "records": [], "columns": []}

    # ── 2. Límite de memoria ─────────────────────────────────────────────────
    try:
        resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, MAX_MEMORY_BYTES))
    except (ValueError, resource.error):
        pass  # No disponible en todos los entornos

    # ── 3. Namespace restringido ─────────────────────────────────────────────
    namespace: dict = {"__builtins__": _SAFE_BUILTINS, "pd": pd}
    try:
        import numpy as np
        namespace["np"] = np
    except ImportError:
        pass
    try:
        import duckdb
        namespace["duckdb"] = duckdb
    except ImportError:
        pass

    for name, rows in raw_frames.items():
        if not isinstance(rows, list):
            return {"error": f"dataframes['{name}'] debe ser una lista de dicts", "records": [], "columns": []}
        namespace[name] = pd.DataFrame(rows)

    # ── 4. Ejecución con timeout ─────────────────────────────────────────────
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(MAX_EXEC_SECONDS)
    try:
        exec(compile(code, "<computed_dataset>", "exec"), namespace)  # noqa: S102
    except TimeoutError as e:
        return {"error": str(e), "records": [], "columns": []}
    except Exception:
        return {
            "error": f"Error durante la ejecución:\n{traceback.format_exc(limit=10)}",
            "records": [],
            "columns": [],
        }
    finally:
        signal.alarm(0)

    # ── 5. Extraer resultado ─────────────────────────────────────────────────
    result_df = namespace.get("result")
    if result_df is None:
        return {
            "error": "El script debe asignar el DataFrame final a la variable 'result'",
            "records": [],
            "columns": [],
        }
    if not isinstance(result_df, pd.DataFrame):
        return {
            "error": f"'result' debe ser un DataFrame (recibido: {type(result_df).__name__})",
            "records": [],
            "columns": [],
        }
    if result_df.empty:
        return {"records": [], "columns": [], "error": None}

    columns = [
        {
            "name": str(col),
            "field_key": str(col).lower().strip().replace(" ", "_")[:64],
        }
        for col in result_df.columns
    ]
    records = json.loads(result_df.fillna("").astype(str).to_json(orient="records"))

    return {"records": records, "columns": columns, "error": None}
