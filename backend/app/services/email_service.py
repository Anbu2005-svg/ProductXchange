import os
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("productxchange.email")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@productxchange.campus")


def _send_email_raw(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None):
    """
    Sends an email using configured SMTP credentials or safely logs it in development/testing.
    """
    if not text_content:
        text_content = html_content

    if not SMTP_HOST or not SMTP_USER:
        logger.info(
            f"[MOCK EMAIL SERVICE] To: {to_email} | Subject: {subject} | Body: {text_content[:120]}..."
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"ProductXchange Campus <{EMAIL_FROM}>"
        msg["To"] = to_email

        part1 = MIMEText(text_content, "plain")
        part2 = MIMEText(html_content, "html")
        msg.attach(part1)
        msg.attach(part2)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(EMAIL_FROM, [to_email], msg.as_string())
        logger.info(f"Email successfully delivered to {to_email} with subject '{subject}'")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


import html

def send_deal_status_email(to_email: str, recipient_name: str, product_title: str, state: str, link_url: str):
    safe_recipient = html.escape(recipient_name or "there")
    safe_title = html.escape(product_title or "Item")
    safe_state = html.escape(state or "")
    safe_link = html.escape(link_url or "")
    subject = f"Deal Update: {safe_title} is now {safe_state}"
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #2f6b4f; margin-top: 0;">ProductXchange Deal Update</h2>
        <p>Hi {safe_recipient},</p>
        <p>Your deal for <strong>{safe_title}</strong> has updated status: <strong style="color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">{safe_state}</strong>.</p>
        <div style="margin: 24px 0;">
            <a href="{safe_link}" style="background: #2f6b4f; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">View Deal & Pickup Details</a>
        </div>
        <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">ProductXchange — Location-First College Marketplace</p>
    </div>
    """
    return _send_email_raw(to_email, subject, html_body)


def send_password_reset_email(to_email: str, recipient_name: str, reset_url: str):
    safe_recipient = html.escape(recipient_name or "there")
    safe_url = html.escape(reset_url or "")
    subject = "Password Reset Request — ProductXchange"
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #2f6b4f; margin-top: 0;">Password Reset Request</h2>
        <p>Hi {safe_recipient},</p>
        <p>We received a request to reset your ProductXchange account password. Click the secure link below to choose a new password:</p>
        <div style="margin: 24px 0;">
            <a href="{safe_url}" style="background: #2f6b4f; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="font-size: 13px; color: #4b5563;">This link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>
        <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">ProductXchange — Location-First College Marketplace</p>
    </div>
    """
    return _send_email_raw(to_email, subject, html_body)


def send_new_message_alert(to_email: str, sender_name: str, preview: str, chat_url: str):
    safe_sender = html.escape(sender_name or "Campus student")
    safe_preview = html.escape(preview or "")
    safe_url = html.escape(chat_url or "")
    subject = f"New message from {safe_sender} on ProductXchange"
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #2f6b4f; margin-top: 0;">New Chat Message</h2>
        <p><strong>{safe_sender}</strong> sent you a message:</p>
        <blockquote style="margin: 16px 0; padding: 12px 16px; background: #f3f4f6; border-left: 4px solid #2f6b4f; border-radius: 4px; font-style: italic; color: #374151;">
            "{safe_preview}"
        </blockquote>
        <div style="margin: 24px 0;">
            <a href="{safe_url}" style="background: #2f6b4f; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Open Conversation</a>
        </div>
        <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">ProductXchange — Location-First College Marketplace</p>
    </div>
    """
    return _send_email_raw(to_email, subject, html_body)
