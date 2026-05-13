#!/usr/bin/env python3
"""
migrate_to_datavault.py
Importa BD_Operaciones.xlsx a DataVault (local).

Crea 4 datasets principales:
  1. Inversionistas      (~600 unicos)
  2. Cuentas Bancarias   (~1.292 filas)
  3. Empresarios         (~7.258 filas)
  4. Operaciones         (~6.847 filas)

Uso:
  python migrate_to_datavault.py            # importa todo
  python migrate_to_datavault.py --dry-run  # solo muestra plan, no modifica nada
"""

import io
import os
import codecs
import re
import sys
import warnings
import numpy as np
import pandas as pd
import requests
from datetime import datetime

warnings.filterwarnings("ignore")

# ── Config ─────────────────────────────────────────────────────────────────────
BASE_URL = "http://localhost:8000"
EMAIL    = "admin@datavault.com"
PASSWORD = "Admin1234!"
DRY_RUN  = "--dry-run" in sys.argv

DIR   = os.path.dirname(os.path.abspath(__file__))
F_OPS = os.path.join(DIR, "BD_Operaciones.xlsx")
F_PLA = os.path.join(DIR, "BD_Operaciones_Plantilla de Llenado.xlsx")


# ── Definiciones de columnas ────────────────────────────────────────────────────
# Cada item: name (display + usado como header de Excel para import), key (field_key), type

INV_COLS = [
    {"name": "Codigo Inversionista",    "key": "codigo_inversionista",    "type": "text"},
    {"name": "Nombres",                 "key": "nombres",                 "type": "text"},
    {"name": "Tipo Documento",          "key": "tipo_documento",          "type": "text"},
    {"name": "DNI RUC CE",              "key": "dni_ruc_ce",              "type": "text"},
    {"name": "Sexo",                    "key": "sexo",                    "type": "text"},
    {"name": "Estado Civil",            "key": "estado_civil",            "type": "text"},
    {"name": "Ocupacion",               "key": "ocupacion",               "type": "text"},
    {"name": "Ocupacion Detalle",       "key": "ocupacion_detalle",       "type": "text"},
    {"name": "Nombre Conyuge",          "key": "nombre_conyuge",          "type": "text"},
    {"name": "Tipo Doc Conyuge",        "key": "tipo_doc_conyuge",        "type": "text"},
    {"name": "DNI CE Conyuge",          "key": "dni_conyuge",             "type": "text"},
    {"name": "Domicilio",               "key": "domicilio",               "type": "text"},
    {"name": "Distrito Domicilio",      "key": "distrito_domicilio",      "type": "text"},
    {"name": "Provincia Domicilio",     "key": "provincia_domicilio",     "type": "text"},
    {"name": "Departamento Domicilio",  "key": "departamento_domicilio",  "type": "text"},
    {"name": "Direccion Envio",         "key": "dir_envio",               "type": "text"},
    {"name": "Distrito Envio",          "key": "distrito_envio",          "type": "text"},
    {"name": "Provincia Envio",         "key": "provincia_envio",         "type": "text"},
    {"name": "Departamento Envio",      "key": "departamento_envio",      "type": "text"},
    {"name": "Telefono",                "key": "telefono",                "type": "text"},
    {"name": "DNI Representante Legal", "key": "dni_representante",       "type": "text"},
    {"name": "Representante Legal",     "key": "representante_legal",     "type": "text"},
    {"name": "Correo",                  "key": "correo",                  "type": "text"},
    {"name": "Nr Separacion Bienes",    "key": "nro_separacion_bienes",   "type": "text"},
]

# {columna en Excel fuente -> nombre en DataVault}
INV_MAP = {
    "Codigo Inversionista":                "Codigo Inversionista",
    "Nombres":                             "Nombres",
    "Tipo de documento":                   "Tipo Documento",
    "DNI/RUC/CE":                          "DNI RUC CE",
    "Sexo":                                "Sexo",
    "Estado Civil":                        "Estado Civil",
    "Ocupación/Carrera":                   "Ocupacion",
    "Ocupación/Carrera: Otros - Detalle":  "Ocupacion Detalle",
    "Nombre de conyuge":                   "Nombre Conyuge",
    "Tipo de documento del cónyuge":       "Tipo Doc Conyuge",
    "DNI/CE de conyuge":                   "DNI CE Conyuge",
    "Domicilio":                           "Domicilio",
    "Distrito de Domicilio":               "Distrito Domicilio",
    "Provincia de Domicilio":              "Provincia Domicilio",
    "Departamento de Domicilio":           "Departamento Domicilio",
    "Dirección para envío de documentos":  "Direccion Envio",
    "Distrito de Dir. Envio.":             "Distrito Envio",
    "Provincia de Dir. Envio.":            "Provincia Envio",
    "Departamento de Dir. Envio.":         "Departamento Envio",
    "Telefono":                            "Telefono",
    "DNI/CE del Representante legal":      "DNI Representante Legal",
    "Representante legal":                 "Representante Legal",
    "Correo":                              "Correo",
    "N° de separación de bienes":          "Nr Separacion Bienes",
}

