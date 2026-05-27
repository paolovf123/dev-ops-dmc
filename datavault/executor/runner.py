"""Runner aislado: corre el código del usuario en un SUBPROCESO separado.

Lee un job JSON por stdin: {"code": "...", "dataframes": {...}} y escribe el
resultado JSON por stdout: {"columns":[...], "records":[...]} o {"error","traceback"}.

Aislamiento (defensa en capas):
  - corre como subproceso aparte del servicio HTTP (si revienta/OOM, no tumba la API)
  - límites de RLIMIT_AS (memoria) y RLIMIT_CPU aplicados acá
  - __import__ restringido a una whitelist de librerías de datos
  - builtins recortados
El servicio (app.py) además impone timeout de pared y el contenedor corre sin red
externa ni acceso a la base de datos (ver docker-compose).
"""
import json
import math
import os
import sys
import traceback

# ── Límites de recursos (segunda capa; la primera es el cgroup del contenedor) ──
try:
    import resource
    mem_mb = int(os.getenv("EXECUTOR_MEM_MB", "768"))
    cpu_s = int(os.getenv("EXECUTOR_CPU_SECONDS", "25"))
    soft = mem_mb * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (soft, soft))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s))
except Exception:
    pass  # en plataformas sin resource (no Linux) seguimos con el timeout de pared

import pandas as pd
import numpy as np

# Librerías permitidas dentro del código del usuario (import controlado).
# Limpiezas/transformaciones básicas: pandas + numpy + duckdb + stdlib segura.
# (scipy/scikit-learn no se incluyen; si en el futuro hacen falta, agregarlos
#  a executor/requirements.txt y a este set.)
_ALLOWED_IMPORTS = {
    "pandas", "numpy", "math", "statistics", "datetime", "json", "re",
    "itertools", "collections", "functools", "decimal", "random",
    "duckdb",
}
_real_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__


def _safe_import(name, *args, **kwargs):
    root = name.split(".")[0]
    if root not in _ALLOWED_IMPORTS:
        raise ImportError(f"Importar '{root}' no está permitido. Disponibles: {', '.join(sorted(_ALLOWED_IMPORTS))}")
    return _real_import(name, *args, **kwargs)


def _infer_data_type(series: "pd.Series") -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_integer_dtype(series) or pd.api.types.is_float_dtype(series):
        return "number"
    if series.dtype == object:
        sample = series.dropna().head(5)
        try:
            pd.to_datetime(sample)
            return "date"
        except Exception:
            pass
    return "text"


def _slugify(name: str) -> str:
    slug = str(name).lower().replace(" ", "_").replace("-", "_")
    return "".join(c if c.isalnum() or c == "_" else "_" for c in slug) or "col"


def _clean_value(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def run(event: dict) -> dict:
    code = (event.get("code") or "").strip()
    dataframes_json = event.get("dataframes") or {}
    if not code:
        return {"error": "No se proporcionó código", "traceback": ""}

    safe_builtins = {
        "print": print, "len": len, "range": range, "enumerate": enumerate,
        "zip": zip, "map": map, "filter": filter, "list": list, "dict": dict,
        "set": set, "tuple": tuple, "str": str, "int": int, "float": float,
        "bool": bool, "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
        "sorted": sorted, "reversed": reversed, "isinstance": isinstance, "type": type,
        "any": any, "all": all, "True": True, "False": False, "None": None,
        # tipos/utilidades seguras de uso común en limpieza de datos
        "object": object, "frozenset": frozenset, "bytes": bytes, "repr": repr,
        "format": format, "divmod": divmod, "pow": pow, "hash": hash,
        # excepciones (para que el usuario pueda usar try/except)
        "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError,
        "KeyError": KeyError, "IndexError": IndexError, "AttributeError": AttributeError,
        "ZeroDivisionError": ZeroDivisionError, "ArithmeticError": ArithmeticError,
        "RuntimeError": RuntimeError, "StopIteration": StopIteration, "OverflowError": OverflowError,
        "__import__": _safe_import,
    }
    namespace: dict = {"pd": pd, "np": np, "__builtins__": safe_builtins}
    for df_name, records in dataframes_json.items():
        try:
            namespace[df_name] = pd.DataFrame(records)
        except Exception as e:
            return {"error": f"Error cargando dataset '{df_name}': {e}", "traceback": ""}

    # duckdb opcional: registramos cada DataFrame como vista para que
    # duckdb.query("... FROM <nombre>") funcione SIN el replacement-scan (que hace
    # 'import inspect' — bloqueado por el sandbox y un vector de escape).
    try:
        import duckdb
        for _name, _val in list(namespace.items()):
            if isinstance(_val, pd.DataFrame):
                duckdb.register(_name, _val)
        namespace["duckdb"] = duckdb
    except Exception:
        pass

    try:
        exec(compile(code, "<computed_dataset>", "exec"), namespace)
    except Exception:
        return {"error": "Error ejecutando el código", "traceback": traceback.format_exc()}

    result_df = namespace.get("result")
    if result_df is None:
        return {"error": "El código debe asignar el resultado a la variable 'result'.", "traceback": ""}
    if not isinstance(result_df, pd.DataFrame):
        return {"error": f"'result' debe ser un pandas DataFrame, no {type(result_df).__name__}.", "traceback": ""}
    if result_df.empty and len(result_df.columns) == 0:
        return {"error": "El DataFrame resultado no tiene columnas.", "traceback": ""}

    columns, seen = [], set()
    for col_name in result_df.columns:
        key = _slugify(col_name)
        base = key
        n = 1
        while key in seen:
            key = f"{base}_{n}"; n += 1
        seen.add(key)
        columns.append({"name": str(col_name), "field_key": key, "data_type": _infer_data_type(result_df[col_name])})

    col_map = {str(c): columns[i]["field_key"] for i, c in enumerate(result_df.columns)}
    records_out = [{col_map[str(k)]: _clean_value(v) for k, v in row.items()} for _, row in result_df.iterrows()]
    return {"columns": columns, "records": records_out, "error": None}


if __name__ == "__main__":
    try:
        event = json.load(sys.stdin)
        out = run(event)
    except MemoryError:
        out = {"error": "El script superó el límite de memoria.", "traceback": ""}
    except Exception:
        out = {"error": "Fallo interno del runner", "traceback": traceback.format_exc()}
    sys.stdout.write(json.dumps(out))
