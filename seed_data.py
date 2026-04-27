"""
Seed script: 5 datasets vinculados con 100 registros cada uno.
Esquema: Clientes → Productos → Solicitudes → Desembolsos → Pagos
"""
import requests, random, json
from datetime import date, timedelta

BASE = "http://localhost:8000"

def api(method, path, **kwargs):
    r = requests.request(method, BASE + path, **kwargs)
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text[:200]}")
        r.raise_for_status()
    return r.json()

def create_dataset(name, desc=""):
    return api("POST", "/datasets", json={"name": name, "description": desc})

def create_col(ds_id, name, field_key, data_type, rules=None, position=0):
    return api("POST", f"/datasets/{ds_id}/columns", json={
        "name": name, "field_key": field_key,
        "data_type": data_type, "rules": rules or {}, "position": position
    })

def create_record(ds_id, data):
    return api("POST", f"/datasets/{ds_id}/records", json={"data": data})

def rand_date(start_year=2022, end_year=2024):
    start = date(start_year, 1, 1)
    end   = date(end_year, 12, 31)
    return str(start + timedelta(days=random.randint(0, (end - start).days)))

# ─── Data pools ──────────────────────────────────────────────────────────────
NOMBRES = ["Ana García","Luis Torres","María Rodríguez","Carlos Mamani","Rosa Quispe",
    "Juan Flores","Carmen Silva","Pedro Huanca","Lucia Mendoza","Miguel Poma",
    "Isabel Ríos","Roberto Condori","Elena Vargas","Francisco Soto","Gloria Apaza",
    "Andrés León","Pilar Ramos","Héctor Ccorimanya","Sofía Huaranga","Dante Medina",
    "Patricia Bautista","César Ccama","Natalia Chávez","Willy Lazo","Fernanda Cruz",
    "Óscar Salas","Verónica Pinto","Edwin Tito","Sandra Herrera","Mario Yupanqui",
    "Lorena Pacheco","Augusto Quispe","Teresa Cari","Jorge Llanos","Miriam Zevallos",
    "Víctor Ccallo","Alicia Paredes","Raúl Huanca","Graciela Espinoza","Nelson Cusi",
    "Margarita Villanueva","Ernesto Paucar","Cecilia Limachi","Alfredo Gutierrez","Ruth Mamani",
    "Antonio Flores","Beatriz Quispe","Ricardo Silva","Norma Arana","Paulo Torres"]

DISTRITOS = ["San Juan de Lurigancho","Villa El Salvador","Los Olivos","San Martín de Porres",
    "Callao","Villa María del Triunfo","Ate Vitarte","Comas","El Agustino","Independencia",
    "Puente Piedra","San Juan de Miraflores","Chorrillos","Ventanilla","Carabayllo"]

TIPOS_CLIENTE = ["Nuevo","Recurrente","VIP","Premium","Inactivo"]
ACTIVIDADES   = ["Comercio","Servicios","Manufactura","Transporte","Agropecuario","Construcción"]
ESTADOS_SOL   = ["Aprobada","Rechazada","En evaluación","Desembolsada","Cancelada"]
ESTADOS_DES   = ["Vigente","Cancelado","En mora","Prepagado","Reprogramado"]
ESTADOS_PAGO  = ["Pagado","Pendiente","Vencido","Parcial"]
TIPOS_PROD    = ["Préstamo Personal","Préstamo Microempresa","Capital de Trabajo",
    "Crédito Vehicular","Préstamo Solidario","Crédito Revolvente"]
CANALES       = ["Agencia","Digital","Call Center","Convenio","Referido"]

def dni():  return str(random.randint(10000000, 99999999))
def phone(): return f"9{random.randint(10000000,99999999)}"
def cod(prefix, n): return f"{prefix}-{str(n).zfill(4)}"

