"""
Seed completo para el workspace existente "PGH" — Agencia de Marketing Digital.

Crea:
  - 18 usuarios (1 owner, 2 admin_ws, 15 members) — todos con password Pass1234!
  - 5 grupos (Ejecutivos, Cuentas, Creativos, Tecnología, Operaciones)
  - 8 datasets en el workspace con 10 relaciones FK:

      Departamentos.id_lider     → Empleados
      Clientes.id_asignado       → Empleados
      Proyectos.id_cliente       → Clientes
      Proyectos.id_lider         → Empleados
      Campañas.id_proyecto       → Proyectos
      Tareas.id_proyecto         → Proyectos
      Tareas.id_asignado         → Empleados
      Facturas.id_cliente        → Clientes
      Reportes.id_proyecto       → Proyectos
      Reportes.id_autor          → Empleados

  - ~570 registros distribuidos:
      Empleados:     15
      Departamentos: 5
      Clientes:      25
      Proyectos:     40
      Campañas:      60
      Tareas:        250
      Facturas:      60
      Reportes:      40

Uso:
    docker cp seed_pgh_complete.py datavault-backend-1:/app/
    docker compose exec backend python seed_pgh_complete.py
"""
import random, asyncio, uuid
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import async_sessionmaker
from database import engine
from models import (
    Workspace, WorkspaceMember, User, UserGroup, UserGroupMember,
    Dataset, ColumnDefinition, Record, ChangeHistory,
    DatasetPermission, DatasetGroupPermission, PermissionAuditLog,
)
from auth import hash_password

Session = async_sessionmaker(engine, expire_on_commit=False)

# ── Workspace target (PGH) ──────────────────────────────────────────────────
WS_ID = uuid.UUID("e5067394-b0eb-46d2-a02a-49fcfb582a81")
WS_NAME = "PGH"

# ── Master data ─────────────────────────────────────────────────────────────
random.seed(42)  # reproducible

NOMBRES_M = ["Carlos","Roberto","Miguel","Diego","Jorge","Pedro","Luis","Juan","Fernando","Ricardo","Oscar","Hector","Ernesto","Raul","Victor","Andres","Marcos","Cesar","Gonzalo","Felipe","Eduardo","Alvaro","Rodolfo","Enrique","Guillermo"]
NOMBRES_F = ["Lucia","Ana","Sofia","Valeria","Maria","Carmen","Isabel","Rosa","Patricia","Elena","Gloria","Diana","Monica","Claudia","Sandra","Beatriz","Liliana","Adriana","Norma","Martha","Yolanda","Cecilia","Alejandra","Graciela","Pilar"]
APELLIDOS = ["García","Rodríguez","López","Martínez","González","Pérez","Sánchez","Ramírez","Torres","Flores","Rivera","Gómez","Díaz","Cruz","Morales","Ortiz","Guerrero","Delgado","Castro","Vargas","Ramos","Reyes","Mendoza","Herrera","Silva","Rojas","Quispe","Mamani","Huanca","Chávez","Salinas","Vega","Medina","Fuentes","Ponce","Cabrera"]

CARGOS = [
    "Director General","Director Creativo","Account Manager Senior","Account Manager",
    "Diseñador Gráfico Senior","Diseñador Gráfico","Copywriter Senior","Copywriter",
    "Community Manager","Specialist SEO","Desarrollador Web Senior","Desarrollador Web",
    "Especialista en Ads","Analista de Datos","Coordinador de Producción",
]
DEPARTAMENTOS_NAMES = ["Dirección General","Cuentas","Creativo","Performance","Operaciones"]
SECTORES_CLIENTE = ["Retail","Tecnología","Finanzas","Salud","Educación","Inmobiliaria","Gastronomía","Turismo","Manufactura","Servicios"]
ESTADOS_CLIENTE = ["Prospecto","Activo","Pausado","Cerrado","Ex-cliente"]
EMPRESAS = [
    "TecnoMart","FashionGo","BeautyHub","FoodPlus","SportPro","HomeStyle","BookWorld",
    "AutoExpress","TravelNow","HealthFirst","EduMax","FinTrust","RealtyPro","CafeChic",
    "FitnessClub","GreenLife","UrbanWear","DigitalEdge","SmartHome","Wellness360",
    "QuickServ","MediaMax","CloudPro","DataLink","FastDeliver"
]
ESTADOS_PROYECTO = ["Por iniciar","En progreso","En revisión","Completado","En pausa","Cancelado"]
PLATAFORMAS = ["Facebook Ads","Instagram Ads","Google Ads","LinkedIn Ads","TikTok Ads","YouTube Ads","Twitter/X Ads","Pinterest Ads"]
ESTADOS_TAREA = ["Pendiente","En progreso","En revisión","Bloqueada","Completada"]
PRIORIDADES = ["Baja","Media","Alta","Urgente"]
ESTADOS_FACTURA = ["Borrador","Emitida","Pagada parcial","Pagada","Vencida"]
TIPOS_REPORTE = ["Mensual","Trimestral","Campaña","Ad-hoc","Cierre de proyecto"]
TAGS_REPORTE = ["KPIs","ROI","Cliente","Equipo","Performance","Diseño","Contenido","SEO","Branding"]

