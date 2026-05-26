"""Envío de email best-effort vía SMTP.

Si las variables de entorno SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS están
configuradas, envía el email. Si no, hace log + devuelve False, y el caller
puede decidir mostrar el link en la respuesta como fallback.
"""
from __future__ import annotations
import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("datavault.email")

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "no-reply@opsgrid.local")
SMTP_TLS = os.getenv("SMTP_TLS", "true").lower() == "true"


def smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


def send_email(to: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    """Devuelve True si se envió; False si no hay config o falló."""
    if not smtp_configured():
        logger.info("SMTP no configurado; email a %s no enviado. Subject=%s", to, subject)
        return False
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
            if SMTP_TLS:
                s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
        logger.info("Email sent to %s subject=%s", to, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e, exc_info=True)
        return False
