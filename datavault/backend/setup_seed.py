"""
Setup de datos de desarrollo.

Borra todos los datasets existentes y crea 7 tablas interrelacionadas
con datos de ejemplo (~600 registros en total).

Uso:
    docker compose exec backend python setup_seed.py

Esquema FK:
    Proveedor.id_categoria  → Categoria
    Producto.id_categoria   → Categoria
    Producto.id_proveedor   → Proveedor
    Pedido.id_cliente       → Cliente
    Pedido.id_empleado      → Empleado
    Detalle.id_pedido       → Pedido
    Detalle.id_producto     → Producto
"""
import random, asyncio, uuid
from datetime import date, timedelta
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import async_sessionmaker
from database import engine
from models import Dataset, ColumnDefinition, Record, ChangeHistory, DatasetPermission

Session = async_sessionmaker(engine, expire_on_commit=False)

# ── Datos maestros ──────────────────────────────────────────────────────────────
NOMBRES = [
    "Carlos","Lucia","Roberto","Ana","Miguel","Sofia","Diego","Valeria",
    "Jorge","Maria","Pedro","Carmen","Luis","Isabel","Juan","Rosa",
    "Fernando","Patricia","Ricardo","Elena","Oscar","Gloria","Hector",
    "Diana","Ernesto","Monica","Raul","Claudia","Victor","Sandra",
    "Andres","Beatriz","Marcos","Liliana","Cesar","Adriana","Gonzalo",
    "Norma","Felipe","Martha","Eduardo","Yolanda","Alvaro","Cecilia",
    "Rodolfo","Alejandra","Enrique","Graciela","Guillermo","Pilar",
]
APELLIDOS = [
    "García","Rodríguez","López","Martínez","González","Pérez",
    "Sánchez","Ramírez","Torres","Flores","Rivera","Gómez",
    "Díaz","Cruz","Morales","Ortiz","Guerrero","Delgado",
    "Castro","Vargas","Ramos","Reyes","Mendoza","Herrera",
    "Silva","Rojas","Quispe","Mamani","Huanca","Chávez",
    "Salinas","Vega","Medina","Fuentes","Ponce","Cabrera",
]
CIUDADES      = ["Lima","Arequipa","Trujillo","Cusco","Piura","Chiclayo","Iquitos","Tacna","Huancayo","Puno"]
PAISES        = ["Peru","Colombia","Chile","Mexico","China","USA","Brasil","Argentina","Taiwan","Alemania"]
ESTADOS       = ["Pendiente","En proceso","Enviado","Entregado","Cancelado"]
CANALES       = ["Web","Telefono","Presencial","App"]
TIPOS_CLI     = ["Retail","Mayorista","Corporativo"]
DEPARTAMENTOS = ["Ventas","Compras","Logistica","Soporte"]
CARGOS        = [
    "Ejecutivo de Ventas","Gerente de Zona","Asesor Comercial",
    "Supervisor de Ventas","Representante de Compras","Analista Comercial",
    "Director Comercial","Coordinador de Cuentas",
]
EMPRESAS = [
    "TechImport","GlobalSupply","FastDist","MegaTrade","ProSource",
    "AgroExport","IndustrialMax","OfficeWorld","BuildMart","FashionHub",
    "DataSoft","PowerTools","FoodLink","TextilPro","ElectroGlobal",
    "NorteDistrib","SurImport","EastTrade","WestSupply","CentroMart",
    "PacificCorp","AndesTrade","CostaSupply","SierraDist","SelvaMart",
    "AlphaGroup","BetaTrade","GammaSupply","DeltaCorp","OmegaDist",
]
SUFIJOS_EMP = ["SAC","SRL","EIRL","SA","Corp","LLC","Group","Holdings"]

CATEGORIAS_INFO = [
    ("Electrónica",    "Dispositivos, componentes y accesorios electrónicos"),
    ("Ropa y Calzado", "Prendas de vestir, calzado y accesorios de moda"),
    ("Alimentos",      "Productos alimenticios, bebidas y abarrotes"),
    ("Herramientas",   "Herramientas manuales, eléctricas e industriales"),
    ("Oficina",        "Artículos de oficina, papelería y equipos de trabajo"),
    ("Hogar",          "Artículos para el hogar, cocina y decoración"),
    ("Deportes",       "Equipos, ropa e implementos deportivos"),
    ("Salud",          "Productos de salud, bienestar y farmacia"),
    ("Automotriz",     "Piezas, accesorios y lubricantes para vehículos"),
    ("Juguetes",       "Juguetes, juegos y entretenimiento infantil"),
    ("Construcción",   "Materiales y herramientas de construcción"),
    ("Tecnología",     "Software, licencias y servicios tecnológicos"),
]