CTA_COLS = [
    {"name": "Id Banco Completo",      "key": "id_banco_completo",    "type": "text"},
    {"name": "Codigo Inversionista",   "key": "codigo_inversionista", "type": "text"},
    {"name": "id_inversionistas",      "key": "id_inversionistas",    "type": "text"},
    {"name": "Nr Banco",               "key": "numero_banco",         "type": "number"},
    {"name": "Banco",                  "key": "banco",                "type": "text"},
    {"name": "Tipo Cuenta",            "key": "tipo_cuenta",          "type": "text"},
    {"name": "Numero Cuenta",          "key": "numero_cuenta",        "type": "text"},
    {"name": "Codigo CCI",             "key": "codigo_cci",           "type": "text"},
]

CTA_MAP = {
    "Id Banco_completo":          "Id Banco Completo",
    "Codigo Inversionista":       "Codigo Inversionista",
    "Id Banco":                   "Nr Banco",
    "Banco":                      "Banco",
    "Tipo de Cuenta (S/ o $)":    "Tipo Cuenta",
    "Numero de cuenta":           "Numero Cuenta",
    "Codigo de cuenta (CCIO)":    "Codigo CCI",
}

EMP_COLS = [
    {"name": "Codigo Empresario",       "key": "codigo_empresario",   "type": "text"},
    {"name": "Codigo Personal",         "key": "codigo_personal",     "type": "text"},
    {"name": "Tipo Persona",            "key": "tipo_persona",        "type": "text"},
    {"name": "Prioridad",               "key": "prioridad",           "type": "number"},
    {"name": "Nombres",                 "key": "nombres",             "type": "text"},
    {"name": "Sexo",                    "key": "sexo",                "type": "text"},
    {"name": "Educacion",               "key": "educacion",           "type": "text"},
    {"name": "Tipo Documento",          "key": "tipo_documento",      "type": "text"},
    {"name": "DNI CE RUC",              "key": "dni_ce_ruc",          "type": "text"},
    {"name": "Estado Civil",            "key": "estado_civil",        "type": "text"},
    {"name": "Rubro Proyecto",          "key": "rubro_proyecto",      "type": "text"},
    {"name": "Telefono",                "key": "telefono",            "type": "text"},
    {"name": "Correo",                  "key": "correo",              "type": "text"},
    {"name": "Direccion",               "key": "direccion",           "type": "text"},
    {"name": "Distrito",                "key": "distrito",            "type": "text"},
    {"name": "Provincia",               "key": "provincia",           "type": "text"},
    {"name": "Departamento",            "key": "departamento",        "type": "text"},
    {"name": "Posicion Contractual",    "key": "posicion_contractual","type": "text"},
    {"name": "Link Ubicacion",          "key": "link_ubicacion",      "type": "text"},
    {"name": "Pais Nacionalidad",       "key": "pais_nacionalidad",   "type": "text"},
    {"name": "Actividad Economica PJ",  "key": "actividad_economica", "type": "text"},
    {"name": "Nr Partida Registral PJ", "key": "nro_partida_registral","type": "text"},
]

EMP_MAP = {
    "Codigo cliente":                  "Codigo Empresario",
    "Codigo personal":                 "Codigo Personal",
    "Tipo de persona":                 "Tipo Persona",
    "Prioridad":                       "Prioridad",
    "Nombres":                         "Nombres",
    "Sexo":                            "Sexo",
    "Educación":                       "Educacion",
    "Tipo de documento":               "Tipo Documento",
    "DNI/CE/RUC":                      "DNI CE RUC",
    "Estado Civil":                    "Estado Civil",
    "Rubro del proyecto":              "Rubro Proyecto",
    "Telefono":                        "Telefono",
    "Correo":                          "Correo",
    "Direccion":                       "Direccion",
    "Distrito de dirección":           "Distrito",
    "Provincia de dirección":          "Provincia",
    "Departamento de dirección":       "Departamento",
    "Posicion contractual":            "Posicion Contractual",
    "Link de ubicación":               "Link Ubicacion",
    "País de Nacionalidad":            "Pais Nacionalidad",
    "Actividad Económica (PJ)":        "Actividad Economica PJ",
    "N° Partida Registral (PJ)":       "Nr Partida Registral PJ",
}