# ════════════════════════════════════════════════════════════════════════════════
# 1. CLIENTES
# ════════════════════════════════════════════════════════════════════════════════
print("\n━━━ 1/5  Clientes ━━━")
ds_cli = create_dataset("Clientes", "Cartera de clientes de PrestaMype")
print(f"  Dataset creado: {ds_cli['id']}")

for i, (name, fk, dt, rules, pos) in enumerate([
    ("Código cliente",  "id",              "text",   {"required": True}, 0),
    ("Nombre completo", "nombre",          "text",   {"required": True}, 1),
    ("DNI / CE",        "dni",             "text",   {"required": True}, 2),
    ("Teléfono",        "telefono",        "text",   {}, 3),
    ("Distrito",        "distrito",        "enum",   {"options": DISTRITOS}, 4),
    ("Actividad",       "actividad",       "enum",   {"options": ACTIVIDADES}, 5),
    ("Tipo cliente",    "tipo_cliente",    "enum",   {"options": TIPOS_CLIENTE}, 6),
    ("Ingreso mensual", "ingreso_mensual", "number", {"min": 500, "max": 15000}, 7),
    ("Fecha registro",  "fecha_registro",  "date",   {}, 8),
]):
    create_col(ds_cli["id"], name, fk, dt, rules, pos)

cli_ids = []
for i in range(1, 101):
    rec = create_record(ds_cli["id"], {
        "id":             cod("CLI", i),
        "nombre":         random.choice(NOMBRES),
        "dni":            dni(),
        "telefono":       phone(),
        "distrito":       random.choice(DISTRITOS),
        "actividad":      random.choice(ACTIVIDADES),
        "tipo_cliente":   random.choice(TIPOS_CLIENTE),
        "ingreso_mensual": random.randint(800, 12000),
        "fecha_registro": rand_date(2020, 2023),
    })
    cli_ids.append(cod("CLI", i))
    if i % 20 == 0: print(f"  {i}/100 registros")

# ════════════════════════════════════════════════════════════════════════════════
# 2. PRODUCTOS
# ════════════════════════════════════════════════════════════════════════════════
print("\n━━━ 2/5  Productos ━━━")
ds_prod = create_dataset("Productos", "Catálogo de productos crediticios")
print(f"  Dataset creado: {ds_prod['id']}")

for name, fk, dt, rules, pos in [
    ("Código producto",  "id",              "text",   {"required": True}, 0),
    ("Nombre producto",  "nombre",          "text",   {"required": True}, 1),
    ("Tipo",             "tipo",            "enum",   {"options": TIPOS_PROD}, 2),
    ("Tasa mensual (%)", "tasa_mensual",    "number", {"min": 1, "max": 8}, 3),
    ("Plazo máx. (meses)","plazo_maximo",   "number", {"min": 3, "max": 60}, 4),
    ("Monto mínimo",     "monto_minimo",    "number", {"min": 500}, 5),
    ("Monto máximo",     "monto_maximo",    "number", {"min": 1000}, 6),
    ("Canal",            "canal",           "enum",   {"options": CANALES}, 7),
    ("Activo",           "activo",          "enum",   {"options": ["Sí","No"]}, 8),
]:
    create_col(ds_prod["id"], name, fk, dt, rules, pos)

prod_ids = []
for i in range(1, 101):
    tipo = random.choice(TIPOS_PROD)
    tasa = round(random.uniform(1.5, 6.5), 2)
    monto_min = random.choice([500, 1000, 2000, 3000, 5000])
    monto_max = monto_min * random.randint(5, 20)
    rec = create_record(ds_prod["id"], {
        "id":           cod("PRD", i),
        "nombre":       f"{tipo} {['Express','Flex','Plus','Max','Básico'][i%5]}",
        "tipo":         tipo,
        "tasa_mensual": tasa,
        "plazo_maximo": random.choice([6,12,18,24,36,48,60]),
        "monto_minimo": monto_min,
        "monto_maximo": monto_max,
        "canal":        random.choice(CANALES),
        "activo":       random.choice(["Sí","Sí","Sí","No"]),
    })
    prod_ids.append(cod("PRD", i))
    if i % 20 == 0: print(f"  {i}/100 registros")

