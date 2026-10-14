import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from app.core.config import settings

logger = logging.getLogger("productxchange.email")

def send_transactional_email(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str] = None
) -> bool:
    """
    Sends a transactional notification email.
    If SMTP credentials are not configured or connection fails, logs to console
    so local development/demo environments operate seamlessly without crashing.
    """
    smtp_host = getattr(settings, "SMTP_HOST", None)
    smtp_port = getattr(settings, "SMTP_PORT", 587)
    smtp_user = getattr(settings, "SMTP_USER", None)
    smtp_password = getattr(settings, "SMTP_PASSWORD", None)
    smtp_from = getattr(settings, "SMTP_FROM", "ProductXchange Campus <no-reply@productxchange.campus>")

    if not smtp_host or not smtp_user:
        logger.info(
            f"[EMAIL MOCK - No SMTP Configured] To: {to_email} | Subject: {subject}\n"
            f"Body: {text_content}"
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = to_email

        part1 = MIMEText(text_content, "plain")
        msg.attach(part1)

        if html_content:
            part2 = MIMEText(html_content, "html")
            msg.attach(part2)

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [to_email], msg.as_string())
            logger.info(f"Transactional email sent to {to_email}: {subject}")
            return True
    except Exception as exc:
        logger.warning(f"Failed to send email to {to_email}: {exc}. Fallback logged.")
        return False
