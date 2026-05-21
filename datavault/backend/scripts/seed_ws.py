import asyncio
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from database import engine
from models import User, Workspace, WorkspaceMember

pwd = CryptContext(schemes=["bcrypt"])
S = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

USERS = [
    ("luis@empresa.com",     "Luis Mendoza",    "editor"),
    ("patricia@empresa.com", "Patricia Ruiz",   "editor"),
    ("roberto@empresa.com",  "Roberto Salinas", "viewer"),
    ("diana@empresa.com",    "Diana Torres",    "viewer"),
    ("miguel@empresa.com",   "Miguel Angel",    "editor"),
    ("carmen@empresa.com",   "Carmen Vega",     "editor"),
    ("andres@empresa.com",   "Andres Paredes",  "viewer"),
    ("valeria@empresa.com",  "Valeria Mora",    "editor"),
    ("gabriel@empresa.com",  "Gabriel Castro",  "viewer"),
    ("fernando@empresa.com", "Fernando Quispe", "editor"),
    ("natalia@empresa.com",  "Natalia Flores",  "editor"),
    ("oscar@empresa.com",    "Oscar Huanca",    "viewer"),
    ("beatriz@empresa.com",  "Beatriz Lara",    "viewer"),
    ("ricardo@empresa.com",  "Ricardo Ponce",   "editor"),
    ("claudia@empresa.com",  "Claudia Nieto",   "editor"),
    ("hector@empresa.com",   "Hector Mamani",   "viewer"),
    ("jessica@empresa.com",  "Jessica Apaza",   "viewer"),
]

NEW_WS = [
    ("Finanzas", "Presupuestos y reportes financieros"),
    ("TI",       "Infraestructura y soporte tecnico"),
]

ASSIGNMENTS = [
    ("luis@empresa.com",     "Ventas",      "editor"),
    ("patricia@empresa.com", "Ventas",      "editor"),
    ("roberto@empresa.com",  "Ventas",      "viewer"),
    ("diana@empresa.com",    "Ventas",      "viewer"),
    ("miguel@empresa.com",   "Operaciones", "manager"),
    ("carmen@empresa.com",   "Operaciones", "editor"),
    ("andres@empresa.com",   "Operaciones", "viewer"),
    ("valeria@empresa.com",  "RRHH",        "editor"),
    ("gabriel@empresa.com",  "RRHH",        "viewer"),
    ("fernando@empresa.com", "Finanzas",    "owner"),
    ("natalia@empresa.com",  "Finanzas",    "manager"),
    ("oscar@empresa.com",    "Finanzas",    "editor"),
    ("beatriz@empresa.com",  "Finanzas",    "viewer"),
    ("luis@empresa.com",     "Finanzas",    "viewer"),
    ("ricardo@empresa.com",  "TI",          "owner"),
    ("claudia@empresa.com",  "TI",          "manager"),
    ("hector@empresa.com",   "TI",          "editor"),
    ("jessica@empresa.com",  "TI",          "viewer"),
    ("andres@empresa.com",   "TI",          "viewer"),
    ("miguel@empresa.com",   "TI",          "editor"),
]

async def main():
    async with S() as db:
        users = {}
        for email, name, role in USERS:
            r = await db.execute(select(User).where(User.email == email))
            u = r.scalar_one_or_none()
            if not u:
                u = User(email=email, username=name,
                         hashed_password=pwd.hash("Pass1234!"),
                         role=role, is_active=True)
                db.add(u)
                await db.flush()
                print(f"  + {name} ({role})")
            users[email] = u
        await db.commit()

        for email, _, _ in USERS:
            r = await db.execute(select(User).where(User.email == email))
            users[email] = r.scalar_one()

        ws = {}
        for name, desc in NEW_WS:
            r = await db.execute(select(Workspace).where(Workspace.name == name))
            w = r.scalar_one_or_none()
            if not w:
                w = Workspace(name=name, description=desc)
                db.add(w)
                await db.flush()
                print(f"  + Workspace: {name}")
            ws[name] = w
        await db.commit()

        for name in ["Ventas", "Operaciones", "RRHH", "Finanzas", "TI"]:
            r = await db.execute(select(Workspace).where(Workspace.name == name))
            w = r.scalar_one_or_none()
            if w:
                ws[name] = w

        for email, wn, role in ASSIGNMENTS:
            w = ws.get(wn)
            u = users.get(email)
            if not w or not u:
                continue
            r = await db.execute(select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == w.id,
                WorkspaceMember.user_id == u.id))
            if not r.scalar_one_or_none():
                db.add(WorkspaceMember(workspace_id=w.id, user_id=u.id, role=role))
                print(f"  + {email} -> {wn} [{role}]")
        await db.commit()

        print("\n=== Resumen ===")
        for name, w in ws.items():
            r = await db.execute(
                select(WorkspaceMember, User)
                .join(User, WorkspaceMember.user_id == User.id)
                .where(WorkspaceMember.workspace_id == w.id))
            print(f"\n{name}:")
            for m, u in r.all():
                print(f"  {u.email:32s} [{m.role}]")

asyncio.run(main())
