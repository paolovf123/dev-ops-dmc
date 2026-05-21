"""
Seed de pruebas de roles:
- Crea 15 nuevos usuarios (algunos se marcan inactivos)
- Crea 3 usuarios de prueba específicos: test.owner, test.adminws, test.member
- Asigna usuarios a workspaces con roles owner/admin_ws/member
- Puebla grupos con más miembros
- Crea grupos nuevos en Finanzas y TI
"""
import asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, text
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://dev:dev@db/datavault")

from passlib.context import CryptContext
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Nuevos usuarios ───────────────────────────────────────────────────────────
NEW_USERS = [
    # (email, username, password, global_role, is_active)
    ("juan.perez@empresa.com",       "juan.perez",       "Pass1234!", "editor",  True),
    ("maria.garcia@empresa.com",     "maria.garcia",     "Pass1234!", "viewer",  True),
    ("carlos.lopez@empresa.com",     "carlos.lopez",     "Pass1234!", "editor",  False),  # inactivo
    ("ana.martinez@empresa.com",     "ana.martinez",     "Pass1234!", "viewer",  False),  # inactivo
    ("laura.sanchez@empresa.com",    "laura.sanchez",    "Pass1234!", "editor",  True),
    ("david.gonzalez@empresa.com",   "david.gonzalez",   "Pass1234!", "viewer",  True),
    ("isabel.hernandez@empresa.com", "isabel.hernandez", "Pass1234!", "editor",  False),  # inactivo
    ("pablo.moreno@empresa.com",     "pablo.moreno",     "Pass1234!", "viewer",  True),
    ("cristina.jimenez@empresa.com", "cristina.jimenez", "Pass1234!", "editor",  True),
    ("alejandro.ruiz@empresa.com",   "alejandro.ruiz",   "Pass1234!", "viewer",  False),  # inactivo
    ("pilar.vargas@empresa.com",     "pilar.vargas",     "Pass1234!", "editor",  True),
    ("raul.ortega@empresa.com",      "raul.ortega",      "Pass1234!", "viewer",  True),
    ("marta.castillo@empresa.com",   "marta.castillo",   "Pass1234!", "editor",  True),
    ("sergio.molina@empresa.com",    "sergio.molina",    "Pass1234!", "viewer",  True),
    ("elena.ramos@empresa.com",      "elena.ramos",      "Pass1234!", "editor",  True),
    # Cuentas de prueba por rol de workspace
    ("test.owner@empresa.com",   "test.owner",   "TestOwner1!",   "editor", True),
    ("test.adminws@empresa.com", "test.adminws", "TestAdminWS1!", "editor", True),
    ("test.member@empresa.com",  "test.member",  "TestMember1!",  "viewer", True),
]

# Usuarios existentes que vamos a marcar como inactivos
DEACTIVATE_USERNAMES = ["jorge", "mario", "pedro", "ana"]