PRODUCTOS_POR_CAT = {
    "Electrónica":    [("Laptop Lenovo IdeaPad","ELEC",2850),("Mouse Inalámbrico","ELEC",89),
                       ("Teclado Mecánico","ELEC",199),("Monitor 24'' LG","ELEC",650),
                       ("Auriculares Bluetooth","ELEC",149),("Tablet Samsung","ELEC",480),
                       ("Impresora Laser HP","ELEC",390),("Disco SSD 1TB","ELEC",220),
                       ("Webcam HD","ELEC",120),("Hub USB-C","ELEC",65)],
    "Ropa y Calzado": [("Polo Manga Corta","ROPA",45),("Jeans Slim Fit","ROPA",85),
                       ("Casaca Polar","ROPA",120),("Camiseta Deportiva","ROPA",38),
                       ("Zapatos Cuero","ROPA",190),("Buzo Completo","ROPA",95),
                       ("Vestido Casual","ROPA",75),("Chompa Lana","ROPA",110)],
    "Alimentos":      [("Arroz Integral 5kg","ALIM",28),("Aceite Vegetal 1L","ALIM",12),
                       ("Azúcar Blanca 2kg","ALIM",8),("Frijoles Negros 1kg","ALIM",7),
                       ("Leche Evaporada 24u","ALIM",48),("Fideos 500g","ALIM",4),
                       ("Atún en Conserva","ALIM",6),("Café Molido 250g","ALIM",18)],
    "Herramientas":   [("Taladro Percutor Bosch","HERR",380),("Amoladora 4.5''","HERR",220),
                       ("Juego Llaves 20pzas","HERR",95),("Nivel Aluminio 60cm","HERR",35),
                       ("Cinta Métrica 5m","HERR",18),("Set Destornilladores","HERR",45),
                       ("Sierra Circular","HERR",320),("Compresor 50L","HERR",580)],
    "Oficina":        [("Resma Papel A4","OFIC",22),("Cuaderno A4 100h","OFIC",8),
                       ("Lapiceros Caja 50u","OFIC",18),("Folder Manila x50","OFIC",15),
                       ("Archivador Palanca","OFIC",12),("Calculadora Científica","OFIC",55),
                       ("Grapadora Eléctrica","OFIC",85),("Sello Automático","OFIC",35)],
    "Hogar":          [("Sartén Antiadherente","HOGA",65),("Juego Ollas 5pzas","HOGA",180),
                       ("Licuadora Oster","HOGA",120),("Hervidor Eléctrico","HOGA",55),
                       ("Set Toallas Baño","HOGA",45),("Aspiradora Vertical","HOGA",280)],
    "Deportes":       [("Pelota Fútbol N5","DEPO",45),("Zapatillas Running","DEPO",180),
                       ("Bicicleta Estacionaria","DEPO",850),("Mancuernas 10kg Par","DEPO",95),
                       ("Colchoneta Yoga","DEPO",40),("Cuerda para Saltar","DEPO",15)],
    "Salud":          [("Tensiómetro Digital","SALU",120),("Termómetro Infrarrojo","SALU",65),
                       ("Oxímetro de Pulso","SALU",45),("Kit Primeros Auxilios","SALU",38),
                       ("Mascarillas KN95 x50","SALU",25),("Glucómetro Digital","SALU",95)],
    "Automotriz":     [("Aceite Motor 5W-30 4L","AUTO",85),("Filtro de Aceite","AUTO",25),
                       ("Batería 12V 60Ah","AUTO",280),("Llantas 185/65R15 x4","AUTO",640),
                       ("Pastillas de Freno","AUTO",75),("Kit Afinamiento","AUTO",150)],
    "Juguetes":       [("LEGO Classic 500pzas","JUGO",180),("Muñeca Articulada","JUGO",45),
                       ("Auto Radio Control","JUGO",95),("Rompecabezas 1000pzas","JUGO",35),
                       ("Juego de Mesa","JUGO",55)],
    "Construcción":   [("Cemento Portland 42.5kg","CONS",28),("Varilla Acero 1/2''","CONS",45),
                       ("Ladrillo King Kong x100","CONS",85),("Pintura Interior 20L","CONS",120),
                       ("Porcelanato 60x60 m2","CONS",55)],
    "Tecnología":     [("Licencia Windows 11","TECH",420),("Office 365 Anual","TECH",380),
                       ("Antivirus Kaspersky","TECH",95),("Dominio .com 1 año","TECH",55),
                       ("Hosting SSD 10GB","TECH",120)],
}