# ════════════════════════════════════════════════════════════════════════════════
# 3. SOLICITUDES (FK → Clientes + Productos)
# ════════════════════════════════════════════════════════════════════════════════
print("\n━━━ 3/5  Solicitudes ━━━")
ds_sol = create_dataset("Solicitudes", "Solicitudes de crédito (vinculado a Clientes y Productos)")
print(f"  Dataset creado: {ds_sol['id']}")

for name, fk, dt, rules, pos in [
    ("Código solicitud",  "id",           "text",   {"required": True}, 0),
    ("ID Cliente",        "id_clientes",  "text",   {"required": True}, 1),
    ("ID Producto",       "id_productos", "text",   {"required": True}, 2),
    ("Monto solicitado",  "monto",        "number", {"min": 500}, 3),
    ("Plazo (meses)",     "plazo",        "number", {"min": 1, "max": 60}, 4),
    ("Estado",            "estado",       "enum",   {"options": ESTADOS_SOL}, 5),
    ("Analista",          "analista",     "text",   {}, 6),
    ("Fecha solicitud",   "fecha",        "date",   {}, 7),
    ("Puntaje crediticio","score",        "number", {"min": 300, "max": 900}, 8),
]:
    create_col(ds_sol["id"], name, fk, dt, rules, pos)

sol_ids = []
ANALISTAS = ["Julio Ríos","Carmen Huanca","Pedro Salas","Miriam Torres","Carlos Vega"]
for i in range(1, 101):
    monto = random.randint(1, 50) * 500
    rec = create_record(ds_sol["id"], {
        "id":           cod("SOL", i),
        "id_clientes":  random.choice(cli_ids),
        "id_productos": random.choice(prod_ids),
        "monto":        monto,
        "plazo":        random.choice([6,12,18,24,36]),
        "estado":       random.choice(ESTADOS_SOL),
        "analista":     random.choice(ANALISTAS),
        "fecha":        rand_date(2023, 2024),
        "score":        random.randint(400, 870),
    })
    sol_ids.append(cod("SOL", i))
    if i % 20 == 0: print(f"  {i}/100 registros")

# ════════════════════════════════════════════════════════════════════════════════
# 4. DESEMBOLSOS (FK → Solicitudes)
# ════════════════════════════════════════════════════════════════════════════════
print("\n━━━ 4/5  Desembolsos ━━━")
ds_des = create_dataset("Desembolsos", "Registro de desembolsos (vinculado a Solicitudes)")
print(f"  Dataset creado: {ds_des['id']}")

for name, fk, dt, rules, pos in [
    ("Código desembolso", "id",             "text",   {"required": True}, 0),
    ("ID Solicitud",      "id_solicitudes", "text",   {"required": True}, 1),
    ("Monto desembolsado","monto",          "number", {"min": 500}, 2),
    ("Cuota mensual",     "cuota",          "number", {"min": 50}, 3),
    ("Tasa aplicada (%)", "tasa",           "number", {"min": 1, "max": 8}, 4),
    ("Estado",            "estado",         "enum",   {"options": ESTADOS_DES}, 5),
    ("Fecha desembolso",  "fecha",          "date",   {}, 6),
    ("Fecha vencimiento", "fecha_vcto",     "date",   {}, 7),
    ("Saldo pendiente",   "saldo",          "number", {"min": 0}, 8),
]:
    create_col(ds_des["id"], name, fk, dt, rules, pos)