# Personas Empresario: igual que EMP_COLS + FK al grupo
PERS_COLS = [
    {"name": "Codigo Personal",         "key": "codigo_personal",      "type": "text"},
    {"name": "Codigo Empresario",       "key": "codigo_empresario",    "type": "text"},
    {"name": "id_empresarios",          "key": "id_empresarios",       "type": "text"},
    {"name": "Posicion Contractual",    "key": "posicion_contractual", "type": "text"},
    {"name": "Tipo Persona",            "key": "tipo_persona",         "type": "text"},
    {"name": "Prioridad",               "key": "prioridad",            "type": "number"},
    {"name": "Nombres",                 "key": "nombres",              "type": "text"},
    {"name": "Sexo",                    "key": "sexo",                 "type": "text"},
    {"name": "Educacion",               "key": "educacion",            "type": "text"},
    {"name": "Tipo Documento",          "key": "tipo_documento",       "type": "text"},
    {"name": "DNI CE RUC",              "key": "dni_ce_ruc",           "type": "text"},
    {"name": "Estado Civil",            "key": "estado_civil",         "type": "text"},
    {"name": "Rubro Proyecto",          "key": "rubro_proyecto",       "type": "text"},
    {"name": "Telefono",                "key": "telefono",             "type": "text"},
    {"name": "Correo",                  "key": "correo",               "type": "text"},
    {"name": "Direccion",               "key": "direccion",            "type": "text"},
    {"name": "Distrito",                "key": "distrito",             "type": "text"},
    {"name": "Provincia",               "key": "provincia",            "type": "text"},
    {"name": "Departamento",            "key": "departamento",         "type": "text"},
    {"name": "Link Ubicacion",          "key": "link_ubicacion",       "type": "text"},
    {"name": "Pais Nacionalidad",       "key": "pais_nacionalidad",    "type": "text"},
    {"name": "Actividad Economica PJ",  "key": "actividad_economica",  "type": "text"},
    {"name": "Nr Partida Registral PJ", "key": "nro_partida_registral","type": "text"},
]

# ── Operaciones (términos del préstamo) ────────────────────────────────────────
OPS_COLS = [
    {"name": "Codigo Prestamo",         "key": "codigo_prestamo",         "type": "text"},
    {"name": "Codigo Contrato",         "key": "codigo_contrato",         "type": "text"},
    {"name": "Kardex",                  "key": "kardex",                  "type": "text"},
    {"name": "Codigo Empresario",       "key": "codigo_empresario",       "type": "text"},
    {"name": "id_empresarios",          "key": "id_empresarios",          "type": "text"},
    {"name": "Empresario",              "key": "empresario",              "type": "text"},
    {"name": "Codigo Inversionista",    "key": "codigo_inversionista",    "type": "text"},
    {"name": "id_inversionistas",       "key": "id_inversionistas",       "type": "text"},
    {"name": "Inversionista",           "key": "inversionista",           "type": "text"},
    {"name": "Tipo Prestamo",           "key": "tipo_prestamo",           "type": "text"},
    {"name": "Situacion Credito",       "key": "situacion_credito",       "type": "text"},
    {"name": "Producto",                "key": "producto",                "type": "text"},
    {"name": "Tipo Fondo",              "key": "tipo_fondo",              "type": "text"},
    {"name": "Analista",                "key": "analista",                "type": "text"},
    {"name": "Moneda",                  "key": "moneda",                  "type": "text"},
    {"name": "Monto Prestamo",          "key": "monto_prestamo",          "type": "number"},
    {"name": "Tasa Mensual Interes",    "key": "tasa_mensual",            "type": "number"},
    {"name": "Tiempo Meses",            "key": "tiempo_meses",            "type": "number"},
    {"name": "Fecha Desembolso",        "key": "fecha_desembolso",        "type": "date"},
    {"name": "Fecha Inicio Intereses",  "key": "fecha_inicio_intereses",  "type": "date"},
    {"name": "Fecha Primera Cuota",     "key": "fecha_primera_cuota",     "type": "date"},
]

OPS_MAP = {
    "Codigo Prestamo":                                    "Codigo Prestamo",
    "Codigo Contrato":                                    "Codigo Contrato",
    "Kardex":                                             "Kardex",
    "CODIGO EMPRESARIO":                                  "Codigo Empresario",
    "Empresario":                                         "Empresario",
    "CODIGO INVERSIONISTA":                               "Codigo Inversionista",
    "Inversionista":                                      "Inversionista",
    "TIPO DE PRESTAMO":                                   "Tipo Prestamo",
    "Situación del credito":                              "Situacion Credito",
    "Producto":                                           "Producto",
    "Tipo de fondo":                                      "Tipo Fondo",
    "ANALISTA":                                           "Analista",
    "Moneda":                                             "Moneda",
    "Monto de prestamo recibido":                         "Monto Prestamo",
    "Tasa Mensual Interes":                               "Tasa Mensual Interes",
    "Tiempo en meses":                                    "Tiempo Meses",
    "Fecha Desembolso / reestructuración/cambio de fondo":"Fecha Desembolso",
    "Fecha Inicio de Intereses":                          "Fecha Inicio Intereses",
    "Fecha 1ra cuota":                                    "Fecha Primera Cuota",
}

