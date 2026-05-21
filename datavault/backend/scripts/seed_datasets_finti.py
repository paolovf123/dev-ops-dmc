import asyncio, uuid, random
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from database import engine
from models import Dataset, ColumnDefinition, Record, Workspace

S = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

def rid(): return str(uuid.uuid4())

async def get_ws(db, name):
    r = await db.execute(select(Workspace).where(Workspace.name == name))
    return r.scalar_one()

async def create_dataset(db, ws_id, name, desc, cols, records):
    ds = Dataset(name=name, description=desc, workspace_id=ws_id)
    db.add(ds)
    await db.flush()
    for i, (col_name, field_key, data_type, rules) in enumerate(cols):
        db.add(ColumnDefinition(
            dataset_id=ds.id, name=col_name, field_key=field_key,
            data_type=data_type, rules=rules, position=i
        ))
    for rec_data in records:
        db.add(Record(dataset_id=ds.id, data=rec_data))
    print(f"  + {name} ({len(records)} registros)")
    return ds.id

async def main():
    async with S() as db:
        fin = await get_ws(db, "Finanzas")
        ti  = await get_ws(db, "TI")

        # ── FINANZAS ──────────────────────────────────────────────────────

        # 1. Presupuesto
        presupuesto_cols = [
            ("Área",        "area",        "text",   {"required": True}),
            ("Concepto",    "concepto",    "text",   {"required": True}),
            ("Monto Aprobado", "monto_aprobado", "number", {"required": True, "min": 0}),
            ("Monto Ejecutado", "monto_ejecutado", "number", {"min": 0}),
            ("Período",     "periodo",     "text",   {}),
            ("Estado",      "estado",      "enum",   {"options": ["Aprobado", "En ejecución", "Cerrado", "Suspendido"]}),
        ]
        areas = ["Ventas", "Operaciones", "RRHH", "TI", "Marketing", "Logística"]
        conceptos = ["Salarios", "Software", "Equipos", "Capacitación", "Viajes", "Servicios", "Infraestructura"]
        presupuesto_recs = []
        for area in areas:
            for concepto in random.sample(conceptos, random.randint(2, 4)):
                aprobado = random.randint(5000, 80000)
                ejecutado = random.randint(0, aprobado)
                presupuesto_recs.append({
                    "area": area, "concepto": concepto,
                    "monto_aprobado": aprobado, "monto_ejecutado": ejecutado,
                    "periodo": random.choice(["2025-Q1","2025-Q2","2025-Q3","2025-Q4","2026-Q1"]),
                    "estado": random.choice(["Aprobado","En ejecución","Cerrado"]),
                })
        pid = await create_dataset(db, fin.id, "Presupuesto", "Presupuestos por área y concepto", presupuesto_cols, presupuesto_recs)

        # 2. Facturas
        facturas_cols = [
            ("Número",       "numero",       "text",   {"required": True}),
            ("Proveedor",    "proveedor",    "text",   {"required": True}),
            ("Concepto",     "concepto",     "text",   {}),
            ("Monto",        "monto",        "number", {"required": True, "min": 0}),
            ("Fecha Emisión","fecha_emision","date",   {}),
            ("Estado",       "estado",       "enum",   {"options": ["Pendiente", "Pagada", "Vencida", "Anulada"]}),
            ("id_presupuesto","id_presupuesto","text", {}),
        ]
        proveedores = ["Tech Solutions SAC","Servicios Generales SRL","Consultora ABC","Proveedor XYZ","Distribuidora Norte","Software Corp"]
        base = date(2025, 1, 1)
        facturas_recs = []
        for i in range(80):
            monto = round(random.uniform(500, 15000), 2)
            fecha = base + timedelta(days=random.randint(0, 365))
            facturas_recs.append({
                "numero": f"F-{2025000 + i + 1}",
                "proveedor": random.choice(proveedores),
                "concepto": random.choice(conceptos),
                "monto": monto,
                "fecha_emision": fecha.isoformat(),
                "estado": random.choice(["Pendiente","Pagada","Pagada","Vencida"]),
            })
        await create_dataset(db, fin.id, "Facturas", "Registro de facturas de proveedores", facturas_cols, facturas_recs)

        # 3. Centro de Costos
        costos_cols = [
            ("Centro",       "centro",      "text",   {"required": True}),
            ("Categoría",    "categoria",   "enum",   {"options": ["Directo","Indirecto","Administrativo","Operativo"]}),
            ("Responsable",  "responsable", "text",   {}),
            ("Costo Fijo",   "costo_fijo",  "number", {"min": 0}),
            ("Costo Variable","costo_variable","number",{"min": 0}),
            ("Mes",          "mes",         "text",   {}),
        ]
        centros = ["Producción","Administración","Comercial","Logística","Sistemas","RRHH"]
        meses = ["Ene-2025","Feb-2025","Mar-2025","Abr-2025","May-2025","Jun-2025"]
        costos_recs = []
        for centro in centros:
            for mes in meses:
                costos_recs.append({
                    "centro": centro,
                    "categoria": random.choice(["Directo","Indirecto","Administrativo","Operativo"]),
                    "responsable": random.choice(["Fernando Quispe","Natalia Flores","Oscar Huanca"]),
                    "costo_fijo": random.randint(2000, 20000),
                    "costo_variable": random.randint(500, 8000),
                    "mes": mes,
                })
        await create_dataset(db, fin.id, "CentrosCosto", "Costos fijos y variables por centro", costos_cols, costos_recs)

        # 4. Flujo de Caja
        flujo_cols = [
            ("Fecha",        "fecha",       "date",   {"required": True}),
            ("Tipo",         "tipo",        "enum",   {"options": ["Ingreso","Egreso"]}),
            ("Categoría",    "categoria",   "text",   {}),
            ("Monto",        "monto",       "number", {"required": True, "min": 0}),
            ("Descripción",  "descripcion", "text",   {}),
            ("Saldo",        "saldo",       "number", {}),
        ]
        saldo = 50000
        flujo_recs = []
        for i in range(120):
            fecha = base + timedelta(days=i * 3)
            tipo = random.choice(["Ingreso","Ingreso","Egreso"])
            monto = random.randint(1000, 25000)
            saldo += monto if tipo == "Ingreso" else -monto
            flujo_recs.append({
                "fecha": fecha.isoformat(),
                "tipo": tipo,
                "categoria": random.choice(["Ventas","Servicios","Nómina","Proveedores","Impuestos","Inversión"]),
                "monto": monto,
                "descripcion": f"Movimiento {i+1}",
                "saldo": saldo,
            })
        await create_dataset(db, fin.id, "FlujoCaja", "Movimientos de caja diarios", flujo_cols, flujo_recs)

        # ── TI ────────────────────────────────────────────────────────────

        # 5. Proyectos TI
        proyectos_cols = [
            ("Nombre",        "nombre",       "text",   {"required": True}),
            ("Descripción",   "descripcion",  "text",   {}),
            ("Líder",         "lider",        "text",   {}),
            ("Fecha Inicio",  "fecha_inicio", "date",   {}),
            ("Fecha Fin",     "fecha_fin",    "date",   {}),
            ("Estado",        "estado",       "enum",   {"options": ["Planificado","En curso","Pausado","Completado","Cancelado"]}),
            ("Prioridad",     "prioridad",    "enum",   {"options": ["Alta","Media","Baja"]}),
            ("Presupuesto",   "presupuesto",  "number", {"min": 0}),
        ]
        proyectos = [
            ("Migración Cloud","Mover infraestructura a AWS","Ricardo Ponce","2025-01-15","2025-06-30","Completado","Alta",85000),
            ("Sistema ERP","Implementar ERP corporativo","Claudia Nieto","2025-03-01","2025-12-31","En curso","Alta",150000),
            ("App Móvil","Desarrollo app para clientes","Ricardo Ponce","2025-02-01","2025-08-31","En curso","Media",60000),
            ("Seguridad Redes","Auditoría y mejora de seguridad","Hector Mamani","2025-04-01","2025-05-31","Completado","Alta",25000),
            ("BI Dashboard","Tableros de inteligencia de negocio","Claudia Nieto","2025-05-01","2025-09-30","En curso","Media",40000),
            ("Backup Automático","Sistema automatizado de backups","Hector Mamani","2025-01-01","2025-02-28","Completado","Baja",8000),
            ("Portal RRHH","Portal self-service para empleados","Jessica Apaza","2025-06-01","2025-11-30","Planificado","Media",35000),
            ("Renovación Equipos","Reemplazo de equipos obsoletos","Ricardo Ponce","2025-07-01","2025-08-31","Planificado","Media",45000),
        ]
        proyecto_ids = []
        for p in proyectos:
            pass
        proy_recs = [
            {"nombre":p[0],"descripcion":p[1],"lider":p[2],"fecha_inicio":p[3],
             "fecha_fin":p[4],"estado":p[5],"prioridad":p[6],"presupuesto":p[7]}
            for p in proyectos
        ]
        proy_ds_id = await create_dataset(db, ti.id, "ProyectosTI", "Proyectos del área de TI", proyectos_cols, proy_recs)

        # 6. Inventario TI
        inv_cols = [
            ("Código",       "codigo",      "text",   {"required": True}),
            ("Nombre",       "nombre",      "text",   {"required": True}),
            ("Tipo",         "tipo",        "enum",   {"options": ["Laptop","Desktop","Servidor","Switch","Router","Monitor","Impresora","Otro"]}),
            ("Marca",        "marca",       "text",   {}),
            ("Modelo",       "modelo",      "text",   {}),
            ("Asignado a",   "asignado_a",  "text",   {}),
            ("Estado",       "estado",      "enum",   {"options": ["Activo","En reparación","Dado de baja","Almacén"]}),
            ("Año compra",   "anio_compra", "number", {}),
        ]
        tipos = ["Laptop","Desktop","Monitor","Laptop","Laptop","Switch","Router"]
        marcas = {"Laptop":["Dell","HP","Lenovo","Apple"],"Desktop":["Dell","HP","Lenovo"],
                  "Monitor":["LG","Samsung","Dell"],"Switch":["Cisco","HP"],"Router":["Cisco","TP-Link"]}
        empleados_ti = ["Ricardo Ponce","Claudia Nieto","Hector Mamani","Jessica Apaza","Andres Paredes"]
        inv_recs = []
        for i in range(60):
            tipo = random.choice(tipos)
            marca_list = marcas.get(tipo, ["Generic"])
            inv_recs.append({
                "codigo": f"TI-{1000+i}",
                "nombre": f"{tipo} {i+1}",
                "tipo": tipo,
                "marca": random.choice(marca_list),
                "modelo": f"Model-{random.randint(100,999)}",
                "asignado_a": random.choice(empleados_ti + [""]),
                "estado": random.choice(["Activo","Activo","Activo","En reparación","Almacén"]),
                "anio_compra": random.randint(2018, 2025),
            })
        await create_dataset(db, ti.id, "InventarioTI", "Inventario de equipos tecnológicos", inv_cols, inv_recs)

        # 7. Tickets Soporte
        tickets_cols = [
            ("Ticket",       "ticket",      "text",   {"required": True}),
            ("Solicitante",  "solicitante", "text",   {"required": True}),
            ("Área",         "area",        "text",   {}),
            ("Categoría",    "categoria",   "enum",   {"options": ["Hardware","Software","Red","Accesos","Correo","Otro"]}),
            ("Prioridad",    "prioridad",   "enum",   {"options": ["Crítica","Alta","Media","Baja"]}),
            ("Estado",       "estado",      "enum",   {"options": ["Abierto","En atención","Resuelto","Cerrado"]}),
            ("Técnico",      "tecnico",     "text",   {}),
            ("Fecha apertura","fecha_apertura","date", {}),
        ]
        tecnicos = ["Hector Mamani","Jessica Apaza","Andres Paredes"]
        solicitantes = ["Luis Mendoza","Ana Torres","Mario García","Elena Ruiz","Fernando Quispe",
                        "Patricia Ruiz","Carmen Vega","Valeria Mora","Carlos López","Sofia Pérez"]
        ticket_recs = []
        for i in range(100):
            fecha = base + timedelta(days=random.randint(0, 365))
            ticket_recs.append({
                "ticket": f"TKT-{10000+i}",
                "solicitante": random.choice(solicitantes),
                "area": random.choice(areas),
                "categoria": random.choice(["Hardware","Software","Red","Accesos","Correo","Otro"]),
                "prioridad": random.choice(["Crítica","Alta","Alta","Media","Media","Baja"]),
                "estado": random.choice(["Abierto","En atención","Resuelto","Resuelto","Cerrado"]),
                "tecnico": random.choice(tecnicos),
                "fecha_apertura": fecha.isoformat(),
            })
        await create_dataset(db, ti.id, "TicketsSoporte", "Tickets de soporte técnico", tickets_cols, ticket_recs)

        # 8. Licencias Software
        lic_cols = [
            ("Software",     "software",    "text",   {"required": True}),
            ("Proveedor",    "proveedor",   "text",   {}),
            ("Tipo licencia","tipo_licencia","enum",  {"options": ["Perpetua","Suscripción anual","Mensual","Open source"]}),
            ("Cant. licencias","cant_licencias","number",{"min":1}),
            ("Cant. usadas", "cant_usadas", "number", {"min":0}),
            ("Costo anual",  "costo_anual", "number", {"min":0}),
            ("Vencimiento",  "vencimiento", "date",   {}),
            ("Estado",       "estado",      "enum",   {"options": ["Vigente","Por vencer","Vencida"]}),
        ]
        softwares = [
            ("Microsoft 365","Microsoft","Suscripción anual",50,47,12000,"2026-01-31","Vigente"),
            ("Adobe CC","Adobe","Suscripción anual",10,8,6000,"2025-12-31","Vigente"),
            ("Slack","Slack Inc","Suscripción anual",80,65,4800,"2025-11-30","Por vencer"),
            ("Jira","Atlassian","Suscripción anual",25,22,3000,"2025-09-30","Por vencer"),
            ("AutoCAD","Autodesk","Suscripción anual",5,3,8500,"2026-03-31","Vigente"),
            ("Windows Server","Microsoft","Perpetua",8,8,15000,"2030-01-01","Vigente"),
            ("Antivirus Corp","Kaspersky","Suscripción anual",100,98,2500,"2025-08-31","Por vencer"),
            ("Zoom","Zoom","Mensual",30,28,1800,"2025-06-30","Vencida"),
            ("VS Code","Microsoft","Open source",0,0,0,"2099-12-31","Vigente"),
            ("PostgreSQL","PostgreSQL","Open source",0,0,0,"2099-12-31","Vigente"),
        ]
        lic_recs = [
            {"software":s[0],"proveedor":s[1],"tipo_licencia":s[2],"cant_licencias":s[3],
             "cant_usadas":s[4],"costo_anual":s[5],"vencimiento":s[6],"estado":s[7]}
            for s in softwares
        ]
        await create_dataset(db, ti.id, "LicenciasSoftware", "Control de licencias de software", lic_cols, lic_recs)

        await db.commit()
        print("\n✓ Datasets de Finanzas y TI creados correctamente")

asyncio.run(main())