def rand_date(start="2024-01-01", end="2026-04-27"):
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    return (s + timedelta(days=random.randint(0, (e - s).days))).isoformat()


def rand_email(nombre, ref):
    domains = ["gmail.com","hotmail.com","outlook.com","empresa.pe","corp.com","negocios.pe"]
    clean = ref.lower()
    for a, b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),(" ",""),(".",""),(",","")]:
        clean = clean.replace(a, b)
    return f"{nombre.lower()[:6]}.{clean[:10]}@{random.choice(domains)}"


async def bulk(session, dataset_id: uuid.UUID, rows: list[dict]):
    for data in rows:
        session.add(Record(dataset_id=dataset_id, data=data))
    await session.commit()
    print(f"    → {len(rows)} registros")


async def make_dataset(session, name: str, description: str = "") -> uuid.UUID:
    ds = Dataset(name=name, description=description or None)
    session.add(ds)
    await session.commit()
    await session.refresh(ds)
    return ds.id


async def make_col(session, dataset_id: uuid.UUID, name: str, field_key: str,
                   data_type: str, rules: dict | None = None, position: int = 0):
    session.add(ColumnDefinition(
        dataset_id=dataset_id,
        name=name, field_key=field_key,
        data_type=data_type,
        rules=rules or {},
        position=position,
    ))
    await session.commit()


async def get_ids(session, dataset_id: uuid.UUID) -> list[str]:
    r = await session.execute(
        select(Record.id).where(Record.dataset_id == dataset_id, Record.deleted_at.is_(None))
    )
    return [str(row[0]) for row in r.all()]


