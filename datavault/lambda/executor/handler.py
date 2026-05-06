"""
DataVault Lambda Executor
Runs user-supplied Python code in a sandboxed environment.

Input event:
  {
    "code": "result = pedidos.merge(...)",
    "dataframes": {
      "pedidos": [{"__id__": "uuid", "col1": "val", ...}, ...],
      "productos": [...]
    }
  }

Output:
  On success:
  {
    "columns": [{"name": "col", "field_key": "col", "data_type": "text"}, ...],
    "records": [{"col": "val", ...}, ...],
    "error": null
  }
  On error:
  {
    "error": "description",
    "traceback": "..."
  }
"""
import json
import traceback
import math
import pandas as pd
import numpy as np


def _infer_data_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_integer_dtype(series) or pd.api.types.is_float_dtype(series):
        return "number"
    # Try parsing as date
    if series.dtype == object:
        sample = series.dropna().head(5)
        try:
            pd.to_datetime(sample)
            return "date"
        except Exception:
            pass
    return "text"


def _slugify(name: str) -> str:
    slug = name.lower().replace(" ", "_").replace("-", "_")
    return "".join(c if c.isalnum() or c == "_" else "_" for c in slug)


def _clean_value(v):
    """Convert non-JSON-serializable values to safe types."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


def handler(event, context):
    code = event.get("code", "").strip()
    dataframes_json: dict = event.get("dataframes", {})

    if not code:
        return {"error": "No se proporcionó código", "traceback": ""}

    # Build execution namespace with DataFrames
    namespace: dict = {
        "pd": pd,
        "np": np,
        "__builtins__": {
            # Allow safe builtins only
            "print": print,
            "len": len, "range": range, "enumerate": enumerate,
            "zip": zip, "map": map, "filter": filter,
            "list": list, "dict": dict, "set": set, "tuple": tuple,
            "str": str, "int": int, "float": float, "bool": bool,
            "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
            "sorted": sorted, "reversed": reversed,
            "isinstance": isinstance, "type": type,
            "True": True, "False": False, "None": None,
        },
    }

    for df_name, records in dataframes_json.items():
        try:
            namespace[df_name] = pd.DataFrame(records)
        except Exception as e:
            return {"error": f"Error cargando dataset '{df_name}': {str(e)}", "traceback": ""}

    # Execute user code
    try:
        exec(compile(code, "<computed_dataset>", "exec"), namespace)
    except Exception:
        return {
            "error": "Error ejecutando el código",
            "traceback": traceback.format_exc(),
        }

    # Validate result
    result_df = namespace.get("result")
    if result_df is None:
        return {
            "error": "El código debe asignar el resultado a la variable 'result'. Ejemplo: result = df.groupby('col').sum()",
            "traceback": "",
        }
    if not isinstance(result_df, pd.DataFrame):
        return {
            "error": f"'result' debe ser un pandas DataFrame, pero es {type(result_df).__name__}",
            "traceback": "",
        }
    if result_df.empty and len(result_df.columns) == 0:
        return {"error": "El DataFrame resultado está vacío y no tiene columnas", "traceback": ""}

    # Build column definitions
    columns = []
    seen_keys = set()
    for col_name in result_df.columns:
        field_key = _slugify(str(col_name))
        # Deduplicate field keys
        original_key = field_key
        n = 1
        while field_key in seen_keys:
            field_key = f"{original_key}_{n}"
            n += 1
        seen_keys.add(field_key)
        columns.append({
            "name": str(col_name),
            "field_key": field_key,
            "data_type": _infer_data_type(result_df[col_name]),
        })

    # Build records — map column names to field_keys
    col_map = {str(col_name): columns[i]["field_key"] for i, col_name in enumerate(result_df.columns)}
    records_out = []
    for _, row in result_df.iterrows():
        record_data = {col_map[str(k)]: _clean_value(v) for k, v in row.items()}
        records_out.append(record_data)

    return {
        "columns": columns,
        "records": records_out,
        "error": None,
    }
