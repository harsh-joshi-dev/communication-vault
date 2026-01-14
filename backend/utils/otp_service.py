"""
OTP service for sending OTP via email and SMS
"""

import os
from twilio.rest import Client
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_otp_sms(phone_number: str, code: str):
    """Send OTP via SMS using Twilio"""
    try:
        account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
        auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
        from_number = os.environ.get('TWILIO_PHONE_NUMBER')
        
        if not all([account_sid, auth_token, from_number]):
            print(f"[DEV MODE] OTP for {phone_number}: {code}")
            return
        
        client = Client(account_sid, auth_token)
        
        message = client.messages.create(
            body=f'Your Stealth Vault OTP is: {code}. Valid for 10 minutes.',
            from_=from_number,
            to=phone_number
        )
        
        print(f"OTP SMS sent: {message.sid}")
    except Exception as e:
        print(f"Error sending SMS OTP: {e}")
        # In development, just print
        print(f"[DEV MODE] OTP for {phone_number}: {code}")

def send_otp_email(email: str, code: str):
    """Send OTP via Email"""
    try:
        smtp_server = os.environ.get('MAIL_SERVER')
        smtp_port = int(os.environ.get('MAIL_PORT') or 587)
        smtp_user = os.environ.get('MAIL_USERNAME')
        smtp_password = os.environ.get('MAIL_PASSWORD')
        
        if not all([smtp_server, smtp_user, smtp_password]):
            print(f"[DEV MODE] OTP for {email}: {code}")
            return
        
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = email
        msg['Subject'] = 'Stealth Vault - OTP Verification'
        
        body = f"""
        Your Stealth Vault OTP is: {code}
        
        This code is valid for 10 minutes.
        
        If you didn't request this, please ignore this email.
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
        server.quit()
        
        print(f"OTP Email sent to {email}")
    except Exception as e:
        print(f"Error sending Email OTP: {e}")
        # In development, just print
        print(f"[DEV MODE] OTP for {email}: {code}")