async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:

        # ── 1. Crear nuevos usuarios ──────────────────────────────────────────
        print("=== Creando usuarios ===")
        user_map: dict[str, uuid.UUID] = {}  # username → id

        # Cargar usuarios existentes en el mapa
        existing = await db.execute(text("SELECT id, username, email FROM users"))
        for row in existing:
            user_map[row.username] = row.id
            user_map[row.email]    = row.id

        for email, username, password, role, is_active in NEW_USERS:
            if email in user_map:
                print(f"  [skip] {username} ya existe")
                continue
            uid = uuid.uuid4()
            await db.execute(text("""
                INSERT INTO users (id, email, username, hashed_password, role, is_active, created_at)
                VALUES (:id, :email, :username, :pw, :role, :active, now())
            """), {"id": uid, "email": email, "username": username,
                   "pw": pwd.hash(password), "role": role, "active": is_active})
            user_map[username] = uid
            user_map[email]    = uid
            status = "ACTIVO" if is_active else "INACTIVO"
            print(f"  [+] {username} ({role}) [{status}]")

        await db.commit()

        # ── 2. Desactivar usuarios existentes ─────────────────────────────────
        print("\n=== Desactivando usuarios ===")
        for uname in DEACTIVATE_USERNAMES:
            result = await db.execute(
                text("UPDATE users SET is_active=false WHERE username=:u AND is_active=true RETURNING username"),
                {"u": uname}
            )
            row = result.fetchone()
            if row:
                print(f"  [desactivado] {uname}")
            else:
                print(f"  [skip] {uname} (no encontrado o ya inactivo)")
        await db.commit()

        # ── 3. Recargar mapa completo de usuarios ─────────────────────────────
        all_users = await db.execute(text("SELECT id, username, email FROM users"))
        for row in all_users:
            user_map[row.username] = row.id
            user_map[row.email]    = row.id

        # ── 4. Cargar workspaces ───────────────────────────────────────────────
        ws_result = await db.execute(text("SELECT id, name FROM workspaces"))
        ws_map: dict[str, uuid.UUID] = {row.name: row.id for row in ws_result}
        print(f"\n=== Workspaces: {list(ws_map.keys())} ===")

        # ── 5. Cargar grupos ───────────────────────────────────────────────────
        grp_result = await db.execute(text("SELECT id, name FROM user_groups"))
        grp_map: dict[str, uuid.UUID] = {row.name: row.id for row in grp_result}

        # ── 6. Asignaciones workspace → miembros con roles ────────────────────
        print("\n=== Asignando miembros a workspaces ===")

        WS_MEMBERS = {
            "Ventas": [
                ("test.owner",   "owner"),
                ("test.adminws", "admin_ws"),
                ("test.member",  "member"),
                ("Ricardo Ponce",   "admin_ws"),
                ("Natalia Flores",  "admin_ws"),
                ("juan.perez",      "member"),
                ("maria.garcia",    "member"),
                ("laura.sanchez",   "member"),
                ("david.gonzalez",  "member"),
                ("cristina.jimenez","member"),
                ("raul.ortega",     "member"),
                ("marta.castillo",  "member"),
                ("elena.ramos",     "member"),
            ],
            "Finanzas": [
                ("Miguel Angel",   "owner"),
                ("Patricia Ruiz",  "admin_ws"),
                ("Valeria Mora",   "admin_ws"),
                ("pilar.vargas",   "member"),
                ("pablo.moreno",   "member"),
                ("sergio.molina",  "member"),
                ("isabel.hernandez","member"),
                ("Luis Mendoza",   "member"),
            ],
            "TI": [
                ("Luis Mendoza",     "owner"),
                ("Carmen Vega",      "admin_ws"),
                ("Claudia Nieto",    "admin_ws"),
                ("isabel.hernandez", "member"),
                ("pilar.vargas",     "member"),
                ("david.gonzalez",   "member"),
                ("juan.perez",       "member"),
                ("sergio.molina",    "member"),
            ],
            "RRHH": [
                ("Valeria Mora",   "owner"),
                ("Carmen Vega",    "admin_ws"),
                ("Patricia Ruiz",  "member"),
                ("marta.castillo", "member"),
                ("elena.ramos",    "member"),
                ("laura.sanchez",  "member"),
                ("pablo.moreno",   "member"),
            ],
            "Operaciones": [
                ("Fernando Quispe", "owner"),
                ("Claudia Nieto",   "admin_ws"),
                ("Ricardo Ponce",   "admin_ws"),
                ("raul.ortega",     "member"),
                ("juan.perez",      "member"),
                ("cristina.jimenez","member"),
                ("david.gonzalez",  "member"),
                ("maria.garcia",    "member"),
                ("sergio.molina",   "member"),
                ("marta.castillo",  "member"),
            ],
        }

        for ws_name, assignments in WS_MEMBERS.items():
            ws_id = ws_map.get(ws_name)
            if not ws_id:
                print(f"  [skip] workspace '{ws_name}' no encontrado")
                continue

            # Cargar miembros existentes
            existing_members = await db.execute(
                text("SELECT user_id FROM workspace_members WHERE workspace_id=:ws"),
                {"ws": ws_id}
            )
            existing_ids = {row.user_id for row in existing_members}

            for uname, role in assignments:
                uid = user_map.get(uname)
                if not uid:
                    print(f"  [skip] usuario '{uname}' no encontrado")
                    continue
                if uid in existing_ids:
                    # Actualizar rol si cambió
                    await db.execute(
                        text("UPDATE workspace_members SET role=:role WHERE workspace_id=:ws AND user_id=:uid"),
                        {"role": role, "ws": ws_id, "uid": uid}
                    )
                    print(f"  [upd] {ws_name}: {uname} → {role}")
                else:
                    await db.execute(
                        text("INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (:ws, :uid, :role, now())"),
                        {"ws": ws_id, "uid": uid, "role": role}
                    )
                    existing_ids.add(uid)
                    print(f"  [+] {ws_name}: {uname} ({role})")

        await db.commit()

        # ── 7. Crear grupos nuevos ─────────────────────────────────────────────
        print("\n=== Creando grupos nuevos ===")
        NEW_GROUPS = [
            ("Analistas",     "Análisis financiero y reportes",     "Finanzas"),
            ("Contabilidad",  "Gestión contable y presupuesto",     "Finanzas"),
            ("Dev Backend",   "Desarrollo de servicios y APIs",     "TI"),
            ("Dev Frontend",  "Desarrollo de interfaces de usuario", "TI"),
            ("Soporte TI",    "Mesa de ayuda y soporte técnico",    "TI"),
        ]
        for gname, gdesc, ws_name in NEW_GROUPS:
            if gname in grp_map:
                print(f"  [skip] {gname} ya existe")
                continue
            ws_id = ws_map.get(ws_name)
            gid = uuid.uuid4()
            await db.execute(
                text("INSERT INTO user_groups (id, name, description, workspace_id, created_at) VALUES (:id,:name,:desc,:ws,now())"),
                {"id": gid, "name": gname, "desc": gdesc, "ws": ws_id}
            )
            grp_map[gname] = gid
            print(f"  [+] {gname} (en {ws_name})")
        await db.commit()

        # ── 8. Asignar miembros a grupos ──────────────────────────────────────
        print("\n=== Asignando miembros a grupos ===")

        GROUP_MEMBERS = {
            "Vendedores": [
                "juan.perez", "maria.garcia", "laura.sanchez", "david.gonzalez",
                "cristina.jimenez", "raul.ortega", "marta.castillo", "test.member",
                "Ricardo Ponce", "Natalia Flores",
            ],
            "Supervisores": [
                "test.owner", "test.adminws", "Ricardo Ponce",
                "Natalia Flores", "Miguel Angel",
            ],
            "Almacén": [
                "raul.ortega", "pablo.moreno", "sergio.molina",
                "david.gonzalez", "cristina.jimenez",
            ],
            "Logística": [
                "Fernando Quispe", "juan.perez", "maria.garcia",
                "marta.castillo", "elena.ramos", "Claudia Nieto",
            ],
            "Gestores RRHH": [
                "Valeria Mora", "Carmen Vega", "Patricia Ruiz",
                "marta.castillo", "laura.sanchez",
            ],
            "Analistas": [
                "Miguel Angel", "pilar.vargas", "Luis Mendoza",
                "isabel.hernandez", "Patricia Ruiz",
            ],
            "Contabilidad": [
                "pilar.vargas", "pablo.moreno", "sergio.molina",
                "Valeria Mora", "Patricia Ruiz",
            ],
            "Dev Backend": [
                "Luis Mendoza", "juan.perez", "Claudia Nieto",
                "david.gonzalez", "isabel.hernandez",
            ],
            "Dev Frontend": [
                "Carmen Vega", "cristina.jimenez", "pilar.vargas",
                "marta.castillo", "elena.ramos",
            ],
            "Soporte TI": [
                "raul.ortega", "pablo.moreno", "sergio.molina",
                "david.gonzalez", "test.member",
            ],
        }

        for gname, usernames in GROUP_MEMBERS.items():
            gid = grp_map.get(gname)
            if not gid:
                print(f"  [skip] grupo '{gname}' no encontrado")
                continue

            existing_members = await db.execute(
                text("SELECT user_id FROM user_group_members WHERE group_id=:gid"),
                {"gid": gid}
            )
            existing_ids = {row.user_id for row in existing_members}

            added = 0
            for uname in usernames:
                uid = user_map.get(uname)
                if not uid:
                    print(f"    [skip] '{uname}' no encontrado")
                    continue
                if uid in existing_ids:
                    continue
                await db.execute(
                    text("INSERT INTO user_group_members (group_id, user_id) VALUES (:gid, :uid)"),
                    {"gid": gid, "uid": uid}
                )
                existing_ids.add(uid)
                added += 1

            print(f"  [+] {gname}: +{added} miembros nuevos")

        await db.commit()

        # ── 9. Resumen ────────────────────────────────────────────────────────
        print("\n=== RESUMEN ===")
        counts = await db.execute(text("""
            SELECT
                (SELECT count(*) FROM users WHERE is_active=true)  AS activos,
                (SELECT count(*) FROM users WHERE is_active=false) AS inactivos,
                (SELECT count(*) FROM workspaces)                  AS workspaces,
                (SELECT count(*) FROM user_groups)                 AS grupos,
                (SELECT count(*) FROM workspace_members)           AS ws_members,
                (SELECT count(*) FROM user_group_members)          AS grp_members
        """))
        r = counts.fetchone()
        print(f"  Usuarios activos:   {r.activos}")
        print(f"  Usuarios inactivos: {r.inactivos}")
        print(f"  Workspaces:         {r.workspaces}")
        print(f"  Grupos:             {r.grupos}")
        print(f"  Miembros WS total:  {r.ws_members}")
        print(f"  Miembros grupos:    {r.grp_members}")
        print()
        print("Cuentas de prueba por rol (todos con workspace 'Ventas'):")
        print("  test.owner@empresa.com   / TestOwner1!   → owner del workspace Ventas")
        print("  test.adminws@empresa.com / TestAdminWS1! → admin_ws del workspace Ventas")
        print("  test.member@empresa.com  / TestMember1!  → member del workspace Ventas")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
