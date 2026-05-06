import asyncio
import uuid
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import engine
from models import User, Dataset, UserGroup, UserGroupMember, DatasetGroupPermission

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = [
    ("carlos.mendez@empresa.com",   "carlos.mendez",   "Pass1234!", "editor"),
    ("lucia.torres@empresa.com",    "lucia.torres",    "Pass1234!", "viewer"),
    ("miguel.quispe@empresa.com",   "miguel.quispe",   "Pass1234!", "editor"),
    ("sofia.ramirez@empresa.com",   "sofia.ramirez",   "Pass1234!", "viewer"),
    ("andres.flores@empresa.com",   "andres.flores",   "Pass1234!", "editor"),
    ("valeria.chacon@empresa.com",  "valeria.chacon",  "Pass1234!", "viewer"),
    ("javier.ramos@empresa.com",    "javier.ramos",    "Pass1234!", "editor"),
    ("daniela.vega@empresa.com",    "daniela.vega",    "Pass1234!", "viewer"),
    ("rodrigo.luna@empresa.com",    "rodrigo.luna",    "Pass1234!", "editor"),
    ("patricia.silva@empresa.com",  "patricia.silva",  "Pass1234!", "viewer"),
    ("fernando.rojas@empresa.com",  "fernando.rojas",  "Pass1234!", "editor"),
    ("camila.paredes@empresa.com",  "camila.paredes",  "Pass1234!", "viewer"),
]

GROUPS = [
    ("Ventas",       "Equipo comercial y seguimiento de pedidos"),
    ("Operaciones",  "Gestion de productos, proveedores y categorias"),
    ("Gerencia",     "Acceso completo de direccion"),
    ("Analitica",    "Analistas de datos y scripts calculados"),
]

GROUP_MEMBERS = {
    "Ventas":      ["carlos.mendez", "lucia.torres", "andres.flores", "valeria.chacon"],
    "Operaciones": ["miguel.quispe", "sofia.ramirez", "javier.ramos", "daniela.vega"],
    "Gerencia":    ["rodrigo.luna", "patricia.silva"],
    "Analitica":   ["fernando.rojas", "camila.paredes", "carlos.mendez"],
}

GROUP_PERMISSIONS = {
    "Ventas": [
        ("Cliente", "editor"),
        ("Pedido",  "editor"),
        ("Detalle", "editor"),
        ("Producto","viewer"),
    ],
    "Operaciones": [
        ("Producto",  "editor"),
        ("Proveedor", "editor"),
        ("Categoria", "editor"),
        ("Pedido",    "viewer"),
        ("Detalle",   "viewer"),
    ],
    "Gerencia": [
        ("Cliente",   "editor"),
        ("Pedido",    "editor"),
        ("Detalle",   "editor"),
        ("Producto",  "editor"),
        ("Proveedor", "editor"),
        ("Categoria", "editor"),
        ("Empleado",  "editor"),
    ],
    "Analitica": [
        ("Cliente",   "viewer"),
        ("Pedido",    "viewer"),
        ("Detalle",   "viewer"),
        ("Producto",  "viewer"),
        ("Proveedor", "viewer"),
        ("Categoria", "viewer"),
        ("Empleado",  "viewer"),
        ("test",      "editor"),
    ],
}

async def main():
    async with AsyncSession(engine) as db:
        # 1. Create users
        existing_emails = {u.email for u in (await db.execute(select(User))).scalars().all()}
        user_map: dict[str, User] = {
            u.username: u
            for u in (await db.execute(select(User))).scalars().all()
        }

        for email, username, password, role in USERS:
            if email in existing_emails:
                print(f"  [skip] {username} ya existe")
                continue
            u = User(
                id=uuid.uuid4(),
                email=email,
                username=username,
                hashed_password=pwd_ctx.hash(password),
                role=role,
            )
            db.add(u)
            user_map[username] = u
            print(f"  [+] usuario {username} ({role})")

        await db.flush()

        # 2. Create groups
        existing_groups = {g.name: g for g in (await db.execute(select(UserGroup))).scalars().all()}
        group_map: dict[str, UserGroup] = dict(existing_groups)

        for name, desc in GROUPS:
            if name in existing_groups:
                print(f"  [skip] grupo '{name}' ya existe")
                continue
            g = UserGroup(id=uuid.uuid4(), name=name, description=desc)
            db.add(g)
            group_map[name] = g
            print(f"  [+] grupo '{name}'")

        await db.flush()

        # 3. Add members
        existing_members = {
            (str(m.group_id), str(m.user_id))
            for m in (await db.execute(select(UserGroupMember))).scalars().all()
        }

        for group_name, usernames in GROUP_MEMBERS.items():
            g = group_map[group_name]
            for uname in usernames:
                u = user_map.get(uname)
                if not u:
                    print(f"  [warn] usuario '{uname}' no encontrado")
                    continue
                if (str(g.id), str(u.id)) in existing_members:
                    continue
                db.add(UserGroupMember(group_id=g.id, user_id=u.id))
                print(f"  [+] {uname} -> {group_name}")

        await db.flush()

        # 4. Assign dataset permissions to groups
        datasets = {d.name: d for d in (await db.execute(select(Dataset))).scalars().all()}
        existing_perms = {
            (str(p.group_id), str(p.dataset_id))
            for p in (await db.execute(select(DatasetGroupPermission))).scalars().all()
        }

        for group_name, perms in GROUP_PERMISSIONS.items():
            g = group_map[group_name]
            for ds_name, role in perms:
                ds = datasets.get(ds_name)
                if not ds:
                    print(f"  [warn] dataset '{ds_name}' no encontrado")
                    continue
                if (str(g.id), str(ds.id)) in existing_perms:
                    continue
                db.add(DatasetGroupPermission(
                    id=uuid.uuid4(),
                    dataset_id=ds.id,
                    group_id=g.id,
                    role=role,
                ))
                print(f"  [+] {group_name} -> {ds_name} ({role})")

        await db.commit()
        print("\nListo!")

asyncio.run(main())