# ── Costos y Comisiones ─────────────────────────────────────────────────────────
COS_COLS = [
    {"name": "Codigo Prestamo",              "key": "codigo_prestamo",     "type": "text"},
    {"name": "id_operaciones",               "key": "id_operaciones",      "type": "text"},
    {"name": "Comision Prestamype",          "key": "comision",            "type": "number"},
    {"name": "IGV Comision",                 "key": "igv_comision",        "type": "number"},
    {"name": "Comision Sin IGV",             "key": "comision_sin_igv",    "type": "number"},
    {"name": "Total Colocado",               "key": "total_colocado",      "type": "number"},
    {"name": "Tipo Retencion Operativa",     "key": "tipo_retencion",      "type": "text"},
    {"name": "Comision Financiada",          "key": "comision_financiada", "type": "text"},
    {"name": "Tasa Cambio",                  "key": "tasa_cambio",         "type": "number"},
    {"name": "Der Notariales Inscripcion",   "key": "der_not_inscripcion", "type": "number"},
    {"name": "IGV Notaria Inscripcion",      "key": "igv_not_inscripcion", "type": "number"},
    {"name": "Pago Bloqueo Inscripcion",     "key": "pago_bloqueo",        "type": "number"},
    {"name": "Der Registrales Inscripcion",  "key": "der_reg_inscripcion", "type": "number"},
    {"name": "Der Notariales Levantamiento", "key": "der_not_levant",      "type": "number"},
    {"name": "IGV Notaria Levantamiento",    "key": "igv_not_levant",      "type": "number"},
    {"name": "Der Registrales Levantamiento","key": "der_reg_levant",      "type": "number"},
    {"name": "Margen Bruto Sin IGV",         "key": "margen_bruto",        "type": "number"},
    {"name": "Pct Margen Bruto",             "key": "pct_margen_bruto",    "type": "number"},
    {"name": "Cifras",                       "key": "cifras",              "type": "text"},
]

COS_MAP = {
    "Codigo Prestamo":                       "Codigo Prestamo",
    "Comision Prestamype":                   "Comision Prestamype",
    "IGV Comisión":                          "IGV Comision",
    "Comisión Prestamype sin IGV":           "Comision Sin IGV",
    "Total Colocado":                        "Total Colocado",
    "Tipo Retención Operativa":              "Tipo Retencion Operativa",
    "¿Comisión financiada?":                 "Comision Financiada",
    "Tasa de cambio":                        "Tasa Cambio",
    "Derechos Notariales (Inscripción)":     "Der Notariales Inscripcion",
    "IGV Notaria (Inscripcion)":             "IGV Notaria Inscripcion",
    "Pago por Bloqueo (Inscripcion)":        "Pago Bloqueo Inscripcion",
    "Derechos registrales (Inscripcion)":    "Der Registrales Inscripcion",
    "Derechos Notariales (Levantamiento)":   "Der Notariales Levantamiento",
    "IGV Notaria (Levantamiento)":           "IGV Notaria Levantamiento",
    "Derechos Registrales (Levantamiento)":  "Der Registrales Levantamiento",
    "Margen bruto sin IGV":                  "Margen Bruto Sin IGV",
    "% Margen bruto sin IGV":                "Pct Margen Bruto",
    "CIFRAS":                                "Cifras",
}

# ── Historial Cambios (renovaciones, reestructuraciones, cambio de fondo) ───────
HIS_COLS = [
    {"name": "Codigo Prestamo",              "key": "codigo_prestamo",     "type": "text"},
    {"name": "id_operaciones",               "key": "id_operaciones",      "type": "text"},
    {"name": "Prestamo Orig Cambio Fondo",   "key": "prest_orig_cambio",   "type": "text"},
    {"name": "Prestamo Dest Cambio Fondo",   "key": "prest_dest_cambio",   "type": "text"},
    {"name": "Prestamo Orig Renovacion",     "key": "prest_orig_renov",    "type": "text"},
    {"name": "Prestamo Dest Renovacion",     "key": "prest_dest_renov",    "type": "text"},
    {"name": "Prestamo Orig Reestructurado", "key": "prest_orig_reest",    "type": "text"},
    {"name": "Prestamo Dest Reestructurado", "key": "prest_dest_reest",    "type": "text"},
]

HIS_MAP = {
    "Codigo Prestamo":                          "Codigo Prestamo",
    "Prestamo de origen de cambio de fondo":    "Prestamo Orig Cambio Fondo",
    "Prestamo de destino de cambio de fondo":   "Prestamo Dest Cambio Fondo",
    "Prestamo de origen de renovación":         "Prestamo Orig Renovacion",
    "Prestamo de destino donde se renovó":      "Prestamo Dest Renovacion",
    "Origen de Prestamo reestructurado":        "Prestamo Orig Reestructurado",
    "Prestamo reestructurado de destino":       "Prestamo Dest Reestructurado",
}

# ── Seguimiento Operativo ───────────────────────────────────────────────────────
SEG_COLS = [
    {"name": "Codigo Prestamo",          "key": "codigo_prestamo",        "type": "text"},
    {"name": "id_operaciones",           "key": "id_operaciones",         "type": "text"},
    {"name": "Id Banco",                 "key": "id_banco",               "type": "number"},
    {"name": "Distrito Garantia",        "key": "distrito_garantia",      "type": "text"},
    {"name": "Fecha Escritura Notaria",  "key": "fecha_escritura",        "type": "date"},
    {"name": "Firma",                    "key": "firma",                  "type": "text"},
    {"name": "Notaria",                  "key": "notaria",                "type": "text"},
    {"name": "Condiciones",              "key": "condiciones",            "type": "text"},
    {"name": "Titulo Bloqueo SUNARP",    "key": "titulo_bloqueo_sunarp",  "type": "text"},
    {"name": "Seguimiento Bloqueo",      "key": "seguimiento_bloqueo",    "type": "text"},
    {"name": "Entrega Cheque",           "key": "entrega_cheque",         "type": "text"},
    {"name": "Titulo Hipoteca",          "key": "titulo_hipoteca",        "type": "text"},
    {"name": "Seguimiento Testimonios",  "key": "seguimiento_testimonios","type": "text"},
    {"name": "Tramite",                  "key": "tramite",                "type": "text"},
    {"name": "Anulados",                 "key": "anulados",               "type": "text"},
    {"name": "Con Politicas Prestamype", "key": "con_politicas",          "type": "text"},
    {"name": "Con Escritura Publica",    "key": "con_escritura",          "type": "text"},
    {"name": "Fondeado SWAP",            "key": "fondeado_swap",          "type": "text"},
    {"name": "Cronograma Core Bancario", "key": "cronograma_core",        "type": "text"},
]