# ═══════════════════════════════════════════════════════════════════════════════
async def main():
    async with Session() as s:

        # ── 0. Limpiar ───────────────────────────────────────────────────────
        print("Eliminando datos existentes...")
        await s.execute(delete(ChangeHistory))
        await s.execute(delete(Record))
        await s.execute(delete(ColumnDefinition))
        await s.execute(delete(DatasetPermission))
        await s.execute(delete(Dataset))
        await s.commit()
        print("  ✓ Limpio\n")

        # ── 1. CATEGORIA ─────────────────────────────────────────────────────
        print("Creando Categoria...")
        ds_cat = await make_dataset(s, "Categoria", "Categorías de productos y servicios")
        await make_col(s, ds_cat, "Nombre",      "nombre",      "text",    {"required": True}, 0)
        await make_col(s, ds_cat, "Descripción", "descripcion", "text",    {},                  1)
        await make_col(s, ds_cat, "Activo",      "activo",      "boolean", {},                  2)
        await bulk(s, ds_cat, [
            {"nombre": n, "descripcion": d, "activo": True}
            for n, d in CATEGORIAS_INFO
        ])
        ids_cat = await get_ids(s, ds_cat)

        # ── 2. PROVEEDOR  (FK → Categoria) ───────────────────────────────────
        print("Creando Proveedor...")
        ds_prv = await make_dataset(s, "Proveedor", "Proveedores y distribuidores")
        await make_col(s, ds_prv, "Empresa",   "empresa",      "text", {"required": True}, 0)
        await make_col(s, ds_prv, "Email",     "email",        "text", {},                  1)
        await make_col(s, ds_prv, "País",      "pais",         "text", {},                  2)
        await make_col(s, ds_prv, "Teléfono",  "telefono",     "text", {},                  3)
        await make_col(s, ds_prv, "Categoría", "id_categoria", "text", {},                  4)
        rows = []
        for _ in range(50):
            emp = f"{random.choice(EMPRESAS)} {random.choice(SUFIJOS_EMP)}"
            rows.append({
                "empresa":      emp,
                "email":        rand_email("contacto", emp.split()[0]),
                "pais":         random.choice(PAISES),
                "telefono":     f"+51 1 {random.randint(2000000,9999999)}",
                "id_categoria": random.choice(ids_cat),
            })
        await bulk(s, ds_prv, rows)
        ids_prv = await get_ids(s, ds_prv)

        # ── 3. CLIENTE ───────────────────────────────────────────────────────
        print("Creando Cliente...")
        ds_cli = await make_dataset(s, "Cliente", "Clientes registrados")
        await make_col(s, ds_cli, "Nombre",   "nombre",   "text", {"required": True},         0)
        await make_col(s, ds_cli, "Email",    "email",    "text", {},                           1)
        await make_col(s, ds_cli, "Teléfono", "telefono", "text", {},                           2)
        await make_col(s, ds_cli, "Ciudad",   "ciudad",   "text", {},                           3)
        await make_col(s, ds_cli, "Tipo",     "tipo",     "enum", {"options": TIPOS_CLI},       4)
        rows = []
        for _ in range(100):
            n, a = random.choice(NOMBRES), random.choice(APELLIDOS)
            rows.append({
                "nombre":   f"{n} {a}",
                "email":    rand_email(n, a),
                "telefono": f"9{random.randint(10000000,99999999)}",
                "ciudad":   random.choice(CIUDADES),
                "tipo":     random.choice(TIPOS_CLI),
            })
        await bulk(s, ds_cli, rows)
        ids_cli = await get_ids(s, ds_cli)

        # ── 4. EMPLEADO ──────────────────────────────────────────────────────
        print("Creando Empleado...")
        ds_emp = await make_dataset(s, "Empleado", "Empleados y vendedores")
        await make_col(s, ds_emp, "Nombre",      "nombre",       "text",    {"required": True},          0)
        await make_col(s, ds_emp, "Cargo",        "cargo",        "text",    {},                           1)
        await make_col(s, ds_emp, "Email",         "email",        "text",    {},                           2)
        await make_col(s, ds_emp, "Departamento",  "departamento", "enum",    {"options": DEPARTAMENTOS},  3)
        await make_col(s, ds_emp, "Activo",         "activo",       "boolean", {},                           4)
        rows = []
        for _ in range(20):
            n, a = random.choice(NOMBRES), random.choice(APELLIDOS)
            rows.append({
                "nombre":       f"{n} {a}",
                "cargo":        random.choice(CARGOS),
                "email":        rand_email(n, a),
                "departamento": random.choice(DEPARTAMENTOS),
                "activo":       random.random() > 0.15,
            })
        await bulk(s, ds_emp, rows)
        ids_emp = await get_ids(s, ds_emp)

        # ── 5. PRODUCTO  (FK → Categoria + Proveedor) ────────────────────────
        print("Creando Producto...")
        ds_prd = await make_dataset(s, "Producto", "Catálogo de productos")
        await make_col(s, ds_prd, "Nombre",          "nombre",       "text",   {"required": True}, 0)
        await make_col(s, ds_prd, "SKU",              "sku",          "text",   {},                  1)
        await make_col(s, ds_prd, "Precio",            "precio",       "number", {"min": 0},          2)
        await make_col(s, ds_prd, "Stock",              "stock",        "number", {"min": 0},          3)
        await make_col(s, ds_prd, "Categoría",         "id_categoria", "text",   {},                  4)
        await make_col(s, ds_prd, "Proveedor",         "id_proveedor", "text",   {},                  5)

        cat_rows = await s.execute(select(Record).where(Record.dataset_id == ds_cat))
        cat_name_to_id = {r.data["nombre"]: str(r.id) for r in cat_rows.scalars().all()}

        all_products = []
        for cat_name, items in PRODUCTOS_POR_CAT.items():
            cat_id = cat_name_to_id.get(cat_name)
            if not cat_id:
                continue
            for nombre, prefix, precio_base in items:
                for v in range(random.randint(1, 3)):
                    all_products.append({
                        "nombre":       f"{nombre} v{v+2}" if v > 0 else nombre,
                        "sku":          f"{prefix}-{random.randint(100,999)}",
                        "precio":       round(precio_base * random.uniform(0.85, 1.25), 2),
                        "stock":        random.randint(0, 500),
                        "id_categoria": cat_id,
                        "id_proveedor": random.choice(ids_prv),
                    })
        random.shuffle(all_products)
        await bulk(s, ds_prd, all_products[:100])
        ids_prd = await get_ids(s, ds_prd)

        # ── 6. PEDIDO  (FK → Cliente + Empleado) ─────────────────────────────
        print("Creando Pedido...")
        ds_ped = await make_dataset(s, "Pedido", "Pedidos de clientes")
        await make_col(s, ds_ped, "Número Pedido", "numero_pedido", "text",   {"required": True},    0)
        await make_col(s, ds_ped, "Fecha",          "fecha",         "date",   {},                     1)
        await make_col(s, ds_ped, "Estado",          "estado",        "enum",   {"options": ESTADOS},  2)
        await make_col(s, ds_ped, "Total",            "total",         "number", {"min": 0},             3)
        await make_col(s, ds_ped, "Canal",            "canal",         "enum",   {"options": CANALES},   4)
        await make_col(s, ds_ped, "Cliente",          "id_cliente",   "text",   {},                     5)
        await make_col(s, ds_ped, "Empleado",         "id_empleado",  "text",   {},                     6)
        rows = []
        for i in range(120):
            year = random.choice([2024, 2025, 2026])
            rows.append({
                "numero_pedido": f"PED-{year}-{str(i+1).zfill(4)}",
                "fecha":         rand_date(),
                "estado":        random.choice(ESTADOS),
                "total":         round(random.uniform(50, 8000), 2),
                "canal":         random.choice(CANALES),
                "id_cliente":    random.choice(ids_cli),
                "id_empleado":   random.choice(ids_emp),
            })
        await bulk(s, ds_ped, rows)
        ids_ped = await get_ids(s, ds_ped)

        # ── 7. DETALLE  (FK → Pedido + Producto) ─────────────────────────────
        print("Creando Detalle...")
        ds_det = await make_dataset(s, "Detalle", "Líneas de detalle de cada pedido")
        await make_col(s, ds_det, "Pedido",          "id_pedido",       "text",   {},                        0)
        await make_col(s, ds_det, "Producto",         "id_producto",     "text",   {},                        1)
        await make_col(s, ds_det, "Cantidad",          "cantidad",        "number", {"min": 1},                2)
        await make_col(s, ds_det, "Precio Unitario",  "precio_unitario", "number", {"min": 0},                3)
        await make_col(s, ds_det, "Descuento %",      "descuento",       "number", {"min": 0, "max": 100},    4)
        await make_col(s, ds_det, "Subtotal",          "subtotal",        "number", {"min": 0},                5)
        rows = []
        for _ in range(200):
            precio    = round(random.uniform(5, 3500), 2)
            cantidad  = random.randint(1, 30)
            descuento = random.choice([0, 0, 0, 5, 10, 15, 20, 25])
            rows.append({
                "id_pedido":       random.choice(ids_ped),
                "id_producto":     random.choice(ids_prd),
                "cantidad":        cantidad,
                "precio_unitario": precio,
                "descuento":       descuento,
                "subtotal":        round(precio * cantidad * (1 - descuento / 100), 2),
            })
        await bulk(s, ds_det, rows)

        # ── Resumen ───────────────────────────────────────────────────────────
        print("\n✓ Setup completo:")
        for label, ds_id in [
            ("Categoria",  ds_cat), ("Proveedor", ds_prv), ("Cliente",  ds_cli),
            ("Empleado",   ds_emp), ("Producto",  ds_prd), ("Pedido",   ds_ped),
            ("Detalle",    ds_det),
        ]:
            r = await s.execute(
                select(Record).where(Record.dataset_id == ds_id, Record.deleted_at.is_(None))
            )
            print(f"  {label:12s} {len(r.scalars().all()):4d} registros")

        print("\nRelaciones FK:")
        for rel in [
            "Proveedor.id_categoria  → Categoria",
            "Producto.id_categoria   → Categoria",
            "Producto.id_proveedor   → Proveedor",
            "Pedido.id_cliente       → Cliente",
            "Pedido.id_empleado      → Empleado",
            "Detalle.id_pedido       → Pedido",
            "Detalle.id_producto     → Producto",
        ]:
            print(f"  {rel}")


asyncio.run(main())
