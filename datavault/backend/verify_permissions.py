import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import engine
from models import User, Dataset
from auth import effective_role

VERIFY_USERS = [
    # (username, expected_access: {dataset_name: role})
    ("carlos.mendez", {
        "Cliente": "editor", "Pedido": "editor", "Detalle": "editor",
        "Producto": "viewer",
        "Proveedor": None, "Categoria": None, "Empleado": None,
    }),
    ("lucia.torres", {
        "Cliente": "editor", "Pedido": "editor", "Detalle": "editor",
        "Producto": "viewer",
        "Proveedor": None, "Categoria": None, "Empleado": None,
    }),
    ("miguel.quispe", {
        "Producto": "editor", "Proveedor": "editor", "Categoria": "editor",
        "Pedido": "viewer", "Detalle": "viewer",
        "Cliente": None, "Empleado": None,
    }),
    ("rodrigo.luna", {
        "Cliente": "editor", "Pedido": "editor", "Detalle": "editor",
        "Producto": "editor", "Proveedor": "editor",
        "Categoria": "editor", "Empleado": "editor",
    }),
    ("fernando.rojas", {
        "Cliente": "viewer", "Pedido": "viewer", "Detalle": "viewer",
        "Producto": "viewer", "Proveedor": "viewer",
        "Categoria": "viewer", "Empleado": "viewer",
    }),
]

async def main():
    async with AsyncSession(engine) as db:
        users = {u.username: u for u in (await db.execute(select(User))).scalars().all()}
        datasets = {d.name: d for d in (await db.execute(select(Dataset))).scalars().all()}

        all_ok = True
        for username, expected in VERIFY_USERS:
            u = users.get(username)
            if not u:
                print(f"\n[ERROR] usuario '{username}' no encontrado")
                continue

            print(f"\n{'='*55}")
            print(f"  {username} (rol global: {u.role})")
            print(f"{'='*55}")

            for ds_name, exp_role in expected.items():
                ds = datasets.get(ds_name)
                if not ds:
                    print(f"  [warn] dataset '{ds_name}' no encontrado")
                    continue

                actual = await effective_role(u, ds.id, db)
                # None means no specific perm — fallback to global role
                # For viewers, global role = viewer; for editors, global role = editor
                # But group perm should override for restricted datasets
                # "None" in expected means: should only see via global role (viewer/editor)
                if exp_role is None:
                    exp_role = u.role  # fallback to global

                ok = actual == exp_role
                if not ok:
                    all_ok = False
                status = "OK" if ok else "FAIL"
                mark = "+" if ok else "X"
                print(f"  [{mark}] {ds_name:<12} esperado={exp_role:<7} actual={actual:<7}  {status}")

        print(f"\n{'='*55}")
        if all_ok:
            print("  RESULTADO: Todos los permisos son correctos")
        else:
            print("  RESULTADO: Hay permisos incorrectos (ver FAIL arriba)")
        print(f"{'='*55}\n")

asyncio.run(main())
