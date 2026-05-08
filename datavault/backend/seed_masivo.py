"""
Seed masivo de datos de prueba para los 3 workspaces.
Agrega datasets con FK entre sí y ~500-800 registros adicionales por workspace.

Workspace Ventas:
  - Categoria (15), Producto (80), Cliente (120), Vendedor (15),
    Campana (10), Oportunidad (100), Pedido (150), DetallePedido (300)

Workspace Operaciones:
  - Almacen (5), Categoria (10), Proveedor (40), Producto (60),
    MovimientoStock (200), OrdenCompra (80), DetalleOrden (160)

Workspace RRHH:
  - Departamento (8), Cargo (20), Empleado (50),
    Asistencia (200), Evaluacion (80), Capacitacion (15), InscripcionCap (60)
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from models import Workspace, Dataset, ColumnDefinition, Record

DATABASE_URL = "postgresql+asyncpg://dev:dev@db/datavault"
engine = create_async_engine(DATABASE_URL, echo=False)
DB = async_sessionmaker(engine, expire_on_commit=False)

def utcnow(): return datetime.now(timezone.utc)
def rdate(days_ago=730): return (datetime.now() - timedelta(days=random.randint(0, days_ago))).strftime("%Y-%m-%d")
def rpick(lst): return random.choice(lst)

# ── Helpers ───────────────────────────────────────────────────────────────────

async def get_workspace(db, name):
    r = await db.execute(select(Workspace).where(Workspace.name == name))
    ws = r.scalar_one_or_none()
    if not ws:
        raise ValueError(f"Workspace '{name}' no encontrado. Ejecuta seed_workspaces.py primero.")
    return ws

async def make_dataset(db, ws, name, description):
    r = await db.execute(select(Dataset).where(Dataset.name == name, Dataset.workspace_id == ws.id))
    ds = r.scalar_one_or_none()
    if ds:
        print(f"  [=] Dataset ya existe: {name}")
        return ds
    ds = Dataset(name=name, description=description, workspace_id=ws.id, created_at=utcnow())
    db.add(ds)
    await db.flush()
    print(f"  [+] Dataset: {name}")
    return ds

async def add_columns(db, ds, cols_def):
    for i, c in enumerate(cols_def):
        db.add(ColumnDefinition(
            dataset_id=ds.id, name=c["name"], field_key=c["field_key"],
            data_type=c["data_type"], rules=c.get("rules", {}), position=i, created_at=utcnow()
        ))

async def add_records(db, ds, records):
    for r in records:
        db.add(Record(dataset_id=ds.id, data=r, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> {len(records)} registros en {ds.name}")

# ── VENTAS ────────────────────────────────────────────────────────────────────

async def seed_ventas(db):
    ws = await get_workspace(db, "Ventas")
    print("\n=== Seed masivo: Ventas ===")

    # Categoria
    ds_cat = await make_dataset(db, ws, "CategoriaProducto", "Categorías de productos comerciales")
    await add_columns(db, ds_cat, [
        {"name": "Nombre",      "field_key": "nombre",      "data_type": "text",    "rules": {"required": True}},
        {"name": "Descripción", "field_key": "descripcion", "data_type": "text",    "rules": {}},
        {"name": "Activa",      "field_key": "activa",      "data_type": "boolean", "rules": {}},
    ])
    categorias = ["Electrónica", "Software", "Servicios", "Hardware", "Consultoría",
                  "Capacitación", "Soporte", "Cloud", "Seguridad", "Datos",
                  "Infraestructura", "Redes", "Automatización", "Analytics", "Marketing Digital"]
    cat_ids = []
    for cat in categorias:
        rec = Record(dataset_id=ds_cat.id, data={"nombre": cat, "descripcion": f"Productos de {cat}", "activa": True}, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); cat_ids.append(str(rec.id))
    print(f"    -> {len(cat_ids)} registros en CategoriaProducto")

    # Producto (con FK a CategoriaProducto via id_categoriaproducto)
    ds_prod = await make_dataset(db, ws, "Producto", "Catálogo de productos")
    await add_columns(db, ds_prod, [
        {"name": "Nombre",        "field_key": "nombre",               "data_type": "text",   "rules": {"required": True}},
        {"name": "Código",        "field_key": "codigo",               "data_type": "text",   "rules": {}},
        {"name": "Precio",        "field_key": "precio",               "data_type": "number", "rules": {"min": 0}},
        {"name": "Categoría",     "field_key": "id_categoriaproducto", "data_type": "text",   "rules": {}},
        {"name": "Stock mínimo",  "field_key": "stock_minimo",         "data_type": "number", "rules": {}},
        {"name": "Activo",        "field_key": "activo",               "data_type": "boolean","rules": {}},
    ])
    nombres_prod = [
        "CRM Enterprise", "ERP Básico", "ERP Pro", "Suite Analytics", "DataVault SaaS",
        "Firewall UTM", "Antivirus Corporativo", "Backup Cloud", "VPN Empresarial", "SIEM Pro",
        "Switch 24p", "Router Core", "Servidor Dell R740", "NAS 48TB", "UPS 3kVA",
        "Consultoría Impl.", "Capacitación TI", "Soporte 24/7", "Auditoría Seguridad", "Migración Cloud",
        "BI Dashboard", "ETL Pipeline", "Data Lake Setup", "ML Platform", "Reportería Avanzada",
        "Automatización RPA", "Chatbot IA", "API Gateway", "Microservicios Kit", "DevOps Toolkit",
        "Office 365 E3", "Adobe CC Team", "AutoCAD LT", "Antivirus 50u", "Backup Pro 1TB",
        "Cámara IP 4K", "Access Point WiFi6", "PDU Inteligente", "KVM Switch", "Monitor 32\" 4K",
        "Curso Python", "Curso Ciberseguridad", "Curso Cloud AWS", "Cert. ITIL", "Bootcamp DevOps",
        "Implementación SAP", "Integración ERP", "Desarrollo Web", "App Móvil Custom", "Portal RRHH",
        "Hosting Dedicado", "CDN Premium", "SSL Wildcard", "DRP as a Service", "SOC Gestionado",
        "Análisis Vulnerab.", "Pentest Web", "Hardening Serv.", "Compliance GDPR", "ISO 27001 Gap",
        "Licencia CAD", "Suite Office", "Gestor Proyectos", "Firma Digital", "Portal Clientes",
        "Impresora 3D", "Plotter A0", "Escáner Doc.", "Proyector 4K", "Pizarra Interactiva",
        "Rack 42U", "Cable Cat6 (rollo)", "Fibra Óptica 1Gb", "SFP Módulo", "Patch Panel 24p",
        "Tablet Enterprise", "Laptop Ejecutiva", "Workstation CAD", "Thin Client", "Mini PC",
        "GPS Flota", "Lector Código QR", "Terminal POS", "Impresora Etiq.", "Báscula Electrónica",
    ]
    prod_ids = []
    for i, nom in enumerate(nombres_prod):
        precio = round(random.uniform(100, 15000), 2)
        rec = Record(dataset_id=ds_prod.id, data={
            "nombre": nom, "codigo": f"PRD-{i+1:03d}", "precio": precio,
            "id_categoriaproducto": rpick(cat_ids),
            "stock_minimo": random.randint(1, 20), "activo": random.random() > 0.1
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); prod_ids.append(str(rec.id))
    print(f"    -> {len(prod_ids)} registros en Producto")

    # Cliente
    ds_cli = await make_dataset(db, ws, "Cliente", "Base de clientes comerciales")
    await add_columns(db, ds_cli, [
        {"name": "Empresa",    "field_key": "empresa",    "data_type": "text",   "rules": {"required": True}},
        {"name": "Contacto",   "field_key": "contacto",   "data_type": "text",   "rules": {}},
        {"name": "Email",      "field_key": "email",      "data_type": "text",   "rules": {}},
        {"name": "Teléfono",   "field_key": "telefono",   "data_type": "text",   "rules": {}},
        {"name": "País",       "field_key": "pais",       "data_type": "enum",   "rules": {"options": ["Perú","Colombia","Chile","México","Argentina","Ecuador","Bolivia","Uruguay"]}},
        {"name": "Segmento",   "field_key": "segmento",   "data_type": "enum",   "rules": {"options": ["Enterprise","Mediana","Pyme","Startup"]}},
        {"name": "Potencial",  "field_key": "potencial",  "data_type": "number", "rules": {}},
        {"name": "Activo",     "field_key": "activo",     "data_type": "boolean","rules": {}},
    ])
    empresas = [f"Empresa {chr(65+i%26)}{i//26 or ''} S.A." for i in range(120)]
    paises = ["Perú","Colombia","Chile","México","Argentina","Ecuador","Bolivia","Uruguay"]
    segmentos = ["Enterprise","Mediana","Pyme","Startup"]
    cli_ids = []
    for i, emp in enumerate(empresas):
        rec = Record(dataset_id=ds_cli.id, data={
            "empresa": emp, "contacto": f"Contacto {i+1}", "email": f"contacto{i+1}@empresa.com",
            "telefono": f"+51 9{random.randint(10000000,99999999)}",
            "pais": rpick(paises), "segmento": rpick(segmentos),
            "potencial": random.randint(5000, 500000), "activo": random.random() > 0.15
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); cli_ids.append(str(rec.id))
    print(f"    -> {len(cli_ids)} registros en Cliente")

    # Vendedor
    ds_vend = await make_dataset(db, ws, "Vendedor", "Equipo de vendedores")
    await add_columns(db, ds_vend, [
        {"name": "Nombre",   "field_key": "nombre",   "data_type": "text",   "rules": {"required": True}},
        {"name": "Email",    "field_key": "email",    "data_type": "text",   "rules": {}},
        {"name": "Zona",     "field_key": "zona",     "data_type": "enum",   "rules": {"options": ["Norte","Sur","Centro","Este","Oeste","Internacional"]}},
        {"name": "Meta",     "field_key": "meta",     "data_type": "number", "rules": {}},
        {"name": "Activo",   "field_key": "activo",   "data_type": "boolean","rules": {}},
    ])
    nombres_vend = ["Sofía Herrera","Diego Ruiz","Camila Torres","Andrés Mora","Valentina Díaz",
                    "Felipe Castro","Lucía Vargas","Mateo Reyes","Isabella Ríos","Sebastián Lara",
                    "Gabriela Núñez","Rodrigo Salinas","Daniela Fuentes","Tomás Guerrero","Natalia Rojas"]
    vend_ids = []
    for nom in nombres_vend:
        rec = Record(dataset_id=ds_vend.id, data={
            "nombre": nom, "email": nom.lower().replace(" ", ".") + "@empresa.com",
            "zona": rpick(["Norte","Sur","Centro","Este","Oeste","Internacional"]),
            "meta": random.randint(50000, 300000), "activo": True
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); vend_ids.append(str(rec.id))
    print(f"    -> {len(vend_ids)} registros en Vendedor")

    # Pedido (FK a Cliente y Vendedor)
    ds_ped = await make_dataset(db, ws, "Pedido", "Pedidos de clientes")
    await add_columns(db, ds_ped, [
        {"name": "Código",    "field_key": "codigo",      "data_type": "text",   "rules": {"required": True}},
        {"name": "Cliente",   "field_key": "id_cliente",  "data_type": "text",   "rules": {}},
        {"name": "Vendedor",  "field_key": "id_vendedor", "data_type": "text",   "rules": {}},
        {"name": "Fecha",     "field_key": "fecha",       "data_type": "date",   "rules": {}},
        {"name": "Estado",    "field_key": "estado",      "data_type": "enum",   "rules": {"options": ["Borrador","Confirmado","En proceso","Enviado","Entregado","Cancelado"]}},
        {"name": "Total",     "field_key": "total",       "data_type": "number", "rules": {"min": 0}},
        {"name": "Descuento", "field_key": "descuento",   "data_type": "number", "rules": {}},
    ])
    estados_ped = ["Borrador","Confirmado","En proceso","Enviado","Entregado","Cancelado"]
    ped_ids = []
    for i in range(200):
        total = round(random.uniform(500, 80000), 2)
        rec = Record(dataset_id=ds_ped.id, data={
            "codigo": f"PED-{i+1:04d}", "id_cliente": rpick(cli_ids),
            "id_vendedor": rpick(vend_ids), "fecha": rdate(365),
            "estado": rpick(estados_ped), "total": total,
            "descuento": round(random.uniform(0, 15), 1),
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); ped_ids.append(str(rec.id))
    print(f"    -> {len(ped_ids)} registros en Pedido")

    # DetallePedido (FK a Pedido y Producto)
    ds_det = await make_dataset(db, ws, "DetallePedido", "Líneas de detalle de cada pedido")
    await add_columns(db, ds_det, [
        {"name": "Pedido",    "field_key": "id_pedido",   "data_type": "text",   "rules": {"required": True}},
        {"name": "Producto",  "field_key": "id_producto", "data_type": "text",   "rules": {}},
        {"name": "Cantidad",  "field_key": "cantidad",    "data_type": "number", "rules": {"min": 1}},
        {"name": "Precio U.", "field_key": "precio_unit", "data_type": "number", "rules": {}},
        {"name": "Subtotal",  "field_key": "subtotal",    "data_type": "number", "rules": {}},
    ])
    det_records = []
    for ped_id in ped_ids:
        for _ in range(random.randint(1, 5)):
            cant = random.randint(1, 20)
            precio = round(random.uniform(100, 8000), 2)
            det_records.append({
                "id_pedido": ped_id, "id_producto": rpick(prod_ids),
                "cantidad": cant, "precio_unit": precio,
                "subtotal": round(cant * precio, 2),
            })
    random.shuffle(det_records)
    det_records = det_records[:600]
    for r in det_records:
        db.add(Record(dataset_id=ds_det.id, data=r, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> {len(det_records)} registros en DetallePedido")


# ── OPERACIONES ───────────────────────────────────────────────────────────────

async def seed_operaciones(db):
    ws = await get_workspace(db, "Operaciones")
    print("\n=== Seed masivo: Operaciones ===")

    # Categoria
    ds_cat = await make_dataset(db, ws, "CategoriaItem", "Categorías de ítems en almacén")
    await add_columns(db, ds_cat, [
        {"name": "Nombre",  "field_key": "nombre",  "data_type": "text",    "rules": {"required": True}},
        {"name": "Código",  "field_key": "codigo",  "data_type": "text",    "rules": {}},
        {"name": "Activa",  "field_key": "activa",  "data_type": "boolean", "rules": {}},
    ])
    cats_ops = ["Electrónica","Mecánica","Eléctrica","Hidráulica","Neumática",
                "Consumibles","Repuestos","Herramientas","EPP","Materiales de Obra"]
    cat_ids = []
    for c in cats_ops:
        rec = Record(dataset_id=ds_cat.id, data={"nombre": c, "codigo": c[:3].upper(), "activa": True}, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); cat_ids.append(str(rec.id))
    print(f"    -> {len(cat_ids)} registros en CategoriaItem")

    # Proveedor
    ds_prov = await make_dataset(db, ws, "Proveedor", "Proveedores de insumos y equipos")
    await add_columns(db, ds_prov, [
        {"name": "Empresa",   "field_key": "empresa",   "data_type": "text",   "rules": {"required": True}},
        {"name": "RUC",       "field_key": "ruc",       "data_type": "text",   "rules": {}},
        {"name": "Contacto",  "field_key": "contacto",  "data_type": "text",   "rules": {}},
        {"name": "País",      "field_key": "pais",      "data_type": "enum",   "rules": {"options": ["Perú","China","EEUU","Alemania","Brasil","España","México"]}},
        {"name": "Categoría", "field_key": "id_categoriaitem", "data_type": "text", "rules": {}},
        {"name": "Calific.",  "field_key": "calificacion","data_type": "number","rules": {"min": 1, "max": 5}},
        {"name": "Activo",    "field_key": "activo",    "data_type": "boolean","rules": {}},
    ])
    paises_prov = ["Perú","China","EEUU","Alemania","Brasil","España","México"]
    prov_ids = []
    for i in range(50):
        rec = Record(dataset_id=ds_prov.id, data={
            "empresa": f"Proveedor {i+1} Ltda.", "ruc": f"2{random.randint(1000000000,9999999999)}",
            "contacto": f"Rep. Ventas {i+1}", "pais": rpick(paises_prov),
            "id_categoriaitem": rpick(cat_ids),
            "calificacion": round(random.uniform(2.5, 5.0), 1), "activo": random.random() > 0.1
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); prov_ids.append(str(rec.id))
    print(f"    -> {len(prov_ids)} registros en Proveedor")

    # Producto (almacén, FK a CategoriaItem y Proveedor)
    ds_item = await make_dataset(db, ws, "ItemAlmacen", "Ítems en stock del almacén")
    await add_columns(db, ds_item, [
        {"name": "Nombre",      "field_key": "nombre",           "data_type": "text",   "rules": {"required": True}},
        {"name": "SKU",         "field_key": "sku",              "data_type": "text",   "rules": {}},
        {"name": "Categoría",   "field_key": "id_categoriaitem", "data_type": "text",   "rules": {}},
        {"name": "Proveedor",   "field_key": "id_proveedor",     "data_type": "text",   "rules": {}},
        {"name": "Stock",       "field_key": "stock",            "data_type": "number", "rules": {"min": 0}},
        {"name": "Stock mín.",  "field_key": "stock_min",        "data_type": "number", "rules": {}},
        {"name": "Costo U.",    "field_key": "costo_unit",       "data_type": "number", "rules": {}},
        {"name": "Ubicación",   "field_key": "ubicacion",        "data_type": "text",   "rules": {}},
    ])
    item_ids = []
    ubicaciones = [f"Estante {l}{n}" for l in "ABCDE" for n in range(1, 9)]
    for i in range(80):
        rec = Record(dataset_id=ds_item.id, data={
            "nombre": f"Ítem de Almacén {i+1:03d}", "sku": f"SKU-{i+1:04d}",
            "id_categoriaitem": rpick(cat_ids), "id_proveedor": rpick(prov_ids),
            "stock": random.randint(0, 500), "stock_min": random.randint(5, 50),
            "costo_unit": round(random.uniform(5, 2000), 2),
            "ubicacion": rpick(ubicaciones),
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); item_ids.append(str(rec.id))
    print(f"    -> {len(item_ids)} registros en ItemAlmacen")

    # MovimientoStock (FK a ItemAlmacen)
    ds_mov = await make_dataset(db, ws, "MovimientoStock", "Entradas y salidas de almacén")
    await add_columns(db, ds_mov, [
        {"name": "Ítem",      "field_key": "id_itemalmacen", "data_type": "text",   "rules": {"required": True}},
        {"name": "Tipo",      "field_key": "tipo",           "data_type": "enum",   "rules": {"options": ["Entrada","Salida","Ajuste","Transferencia"]}},
        {"name": "Cantidad",  "field_key": "cantidad",       "data_type": "number", "rules": {"min": 1}},
        {"name": "Fecha",     "field_key": "fecha",          "data_type": "date",   "rules": {}},
        {"name": "Referencia","field_key": "referencia",     "data_type": "text",   "rules": {}},
        {"name": "Usuario",   "field_key": "usuario",        "data_type": "text",   "rules": {}},
    ])
    tipos_mov = ["Entrada","Salida","Ajuste","Transferencia"]
    usuarios_ops = ["mario.ramirez","sofia.torres","pedro.sanchez","operario1","operario2"]
    for i in range(300):
        db.add(Record(dataset_id=ds_mov.id, data={
            "id_itemalmacen": rpick(item_ids), "tipo": rpick(tipos_mov),
            "cantidad": random.randint(1, 100), "fecha": rdate(180),
            "referencia": f"REF-{random.randint(1000,9999)}", "usuario": rpick(usuarios_ops),
        }, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> 300 registros en MovimientoStock")

    # OrdenCompra (FK a Proveedor)
    ds_oc = await make_dataset(db, ws, "OrdenCompra", "Órdenes de compra a proveedores")
    await add_columns(db, ds_oc, [
        {"name": "Código",    "field_key": "codigo",        "data_type": "text",   "rules": {"required": True}},
        {"name": "Proveedor", "field_key": "id_proveedor",  "data_type": "text",   "rules": {}},
        {"name": "Fecha",     "field_key": "fecha",         "data_type": "date",   "rules": {}},
        {"name": "Estado",    "field_key": "estado",        "data_type": "enum",   "rules": {"options": ["Borrador","Enviada","Confirmada","Recibida","Cancelada"]}},
        {"name": "Total",     "field_key": "total",         "data_type": "number", "rules": {}},
        {"name": "Moneda",    "field_key": "moneda",        "data_type": "enum",   "rules": {"options": ["USD","PEN","EUR"]}},
    ])
    oc_ids = []
    for i in range(100):
        rec = Record(dataset_id=ds_oc.id, data={
            "codigo": f"OC-{i+1:04d}", "id_proveedor": rpick(prov_ids),
            "fecha": rdate(365), "estado": rpick(["Borrador","Enviada","Confirmada","Recibida","Cancelada"]),
            "total": round(random.uniform(500, 50000), 2), "moneda": rpick(["USD","PEN","EUR"]),
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); oc_ids.append(str(rec.id))
    print(f"    -> {len(oc_ids)} registros en OrdenCompra")

    # DetalleOrden (FK a OrdenCompra y ItemAlmacen)
    ds_doc = await make_dataset(db, ws, "DetalleOrden", "Líneas de detalle de órdenes de compra")
    await add_columns(db, ds_doc, [
        {"name": "Orden",    "field_key": "id_ordencompra",  "data_type": "text",   "rules": {"required": True}},
        {"name": "Ítem",     "field_key": "id_itemalmacen",  "data_type": "text",   "rules": {}},
        {"name": "Cantidad", "field_key": "cantidad",        "data_type": "number", "rules": {"min": 1}},
        {"name": "Precio U.","field_key": "precio_unit",     "data_type": "number", "rules": {}},
        {"name": "Subtotal", "field_key": "subtotal",        "data_type": "number", "rules": {}},
    ])
    for oc_id in oc_ids:
        for _ in range(random.randint(1, 4)):
            cant = random.randint(1, 50)
            precio = round(random.uniform(10, 2000), 2)
            db.add(Record(dataset_id=ds_doc.id, data={
                "id_ordencompra": oc_id, "id_itemalmacen": rpick(item_ids),
                "cantidad": cant, "precio_unit": precio, "subtotal": round(cant * precio, 2),
            }, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> ~250 registros en DetalleOrden")


# ── RRHH ──────────────────────────────────────────────────────────────────────

async def seed_rrhh(db):
    ws = await get_workspace(db, "RRHH")
    print("\n=== Seed masivo: RRHH ===")

    # Departamento
    ds_dep = await make_dataset(db, ws, "Departamento", "Departamentos de la empresa")
    await add_columns(db, ds_dep, [
        {"name": "Nombre",     "field_key": "nombre",     "data_type": "text",   "rules": {"required": True}},
        {"name": "Jefe",       "field_key": "jefe",       "data_type": "text",   "rules": {}},
        {"name": "Presupuesto","field_key": "presupuesto","data_type": "number", "rules": {}},
        {"name": "Activo",     "field_key": "activo",     "data_type": "boolean","rules": {}},
    ])
    deptos = [("Ventas","Ana García"),("Operaciones","Mario Ramírez"),("RRHH","Elena Morales"),
              ("TI","Carlos López"),("Finanzas","Rosa Mendez"),("Marketing","Luis Vera"),
              ("Legal","Diana Castro"),("Gerencia","Pablo Ríos")]
    dep_ids = []
    for nom, jefe in deptos:
        rec = Record(dataset_id=ds_dep.id, data={
            "nombre": nom, "jefe": jefe,
            "presupuesto": random.randint(80000, 500000), "activo": True
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); dep_ids.append(str(rec.id))
    print(f"    -> {len(dep_ids)} registros en Departamento")

    # Cargo (FK a Departamento)
    ds_cargo = await make_dataset(db, ws, "Cargo", "Cargos y posiciones")
    await add_columns(db, ds_cargo, [
        {"name": "Nombre",       "field_key": "nombre",          "data_type": "text",   "rules": {"required": True}},
        {"name": "Departamento", "field_key": "id_departamento", "data_type": "text",   "rules": {}},
        {"name": "Nivel",        "field_key": "nivel",           "data_type": "enum",   "rules": {"options": ["Operativo","Analista","Senior","Jefatura","Gerencia","Dirección"]}},
        {"name": "Salario Base", "field_key": "salario_base",    "data_type": "number", "rules": {"min": 0}},
        {"name": "Vacantes",     "field_key": "vacantes",        "data_type": "number", "rules": {}},
    ])
    cargos_lista = [
        ("Vendedor Junior","Operativo",35000),("Vendedor Senior","Analista",55000),
        ("Key Account Manager","Senior",75000),("Jefe de Ventas","Jefatura",90000),
        ("Operario Almacén","Operativo",32000),("Técnico Logística","Analista",45000),
        ("Coordinador Ops.","Senior",62000),("Jefe Operaciones","Jefatura",85000),
        ("Analista RRHH","Analista",48000),("Coordinador RRHH","Senior",65000),
        ("Gerente RRHH","Gerencia",90000),("Programador Jr.","Operativo",42000),
        ("Desarrollador","Analista",60000),("Arquitecto TI","Senior",85000),
        ("Jefe TI","Jefatura",95000),("Analista Financiero","Analista",52000),
        ("Contador","Analista",50000),("Jefe Finanzas","Jefatura",88000),
        ("Analista Marketing","Analista",47000),("Community Manager","Operativo",38000),
    ]
    cargo_ids = []
    for nom, nivel, salario in cargos_lista:
        rec = Record(dataset_id=ds_cargo.id, data={
            "nombre": nom, "id_departamento": rpick(dep_ids), "nivel": nivel,
            "salario_base": salario, "vacantes": random.randint(0, 3)
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); cargo_ids.append(str(rec.id))
    print(f"    -> {len(cargo_ids)} registros en Cargo")

    # Empleado (FK a Departamento y Cargo)
    ds_emp = await make_dataset(db, ws, "EmpleadoRRHH", "Registro completo de empleados")
    await add_columns(db, ds_emp, [
        {"name": "Nombre",       "field_key": "nombre",          "data_type": "text",   "rules": {"required": True}},
        {"name": "DNI",          "field_key": "dni",             "data_type": "text",   "rules": {}},
        {"name": "Email",        "field_key": "email",           "data_type": "text",   "rules": {}},
        {"name": "Departamento", "field_key": "id_departamento", "data_type": "text",   "rules": {}},
        {"name": "Cargo",        "field_key": "id_cargo",        "data_type": "text",   "rules": {}},
        {"name": "Fecha Ingreso","field_key": "fecha_ingreso",   "data_type": "date",   "rules": {}},
        {"name": "Salario",      "field_key": "salario",         "data_type": "number", "rules": {"min": 0}},
        {"name": "Modalidad",    "field_key": "modalidad",       "data_type": "enum",   "rules": {"options": ["Presencial","Remoto","Híbrido"]}},
        {"name": "Activo",       "field_key": "activo",          "data_type": "boolean","rules": {}},
    ])
    nombres_m = ["Carlos","Luis","José","Andrés","Miguel","Diego","Tomás","Felipe","Jorge","Roberto",
                 "Sebastián","Gabriel","Ricardo","Alejandro","Fernando","Manuel","Pablo","Nicolás","Javier","Eduardo"]
    nombres_f = ["María","Ana","Lucía","Sofía","Valeria","Camila","Isabella","Daniela","Paula","Natalia",
                 "Gabriela","Valentina","Andrea","Carolina","Patricia","Rosa","Elena","Diana","Claudia","Sandra"]
    apellidos = ["García","López","Martínez","Rodríguez","González","Hernández","Pérez","Sánchez","Ramírez",
                 "Torres","Flores","Rivera","Morales","Vargas","Castro","Ramos","Reyes","Guzmán","Díaz","Romero"]
    emp_ids = []
    for i in range(80):
        nombre = f"{rpick(nombres_m if i % 2 == 0 else nombres_f)} {rpick(apellidos)} {rpick(apellidos)}"
        rec = Record(dataset_id=ds_emp.id, data={
            "nombre": nombre, "dni": str(random.randint(10000000, 99999999)),
            "email": nombre.lower().split()[0] + f".{nombre.lower().split()[1]}@empresa.com",
            "id_departamento": rpick(dep_ids), "id_cargo": rpick(cargo_ids),
            "fecha_ingreso": rdate(1825), "salario": random.randint(32000, 120000),
            "modalidad": rpick(["Presencial","Remoto","Híbrido"]), "activo": random.random() > 0.08
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); emp_ids.append(str(rec.id))
    print(f"    -> {len(emp_ids)} registros en EmpleadoRRHH")

    # Asistencia (FK a EmpleadoRRHH)
    ds_asis = await make_dataset(db, ws, "Asistencia", "Registro de asistencia diaria")
    await add_columns(db, ds_asis, [
        {"name": "Empleado", "field_key": "id_empleadorrhh", "data_type": "text",   "rules": {"required": True}},
        {"name": "Fecha",    "field_key": "fecha",           "data_type": "date",   "rules": {}},
        {"name": "Estado",   "field_key": "estado",          "data_type": "enum",   "rules": {"options": ["Presente","Ausente","Tardanza","Permiso","Vacaciones"]}},
        {"name": "Horas",    "field_key": "horas",           "data_type": "number", "rules": {"min": 0, "max": 12}},
    ])
    estados_asis = ["Presente","Presente","Presente","Presente","Ausente","Tardanza","Permiso","Vacaciones"]
    for emp_id in random.sample(emp_ids, min(40, len(emp_ids))):
        for _ in range(random.randint(8, 15)):
            estado = rpick(estados_asis)
            db.add(Record(dataset_id=ds_asis.id, data={
                "id_empleadorrhh": emp_id, "fecha": rdate(60),
                "estado": estado, "horas": random.randint(6, 10) if estado == "Presente" else 0
            }, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> ~500 registros en Asistencia")

    # Evaluacion (FK a EmpleadoRRHH)
    ds_eval = await make_dataset(db, ws, "Evaluacion", "Evaluaciones de desempeño")
    await add_columns(db, ds_eval, [
        {"name": "Empleado",  "field_key": "id_empleadorrhh","data_type": "text",   "rules": {"required": True}},
        {"name": "Período",   "field_key": "periodo",        "data_type": "text",   "rules": {}},
        {"name": "Puntaje",   "field_key": "puntaje",        "data_type": "number", "rules": {"min": 0, "max": 100}},
        {"name": "Categoría", "field_key": "categoria",      "data_type": "enum",   "rules": {"options": ["Sobresaliente","Bueno","Regular","Necesita mejora"]}},
        {"name": "Evaluador", "field_key": "evaluador",      "data_type": "text",   "rules": {}},
        {"name": "Comentario","field_key": "comentario",     "data_type": "text",   "rules": {}},
    ])
    periodos = ["2024-Q1","2024-Q2","2024-Q3","2024-Q4","2025-Q1","2025-Q2"]
    for emp_id in emp_ids:
        for periodo in random.sample(periodos, random.randint(1, 3)):
            puntaje = random.randint(45, 100)
            cat = "Sobresaliente" if puntaje >= 90 else "Bueno" if puntaje >= 75 else "Regular" if puntaje >= 60 else "Necesita mejora"
            db.add(Record(dataset_id=ds_eval.id, data={
                "id_empleadorrhh": emp_id, "periodo": periodo,
                "puntaje": puntaje, "categoria": cat,
                "evaluador": f"Jefe {rpick(['A','B','C'])}", "comentario": f"Evaluación {periodo}"
            }, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> ~160 registros en Evaluacion")

    # Capacitacion
    ds_cap = await make_dataset(db, ws, "Capacitacion", "Programas de capacitación")
    await add_columns(db, ds_cap, [
        {"name": "Nombre",    "field_key": "nombre",    "data_type": "text",   "rules": {"required": True}},
        {"name": "Modalidad", "field_key": "modalidad", "data_type": "enum",   "rules": {"options": ["Presencial","Online","Híbrido"]}},
        {"name": "Horas",     "field_key": "horas",     "data_type": "number", "rules": {"min": 1}},
        {"name": "Fecha",     "field_key": "fecha",     "data_type": "date",   "rules": {}},
        {"name": "Costo",     "field_key": "costo",     "data_type": "number", "rules": {}},
        {"name": "Activa",    "field_key": "activa",    "data_type": "boolean","rules": {}},
    ])
    caps = ["Excel Avanzado","Power BI","Liderazgo","Comunicación Efectiva","Gestión del Tiempo",
            "Python para RRHH","Seguridad Informática","Primeros Auxilios","Manejo de Conflictos",
            "Atención al Cliente","Gestión de Proyectos","Lean Manufacturing","Six Sigma Green Belt",
            "ISO 9001","Normativa Laboral"]
    cap_ids = []
    for c in caps:
        rec = Record(dataset_id=ds_cap.id, data={
            "nombre": c, "modalidad": rpick(["Presencial","Online","Híbrido"]),
            "horas": rpick([4, 8, 16, 24, 40]),
            "fecha": rdate(180), "costo": random.randint(200, 3000), "activa": True
        }, created_at=utcnow(), updated_at=utcnow())
        db.add(rec); await db.flush(); cap_ids.append(str(rec.id))
    print(f"    -> {len(cap_ids)} registros en Capacitacion")

    # InscripcionCapacitacion (FK a Empleado y Capacitacion)
    ds_insc = await make_dataset(db, ws, "InscripcionCap", "Inscripciones a capacitaciones")
    await add_columns(db, ds_insc, [
        {"name": "Empleado",       "field_key": "id_empleadorrhh","data_type": "text",   "rules": {"required": True}},
        {"name": "Capacitación",   "field_key": "id_capacitacion","data_type": "text",   "rules": {}},
        {"name": "Estado",         "field_key": "estado",         "data_type": "enum",   "rules": {"options": ["Inscrito","En curso","Completado","Abandonado"]}},
        {"name": "Nota Final",     "field_key": "nota_final",     "data_type": "number", "rules": {"min": 0, "max": 100}},
        {"name": "Certificado",    "field_key": "certificado",    "data_type": "boolean","rules": {}},
    ])
    for emp_id in emp_ids:
        for cap_id in random.sample(cap_ids, random.randint(1, 4)):
            nota = random.randint(50, 100)
            estado = rpick(["Inscrito","En curso","Completado","Completado","Completado","Abandonado"])
            db.add(Record(dataset_id=ds_insc.id, data={
                "id_empleadorrhh": emp_id, "id_capacitacion": cap_id,
                "estado": estado, "nota_final": nota if estado == "Completado" else None,
                "certificado": nota >= 70 and estado == "Completado"
            }, created_at=utcnow(), updated_at=utcnow()))
    print(f"    -> ~200 registros en InscripcionCap")


async def main():
    async with DB() as db:
        await seed_ventas(db)
        await seed_operaciones(db)
        await seed_rrhh(db)
        await db.commit()
        print("\n✓ Seed masivo completado.")

if __name__ == "__main__":
    asyncio.run(main())
