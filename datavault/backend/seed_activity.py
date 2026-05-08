"""Simula actividad realista de múltiples usuarios para poblar el log de auditoría."""
import asyncio, random, json
from datetime import date
import httpx

BASE = "http://localhost:8000"

USERS = {
    "Fernando Quispe": "fernando@empresa.com",
    "Natalia Flores":  "natalia@empresa.com",
    "Oscar Huanca":    "oscar@empresa.com",
    "Ricardo Ponce":   "ricardo@empresa.com",
    "Claudia Nieto":   "claudia@empresa.com",
    "Hector Mamani":   "hector@empresa.com",
    "Luis Mendoza":    "luis@empresa.com",
    "Patricia Ruiz":   "patricia@empresa.com",
    "Miguel Angel":    "miguel@empresa.com",
    "Valeria Mora":    "valeria@empresa.com",
}


async def login_all(client):
    tokens = {}
    for name, email in USERS.items():
        r = await client.post("/auth/login", json={"email": email, "password": "Pass1234!"})
        if r.is_success:
            tokens[name] = r.json()["access_token"]
            print(f"  ✓ {name}")
        else:
            print(f"  ✗ {name}: {r.text[:60]}")
    return tokens


async def get_datasets(client, token):
    r = await client.get("/datasets", headers={"Authorization": f"Bearer {token}"})
    return {ds["name"]: ds["id"] for ds in r.json()}


async def get_recs(client, token, ds_id, limit=30):
    r = await client.get(f"/datasets/{ds_id}/records", headers={"Authorization": f"Bearer {token}"}, params={"limit": limit})
    resp = r.json()
    return resp if isinstance(resp, list) else resp.get("data", [])


async def upd(client, token, ds_id, rec_id, data):
    r = await client.patch(f"/datasets/{ds_id}/records/{rec_id}", json={"data": data}, headers={"Authorization": f"Bearer {token}"})
    return r.is_success


async def create(client, token, ds_id, data):
    r = await client.post(f"/datasets/{ds_id}/records", json={"data": data}, headers={"Authorization": f"Bearer {token}"})
    return r.is_success, (r.json() if r.is_success else {})


async def delete(client, token, ds_id, rec_id):
    r = await client.delete(f"/datasets/{ds_id}/records/{rec_id}", headers={"Authorization": f"Bearer {token}"})
    return r.is_success


