"""
Seed de ejemplo para probar Workspaces.

Estructura:
  Workspace: Ventas
    - Datasets: Clientes, Pedidos
    - Grupos: Vendedores, Supervisores
    - Miembros: ana (owner), carlos (admin), lucia (member)

  Workspace: Operaciones
    - Datasets: Inventario, Proveedores
    - Grupos: Almacén, Logística
    - Miembros: mario (owner), sofia (admin), pedro (member)

  Workspace: RRHH
    - Datasets: Empleados
    - Grupos: Gestores
    - Miembros: elena (owner), jorge (member)

Contraseña de todos: Pass1234!
Admin global: admin@datavault.com / Admin1234!
"""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from models import Base, User, Workspace, WorkspaceMember, UserGroup, UserGroupMember, Dataset, ColumnDefinition, Record
from auth import hash_password

DATABASE_URL = "postgresql+asyncpg://dev:dev@db/datavault"
engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


def utcnow():
    return datetime.now(timezone.utc)


async def get_or_create_user(db, email, username, password, role="viewer"):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        user = User(email=email, username=username, hashed_password=hash_password(password), role=role)
        db.add(user)
        await db.flush()
        print(f"  [+] Usuario: {username} ({email}) rol={role}")
    else:
        print(f"  [=] Usuario ya existe: {username}")
    return user


async def create_workspace(db, name, description):
    ws = Workspace(name=name, description=description, created_at=utcnow())
    db.add(ws)
    await db.flush()
    print(f"  [+] Workspace: {name}")
    return ws


async def add_member(db, workspace, user, role):
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=role, joined_at=utcnow()))
        print(f"    -> Miembro: {user.username} ({role})")


async def create_group(db, workspace, name, description, members):
    group = UserGroup(name=name, description=description, workspace_id=workspace.id, created_at=utcnow())
    db.add(group)
    await db.flush()
    for user in members:
        db.add(UserGroupMember(group_id=group.id, user_id=user.id))
    print(f"    -> Grupo: {name} ({len(members)} miembros)")
    return group


async def create_dataset_with_data(db, workspace, name, description, columns_def, records_data):
    ds = Dataset(
        name=name,
        description=description,
        workspace_id=workspace.id,
        created_at=utcnow(),
    )
    db.add(ds)
    await db.flush()

    for i, col in enumerate(columns_def):
        db.add(ColumnDefinition(
            dataset_id=ds.id,
            name=col["name"],
            field_key=col["field_key"],
            data_type=col["data_type"],
            rules=col.get("rules", {}),
            position=i,
            created_at=utcnow(),
        ))

    for rec in records_data:
        db.add(Record(dataset_id=ds.id, data=rec, created_at=utcnow(), updated_at=utcnow()))

    print(f"    -> Dataset: {name} ({len(records_data)} registros, {len(columns_def)} columnas)")
    return ds