NOMBRES_PROYECTOS_BASE = [
    "Rebranding","Campaña Lanzamiento","Estrategia Digital","Sitio Web","E-commerce",
    "App Móvil","Campaña Estacional","Posicionamiento SEO","Identidad Visual",
    "Plan de Contenidos","Video Corporativo","Auditoría Digital","Reporte Anual",
    "Newsletter","Influencer Marketing","Performance Ads","Landing Page","Social Media",
    "Campaña Black Friday","Branding Producto","Estudio de Mercado","Renovación Sitio",
    "Migración CMS","Optimización Conversiones","Email Marketing","Inbound Marketing"
]

TITULOS_TAREA = [
    "Diseñar pieza para Instagram","Redactar copy para anuncio","Configurar pixel de Meta",
    "Auditoría SEO técnica","Programar publicaciones","Optimizar landing page",
    "Análisis de competencia","Reunión con cliente","Brief creativo","Revisión de creatividades",
    "Aprobar artes finales","Subir campaña a Google Ads","Reportar resultados",
    "Investigar keywords","Editar video","Storyboard","A/B test del CTA",
    "Configurar Analytics","Setup de remarketing","Optimizar bid strategy",
    "Crear newsletter","Diseñar banners web","Renovar fotografías","Crear UTMs",
    "Backup del sitio","Actualizar plugins","Diseñar mockup app","Wireframes UX",
    "Validar formularios","Migrar contenidos","Briefing con influencer","Calendario editorial",
    "Diseñar reel","Investigar tendencias","Setup tracking eventos","Configurar dominio"
]

# ── Helpers ─────────────────────────────────────────────────────────────────
def rand_date(start="2024-01-01", end="2026-05-22"):
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    return (s + timedelta(days=random.randint(0, (e - s).days))).isoformat()

def rand_date_future(start="2026-05-22", days=120):
    s = date.fromisoformat(start)
    return (s + timedelta(days=random.randint(1, days))).isoformat()

def slugify(s: str) -> str:
    out = s.lower()
    for a, b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ñ","n"),(" ","."),(",",""),("(",""),(")","")]:
        out = out.replace(a, b)
    return out


async def make_dataset(session, ws_id, name: str, description: str = "") -> uuid.UUID:
    ds = Dataset(name=name, description=description or None, workspace_id=ws_id)
    session.add(ds)
    await session.commit()
    await session.refresh(ds)
    return ds.id


async def make_col(session, dataset_id, name: str, field_key: str,
                   data_type: str, rules: dict | None = None, position: int = 0):
    session.add(ColumnDefinition(
        dataset_id=dataset_id, name=name, field_key=field_key,
        data_type=data_type, rules=rules or {}, position=position,
    ))
    await session.commit()


async def bulk(session, dataset_id, rows: list[dict]):
    for d in rows:
        session.add(Record(dataset_id=dataset_id, data=d))
    await session.commit()
    print(f"    + {len(rows)} registros")


async def get_ids(session, dataset_id) -> list[str]:
    r = await session.execute(
        select(Record.id).where(Record.dataset_id == dataset_id, Record.deleted_at.is_(None))
    )
    return [str(row[0]) for row in r.all()]