des_ids = []
for i in range(1, 101):
    monto = random.randint(2, 40) * 500
    tasa   = round(random.uniform(1.8, 5.5), 2)
    plazo  = random.choice([6,12,18,24,36])
    cuota  = round(monto * (tasa/100) / (1-(1+tasa/100)**-plazo), 2)
    f_des  = rand_date(2023, 2024)
    f_vcto = str(date.fromisoformat(f_des) + timedelta(days=plazo*30))
    saldo  = round(monto * random.uniform(0.1, 0.95), 2)
    rec = create_record(ds_des["id"], {
        "id":             cod("DES", i),
        "id_solicitudes": random.choice(sol_ids),
        "monto":          monto,
        "cuota":          cuota,
        "tasa":           tasa,
        "estado":         random.choice(ESTADOS_DES),
        "fecha":          f_des,
        "fecha_vcto":     f_vcto,
        "saldo":          saldo,
    })
    des_ids.append(cod("DES", i))
    if i % 20 == 0: print(f"  {i}/100 registros")

# ════════════════════════════════════════════════════════════════════════════════
# 5. PAGOS (FK → Desembolsos)
# ════════════════════════════════════════════════════════════════════════════════
print("\n━━━ 5/5  Pagos ━━━")
ds_pag = create_dataset("Pagos", "Historial de pagos de cuotas (vinculado a Desembolsos)")
print(f"  Dataset creado: {ds_pag['id']}")

for name, fk, dt, rules, pos in [
    ("Código pago",      "id",             "text",   {"required": True}, 0),
    ("ID Desembolso",    "id_desembolsos", "text",   {"required": True}, 1),
    ("N° cuota",         "nro_cuota",      "number", {"min": 1}, 2),
    ("Monto pagado",     "monto_pagado",   "number", {"min": 0}, 3),
    ("Monto cuota",      "monto_cuota",    "number", {"min": 0}, 4),
    ("Estado pago",      "estado",         "enum",   {"options": ESTADOS_PAGO}, 5),
    ("Fecha pago",       "fecha_pago",     "date",   {}, 6),
    ("Fecha vencimiento","fecha_vcto",     "date",   {}, 7),
    ("Canal cobro",      "canal",          "enum",   {"options": ["Caja","Agente BCP","Yape","Plin","Transferencia","Débito automático"]}, 8),
]:
    create_col(ds_pag["id"], name, fk, dt, rules, pos)

for i in range(1, 101):
    monto_cuota = round(random.uniform(150, 1200), 2)
    estado      = random.choice(ESTADOS_PAGO)
    pagado      = monto_cuota if estado == "Pagado" else (
                  round(monto_cuota * random.uniform(0.3, 0.9), 2) if estado == "Parcial" else 0)
    f_vcto      = rand_date(2023, 2025)
    f_pago      = str(date.fromisoformat(f_vcto) + timedelta(days=random.randint(-5, 15))) if estado != "Pendiente" else ""
    create_record(ds_pag["id"], {
        "id":             cod("PAG", i),
        "id_desembolsos": random.choice(des_ids),
        "nro_cuota":      random.randint(1, 24),
        "monto_pagado":   pagado,
        "monto_cuota":    monto_cuota,
        "estado":         estado,
        "fecha_pago":     f_pago,
        "fecha_vcto":     f_vcto,
        "canal":          random.choice(["Caja","Agente BCP","Yape","Plin","Transferencia","Débito automático"]),
    })
    if i % 20 == 0: print(f"  {i}/100 registros")

print(f"""
╔══════════════════════════════════════════════════════════╗
║  ✅  5 datasets · 500 registros creados                  ║
║                                                          ║
║  Clientes     {ds_cli['id'][:8]}…  ←─────────────────┐   ║
║  Productos    {ds_prod['id'][:8]}…  ←──────────────┐  │   ║
║  Solicitudes  {ds_sol['id'][:8]}…  (id_clientes, id_productos) ║
║  Desembolsos  {ds_des['id'][:8]}…  (id_solicitudes)  ↑  ║
║  Pagos        {ds_pag['id'][:8]}…  (id_desembolsos) ↑   ║
╚══════════════════════════════════════════════════════════╝
""")