async def main():
    async with SessionLocal() as db:
        print("\n=== Creando usuarios ===")

        admin = await get_or_create_user(db, "admin@datavault.com", "admin", "Admin1234!", role="admin")

        # Ventas
        ana    = await get_or_create_user(db, "ana@empresa.com",    "ana",    "Pass1234!")
        carlos = await get_or_create_user(db, "carlos@empresa.com", "carlos", "Pass1234!")
        lucia  = await get_or_create_user(db, "lucia@empresa.com",  "lucia",  "Pass1234!")

        # Operaciones
        mario  = await get_or_create_user(db, "mario@empresa.com",  "mario",  "Pass1234!")
        sofia  = await get_or_create_user(db, "sofia@empresa.com",  "sofia",  "Pass1234!")
        pedro  = await get_or_create_user(db, "pedro@empresa.com",  "pedro",  "Pass1234!")

        # RRHH
        elena  = await get_or_create_user(db, "elena@empresa.com",  "elena",  "Pass1234!")
        jorge  = await get_or_create_user(db, "jorge@empresa.com",  "jorge",  "Pass1234!")

        await db.flush()

        # ── Workspace: Ventas ──────────────────────────────────────────────────
        print("\n=== Workspace: Ventas ===")
        ws_ventas = await create_workspace(db, "Ventas", "Equipo comercial y seguimiento de clientes")
        await add_member(db, ws_ventas, ana,    "owner")
        await add_member(db, ws_ventas, carlos, "admin")
        await add_member(db, ws_ventas, lucia,  "member")

        await create_group(db, ws_ventas, "Vendedores",   "Equipo de ventas activo",     [lucia, carlos])
        await create_group(db, ws_ventas, "Supervisores", "Supervisores del área ventas", [ana])

        await create_dataset_with_data(db, ws_ventas, "Clientes", "Base de clientes",
            columns_def=[
                {"name": "Nombre",   "field_key": "nombre",   "data_type": "text",   "rules": {"required": True}},
                {"name": "Email",    "field_key": "email",    "data_type": "text",   "rules": {}},
                {"name": "Teléfono", "field_key": "telefono", "data_type": "text",   "rules": {}},
                {"name": "Segmento", "field_key": "segmento", "data_type": "enum",   "rules": {"options": ["Premium", "Estándar", "Básico"]}},
                {"name": "Activo",   "field_key": "activo",   "data_type": "boolean","rules": {}},
            ],
            records_data=[
                {"nombre": "Empresa Alpha S.A.",  "email": "contacto@alpha.com",  "telefono": "555-0101", "segmento": "Premium",   "activo": True},
                {"nombre": "Beta Corp.",           "email": "info@betacorp.com",   "telefono": "555-0102", "segmento": "Estándar",  "activo": True},
                {"nombre": "Gamma Ltda.",          "email": "ventas@gamma.com",    "telefono": "555-0103", "segmento": "Básico",    "activo": True},
                {"nombre": "Delta Solutions",      "email": "hola@delta.com",      "telefono": "555-0104", "segmento": "Premium",   "activo": True},
                {"nombre": "Epsilon Tech",         "email": "soporte@epsilon.com", "telefono": "555-0105", "segmento": "Estándar",  "activo": False},
            ]
        )

        await create_dataset_with_data(db, ws_ventas, "Pedidos", "Registro de pedidos",
            columns_def=[
                {"name": "Código",   "field_key": "codigo",   "data_type": "text",   "rules": {"required": True}},
                {"name": "Cliente",  "field_key": "cliente",  "data_type": "text",   "rules": {}},
                {"name": "Monto",    "field_key": "monto",    "data_type": "number", "rules": {"min": 0}},
                {"name": "Estado",   "field_key": "estado",   "data_type": "enum",   "rules": {"options": ["Pendiente", "Confirmado", "Enviado", "Entregado"]}},
                {"name": "Fecha",    "field_key": "fecha",    "data_type": "date",   "rules": {}},
            ],
            records_data=[
                {"codigo": "PED-001", "cliente": "Empresa Alpha S.A.", "monto": 15000, "estado": "Entregado",  "fecha": "2026-04-01"},
                {"codigo": "PED-002", "cliente": "Beta Corp.",          "monto": 8500,  "estado": "Enviado",    "fecha": "2026-04-15"},
                {"codigo": "PED-003", "cliente": "Delta Solutions",     "monto": 32000, "estado": "Confirmado", "fecha": "2026-05-01"},
                {"codigo": "PED-004", "cliente": "Gamma Ltda.",         "monto": 2200,  "estado": "Pendiente",  "fecha": "2026-05-05"},
                {"codigo": "PED-005", "cliente": "Empresa Alpha S.A.",  "monto": 19500, "estado": "Confirmado", "fecha": "2026-05-06"},
            ]
        )

        # ── Workspace: Operaciones ─────────────────────────────────────────────
        print("\n=== Workspace: Operaciones ===")
        ws_ops = await create_workspace(db, "Operaciones", "Control de inventario y proveedores")
        await add_member(db, ws_ops, mario, "owner")
        await add_member(db, ws_ops, sofia, "admin")
        await add_member(db, ws_ops, pedro, "member")

        await create_group(db, ws_ops, "Almacén",   "Equipo de almacén",      [pedro, mario])
        await create_group(db, ws_ops, "Logística", "Equipo de distribución", [sofia])

        await create_dataset_with_data(db, ws_ops, "Inventario", "Stock de productos",
            columns_def=[
                {"name": "Producto",  "field_key": "producto",  "data_type": "text",   "rules": {"required": True}},
                {"name": "SKU",       "field_key": "sku",       "data_type": "text",   "rules": {}},
                {"name": "Stock",     "field_key": "stock",     "data_type": "number", "rules": {"min": 0}},
                {"name": "Mínimo",    "field_key": "minimo",    "data_type": "number", "rules": {}},
                {"name": "Categoría", "field_key": "categoria", "data_type": "enum",   "rules": {"options": ["Electrónica", "Insumos", "Herramientas", "Repuestos"]}},
            ],
            records_data=[
                {"producto": "Laptop Dell XPS",   "sku": "ELEC-001", "stock": 12,  "minimo": 5,  "categoria": "Electrónica"},
                {"producto": "Monitor 27\" 4K",   "sku": "ELEC-002", "stock": 8,   "minimo": 3,  "categoria": "Electrónica"},
                {"producto": "Tornillo M6x10",    "sku": "INSU-001", "stock": 500, "minimo": 100,"categoria": "Insumos"},
                {"producto": "Taladro Bosch",     "sku": "HERR-001", "stock": 4,   "minimo": 2,  "categoria": "Herramientas"},
                {"producto": "Cable HDMI 2m",     "sku": "ELEC-003", "stock": 35,  "minimo": 10, "categoria": "Electrónica"},
                {"producto": "Filtro de aceite",  "sku": "REPU-001", "stock": 22,  "minimo": 8,  "categoria": "Repuestos"},
            ]
        )

        await create_dataset_with_data(db, ws_ops, "Proveedores", "Lista de proveedores",
            columns_def=[
                {"name": "Empresa",   "field_key": "empresa",   "data_type": "text",   "rules": {"required": True}},
                {"name": "Contacto",  "field_key": "contacto",  "data_type": "text",   "rules": {}},
                {"name": "País",      "field_key": "pais",      "data_type": "text",   "rules": {}},
                {"name": "Categoría", "field_key": "categoria", "data_type": "enum",   "rules": {"options": ["Electrónica", "Insumos", "Herramientas", "Repuestos"]}},
                {"name": "Activo",    "field_key": "activo",    "data_type": "boolean","rules": {}},
            ],
            records_data=[
                {"empresa": "TechSupply S.A.",   "contacto": "Luis Torres",   "pais": "Chile",    "categoria": "Electrónica",  "activo": True},
                {"empresa": "InduParts Ltda.",   "contacto": "Rosa Méndez",   "pais": "Peru",     "categoria": "Insumos",       "activo": True},
                {"empresa": "HerraTools Corp.",  "contacto": "Carlos Vega",   "pais": "Colombia", "categoria": "Herramientas",  "activo": True},
                {"empresa": "AutoRepuestos EC",  "contacto": "Diana Lara",    "pais": "Ecuador",  "categoria": "Repuestos",     "activo": False},
            ]
        )

        # ── Workspace: RRHH ────────────────────────────────────────────────────
        print("\n=== Workspace: RRHH ===")
        ws_rrhh = await create_workspace(db, "RRHH", "Gestión de personas y talento")
        await add_member(db, ws_rrhh, elena, "owner")
        await add_member(db, ws_rrhh, jorge, "member")
        await add_member(db, ws_rrhh, admin, "admin")

        await create_group(db, ws_rrhh, "Gestores RRHH", "Gestores del área", [elena])

        await create_dataset_with_data(db, ws_rrhh, "Empleados", "Registro de empleados",
            columns_def=[
                {"name": "Nombre",     "field_key": "nombre",     "data_type": "text",   "rules": {"required": True}},
                {"name": "Cargo",      "field_key": "cargo",      "data_type": "text",   "rules": {}},
                {"name": "Área",       "field_key": "area",       "data_type": "enum",   "rules": {"options": ["Ventas", "Operaciones", "RRHH", "TI", "Finanzas"]}},
                {"name": "Inicio",     "field_key": "inicio",     "data_type": "date",   "rules": {}},
                {"name": "Salario",    "field_key": "salario",    "data_type": "number", "rules": {"min": 0}},
                {"name": "Activo",     "field_key": "activo",     "data_type": "boolean","rules": {}},
            ],
            records_data=[
                {"nombre": "Ana García",     "cargo": "Gerente Ventas",    "area": "Ventas",      "inicio": "2022-01-15", "salario": 85000, "activo": True},
                {"nombre": "Carlos López",   "cargo": "Vendedor Senior",   "area": "Ventas",      "inicio": "2023-03-01", "salario": 55000, "activo": True},
                {"nombre": "Lucía Pérez",    "cargo": "Vendedora",         "area": "Ventas",      "inicio": "2024-06-01", "salario": 45000, "activo": True},
                {"nombre": "Mario Ramírez",  "cargo": "Jefe Operaciones",  "area": "Operaciones", "inicio": "2021-05-10", "salario": 75000, "activo": True},
                {"nombre": "Sofía Torres",   "cargo": "Coordinadora Log.", "area": "Operaciones", "inicio": "2022-09-01", "salario": 60000, "activo": True},
                {"nombre": "Pedro Sánchez",  "cargo": "Operario Almacén",  "area": "Operaciones", "inicio": "2023-11-15", "salario": 38000, "activo": True},
                {"nombre": "Elena Morales",  "cargo": "Gerente RRHH",      "area": "RRHH",        "inicio": "2020-02-01", "salario": 90000, "activo": True},
                {"nombre": "Jorge Castillo", "cargo": "Analista RRHH",     "area": "RRHH",        "inicio": "2024-01-10", "salario": 48000, "activo": True},
            ]
        )

        await db.commit()
        print("\n✓ Seed completado exitosamente.")
        print("\n=== Resumen de acceso ===")
        print("Admin global:  admin@datavault.com  / Admin1234!")
        print("Workspace Ventas     → ana@empresa.com (owner), carlos@empresa.com (admin), lucia@empresa.com (member)")
        print("Workspace Operaciones→ mario@empresa.com (owner), sofia@empresa.com (admin), pedro@empresa.com (member)")
        print("Workspace RRHH       → elena@empresa.com (owner), jorge@empresa.com (member)")
        print("Contraseña todos:    Pass1234!")


if __name__ == "__main__":
    asyncio.run(main())