# ═══════════════════════════════════════════════════════════════════════════
async def main():
    async with Session() as s:
        # ── 0. Verificar workspace existe ─────────────────────────────────
        ws = await s.execute(select(Workspace).where(Workspace.id == WS_ID))
        ws_row = ws.scalar_one_or_none()
        if not ws_row:
            print(f"ERROR: workspace {WS_ID} no encontrado.")
            print("Workspaces existentes:")
            all_ws = await s.execute(select(Workspace.id, Workspace.name))
            for row in all_ws.all():
                print(f"  {row[0]}  {row[1]}")
            return
        print(f"✓ Workspace target: {ws_row.name} ({WS_ID})\n")

        # ── 1. Limpiar lo previo del workspace ────────────────────────────
        print("Limpiando datos previos del workspace PGH...")
        # Datasets del workspace (cascade borra cols, records, perms via ondelete)
        ds_rows = (await s.execute(select(Dataset.id).where(Dataset.workspace_id == WS_ID))).scalars().all()
        if ds_rows:
            # Borrar ChangeHistory de records de esos datasets
            await s.execute(delete(ChangeHistory).where(
                ChangeHistory.record_id.in_(
                    select(Record.id).where(Record.dataset_id.in_(ds_rows))
                )
            ))
            await s.execute(delete(PermissionAuditLog).where(PermissionAuditLog.dataset_id.in_(ds_rows)))
            await s.execute(delete(Record).where(Record.dataset_id.in_(ds_rows)))
            await s.execute(delete(ColumnDefinition).where(ColumnDefinition.dataset_id.in_(ds_rows)))
            await s.execute(delete(DatasetGroupPermission).where(DatasetGroupPermission.dataset_id.in_(ds_rows)))
            await s.execute(delete(DatasetPermission).where(DatasetPermission.dataset_id.in_(ds_rows)))
            await s.execute(delete(Dataset).where(Dataset.id.in_(ds_rows)))
        # Grupos del workspace y sus miembros
        grp_ids = (await s.execute(select(UserGroup.id).where(UserGroup.workspace_id == WS_ID))).scalars().all()
        if grp_ids:
            await s.execute(delete(UserGroupMember).where(UserGroupMember.group_id.in_(grp_ids)))
            await s.execute(delete(UserGroup).where(UserGroup.id.in_(grp_ids)))
        # Membresías del workspace (no borrar al admin global existente)
        await s.execute(delete(WorkspaceMember).where(WorkspaceMember.workspace_id == WS_ID))
        await s.commit()
        print("  ✓ Workspace vacío\n")

        # ── 2. Asegurar admin global como owner del WS ────────────────────
        admin_user = (await s.execute(
            select(User).where(User.email == "admin@datavault.com")
        )).scalar_one_or_none()
        if admin_user:
            s.add(WorkspaceMember(workspace_id=WS_ID, user_id=admin_user.id, role="owner"))
            await s.commit()

        # ── 3. Crear usuarios del workspace ───────────────────────────────
        print("Creando usuarios del workspace PGH...")
        hashed = hash_password("Pass1234!")

        users_spec = [
            # (email, username, ws_role, cargo_index_hint)
            ("paola.gomez@pgh.com",       "Paola Gómez",       "owner",   0),  # Director General
            ("miguel.torres@pgh.com",     "Miguel Torres",     "admin_ws",1),  # Director Creativo
            ("ana.rivera@pgh.com",        "Ana Rivera",        "admin_ws",2),  # Account Manager Sr
            ("diego.castro@pgh.com",      "Diego Castro",      "member",  2),
            ("sofia.martinez@pgh.com",    "Sofía Martínez",    "member",  3),
            ("carlos.flores@pgh.com",     "Carlos Flores",     "member",  4),
            ("valeria.salazar@pgh.com",   "Valeria Salazar",   "member",  5),
            ("jorge.mendoza@pgh.com",     "Jorge Mendoza",     "member",  6),
            ("lucia.perez@pgh.com",       "Lucía Pérez",       "member",  7),
            ("roberto.silva@pgh.com",     "Roberto Silva",     "member",  8),
            ("camila.ortega@pgh.com",     "Camila Ortega",     "member",  9),
            ("andres.ramos@pgh.com",      "Andrés Ramos",      "member", 10),
            ("isabella.vega@pgh.com",     "Isabella Vega",     "member", 11),
            ("fernando.cruz@pgh.com",     "Fernando Cruz",     "member", 12),
            ("daniela.huerta@pgh.com",    "Daniela Huerta",    "member", 13),
            ("ricardo.ponce@pgh.com",     "Ricardo Ponce",     "member", 14),
            ("monica.dias@pgh.com",       "Mónica Días",       "member",  3),
            ("eduardo.lopez@pgh.com",     "Eduardo López",     "member",  5),
        ]
        users_created = []
        for email, uname, ws_role, _ in users_spec:
            existing = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if existing:
                user = existing
            else:
                user = User(email=email, username=uname, hashed_password=hashed, role="editor", is_active=True)
                s.add(user)
                await s.commit()
                await s.refresh(user)
            users_created.append((user, ws_role))
            # Membresía
            s.add(WorkspaceMember(workspace_id=WS_ID, user_id=user.id, role=ws_role))
        await s.commit()
        print(f"  ✓ {len(users_created)} usuarios + membresías\n")

        # ── 4. Crear grupos del workspace ─────────────────────────────────
        print("Creando grupos...")
        groups_spec = [
            ("Ejecutivos",   "Dirección general y liderazgo",        [0, 1]),
            ("Cuentas",      "Account managers — relación cliente",  [2, 3, 16]),
            ("Creativos",    "Diseño, copy y producción",            [4, 5, 6, 7, 17]),
            ("Tecnología",   "Desarrollo web, SEO y ads",            [8, 9, 10, 12]),
            ("Operaciones",  "Coordinación y back-office",           [11, 13, 14, 15]),
        ]
        for gname, gdesc, idxs in groups_spec:
            g = UserGroup(workspace_id=WS_ID, name=gname, description=gdesc)
            s.add(g)
            await s.commit()
            await s.refresh(g)
            for i in idxs:
                if i < len(users_created):
                    s.add(UserGroupMember(group_id=g.id, user_id=users_created[i][0].id))
            await s.commit()
            print(f"  + {gname}: {len(idxs)} miembros")
        print()

        # ─────────────────────────────────────────────────────────────────
        # 5. Datasets del workspace — 8 tablas con FKs cruzadas
        # ─────────────────────────────────────────────────────────────────

        # 5.1 EMPLEADOS (sin FK)
        print("Creando Empleados...")
        ds_emp = await make_dataset(s, WS_ID, "Empleados", "Personal interno de la agencia")
        await make_col(s, ds_emp, "Nombre",           "nombre",           "text",     {"required": True}, 0)
        await make_col(s, ds_emp, "Email",            "email",            "email",    {"required": True}, 1)
        await make_col(s, ds_emp, "Cargo",            "cargo",            "enum",     {"options": CARGOS}, 2)
        await make_col(s, ds_emp, "Departamento",     "departamento",     "enum",     {"options": DEPARTAMENTOS_NAMES}, 3)
        await make_col(s, ds_emp, "Teléfono",         "telefono",         "phone",    {}, 4)
        await make_col(s, ds_emp, "Salario mensual",  "salario",          "currency", {"currency_symbol": "S/"}, 5)
        await make_col(s, ds_emp, "Fecha de ingreso", "fecha_ingreso",    "date",     {}, 6)
        await make_col(s, ds_emp, "Activo",           "activo",           "boolean",  {}, 7)
        await make_col(s, ds_emp, "Rating performance","rating_perf",      "rating",   {"max_rating": 5}, 8)

        empleados_rows = []
        for i in range(15):
            es_h = random.choice([True, False])
            nombre = f"{random.choice(NOMBRES_M if es_h else NOMBRES_F)} {random.choice(APELLIDOS)} {random.choice(APELLIDOS)}"
            cargo = CARGOS[i] if i < len(CARGOS) else random.choice(CARGOS)
            dep = DEPARTAMENTOS_NAMES[0] if i == 0 else (
                  DEPARTAMENTOS_NAMES[2] if "Creativo" in cargo or "Diseñ" in cargo or "Copy" in cargo else (
                  DEPARTAMENTOS_NAMES[1] if "Account" in cargo else (
                  DEPARTAMENTOS_NAMES[3] if "Ads" in cargo or "SEO" in cargo or "Desarroll" in cargo or "Datos" in cargo else
                  DEPARTAMENTOS_NAMES[4])))
            empleados_rows.append({
                "nombre": nombre,
                "email": f"{slugify(nombre.split()[0])}.{slugify(nombre.split()[1])}@pgh.com",
                "cargo": cargo,
                "departamento": dep,
                "telefono": f"+51 9{random.randint(10,99)}{random.randint(100,999)}{random.randint(100,999)}",
                "salario": round(random.uniform(2500, 12000), 2),
                "fecha_ingreso": rand_date("2020-01-01", "2025-12-31"),
                "activo": True,
                "rating_perf": random.randint(3, 5),
            })
        await bulk(s, ds_emp, empleados_rows)
        ids_emp = await get_ids(s, ds_emp)

        # 5.2 DEPARTAMENTOS (FK → Empleados)
        print("Creando Departamentos...")
        ds_dep = await make_dataset(s, WS_ID, "Departamentos", "Áreas internas y sus líderes")
        await make_col(s, ds_dep, "Nombre",       "nombre",       "text",     {"required": True}, 0)
        await make_col(s, ds_dep, "Descripción",  "descripcion",  "long_text",{}, 1)
        await make_col(s, ds_dep, "Líder",        "id_lider",     "text",     {}, 2)
        await make_col(s, ds_dep, "Presupuesto anual", "presupuesto_anual", "currency", {"currency_symbol": "S/"}, 3)
        await make_col(s, ds_dep, "N° empleados", "num_empleados", "number",  {}, 4)
        await make_col(s, ds_dep, "Activo",       "activo",       "boolean",  {}, 5)

        # Asignar líder en base al cargo
        cargo_to_lider = {}
        emp_records = (await s.execute(select(Record).where(Record.dataset_id == ds_emp))).scalars().all()
        for r in emp_records:
            cargo_to_lider[r.data.get("cargo")] = str(r.id)

        depto_descs = {
            "Dirección General": "Liderazgo estratégico y dirección de la agencia",
            "Cuentas":           "Relacionamiento, propuestas y seguimiento de clientes",
            "Creativo":          "Diseño, copywriting, branding y producción audiovisual",
            "Performance":       "Ads, SEO, analítica y conversión",
            "Operaciones":       "Administración, coordinación y soporte interno",
        }
        depto_lider_map = {
            "Dirección General": "Director General",
            "Cuentas":           "Account Manager Senior",
            "Creativo":          "Director Creativo",
            "Performance":       "Especialista en Ads",
            "Operaciones":       "Coordinador de Producción",
        }
        deptos_rows = []
        for d in DEPARTAMENTOS_NAMES:
            deptos_rows.append({
                "nombre": d,
                "descripcion": depto_descs[d],
                "id_lider": cargo_to_lider.get(depto_lider_map[d], ""),
                "presupuesto_anual": round(random.uniform(80_000, 350_000), 2),
                "num_empleados": sum(1 for e in emp_records if e.data.get("departamento") == d),
                "activo": True,
            })
        await bulk(s, ds_dep, deptos_rows)

        # 5.3 CLIENTES (FK → Empleados)
        print("Creando Clientes...")
        ds_cli = await make_dataset(s, WS_ID, "Clientes", "Cartera de clientes activos y prospectos")
        await make_col(s, ds_cli, "Empresa",       "empresa",       "text",     {"required": True}, 0)
        await make_col(s, ds_cli, "Sector",        "sector",        "enum",     {"options": SECTORES_CLIENTE}, 1)
        await make_col(s, ds_cli, "Contacto",      "contacto",      "text",     {}, 2)
        await make_col(s, ds_cli, "Email",         "email",         "email",    {}, 3)
        await make_col(s, ds_cli, "Teléfono",      "telefono",      "phone",    {}, 4)
        await make_col(s, ds_cli, "Web",           "web",           "url",      {}, 5)
        await make_col(s, ds_cli, "Account Manager","id_asignado",  "text",     {}, 6)
        await make_col(s, ds_cli, "Estado",        "estado",        "enum",     {"options": ESTADOS_CLIENTE}, 7)
        await make_col(s, ds_cli, "Fecha de alta", "fecha_alta",    "date",     {}, 8)
        await make_col(s, ds_cli, "Facturación estimada","facturacion_est", "currency", {"currency_symbol": "S/"}, 9)

        # Account managers = empleados con cargo "Account..."
        ams = [str(r.id) for r in emp_records if "Account" in r.data.get("cargo", "")]
        if not ams: ams = ids_emp[:3]

        clientes_rows = []
        for i, emp in enumerate(EMPRESAS):
            es_h = random.choice([True, False])
            nombre_cto = f"{random.choice(NOMBRES_M if es_h else NOMBRES_F)} {random.choice(APELLIDOS)}"
            clientes_rows.append({
                "empresa": f"{emp} S.A.C." if i % 3 == 0 else (f"{emp} EIRL" if i % 3 == 1 else emp),
                "sector": random.choice(SECTORES_CLIENTE),
                "contacto": nombre_cto,
                "email": f"contacto@{slugify(emp)}.com",
                "telefono": f"+51 9{random.randint(10,99)}{random.randint(100,999)}{random.randint(100,999)}",
                "web": f"https://www.{slugify(emp)}.com",
                "id_asignado": random.choice(ams),
                "estado": random.choices(ESTADOS_CLIENTE, weights=[2,7,1,1,1])[0],
                "fecha_alta": rand_date("2023-01-01","2026-04-30"),
                "facturacion_est": round(random.uniform(5000, 80000), 2),
            })
        await bulk(s, ds_cli, clientes_rows)
        ids_cli = await get_ids(s, ds_cli)

        # 5.4 PROYECTOS (FK → Clientes, FK → Empleados)
        print("Creando Proyectos...")
        ds_pro = await make_dataset(s, WS_ID, "Proyectos", "Proyectos activos e históricos")
        await make_col(s, ds_pro, "Nombre",            "nombre",         "text",     {"required": True}, 0)
        await make_col(s, ds_pro, "Cliente",           "id_cliente",     "text",     {}, 1)
        await make_col(s, ds_pro, "Líder de proyecto", "id_lider",       "text",     {}, 2)
        await make_col(s, ds_pro, "Estado",            "estado",         "enum",     {"options": ESTADOS_PROYECTO}, 3)
        await make_col(s, ds_pro, "Fecha inicio",      "fecha_inicio",   "date",     {}, 4)
        await make_col(s, ds_pro, "Fecha fin",         "fecha_fin",      "date",     {}, 5)
        await make_col(s, ds_pro, "Presupuesto",       "presupuesto",    "currency", {"currency_symbol": "S/"}, 6)
        await make_col(s, ds_pro, "Avance",            "avance",         "percent",  {}, 7)
        await make_col(s, ds_pro, "Notas",             "notas",          "long_text",{}, 8)

        # Líderes = empleados senior
        lideres = [str(r.id) for r in emp_records if "Senior" in r.data.get("cargo", "") or "Director" in r.data.get("cargo", "")]
        if not lideres: lideres = ids_emp[:5]

        proyectos_rows = []
        for i in range(40):
            nombre = f"{random.choice(NOMBRES_PROYECTOS_BASE)} {random.choice(EMPRESAS)}"
            estado = random.choices(ESTADOS_PROYECTO, weights=[2, 6, 3, 4, 1, 1])[0]
            fi = rand_date("2024-06-01","2026-04-15")
            ff = (date.fromisoformat(fi) + timedelta(days=random.randint(30, 240))).isoformat()
            proyectos_rows.append({
                "nombre": nombre,
                "id_cliente": random.choice(ids_cli),
                "id_lider": random.choice(lideres),
                "estado": estado,
                "fecha_inicio": fi,
                "fecha_fin": ff,
                "presupuesto": round(random.uniform(3000, 65000), 2),
                "avance": 100 if estado == "Completado" else (0 if estado == "Por iniciar" else random.randint(10, 90)),
                "notas": random.choice([
                    "Cliente respondió bien al pitch inicial",
                    "Pendiente revisión final de creatividades",
                    "Esperando aprobación de presupuesto adicional",
                    "Avanza según cronograma",
                    "Hay riesgo de retraso por dependencia de cliente",
                    "",
                ]),
            })
        await bulk(s, ds_pro, proyectos_rows)
        ids_pro = await get_ids(s, ds_pro)

        # 5.5 CAMPAÑAS (FK → Proyectos)
        print("Creando Campañas...")
        ds_cam = await make_dataset(s, WS_ID, "Campanas", "Campañas publicitarias por proyecto")
        await make_col(s, ds_cam, "Nombre",           "nombre",       "text",    {"required": True}, 0)
        await make_col(s, ds_cam, "Proyecto",         "id_proyecto",  "text",    {}, 1)
        await make_col(s, ds_cam, "Plataforma",       "plataforma",   "enum",    {"options": PLATAFORMAS}, 2)
        await make_col(s, ds_cam, "Inversión",        "inversion",    "currency",{"currency_symbol": "S/"}, 3)
        await make_col(s, ds_cam, "Alcance",          "alcance",      "number",  {}, 4)
        await make_col(s, ds_cam, "Conversiones",     "conversiones", "number",  {}, 5)
        await make_col(s, ds_cam, "CPL (costo x lead)","cpl",         "currency",{"currency_symbol": "S/"}, 6)
        await make_col(s, ds_cam, "Fecha inicio",     "fecha_inicio", "date",    {}, 7)
        await make_col(s, ds_cam, "Activa",           "activa",       "boolean", {}, 8)
        await make_col(s, ds_cam, "Tags",             "tags",         "multiselect", {"options": ["Awareness","Conversión","Branding","Retargeting","Leads","Tráfico"]}, 9)

        campanas_rows = []
        for i in range(60):
            inversion = round(random.uniform(500, 15000), 2)
            conversiones = random.randint(2, 800)
            cpl = round(inversion / max(conversiones, 1), 2)
            campanas_rows.append({
                "nombre": f"{random.choice(['Campaña','Lanzamiento','Promo','Flash','Boost'])} #{i+1}",
                "id_proyecto": random.choice(ids_pro),
                "plataforma": random.choice(PLATAFORMAS),
                "inversion": inversion,
                "alcance": random.randint(1000, 250000),
                "conversiones": conversiones,
                "cpl": cpl,
                "fecha_inicio": rand_date("2024-08-01","2026-04-30"),
                "activa": random.choice([True, True, False]),
                "tags": random.sample(["Awareness","Conversión","Branding","Retargeting","Leads","Tráfico"], k=random.randint(1, 3)),
            })
        await bulk(s, ds_cam, campanas_rows)

        # 5.6 TAREAS (FK → Proyectos, FK → Empleados)
        print("Creando Tareas...")
        ds_tar = await make_dataset(s, WS_ID, "Tareas", "Backlog y tareas en curso")
        await make_col(s, ds_tar, "Título",         "titulo",         "text",    {"required": True}, 0)
        await make_col(s, ds_tar, "Proyecto",       "id_proyecto",    "text",    {}, 1)
        await make_col(s, ds_tar, "Asignado a",     "id_asignado",    "text",    {}, 2)
        await make_col(s, ds_tar, "Estado",         "estado",         "enum",    {"options": ESTADOS_TAREA}, 3)
        await make_col(s, ds_tar, "Prioridad",      "prioridad",      "enum",    {"options": PRIORIDADES}, 4)
        await make_col(s, ds_tar, "Fecha límite",   "fecha_limite",   "date",    {}, 5)
        await make_col(s, ds_tar, "Horas estimadas","horas_estimadas","number",  {"min": 0}, 6)
        await make_col(s, ds_tar, "Horas reales",   "horas_reales",   "number",  {"min": 0}, 7)
        await make_col(s, ds_tar, "Completada",     "completada",     "boolean", {}, 8)
        await make_col(s, ds_tar, "Descripción",    "descripcion",    "long_text",{}, 9)

        tareas_rows = []
        for i in range(250):
            estado = random.choices(ESTADOS_TAREA, weights=[3, 5, 2, 1, 4])[0]
            horas_est = random.choice([0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24])
            tareas_rows.append({
                "titulo": random.choice(TITULOS_TAREA),
                "id_proyecto": random.choice(ids_pro),
                "id_asignado": random.choice(ids_emp),
                "estado": estado,
                "prioridad": random.choices(PRIORIDADES, weights=[3, 6, 4, 1])[0],
                "fecha_limite": rand_date_future("2026-05-22", 90) if estado != "Completada" else rand_date("2025-08-01","2026-05-21"),
                "horas_estimadas": horas_est,
                "horas_reales": round(horas_est * random.uniform(0.7, 1.4), 1) if estado == "Completada" else round(horas_est * random.uniform(0, 0.8), 1),
                "completada": estado == "Completada",
                "descripcion": "" if random.random() < 0.7 else random.choice([
                    "Coordinar con cliente para aprobación previa",
                    "Considerar el brief de la última reunión",
                    "Bloqueada hasta tener las imágenes finales",
                    "Esperando aprobación de presupuesto",
                ]),
            })
        await bulk(s, ds_tar, tareas_rows)

        # 5.7 FACTURAS (FK → Clientes)
        print("Creando Facturas...")
        ds_fac = await make_dataset(s, WS_ID, "Facturas", "Facturación a clientes")
        await make_col(s, ds_fac, "Número",         "numero",         "text",    {"required": True}, 0)
        await make_col(s, ds_fac, "Cliente",        "id_cliente",     "text",    {}, 1)
        await make_col(s, ds_fac, "Fecha emisión",  "fecha_emision",  "date",    {}, 2)
        await make_col(s, ds_fac, "Fecha vencimiento","fecha_vto",    "date",    {}, 3)
        await make_col(s, ds_fac, "Subtotal",       "subtotal",       "currency",{"currency_symbol": "S/"}, 4)
        await make_col(s, ds_fac, "IGV (18%)",      "igv",            "currency",{"currency_symbol": "S/"}, 5)
        await make_col(s, ds_fac, "Total",          "total",          "currency",{"currency_symbol": "S/"}, 6)
        await make_col(s, ds_fac, "Estado",         "estado",         "enum",    {"options": ESTADOS_FACTURA}, 7)
        await make_col(s, ds_fac, "Fecha pago",     "fecha_pago",     "date",    {}, 8)
        await make_col(s, ds_fac, "Observaciones",  "observaciones",  "long_text",{}, 9)

        facturas_rows = []
        for i in range(60):
            sub = round(random.uniform(800, 35000), 2)
            igv = round(sub * 0.18, 2)
            total = round(sub + igv, 2)
            estado = random.choices(ESTADOS_FACTURA, weights=[1, 3, 1, 6, 2])[0]
            femit = rand_date("2024-08-01","2026-04-30")
            fvto = (date.fromisoformat(femit) + timedelta(days=30)).isoformat()
            fpago = ""
            if estado in ("Pagada", "Pagada parcial"):
                fpago = (date.fromisoformat(femit) + timedelta(days=random.randint(5, 45))).isoformat()
            facturas_rows.append({
                "numero": f"F001-{1000 + i:05d}",
                "id_cliente": random.choice(ids_cli),
                "fecha_emision": femit,
                "fecha_vto": fvto,
                "subtotal": sub,
                "igv": igv,
                "total": total,
                "estado": estado,
                "fecha_pago": fpago,
                "observaciones": "" if random.random() < 0.8 else "Cliente solicitó plazo extendido",
            })
        await bulk(s, ds_fac, facturas_rows)

        # 5.8 REPORTES (FK → Proyectos, FK → Empleados)
        print("Creando Reportes...")
        ds_rep = await make_dataset(s, WS_ID, "Reportes", "Reportes ejecutivos y de campaña")
        await make_col(s, ds_rep, "Título",      "titulo",       "text",         {"required": True}, 0)
        await make_col(s, ds_rep, "Tipo",        "tipo",         "enum",         {"options": TIPOS_REPORTE}, 1)
        await make_col(s, ds_rep, "Proyecto",    "id_proyecto",  "text",         {}, 2)
        await make_col(s, ds_rep, "Autor",       "id_autor",     "text",         {}, 3)
        await make_col(s, ds_rep, "Fecha",       "fecha",        "date",         {}, 4)
        await make_col(s, ds_rep, "Tags",        "tags",         "multiselect",  {"options": TAGS_REPORTE}, 5)
        await make_col(s, ds_rep, "Calificación","calificacion", "rating",       {"max_rating": 5}, 6)
        await make_col(s, ds_rep, "Resumen",     "resumen",      "long_text",    {}, 7)
        await make_col(s, ds_rep, "Link",        "link_drive",   "url",          {}, 8)

        analistas = [str(r.id) for r in emp_records if "Analista" in r.data.get("cargo","") or "Senior" in r.data.get("cargo","")]
        if not analistas: analistas = ids_emp[:5]

        reportes_rows = []
        for i in range(40):
            reportes_rows.append({
                "titulo": f"{random.choice(TIPOS_REPORTE)} — {random.choice(NOMBRES_PROYECTOS_BASE)} #{i+1}",
                "tipo": random.choice(TIPOS_REPORTE),
                "id_proyecto": random.choice(ids_pro),
                "id_autor": random.choice(analistas),
                "fecha": rand_date("2024-09-01","2026-05-15"),
                "tags": random.sample(TAGS_REPORTE, k=random.randint(2, 4)),
                "calificacion": random.choices([3, 4, 5], weights=[1, 4, 5])[0],
                "resumen": random.choice([
                    "Los KPIs principales superaron lo esperado, con un ROI por encima del benchmark del sector.",
                    "Resultados mixtos: la campaña de awareness funcionó, pero la conversión quedó debajo del objetivo.",
                    "Excelentes resultados en performance, vale la pena escalar el presupuesto el próximo trimestre.",
                    "Cliente satisfecho con los entregables y propuso ampliar el alcance del contrato.",
                    "Detectamos oportunidades de optimización en los anuncios, las aplicaremos en la próxima fase.",
                ]),
                "link_drive": f"https://drive.pgh.com/reportes/{1000+i}",
            })
        await bulk(s, ds_rep, reportes_rows)

        # ─────────────────────────────────────────────────────────────────
        # 6. Permisos por grupo (algunos datasets visibles para algunos grupos)
        # ─────────────────────────────────────────────────────────────────
        print("\nAplicando permisos por grupo...")
        groups_by_name = {g.name: g for g in (await s.execute(select(UserGroup).where(UserGroup.workspace_id == WS_ID))).scalars().all()}
        # Ejecutivos: ven y editan TODO (admin)
        for ds_id in [ds_emp, ds_dep, ds_cli, ds_pro, ds_cam, ds_tar, ds_fac, ds_rep]:
            s.add(DatasetGroupPermission(dataset_id=ds_id, group_id=groups_by_name["Ejecutivos"].id, role="admin"))
        # Cuentas: editan Clientes + Proyectos + Facturas; leen Tareas/Reportes
        for ds_id, role in [(ds_cli,"editor"),(ds_pro,"editor"),(ds_fac,"editor"),(ds_tar,"viewer"),(ds_rep,"viewer")]:
            s.add(DatasetGroupPermission(dataset_id=ds_id, group_id=groups_by_name["Cuentas"].id, role=role))
        # Creativos: editan Tareas + Reportes; leen Proyectos/Clientes
        for ds_id, role in [(ds_tar,"editor"),(ds_rep,"editor"),(ds_pro,"viewer"),(ds_cli,"viewer")]:
            s.add(DatasetGroupPermission(dataset_id=ds_id, group_id=groups_by_name["Creativos"].id, role=role))
        # Tecnología: editan Campañas + Tareas; leen Proyectos
        for ds_id, role in [(ds_cam,"editor"),(ds_tar,"editor"),(ds_pro,"viewer"),(ds_rep,"editor")]:
            s.add(DatasetGroupPermission(dataset_id=ds_id, group_id=groups_by_name["Tecnología"].id, role=role))
        # Operaciones: editan Empleados + Departamentos + Facturas; leen Proyectos
        for ds_id, role in [(ds_emp,"editor"),(ds_dep,"editor"),(ds_fac,"editor"),(ds_pro,"viewer")]:
            s.add(DatasetGroupPermission(dataset_id=ds_id, group_id=groups_by_name["Operaciones"].id, role=role))
        await s.commit()
        print("  ✓ Permisos aplicados (5 grupos × ~5 datasets c/u)")

        # ── Resumen final ────────────────────────────────────────────────
        n_emp     = (await s.execute(select(Record).where(Record.dataset_id == ds_emp))).scalars().all()
        n_dep     = (await s.execute(select(Record).where(Record.dataset_id == ds_dep))).scalars().all()
        n_cli     = (await s.execute(select(Record).where(Record.dataset_id == ds_cli))).scalars().all()
        n_pro     = (await s.execute(select(Record).where(Record.dataset_id == ds_pro))).scalars().all()
        n_cam     = (await s.execute(select(Record).where(Record.dataset_id == ds_cam))).scalars().all()
        n_tar     = (await s.execute(select(Record).where(Record.dataset_id == ds_tar))).scalars().all()
        n_fac     = (await s.execute(select(Record).where(Record.dataset_id == ds_fac))).scalars().all()
        n_rep     = (await s.execute(select(Record).where(Record.dataset_id == ds_rep))).scalars().all()
        total = len(n_emp)+len(n_dep)+len(n_cli)+len(n_pro)+len(n_cam)+len(n_tar)+len(n_fac)+len(n_rep)

        print()
        print("━" * 64)
        print(f"  ✓ Workspace PGH listo — {total} registros totales")
        print("━" * 64)
        print(f"    Empleados      {len(n_emp):>4}")
        print(f"    Departamentos  {len(n_dep):>4}")
        print(f"    Clientes       {len(n_cli):>4}")
        print(f"    Proyectos      {len(n_pro):>4}")
        print(f"    Campañas       {len(n_cam):>4}")
        print(f"    Tareas         {len(n_tar):>4}")
        print(f"    Facturas       {len(n_fac):>4}")
        print(f"    Reportes       {len(n_rep):>4}")
        print()
        print(f"    Usuarios:  {len(users_created)} (1 owner, 2 admin_ws, 15 members)")
        print(f"    Grupos:    5  (Ejecutivos, Cuentas, Creativos, Tecnología, Operaciones)")
        print(f"    Password de todos los usuarios PGH: Pass1234!")
        print()
        print("    Credenciales destacadas:")
        print("      paola.gomez@pgh.com    (owner del workspace)")
        print("      miguel.torres@pgh.com  (admin_ws)")
        print("      ana.rivera@pgh.com     (admin_ws)")


if __name__ == "__main__":
    asyncio.run(main())
