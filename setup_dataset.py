import urllib.request, json

BASE = "http://localhost:8000"

def post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# 1. Crear dataset
ds = post("/datasets", {"name": "Eventos Gestora", "description": "Registro de asistentes a eventos de inversión"})
did = ds["id"]
print(f"Dataset creado: {did}")

# 2. Columnas
columns = [
    {"name": "Nombres y Apellidos",       "field_key": "nombres_apellidos",    "data_type": "text",   "rules": {"required": True}, "position": 0},
    {"name": "Asistencia al evento",      "field_key": "asistencia",           "data_type": "enum",   "rules": {"options": ["Asistió solo", "Asistió con acompañante", "No asistió", "Canceló"]}, "position": 1},
    {"name": "Fecha del Evento",          "field_key": "fecha_evento",         "data_type": "date",   "rules": {}, "position": 2},
    {"name": "Número de teléfono",        "field_key": "telefono",             "data_type": "text",   "rules": {}, "position": 3},
    {"name": "DNI/CE",                    "field_key": "dni_ce",               "data_type": "text",   "rules": {}, "position": 4},
    {"name": "Correo",                    "field_key": "correo",               "data_type": "text",   "rules": {}, "position": 5},
    {"name": "Es lead inversionista",     "field_key": "es_lead",              "data_type": "enum",   "rules": {"options": ["Si", "No"]}, "position": 6},
    {"name": "Nombres del invitado",      "field_key": "nombre_invitado",      "data_type": "text",   "rules": {}, "position": 7},
    {"name": "Propietario del contacto",  "field_key": "propietario_contacto", "data_type": "text",   "rules": {}, "position": 8},
    {"name": "Productos de inversión",    "field_key": "productos_inversion",  "data_type": "text",   "rules": {}, "position": 9},
    {"name": "Canal Gestora",             "field_key": "canal_gestora",        "data_type": "text",   "rules": {}, "position": 10},
    {"name": "Número de negocios",        "field_key": "num_negocios",         "data_type": "number", "rules": {"min": 0}, "position": 11},
    {"name": "Última modificación",       "field_key": "ultima_modificacion",  "data_type": "date",   "rules": {}, "position": 12},
    {"name": "Fecha de creación",         "field_key": "fecha_creacion",       "data_type": "date",   "rules": {}, "position": 13},
    {"name": "Fecha de actualización",    "field_key": "fecha_actualizacion",  "data_type": "date",   "rules": {}, "position": 14},
]

for col in columns:
    r = post(f"/datasets/{did}/columns", col)
    print(f"  Col [{r['position']}] {r['name']} ({r['data_type']})")

print(f"\nDataset ID: {did}")
print("Listo para importar Excel.")