SEG_MAP = {
    "Codigo Prestamo":                           "Codigo Prestamo",
    "IdBanco":                                   "Id Banco",
    "Distrito de Garantia":                      "Distrito Garantia",
    "Fecha Escritura- Notaría":                  "Fecha Escritura Notaria",
    "FIRMA":                                     "Firma",
    "Notaría":                                   "Notaria",
    "CONDICIONES":                               "Condiciones",
    "Titulo de Bloqueo SUNARP":                  "Titulo Bloqueo SUNARP",
    "Seguimiento Bloqueo":                       "Seguimiento Bloqueo",
    "¿Entrega de cheque a Prestamype?":          "Entrega Cheque",
    "Titulo de Hipoteca":                        "Titulo Hipoteca",
    "Seguimiento Testimonios":                   "Seguimiento Testimonios",
    "TRAMITE":                                   "Tramite",
    "ANULADOS":                                  "Anulados",
    "¿Con politicas de Prestamype?":             "Con Politicas Prestamype",
    "¿Fue con escritura publica?":               "Con Escritura Publica",
    "¿Préstamo es fondeado por SWAP?":           "Fondeado SWAP",
    "¿Cronograma generado en el core bancario?": "Cronograma Core Bancario",
}


# ── Funciones de utilidad ───────────────────────────────────────────────────────
def norm_cols(df):
    """Normaliza nombres de columnas: quita saltos de línea y espacios extra."""
    df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
    return df


def clean_df(df, source_map):
    """
    Selecciona y renombra columnas según source_map {excel_col -> datavault_name}.
    Descarta columnas no mapeadas y filas completamente vacías.
    """
    available = {k: v for k, v in source_map.items() if k in df.columns}
    missing = [k for k in source_map if k not in df.columns]
    if missing:
        print(f"    [!] Columnas no encontradas (se omiten): {missing[:5]}{'...' if len(missing)>5 else ''}")
    result = df[list(available.keys())].rename(columns=available)
    return result.dropna(how="all")


def safe_val(v):
    """Limpia valor para que sea aceptable en Excel/JSON."""
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    if hasattr(v, "item"):
        return v.item()
    s = str(v).strip()
    return None if s in ("nan", "None", "-", "#N/A", "#N/D", "#REF!", "#N/D", "") else s


def coerce_numbers(df, cols_def):
    """Para columnas definidas como 'number', fuerza conversión numérica y deja NaN lo que no lo sea."""
    for c in cols_def:
        if c.get("type") == "number" and c["name"] in df.columns:
            df[c["name"]] = pd.to_numeric(df[c["name"]], errors="coerce")
    return df