async def restore(client, token, ds_id, rec_id):
    r = await client.post(f"/datasets/{ds_id}/records/{rec_id}/restore", headers={"Authorization": f"Bearer {token}"})
    return r.is_success


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as client:
        print("Autenticando usuarios...")
        tokens = await login_all(client)

        print("\nObteniendo datasets...")
        ds = await get_datasets(client, tokens["Fernando Quispe"])
        print(f"  {len(ds)} datasets disponibles")

        deleted_facturas = []
        deleted_tickets  = []

        # ── FINANZAS ─────────────────────────────────────────────────────────
        print("\n=== FINANZAS ===")

        # Fernando: actualiza 6 presupuestos
        recs = await get_recs(client, tokens["Fernando Quispe"], ds["Presupuesto"])
        for rec in recs[:6]:
            old = rec["data"].get("monto_ejecutado", 0)
            new_val = round(old * random.uniform(0.85, 1.18), 2)
            ok = await upd(client, tokens["Fernando Quispe"], ds["Presupuesto"], rec["id"],
                           {**rec["data"], "monto_ejecutado": new_val, "estado": "En ejecución"})
            print(f"  [Fernando] Presupuesto {rec['data'].get('area')}/{rec['data'].get('concepto')}: {old} → {new_val} {'✓' if ok else '✗'}")

        # Fernando: marca facturas pendientes como pagadas
        recs = await get_recs(client, tokens["Fernando Quispe"], ds["Facturas"], 50)
        pagadas = 0
        for rec in recs:
            if rec["data"].get("estado") == "Pendiente" and pagadas < 6:
                ok = await upd(client, tokens["Fernando Quispe"], ds["Facturas"], rec["id"],
                               {**rec["data"], "estado": "Pagada"})
                print(f"  [Fernando] Factura {rec['data'].get('numero')} → Pagada {'✓' if ok else '✗'}")
                pagadas += 1

        # Fernando: crea 2 facturas nuevas
        for i, (prov, concepto, monto) in enumerate([
            ("Tech Solutions SAC", "Licencias Microsoft Q2", 12400),
            ("Software Corp", "Soporte ERP anual", 9800),
        ]):
            ok, _ = await create(client, tokens["Fernando Quispe"], ds["Facturas"], {
                "numero": f"F-209900{i+1}", "proveedor": prov, "concepto": concepto,
                "monto": monto, "fecha_emision": "2025-06-01", "estado": "Pendiente",
            })
            print(f"  [Fernando] Factura F-209900{i+1} creada {'✓' if ok else '✗'}")

        # Natalia: actualiza centros de costo
        recs = await get_recs(client, tokens["Natalia Flores"], ds["CentrosCosto"])
        for rec in recs[:7]:
            ok = await upd(client, tokens["Natalia Flores"], ds["CentrosCosto"], rec["id"], {
                **rec["data"],
                "costo_fijo": rec["data"].get("costo_fijo", 0) + random.randint(400, 1200),
                "costo_variable": rec["data"].get("costo_variable", 0) + random.randint(100, 500),
                "responsable": "Natalia Flores",
            })
            print(f"  [Natalia] CentrosCosto {rec['data'].get('centro')}/{rec['data'].get('mes')} {'✓' if ok else '✗'}")

        # Natalia: registra movimientos de caja
        for tipo, cat, monto, desc, saldo in [
            ("Ingreso", "Ventas",      45000, "Cobro cliente corporativo ABC - contrato anual", 195000),
            ("Egreso",  "Nómina",      32000, "Pago nómina junio 2025",                        163000),
            ("Ingreso", "Servicios",   18500, "Facturación servicios digitales mayo",           181500),
            ("Egreso",  "Proveedores", 11200, "Pago Proveedor TechSolutions factura #F-2025A",  170300),
            ("Egreso",  "Impuestos",    8400, "Declaración IGV mayo 2025",                      161900),
        ]:
            ok, _ = await create(client, tokens["Natalia Flores"], ds["FlujoCaja"], {
                "fecha": "2025-06-01", "tipo": tipo, "categoria": cat,
                "monto": monto, "descripcion": desc, "saldo": saldo,
            })
            print(f"  [Natalia] FlujoCaja {tipo} {cat} {monto:,} {'✓' if ok else '✗'}")

        # Oscar: elimina facturas vencidas
        recs = await get_recs(client, tokens["Oscar Huanca"], ds["Facturas"], 80)
        count = 0
        for rec in recs:
            if rec["data"].get("estado") == "Vencida" and count < 5:
                ok = await delete(client, tokens["Oscar Huanca"], ds["Facturas"], rec["id"])
                print(f"  [Oscar] Factura {rec['data'].get('numero')} ELIMINADA {'✓' if ok else '✗'}")
                if ok:
                    deleted_facturas.append(rec["id"])
                count += 1

        # ── TI ────────────────────────────────────────────────────────────────
        print("\n=== TI ===")

        # Ricardo: actualiza proyectos
        recs = await get_recs(client, tokens["Ricardo Ponce"], ds["ProyectosTI"])
        for rec in recs[:4]:
            nuevo_estado = random.choice(["En curso", "Completado", "En curso"])
            ok = await upd(client, tokens["Ricardo Ponce"], ds["ProyectosTI"], rec["id"], {
                **rec["data"],
                "estado": nuevo_estado,
                "presupuesto": rec["data"].get("presupuesto", 0) + random.randint(3000, 12000),
            })
            print(f"  [Ricardo] Proyecto '{rec['data'].get('nombre')}' → {nuevo_estado} {'✓' if ok else '✗'}")

        # Ricardo: crea proyecto nuevo
        ok, _ = await create(client, tokens["Ricardo Ponce"], ds["ProyectosTI"], {
            "nombre": "Ciberseguridad 2025",
            "descripcion": "Plan de hardening, pentesting interno y capacitación al equipo",
            "lider": "Ricardo Ponce", "fecha_inicio": "2025-07-01", "fecha_fin": "2025-12-31",
            "estado": "Planificado", "prioridad": "Alta", "presupuesto": 55000,
        })
        print(f"  [Ricardo] Proyecto Ciberseguridad 2025 creado {'✓' if ok else '✗'}")

        # Claudia: actualiza licencias (uso)
        recs = await get_recs(client, tokens["Claudia Nieto"], ds["LicenciasSoftware"])
        for rec in recs[:5]:
            new_used = min(rec["data"].get("cant_usadas", 0) + random.randint(1, 4),
                          rec["data"].get("cant_licencias", 99))
            ok = await upd(client, tokens["Claudia Nieto"], ds["LicenciasSoftware"], rec["id"], {
                **rec["data"], "cant_usadas": new_used,
            })
            print(f"  [Claudia] Licencia '{rec['data'].get('software')}' usadas: {new_used} {'✓' if ok else '✗'}")

        # Claudia: agrega licencias nuevas
        for sw, prov, tipo, total, usadas, costo, venc, estado in [
            ("GitHub Copilot",   "GitHub",      "Suscripción anual", 15,  9, 2400, "2026-06-30", "Vigente"),
            ("Figma",            "Figma Inc",   "Suscripción anual",  8,  6, 3200, "2025-12-31", "Vigente"),
            ("Docker Desktop",   "Docker Inc",  "Suscripción anual", 20, 18, 1800, "2025-10-31", "Por vencer"),
        ]:
            ok, _ = await create(client, tokens["Claudia Nieto"], ds["LicenciasSoftware"], {
                "software": sw, "proveedor": prov, "tipo_licencia": tipo,
                "cant_licencias": total, "cant_usadas": usadas, "costo_anual": costo,
                "vencimiento": venc, "estado": estado,
            })
            print(f"  [Claudia] Licencia '{sw}' creada {'✓' if ok else '✗'}")

        # Hector: cierra tickets resueltos
        recs = await get_recs(client, tokens["Hector Mamani"], ds["TicketsSoporte"], 60)
        cerrados = 0
        for rec in recs:
            if rec["data"].get("estado") == "Resuelto" and cerrados < 8:
                ok = await upd(client, tokens["Hector Mamani"], ds["TicketsSoporte"], rec["id"], {
                    **rec["data"], "estado": "Cerrado", "tecnico": "Hector Mamani",
                })
                print(f"  [Hector] Ticket {rec['data'].get('ticket')} → Cerrado {'✓' if ok else '✗'}")
                cerrados += 1

        # Hector: elimina tickets viejos cerrados
        recs2 = await get_recs(client, tokens["Hector Mamani"], ds["TicketsSoporte"], 80)
        elim = 0
        for rec in recs2:
            if rec["data"].get("estado") == "Cerrado" and elim < 4:
                ok = await delete(client, tokens["Hector Mamani"], ds["TicketsSoporte"], rec["id"])
                print(f"  [Hector] Ticket {rec['data'].get('ticket')} ELIMINADO {'✓' if ok else '✗'}")
                if ok:
                    deleted_tickets.append(rec["id"])
                elim += 1

        # Hector: crea tickets nuevos
        for tkt_data in [
            {"ticket": "TKT-20001", "solicitante": "Luis Mendoza",   "area": "Finanzas",    "categoria": "Software",  "prioridad": "Alta",   "estado": "Abierto",    "tecnico": "Hector Mamani",  "fecha_apertura": "2025-06-03"},
            {"ticket": "TKT-20002", "solicitante": "Patricia Ruiz",  "area": "Ventas",      "categoria": "Red",       "prioridad": "Media",  "estado": "En atención","tecnico": "Hector Mamani",  "fecha_apertura": "2025-06-03"},
            {"ticket": "TKT-20003", "solicitante": "Carmen Vega",    "area": "RRHH",        "categoria": "Accesos",   "prioridad": "Baja",   "estado": "Abierto",    "tecnico": "Andres Paredes", "fecha_apertura": "2025-06-04"},
            {"ticket": "TKT-20004", "solicitante": "Valeria Mora",   "area": "RRHH",        "categoria": "Correo",    "prioridad": "Media",  "estado": "Abierto",    "tecnico": "Jessica Apaza",  "fecha_apertura": "2025-06-04"},
            {"ticket": "TKT-20005", "solicitante": "Oscar Huanca",   "area": "Finanzas",    "categoria": "Hardware",  "prioridad": "Crítica","estado": "En atención","tecnico": "Hector Mamani",  "fecha_apertura": "2025-06-05"},
        ]:
            ok, _ = await create(client, tokens["Hector Mamani"], ds["TicketsSoporte"], tkt_data)
            print(f"  [Hector] {tkt_data['ticket']} creado {'✓' if ok else '✗'}")

        # Hector: actualiza inventario (marca equipos como en reparación)
        recs = await get_recs(client, tokens["Hector Mamani"], ds["InventarioTI"], 40)
        for rec in recs[:3]:
            if rec["data"].get("estado") == "Activo":
                ok = await upd(client, tokens["Hector Mamani"], ds["InventarioTI"], rec["id"], {
                    **rec["data"], "estado": "En reparación",
                })
                print(f"  [Hector] Equipo {rec['data'].get('codigo')} → En reparación {'✓' if ok else '✗'}")

        # ── OPERACIONES / VENTAS ──────────────────────────────────────────────
        print("\n=== OPERACIONES / VENTAS ===")

        # Luis: edita algunos clientes
        if "Clientes" in ds:
            recs = await get_recs(client, tokens["Luis Mendoza"], ds["Clientes"])
            for rec in recs[:5]:
                email_orig = rec["data"].get("email", "")
                ok = await upd(client, tokens["Luis Mendoza"], ds["Clientes"], rec["id"], {
                    **rec["data"],
                    "email": email_orig.replace("@", "_v2@") if "@" in email_orig else email_orig,
                    "ciudad": random.choice(["Lima", "Arequipa", "Trujillo", "Cusco"]),
                })
                print(f"  [Luis] Cliente actualizado {'✓' if ok else '✗'}")

        # Patricia: actualiza pedidos
        if "Pedidos" in ds:
            recs = await get_recs(client, tokens["Patricia Ruiz"], ds["Pedidos"])
            for rec in recs[:4]:
                ok = await upd(client, tokens["Patricia Ruiz"], ds["Pedidos"], rec["id"], {
                    **rec["data"],
                    "estado": random.choice(["Enviado", "Entregado", "En proceso"]),
                })
                print(f"  [Patricia] Pedido estado actualizado {'✓' if ok else '✗'}")

        # Miguel: actualiza empleados
        if "Empleados" in ds:
            recs = await get_recs(client, tokens["Miguel Angel"], ds["Empleados"])
            for rec in recs[:4]:
                ok = await upd(client, tokens["Miguel Angel"], ds["Empleados"], rec["id"], {
                    **rec["data"],
                    "salario": round(rec["data"].get("salario", 3000) * random.uniform(1.03, 1.08), 2),
                })
                print(f"  [Miguel] Empleado salario actualizado {'✓' if ok else '✗'}")

        # Valeria: edita en RRHH
        if "EmpleadoRRHH" in ds:
            recs = await get_recs(client, tokens["Valeria Mora"], ds["EmpleadoRRHH"])
            for rec in recs[:5]:
                ok = await upd(client, tokens["Valeria Mora"], ds["EmpleadoRRHH"], rec["id"], {
                    **rec["data"],
                    "estado": random.choice(["Activo", "Activo", "Licencia"]),
                })
                print(f"  [Valeria] EmpleadoRRHH actualizado {'✓' if ok else '✗'}")

        # ── RESTAURACIONES ────────────────────────────────────────────────────
        print("\n=== RESTAURACIONES ===")

        for rec_id in deleted_facturas[:2]:
            ok = await restore(client, tokens["Fernando Quispe"], ds["Facturas"], rec_id)
            print(f"  [Fernando] Factura restaurada {'✓' if ok else '✗'}")

        for rec_id in deleted_tickets[:2]:
            ok = await restore(client, tokens["Ricardo Ponce"], ds["TicketsSoporte"], rec_id)
            print(f"  [Ricardo] Ticket restaurado {'✓' if ok else '✗'}")

        print("\n✓ Actividad completada exitosamente")


asyncio.run(main())
