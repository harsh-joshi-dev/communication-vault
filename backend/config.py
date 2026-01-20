"""
Configuration settings for the Flask application
"""

import os
from datetime import timedelta

class Config:
    """Base configuration"""
    
    # App
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Database - MongoDB
    # Get URI from environment, with proper encoding for special characters
    # Supports both mongodb+srv:// (SRV) and mongodb:// (standard) formats
    # Standard format avoids DNS resolution issues on some platforms (like Render)
    _mongodb_uri = os.environ.get('MONGODB_URI') or 'mongodb+srv://gauravpadshala08_db_user:mPqNeTCARUoRq92t@clusterone.zksoinv.mongodb.net/stealth_vault?retryWrites=true&w=majority'
    # Ensure URI is properly formatted (only add prefix if it doesn't start with mongodb)
    if _mongodb_uri and not _mongodb_uri.startswith('mongodb'):
        _mongodb_uri = f'mongodb+srv://{_mongodb_uri}'
    MONGODB_URI = _mongodb_uri
    MONGODB_DB_NAME = os.environ.get('MONGODB_DB_NAME') or 'stealth_vault'
    
    # Extract database name from URI if not provided
    if 'MONGODB_DB_NAME' not in os.environ and MONGODB_URI:
        # Extract db name from URI (after last / and before ?)
        if '/' in MONGODB_URI:
            db_part = MONGODB_URI.split('/')[-1].split('?')[0]
            if db_part:
                MONGODB_DB_NAME = db_part
    
    # JWT
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-in-production'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    
    # File Upload
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
    VAULT_FOLDER = os.path.join(UPLOAD_FOLDER, 'vault')
    CHAT_MEDIA_FOLDER = os.path.join(UPLOAD_FOLDER, 'chat_media')
    
    # OTP
    OTP_EXPIRY_MINUTES = 10
    OTP_LENGTH = 6
    
    # Twilio (for SMS OTP)
    TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
    TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
    TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
    
    # Email (for Email OTP)
    MAIL_SERVER = os.environ.get('MAIL_SERVER')
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 587)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    
    # Redis (for caching and Socket.io)
    REDIS_URL = os.environ.get('REDIS_URL') or 'redis://localhost:6379/0'
    
    # AWS S3 (optional, for cloud storage)
    AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
    AWS_BUCKET_NAME = os.environ.get('AWS_BUCKET_NAME')
    AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
    
    # Google Drive (for backup)
    GOOGLE_DRIVE_CLIENT_ID = os.environ.get('GOOGLE_DRIVE_CLIENT_ID')
    GOOGLE_DRIVE_CLIENT_SECRET = os.environ.get('GOOGLE_DRIVE_CLIENT_SECRET')
    
    # Storage Limits
    FREE_STORAGE_LIMIT_MB = 1024  # 1GB
    PREMIUM_STORAGE_LIMIT_MB = 10240  # 10GB
    
    # Create upload directories
    @staticmethod
    def init_app(app):
        """Initialize upload directories"""
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.VAULT_FOLDER, exist_ok=True)
        os.makedirs(Config.CHAT_MEDIA_FOLDER, exist_ok=True)
        
        # Create subdirectories
        os.makedirs(os.path.join(Config.VAULT_FOLDER, 'photos'), exist_ok=True)
        os.makedirs(os.path.join(Config.VAULT_FOLDER, 'videos'), exist_ok=True)
        os.makedirs(os.path.join(Config.VAULT_FOLDER, 'documents'), exist_ok=True)
        os.makedirs(os.path.join(Config.CHAT_MEDIA_FOLDER, 'images'), exist_ok=True)
        os.makedirs(os.path.join(Config.CHAT_MEDIA_FOLDER, 'videos'), exist_ok=True)
        os.makedirs(os.path.join(Config.CHAT_MEDIA_FOLDER, 'documents'), exist_ok=True)
        os.makedirs(os.path.join(Config.CHAT_MEDIA_FOLDER, 'voice'), exist_ok=True)
        os.makedirs(os.path.join(Config.CHAT_MEDIA_FOLDER, 'thumbnails'), exist_ok=True)
        
        # Create avatars directory
        avatars_folder = os.path.join(Config.UPLOAD_FOLDER, 'avatars')
        os.makedirs(avatars_folder, exist_ok=True)

