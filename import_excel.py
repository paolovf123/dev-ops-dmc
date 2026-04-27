import urllib.request, urllib.parse, json, openpyxl, io, os

BASE = "http://localhost:8000"
DATASET_ID = "1c96630f-5e7d-419c-a0f7-8edb555b47b5"
EXCEL_PATH = r"C:\Users\USER\Documents\migra\Bd_Eventos Gestora.xlsx"

# Mapeo: nombre de columna en Excel (lower) -> field_key en DataVault
FIELD_MAP = {
    "nombres y apellidos":                      "nombres_apellidos",
    "¿asistirá al evento?":                     "asistencia",
    "asistira al evento?":                      "asistencia",
    "fecha del evento":                         "fecha_evento",
    "número de teléfono":                       "telefono",
    "numero de telefono":                       "telefono",
    "dni/ce":                                   "dni_ce",
    "correo":                                   "correo",
    "¿es lead inversionista?":                  "es_lead",
    "es lead inversionista?":                   "es_lead",
    "nombres y apellidos del invitado":         "nombre_invitado",
    "propietario del contacto inv. gestora":    "propietario_contacto",
    "productos de inversión asociados":         "productos_inversion",
    "productos de inversion asociados":         "productos_inversion",
    "canal gestora":                            "canal_gestora",
    "número de negocios asociados":             "num_negocios",
    "numero de negocios asociados":             "num_negocios",
    "última modificación":                      "ultima_modificacion",
    "ultima modificacion":                      "ultima_modificacion",
    "fecha de creación":                        "fecha_creacion",
    "fecha de creacion":                        "fecha_creacion",
    "fecha de actualización de base":           "fecha_actualizacion",
    "fecha de actualizacion de base":           "fecha_actualizacion",
}

def post_record(data):
    body = json.dumps({"data": data}).encode()
    req = urllib.request.Request(
        f"{BASE}/datasets/{DATASET_ID}/records",
        data=body,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return True, None
    except urllib.error.HTTPError as e:
        return False, e.read().decode()

wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
total_ok = 0
total_err = 0

for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        continue

    # Detectar headers (strip + lower + normalizar encoding)
    raw_headers = rows[0]
    headers = []
    for h in raw_headers:
        if h is None:
            headers.append(None)
            continue
        normalized = str(h).strip().lower()
        # Intentar mapear directamente o con encode/decode para caracteres especiales
        headers.append(normalized)

    print(f"\n=== Hoja: {sheet_name} ({len(rows)-1} registros) ===")

    ok = err = 0
    for i, row in enumerate(rows[1:], 2):
        data = {}
        for j, cell in enumerate(row):
            if j >= len(headers) or headers[j] is None:
                continue
            field_key = FIELD_MAP.get(headers[j])
            if field_key is None:
                # Intentar buscar por coincidencia parcial
                for k, v in FIELD_MAP.items():
                    if k in headers[j] or headers[j] in k:
                        field_key = v
                        break
            if field_key and cell is not None:
                # Convertir fechas a string ISO
                if hasattr(cell, 'isoformat'):
                    data[field_key] = cell.isoformat()
                else:
                    data[field_key] = str(cell).strip() if cell != "" else None

        if not data.get("nombres_apellidos"):
            continue  # saltar filas vacías

        success, error = post_record(data)
        if success:
            ok += 1
        else:
            err += 1
            if err <= 3:
                print(f"  Error fila {i}: {error[:120]}")

    print(f"  Importados: {ok} OK, {err} errores")
    total_ok += ok
    total_err += err

print(f"\nTotal: {total_ok} registros importados, {total_err} errores")