def to_excel_bytes(df):
    """Serializa un DataFrame a bytes de Excel listos para subir."""
    # Convertir datetimes a string YYYY-MM-DD para compatibilidad
    df = df.copy()
    for col in df.select_dtypes(include=["datetime64[ns]", "datetimetz"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d")
    # Limpiar valores problemáticos
    for col in df.columns:
        df[col] = df[col].apply(safe_val)
    buf = io.BytesIO()
    df.to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    return buf


def login():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        print(f"[ERR] Login fallido ({r.status_code}): {r.text[:200]}")
        sys.exit(1)
    print("[OK] Login OK")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def get_or_create_workspace(headers, name):
    """Busca o crea un workspace por nombre. Devuelve workspace_id."""
    if DRY_RUN:
        print(f"  [DRY] Workspace '{name}'")
        return "dry-ws-id"
    # Listar workspaces existentes
    r = requests.get(f"{BASE_URL}/workspaces", headers=headers)
    if r.status_code == 200:
        for ws in r.json():
            if ws["name"] == name:
                print(f"  [OK] Workspace '{name}' ya existe — {ws['id'][:8]}...")
                return ws["id"]
    # Crear nuevo
    r = requests.post(f"{BASE_URL}/workspaces", headers=headers,
                      json={"name": name, "description": "Préstamos hipotecarios P2P — PGH"})
    if r.status_code not in (200, 201):
        print(f"  [ERR] Error creando workspace: {r.text[:200]}")
        return None
    ws_id = r.json()["id"]
    print(f"  [OK] Workspace '{name}' creado — {ws_id[:8]}...")
    return ws_id


def create_dataset(headers, name, description, cols, workspace_id=None):
    """Crea dataset + columnas. Devuelve dataset_id o None si falla."""
    if DRY_RUN:
        print(f"  [DRY] Dataset '{name}' con {len(cols)} columnas")
        return "dry-id"
    body = {"name": name, "description": description}
    if workspace_id:
        body["workspace_id"] = workspace_id
    r = requests.post(f"{BASE_URL}/datasets", headers=headers, json=body)
    if r.status_code not in (200, 201):
        print(f"  [ERR] Error creando '{name}': {r.text[:200]}")
        return None
    ds_id = r.json()["id"]
    print(f"  [OK] Dataset '{name}' creado — {ds_id[:8]}...")
    for pos, c in enumerate(cols, 1):
        body = {"name": c["name"], "field_key": c["key"],
                "data_type": c.get("type", "text"), "position": pos}
        if "rules" in c:
            body["rules"] = c["rules"]
        r2 = requests.post(f"{BASE_URL}/datasets/{ds_id}/columns",
                           headers=headers, json=body)
        if r2.status_code not in (200, 201):
            print(f"    [ERR] col '{c['name']}': {r2.text[:100]}")
    return ds_id


def upload_excel(headers, ds_id, df, label):
    """Sube df via import-excel (un solo request HTTP, commit en batch)."""
    if DRY_RUN:
        print(f"    [DRY] {len(df)} registros de '{label}'")
        return
    print(f"    Subiendo {len(df)} registros de '{label}'...", end=" ", flush=True)
    buf = to_excel_bytes(df)
    r = requests.post(
        f"{BASE_URL}/datasets/{ds_id}/records/import-excel",
        headers=headers,
        files={"file": ("data.xlsx", buf,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    if r.status_code in (200, 201):
        result = r.json()
        created = result.get("created", "?")
        errors  = result.get("errors", [])
        print(f"[OK] {created} insertados, {len(errors)} errores")
        if errors:
            for e in errors[:5]:
                print(f"      fila {e['row']}: {e['errors']}")
            if len(errors) > 5:
                print(f"      ... y {len(errors)-5} errores más")
    else:
        print(f"[ERR] HTTP {r.status_code}: {r.text[:300]}")


def build_uuid_map(headers, ds_id, key_field_key):
    """
    Descarga todos los registros de un dataset y devuelve {valor_clave -> uuid_registro}.
    Usa skip/limit con paginas de 1000 registros.
    """
    PAGE = 1000
    uuid_map = {}
    skip = 0
    while True:
        r = requests.get(
            f"{BASE_URL}/datasets/{ds_id}/records",
            headers=headers,
            params={"skip": skip, "limit": PAGE},
        )
        if r.status_code != 200:
            print(f"    [ERR] No se pudieron leer registros (HTTP {r.status_code}): {r.text[:200]}")
            break
        records = r.json()
        if not records:
            break
        for rec in records:
            bk = rec.get("data", {}).get(key_field_key)
            if bk is not None:
                uuid_map[str(bk).strip()] = rec["id"]
        if len(records) < PAGE:
            break
        skip += PAGE
    return uuid_map


def cleanup_workspace_datasets(headers, ws_id):
    """Elimina todos los datasets existentes en un workspace."""
    r = requests.get(f"{BASE_URL}/datasets", headers=headers, params={"workspace_id": ws_id})
    if r.status_code != 200:
        print(f"    [WARN] No se pudo listar datasets: {r.text[:200]}")
        return
    datasets = r.json()
    if isinstance(datasets, dict):
        datasets = datasets.get("items", [])
    if not datasets:
        print("    (sin datasets previos)")
        return
    for ds in datasets:
        rd = requests.delete(f"{BASE_URL}/datasets/{ds['id']}", headers=headers)
        status = "OK" if rd.status_code in (200, 204) else f"ERR {rd.status_code}"
        print(f"    [{status}] Eliminado: {ds['name']}")


# ── Main ────────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("DataVault Migracion — BD_Operaciones.xlsx")
    if DRY_RUN:
        print("  [MODO DRY-RUN — no se modifica nada]")
    print("=" * 60)

    headers = {} if DRY_RUN else login()

    # ── 1. Leer Excels ─────────────────────────────────────────
    print("\n[1/5] Leyendo archivos Excel...")
    if not os.path.exists(F_OPS):
        print(f"[ERR] No encontrado: {F_OPS}")
        sys.exit(1)

    xl_ops = pd.ExcelFile(F_OPS)
    xl_pla = pd.ExcelFile(F_PLA)

    df_inv_raw = norm_cols(xl_ops.parse("Inversionistas", dtype=str))
    df_emp_raw = norm_cols(xl_ops.parse("Empresarios",    dtype=str))
    # Operaciones: no forzar str para preservar números y fechas
    df_ops_raw = norm_cols(xl_ops.parse("Operaciones"))

    print(f"  BD_Operaciones.xlsx | Inversionistas: {len(df_inv_raw)} filas")
    print(f"  BD_Operaciones.xlsx | Empresarios:    {len(df_emp_raw)} filas")
    print(f"  BD_Operaciones.xlsx | Operaciones:    {len(df_ops_raw)} filas")

    # ── 2. Normalizar Inversionistas ────────────────────────────
    print("\n[2/5] Normalizando Inversionistas y Cuentas Bancarias...")
    df_inv_raw = df_inv_raw.dropna(subset=["Codigo Inversionista"])

    # Inversionistas: dedup — tomamos la primera fila de cada código
    df_inv = coerce_numbers(
        clean_df(df_inv_raw.drop_duplicates(subset=["Codigo Inversionista"], keep="first"), INV_MAP),
        INV_COLS
    )
    print(f"  Inversionistas unicos:  {len(df_inv)}")

    # Cuentas bancarias: todas las filas (1 por cuenta)
    df_cta = coerce_numbers(
        clean_df(df_inv_raw.dropna(subset=["Id Banco_completo"]), CTA_MAP),
        CTA_COLS
    )
    print(f"  Cuentas bancarias:      {len(df_cta)}")

    # ── 3. Normalizar Empresarios ───────────────────────────────
    print("\n[3/5] Normalizando Empresarios...")
    df_emp_raw = df_emp_raw.dropna(subset=["Codigo cliente"])

    # Personas Empresario: todas las filas (se importa despues con FK)
    df_pers_all = coerce_numbers(clean_df(df_emp_raw, EMP_MAP), PERS_COLS)

    # Empresarios: un representante por grupo (SOLICITANTE o primera fila)
    col_pos = "Posicion contractual"
    is_sol = df_emp_raw[col_pos].str.strip().str.upper().eq("SOLICITANTE")
    df_sol   = df_emp_raw[is_sol].drop_duplicates(subset=["Codigo cliente"], keep="first")
    df_otros = df_emp_raw[~df_emp_raw["Codigo cliente"].isin(df_sol["Codigo cliente"])]
    df_otros = df_otros.drop_duplicates(subset=["Codigo cliente"], keep="first")
    df_emp_dedup = pd.concat([df_sol, df_otros], ignore_index=True)
    df_emp = coerce_numbers(clean_df(df_emp_dedup, EMP_MAP), EMP_COLS)

    print(f"  Personas Empresario (todas las filas): {len(df_pers_all)}")
    print(f"  Empresarios unicos (representantes):   {len(df_emp)}")

    # ── 4. Normalizar Operaciones y subtablas ──────────────────
    print("\n[4/5] Normalizando Operaciones...")
    df_ops_raw = df_ops_raw.dropna(subset=["Codigo Prestamo"])

    df_ops = coerce_numbers(clean_df(df_ops_raw, OPS_MAP), OPS_COLS)
    df_cos = coerce_numbers(clean_df(df_ops_raw, COS_MAP), COS_COLS)
    df_his = coerce_numbers(clean_df(df_ops_raw, HIS_MAP), HIS_COLS)
    df_seg = coerce_numbers(clean_df(df_ops_raw, SEG_MAP), SEG_COLS)

    # Decimales -> porcentaje (0.0607 -> 6.07)
    df_ops["Tasa Mensual Interes"] = df_ops["Tasa Mensual Interes"] * 100
    df_cos["Pct Margen Bruto"]     = df_cos["Pct Margen Bruto"] * 100

    def kardex_clean(v):
        if pd.isna(v): return None
        s = str(v).strip()
        if s in ("", "nan", "-", "#N/A", "#N/D"): return None
        try: return str(int(float(s)))
        except (ValueError, TypeError): return s

    df_ops["Kardex"] = df_ops["Kardex"].apply(kardex_clean)

    # Historial: solo filas con al menos un campo de cambio
    his_fields = [c["name"] for c in HIS_COLS if c["name"] != "Codigo Prestamo"]
    df_his = df_his.dropna(subset=[f for f in his_fields if f in df_his.columns], how="all")

    print(f"  Operaciones:            {len(df_ops)}")
    print(f"  Costos y Comisiones:    {len(df_cos)}")
    print(f"  Historial Cambios:      {len(df_his)}  (prestamos con cambio/renov/reest)")
    print(f"  Seguimiento Operativo:  {len(df_seg)}")

    # ── 5. Workspace y limpieza ─────────────────────────────────
    print("\n[5/6] Preparando workspace...")
    ws_id = get_or_create_workspace(headers, "PGH")

    if not DRY_RUN and ws_id:
        print("\n  > Eliminando datasets previos en workspace PGH...")
        cleanup_workspace_datasets(headers, ws_id)

    # ── FASE 1: Inversionistas + Empresarios ───────────────────
    print("\n[6/6] Fase 1 — tablas raiz (Inversionistas, Empresarios)...")

    def map_uuid(series, uuid_map):
        return series.apply(lambda x: uuid_map.get(str(x).strip()) if pd.notna(x) else None)

    print("\n  > Inversionistas")
    ds_inv = create_dataset(headers, "Inversionistas",
                            "Registro de inversionistas del fondo P2P", INV_COLS, ws_id)
    inv_uuid_map = {}
    if ds_inv:
        upload_excel(headers, ds_inv, df_inv, "Inversionistas")
        if not DRY_RUN:
            print("    Recuperando UUIDs...", end=" ", flush=True)
            inv_uuid_map = build_uuid_map(headers, ds_inv, "codigo_inversionista")
            print(f"{len(inv_uuid_map)} indexados")

    print("\n  > Empresarios")
    ds_emp = create_dataset(headers, "Empresarios",
                            "Grupos de prestamo (1 representante por grupo)", EMP_COLS, ws_id)
    emp_uuid_map = {}
    if ds_emp:
        upload_excel(headers, ds_emp, df_emp, "Empresarios")
        if not DRY_RUN:
            print("    Recuperando UUIDs...", end=" ", flush=True)
            emp_uuid_map = build_uuid_map(headers, ds_emp, "codigo_empresario")
            print(f"{len(emp_uuid_map)} indexados")

    # ── FASE 2: Operaciones ─────────────────────────────────────
    print("\n  Fase 2 — Operaciones...")

    if not DRY_RUN:
        df_cta["id_inversionistas"]   = map_uuid(df_cta["Codigo Inversionista"], inv_uuid_map)
        df_pers_all["id_empresarios"] = map_uuid(df_pers_all["Codigo Empresario"], emp_uuid_map)
        df_ops["id_inversionistas"]   = map_uuid(df_ops["Codigo Inversionista"], inv_uuid_map)
        df_ops["id_empresarios"]      = map_uuid(df_ops["Codigo Empresario"], emp_uuid_map)
        print(f"\n  UUIDs en Cuentas Bancarias:   {df_cta['id_inversionistas'].notna().sum()}/{len(df_cta)}")
        print(f"  UUIDs en Personas Empresario: {df_pers_all['id_empresarios'].notna().sum()}/{len(df_pers_all)}")
        print(f"  UUIDs en Operaciones (inv):   {df_ops['id_inversionistas'].notna().sum()}/{len(df_ops)}")
        print(f"  UUIDs en Operaciones (emp):   {df_ops['id_empresarios'].notna().sum()}/{len(df_ops)}")

    print("\n  > Operaciones")
    ds_ops = create_dataset(headers, "Operaciones",
                            "Terminos del prestamo: partes, monto, tasa y fechas", OPS_COLS, ws_id)
    ops_uuid_map = {}
    if ds_ops:
        upload_excel(headers, ds_ops, df_ops, "Operaciones")
        if not DRY_RUN:
            print("    Recuperando UUIDs...", end=" ", flush=True)
            ops_uuid_map = build_uuid_map(headers, ds_ops, "codigo_prestamo")
            print(f"{len(ops_uuid_map)} indexados")

    # ── FASE 3: tablas hijo ─────────────────────────────────────
    print("\n  Fase 3 — tablas hijo...")

    if not DRY_RUN:
        df_cos["id_operaciones"] = map_uuid(df_cos["Codigo Prestamo"], ops_uuid_map)
        df_his["id_operaciones"] = map_uuid(df_his["Codigo Prestamo"], ops_uuid_map)
        df_seg["id_operaciones"] = map_uuid(df_seg["Codigo Prestamo"], ops_uuid_map)
        print(f"\n  UUIDs en Costos y Comisiones: {df_cos['id_operaciones'].notna().sum()}/{len(df_cos)}")
        print(f"  UUIDs en Historial Cambios:   {df_his['id_operaciones'].notna().sum()}/{len(df_his)}")
        print(f"  UUIDs en Seguimiento:         {df_seg['id_operaciones'].notna().sum()}/{len(df_seg)}")

    print("\n  > Cuentas Bancarias")
    ds_cta = create_dataset(headers, "Cuentas Bancarias",
                            "Cuentas bancarias por inversionista", CTA_COLS, ws_id)
    if ds_cta:
        upload_excel(headers, ds_cta, df_cta, "Cuentas Bancarias")

    print("\n  > Personas Empresario")
    ds_pers = create_dataset(headers, "Personas Empresario",
                             "Personas vinculadas a cada grupo (solicitantes y garantes)",
                             PERS_COLS, ws_id)
    if ds_pers:
        upload_excel(headers, ds_pers, df_pers_all, "Personas Empresario")

    print("\n  > Costos y Comisiones")
    ds_cos = create_dataset(headers, "Costos y Comisiones",
                            "Comisiones, costos notariales y margen por prestamo", COS_COLS, ws_id)
    if ds_cos:
        upload_excel(headers, ds_cos, df_cos, "Costos y Comisiones")

    print("\n  > Historial Cambios")
    ds_his = create_dataset(headers, "Historial Cambios",
                            "Prestamos origen y destino de renovaciones, cambios de fondo y reestructuraciones",
                            HIS_COLS, ws_id)
    if ds_his:
        upload_excel(headers, ds_his, df_his, "Historial Cambios")

    print("\n  > Seguimiento Operativo")
    ds_seg = create_dataset(headers, "Seguimiento Operativo",
                            "Estado de tramites, SUNARP, hipoteca, firma y otras gestiones",
                            SEG_COLS, ws_id)
    if ds_seg:
        upload_excel(headers, ds_seg, df_seg, "Seguimiento Operativo")

    print("\n" + "=" * 60)
    print("[OK] Migracion completada")
    print(f"  Frontend: http://localhost:5173")
    print("=" * 60)


if __name__ == "__main__":
    main()
