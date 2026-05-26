"""Plantillas predefinidas de datasets — columnas + seed opcional."""
from __future__ import annotations
from typing import TypedDict


class ColumnSpec(TypedDict, total=False):
    name: str
    field_key: str
    data_type: str
    rules: dict
    position: int


class TemplateSpec(TypedDict):
    id: str
    name: str
    description: str
    icon: str
    color: str
    columns: list[ColumnSpec]
    sample_rows: list[dict]


TEMPLATES: list[TemplateSpec] = [
    {
        "id": "inventory",
        "name": "Inventario",
        "description": "Control de stock con SKU, cantidad, ubicación y precio.",
        "icon": "📦",
        "color": "#0EA5E9",
        "columns": [
            {"name": "SKU", "field_key": "sku", "data_type": "text", "rules": {"required": True, "unique": True}, "position": 0},
            {"name": "Producto", "field_key": "producto", "data_type": "text", "rules": {"required": True}, "position": 1},
            {"name": "Categoría", "field_key": "categoria", "data_type": "enum", "rules": {"options": ["Electrónica", "Oficina", "Hogar", "Industrial", "Otro"]}, "position": 2},
            {"name": "Cantidad", "field_key": "cantidad", "data_type": "number", "rules": {"min": 0}, "position": 3},
            {"name": "Precio unitario", "field_key": "precio_unitario", "data_type": "currency", "rules": {"currency_symbol": "S/", "min": 0}, "position": 4},
            {"name": "Ubicación", "field_key": "ubicacion", "data_type": "text", "rules": {}, "position": 5},
            {"name": "Activo", "field_key": "activo", "data_type": "boolean", "rules": {}, "position": 6},
            {"name": "Última revisión", "field_key": "ultima_revision", "data_type": "date", "rules": {}, "position": 7},
        ],
        "sample_rows": [
            {"sku": "ELE-001", "producto": "Laptop HP 14", "categoria": "Electrónica", "cantidad": 8, "precio_unitario": 2450, "ubicacion": "Almacén A-1", "activo": True, "ultima_revision": "2026-05-01"},
            {"sku": "OFI-014", "producto": "Silla ergonómica", "categoria": "Oficina", "cantidad": 25, "precio_unitario": 480, "ubicacion": "Almacén B-3", "activo": True, "ultima_revision": "2026-05-10"},
            {"sku": "HOG-022", "producto": "Cafetera 12 tazas", "categoria": "Hogar", "cantidad": 4, "precio_unitario": 220, "ubicacion": "Almacén C-2", "activo": True, "ultima_revision": "2026-04-22"},
        ],
    },
    {
        "id": "crm",
        "name": "CRM básico",
        "description": "Clientes con datos de contacto, estado y valor estimado.",
        "icon": "👥",
        "color": "#16A34A",
        "columns": [
            {"name": "Nombre", "field_key": "nombre", "data_type": "text", "rules": {"required": True}, "position": 0},
            {"name": "Empresa", "field_key": "empresa", "data_type": "text", "rules": {}, "position": 1},
            {"name": "Email", "field_key": "email", "data_type": "email", "rules": {"required": True, "unique": True}, "position": 2},
            {"name": "Teléfono", "field_key": "telefono", "data_type": "phone", "rules": {}, "position": 3},
            {"name": "Estado", "field_key": "estado", "data_type": "enum", "rules": {"options": ["Lead", "Contactado", "Negociación", "Cliente", "Perdido"]}, "position": 4},
            {"name": "Valor estimado", "field_key": "valor_estimado", "data_type": "currency", "rules": {"currency_symbol": "S/", "min": 0}, "position": 5},
            {"name": "Probabilidad", "field_key": "probabilidad", "data_type": "percent", "rules": {}, "position": 6},
            {"name": "Notas", "field_key": "notas", "data_type": "long_text", "rules": {}, "position": 7},
            {"name": "Próximo contacto", "field_key": "proximo_contacto", "data_type": "date", "rules": {}, "position": 8},
        ],
        "sample_rows": [
            {"nombre": "Ana García", "empresa": "Tech Perú SAC", "email": "ana@techperu.com", "telefono": "987654321", "estado": "Negociación", "valor_estimado": 15000, "probabilidad": 60, "notas": "Interesada en plan anual", "proximo_contacto": "2026-05-30"},
            {"nombre": "Carlos Méndez", "empresa": "Distribuidora Lima", "email": "cmendez@dislima.pe", "telefono": "956123789", "estado": "Cliente", "valor_estimado": 32000, "probabilidad": 100, "notas": "Contrato firmado abril", "proximo_contacto": "2026-06-15"},
            {"nombre": "Lucía Pérez", "empresa": "Startup XYZ", "email": "lucia@xyz.io", "telefono": "912345678", "estado": "Lead", "valor_estimado": 5000, "probabilidad": 20, "notas": "Vino por LinkedIn", "proximo_contacto": "2026-05-28"},
        ],
    },
    {
        "id": "tickets",
        "name": "Tickets de soporte",
        "description": "Mesa de ayuda con prioridad, estado, responsable y SLA.",
        "icon": "🎫",
        "color": "#F5821F",
        "columns": [
            {"name": "Título", "field_key": "titulo", "data_type": "text", "rules": {"required": True}, "position": 0},
            {"name": "Solicitante", "field_key": "solicitante", "data_type": "text", "rules": {"required": True}, "position": 1},
            {"name": "Prioridad", "field_key": "prioridad", "data_type": "enum", "rules": {"options": ["Baja", "Media", "Alta", "Crítica"]}, "position": 2},
            {"name": "Estado", "field_key": "estado", "data_type": "enum", "rules": {"options": ["Abierto", "En progreso", "Esperando cliente", "Resuelto", "Cerrado"]}, "position": 3},
            {"name": "Responsable", "field_key": "responsable", "data_type": "text", "rules": {}, "position": 4},
            {"name": "Categoría", "field_key": "categoria", "data_type": "enum", "rules": {"options": ["Bug", "Solicitud", "Pregunta", "Mejora"]}, "position": 5},
            {"name": "Descripción", "field_key": "descripcion", "data_type": "long_text", "rules": {}, "position": 6},
            {"name": "Creado", "field_key": "creado", "data_type": "date", "rules": {"required": True}, "position": 7},
            {"name": "Vencimiento", "field_key": "vencimiento", "data_type": "date", "rules": {}, "position": 8},
        ],
        "sample_rows": [
            {"titulo": "Login falla con MFA", "solicitante": "Ana García", "prioridad": "Alta", "estado": "En progreso", "responsable": "Carlos R.", "categoria": "Bug", "descripcion": "Después del último deploy, el MFA no envía el código por SMS.", "creado": "2026-05-20", "vencimiento": "2026-05-26"},
            {"titulo": "Solicitud de export Excel", "solicitante": "Luis M.", "prioridad": "Media", "estado": "Abierto", "responsable": "Andrea V.", "categoria": "Solicitud", "descripcion": "Cliente pide exportar reporte mensual.", "creado": "2026-05-22", "vencimiento": "2026-06-01"},
            {"titulo": "¿Cómo cambio mi contraseña?", "solicitante": "Pedro Q.", "prioridad": "Baja", "estado": "Resuelto", "responsable": "Soporte L1", "categoria": "Pregunta", "descripcion": "Cliente nuevo no encuentra el botón.", "creado": "2026-05-24", "vencimiento": "2026-05-25"},
        ],
    },
    {
        "id": "tasks",
        "name": "Tareas de proyecto",
        "description": "Gestión simple de tareas con estado kanban, asignado y prioridad.",
        "icon": "✅",
        "color": "#8B5CF6",
        "columns": [
            {"name": "Tarea", "field_key": "tarea", "data_type": "text", "rules": {"required": True}, "position": 0},
            {"name": "Estado", "field_key": "estado", "data_type": "enum", "rules": {"options": ["Backlog", "Pendiente", "En curso", "En revisión", "Hecho"]}, "position": 1},
            {"name": "Asignado a", "field_key": "asignado_a", "data_type": "text", "rules": {}, "position": 2},
            {"name": "Prioridad", "field_key": "prioridad", "data_type": "enum", "rules": {"options": ["Baja", "Media", "Alta"]}, "position": 3},
            {"name": "Etiquetas", "field_key": "etiquetas", "data_type": "multiselect", "rules": {"options": ["Frontend", "Backend", "Diseño", "QA", "Docs"]}, "position": 4},
            {"name": "Estimación (h)", "field_key": "estimacion_h", "data_type": "number", "rules": {"min": 0}, "position": 5},
            {"name": "Fecha límite", "field_key": "fecha_limite", "data_type": "date", "rules": {}, "position": 6},
            {"name": "Notas", "field_key": "notas", "data_type": "long_text", "rules": {}, "position": 7},
        ],
        "sample_rows": [
            {"tarea": "Diseñar logo OpsGrid", "estado": "Hecho", "asignado_a": "Diseño", "prioridad": "Alta", "etiquetas": ["Diseño"], "estimacion_h": 4, "fecha_limite": "2026-05-15", "notas": "Aprobado"},
            {"tarea": "Implementar cursor pagination", "estado": "En curso", "asignado_a": "Backend", "prioridad": "Media", "etiquetas": ["Backend"], "estimacion_h": 6, "fecha_limite": "2026-05-30", "notas": ""},
            {"tarea": "Pruebas E2E del flujo login", "estado": "Backlog", "asignado_a": "QA", "prioridad": "Media", "etiquetas": ["QA"], "estimacion_h": 8, "fecha_limite": "2026-06-10", "notas": ""},
        ],
    },
    # ── Mini-ERP demo: Categoria → Producto, Cliente/Producto ← Venta ──────────
    {
        "id": "categoria",
        "name": "Categoria",
        "description": "Catálogo de categorías de productos. Padre del template Producto.",
        "icon": "🏷️",
        "color": "#14B8A6",
        "columns": [
            {"name": "Código", "field_key": "codigo", "data_type": "text", "rules": {"required": True, "unique": True}, "position": 0},
            {"name": "Nombre", "field_key": "nombre", "data_type": "text", "rules": {"required": True}, "position": 1},
            {"name": "Descripción", "field_key": "descripcion", "data_type": "long_text", "rules": {}, "position": 2},
            {"name": "Activa", "field_key": "activa", "data_type": "boolean", "rules": {}, "position": 3},
        ],
        "sample_rows": [
            {"codigo": "CAT-001", "nombre": "Electrónica", "descripcion": "Laptops, móviles, audio", "activa": True},
            {"codigo": "CAT-002", "nombre": "Oficina", "descripcion": "Mobiliario y útiles", "activa": True},
            {"codigo": "CAT-003", "nombre": "Hogar", "descripcion": "Electrodomésticos y decoración", "activa": True},
            {"codigo": "CAT-004", "nombre": "Industrial", "descripcion": "Herramientas y equipos pesados", "activa": False},
        ],
    },
    {
        "id": "producto",
        "name": "Producto",
        "description": "Catálogo de productos con FK a Categoria. Hijo de Categoria, padre de Venta.",
        "icon": "🛒",
        "color": "#3B82F6",
        "columns": [
            {"name": "SKU", "field_key": "sku", "data_type": "text", "rules": {"required": True, "unique": True}, "position": 0},
            {"name": "Nombre", "field_key": "nombre", "data_type": "text", "rules": {"required": True}, "position": 1},
            {"name": "ID Categoria", "field_key": "id_categoria", "data_type": "text", "rules": {"required": True}, "position": 2},
            {"name": "Precio", "field_key": "precio", "data_type": "currency", "rules": {"currency_symbol": "S/", "min": 0}, "position": 3},
            {"name": "Stock", "field_key": "stock", "data_type": "number", "rules": {"min": 0}, "position": 4},
            {"name": "Activo", "field_key": "activo", "data_type": "boolean", "rules": {}, "position": 5},
        ],
        "sample_rows": [
            {"sku": "PRD-001", "nombre": "Laptop HP 14", "id_categoria": "CAT-001", "precio": 2450, "stock": 8, "activo": True},
            {"sku": "PRD-002", "nombre": "Mouse inalámbrico", "id_categoria": "CAT-001", "precio": 65, "stock": 40, "activo": True},
            {"sku": "PRD-003", "nombre": "Silla ergonómica", "id_categoria": "CAT-002", "precio": 480, "stock": 25, "activo": True},
            {"sku": "PRD-004", "nombre": "Cafetera 12 tazas", "id_categoria": "CAT-003", "precio": 220, "stock": 4, "activo": True},
            {"sku": "PRD-005", "nombre": "Taladro percutor", "id_categoria": "CAT-004", "precio": 380, "stock": 12, "activo": False},
        ],
    },
    {
        "id": "cliente",
        "name": "Cliente",
        "description": "Catálogo de clientes. Padre del template Venta.",
        "icon": "🧑‍💼",
        "color": "#EC4899",
        "columns": [
            {"name": "Código", "field_key": "codigo", "data_type": "text", "rules": {"required": True, "unique": True}, "position": 0},
            {"name": "Nombre", "field_key": "nombre", "data_type": "text", "rules": {"required": True}, "position": 1},
            {"name": "Email", "field_key": "email", "data_type": "email", "rules": {"required": True, "unique": True}, "position": 2},
            {"name": "Teléfono", "field_key": "telefono", "data_type": "phone", "rules": {}, "position": 3},
            {"name": "Tipo", "field_key": "tipo", "data_type": "enum", "rules": {"options": ["Persona", "Empresa"]}, "position": 4},
            {"name": "Activo", "field_key": "activo", "data_type": "boolean", "rules": {}, "position": 5},
        ],
        "sample_rows": [
            {"codigo": "CLI-001", "nombre": "Ana García", "email": "ana@ejemplo.com", "telefono": "987654321", "tipo": "Persona", "activo": True},
            {"codigo": "CLI-002", "nombre": "Tech Perú SAC", "email": "ventas@techperu.com", "telefono": "012345678", "tipo": "Empresa", "activo": True},
            {"codigo": "CLI-003", "nombre": "Carlos Méndez", "email": "cmendez@ejemplo.pe", "telefono": "956123789", "tipo": "Persona", "activo": True},
            {"codigo": "CLI-004", "nombre": "Distribuidora Lima", "email": "compras@dislima.pe", "telefono": "014567890", "tipo": "Empresa", "activo": False},
        ],
    },
    {
        "id": "venta",
        "name": "Venta",
        "description": "Operaciones de venta con FK a Cliente y Producto. Hijo doble — perfecto para probar el detector de relaciones.",
        "icon": "💰",
        "color": "#F59E0B",
        "columns": [
            {"name": "Folio", "field_key": "folio", "data_type": "text", "rules": {"required": True, "unique": True}, "position": 0},
            {"name": "Fecha", "field_key": "fecha", "data_type": "date", "rules": {"required": True}, "position": 1},
            {"name": "ID Cliente", "field_key": "id_cliente", "data_type": "text", "rules": {"required": True}, "position": 2},
            {"name": "ID Producto", "field_key": "id_producto", "data_type": "text", "rules": {"required": True}, "position": 3},
            {"name": "Cantidad", "field_key": "cantidad", "data_type": "number", "rules": {"min": 1}, "position": 4},
            {"name": "Total", "field_key": "total", "data_type": "currency", "rules": {"currency_symbol": "S/", "min": 0}, "position": 5},
            {"name": "Estado", "field_key": "estado", "data_type": "enum", "rules": {"options": ["Pendiente", "Pagada", "Anulada"]}, "position": 6},
        ],
        "sample_rows": [
            {"folio": "VTA-0001", "fecha": "2026-05-20", "id_cliente": "CLI-001", "id_producto": "PRD-001", "cantidad": 1, "total": 2450, "estado": "Pagada"},
            {"folio": "VTA-0002", "fecha": "2026-05-21", "id_cliente": "CLI-002", "id_producto": "PRD-003", "cantidad": 6, "total": 2880, "estado": "Pagada"},
            {"folio": "VTA-0003", "fecha": "2026-05-22", "id_cliente": "CLI-003", "id_producto": "PRD-002", "cantidad": 2, "total": 130, "estado": "Pendiente"},
            {"folio": "VTA-0004", "fecha": "2026-05-23", "id_cliente": "CLI-001", "id_producto": "PRD-004", "cantidad": 1, "total": 220, "estado": "Pagada"},
            {"folio": "VTA-0005", "fecha": "2026-05-24", "id_cliente": "CLI-004", "id_producto": "PRD-005", "cantidad": 3, "total": 1140, "estado": "Anulada"},
        ],
    },
]


def find_template(template_id: str) -> TemplateSpec | None:
    for t in TEMPLATES:
        if t["id"] == template_id:
            return t
    return None
