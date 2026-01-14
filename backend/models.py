"""
Database models for the application
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

db = SQLAlchemy()

class User(db.Model):
    """User model"""
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    mobile = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    avatar = db.Column(db.String(255))
    is_verified = db.Column(db.Boolean, default=False)
    
    # Privacy settings
    allow_mobile_discovery = db.Column(db.Boolean, default=True)
    allow_username_discovery = db.Column(db.Boolean, default=True)
    invite_only = db.Column(db.Boolean, default=False)
    show_online_status = db.Column(db.Boolean, default=True)
    show_last_seen = db.Column(db.Boolean, default=True)
    
    # Subscription
    subscription_plan = db.Column(db.String(20), default='free')  # free, premium, family, business
    storage_limit_mb = db.Column(db.Integer, default=1024)
    used_storage_mb = db.Column(db.Float, default=0.0)
    subscription_expires_at = db.Column(db.DateTime)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    chats = db.relationship('Chat', foreign_keys='Chat.user1_id', backref='user1', lazy='dynamic')
    chats2 = db.relationship('Chat', foreign_keys='Chat.user2_id', backref='user2', lazy='dynamic')
    sent_messages = db.relationship('Message', foreign_keys='Message.sender_id', backref='sender', lazy='dynamic')
    vault_items = db.relationship('VaultItem', backref='owner', lazy='dynamic')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary"""
        data = {
            'id': self.id,
            'username': self.username,
            'email': self.email if include_sensitive else None,
            'mobile': self.mobile if include_sensitive else None,
            'name': self.name,
            'avatar': self.avatar,
            'isVerified': self.is_verified,
            'privacySettings': {
                'allowMobileDiscovery': self.allow_mobile_discovery,
                'allowUsernameDiscovery': self.allow_username_discovery,
                'inviteOnly': self.invite_only,
                'showOnlineStatus': self.show_online_status,
                'showLastSeen': self.show_last_seen,
            },
            'subscription': {
                'plan': self.subscription_plan,
                'storageLimit': self.storage_limit_mb,
                'usedStorage': self.used_storage_mb,
                'expiresAt': self.subscription_expires_at.isoformat() if self.subscription_expires_at else None,
            },
            'createdAt': self.created_at.isoformat(),
            'lastSeen': self.last_seen.isoformat(),
        }
        return data

class Chat(db.Model):
    """Chat model for one-to-one conversations"""
    __tablename__ = 'chats'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user1_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    user2_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    last_message_id = db.Column(db.String(36), db.ForeignKey('messages.id'))
    unread_count_user1 = db.Column(db.Integer, default=0)
    unread_count_user2 = db.Column(db.Integer, default=0)
    is_blocked = db.Column(db.Boolean, default=False)
    blocked_by = db.Column(db.String(36))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    messages = db.relationship('Message', backref='chat', lazy='dynamic', order_by='Message.created_at')
    last_message = db.relationship('Message', foreign_keys=[last_message_id], uselist=False)
    
    def to_dict(self, user_id):
        """Convert to dictionary"""
        other_user = self.user2 if self.user1_id == user_id else self.user1
        unread_count = self.unread_count_user1 if self.user1_id == user_id else self.unread_count_user2
        
        return {
            'id': self.id,
            'participantIds': [self.user1_id, self.user2_id],
            'otherUser': other_user.to_dict() if other_user else None,
            'lastMessage': self.last_message.to_dict() if self.last_message else None,
            'unreadCount': unread_count,
            'isBlocked': self.is_blocked,
            'createdAt': self.created_at.isoformat(),
            'updatedAt': self.updated_at.isoformat(),
        }

class Message(db.Model):
    """Message model"""
    __tablename__ = 'messages'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = db.Column(db.String(36), db.ForeignKey('chats.id'), nullable=False, index=True)
    sender_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Message content
    type = db.Column(db.String(20), nullable=False)  # text, image, video, voice, document
    content = db.Column(db.Text)
    media_url = db.Column(db.String(500))
    thumbnail_url = db.Column(db.String(500))
    file_name = db.Column(db.String(255))
    file_size = db.Column(db.Integer)  # in bytes
    duration = db.Column(db.Integer)  # for voice/video, in seconds
    
    # Privacy features
    is_view_once = db.Column(db.Boolean, default=False)
    auto_delete_after = db.Column(db.Integer)  # hours
    is_deleted = db.Column(db.Boolean, default=False)
    read_at = db.Column(db.DateTime)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'chatId': self.chat_id,
            'senderId': self.sender_id,
            'receiverId': self.receiver_id,
            'type': self.type,
            'content': self.content,
            'mediaUrl': self.media_url,
            'thumbnailUrl': self.thumbnail_url,
            'fileName': self.file_name,
            'fileSize': self.file_size,
            'duration': self.duration,
            'isViewOnce': self.is_view_once,
            'autoDeleteAfter': self.auto_delete_after,
            'isDeleted': self.is_deleted,
            'readAt': self.read_at.isoformat() if self.read_at else None,
            'createdAt': self.created_at.isoformat(),
        }

class Contact(db.Model):
    """Contact model for app contacts (not phone contacts)"""
    __tablename__ = 'contacts'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    contact_user_id = db.Column(db.String(36), db.ForeignKey('users.id'))
    name = db.Column(db.String(100), nullable=False)
    phone_number = db.Column(db.String(20))
    email = db.Column(db.String(120))
    avatar = db.Column(db.String(255))
    is_app_user = db.Column(db.Boolean, default=False)
    is_invited = db.Column(db.Boolean, default=False)
    qr_code_data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='contacts')
    contact_user = db.relationship('User', foreign_keys=[contact_user_id])
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'userId': self.contact_user_id,
            'name': self.name,
            'phoneNumber': self.phone_number,
            'email': self.email,
            'avatar': self.avatar,
            'isAppUser': self.is_app_user,
            'isInvited': self.is_invited,
            'qrCode': self.qr_code_data,
            'createdAt': self.created_at.isoformat(),
        }

class VaultItem(db.Model):
    """Vault item model"""
    __tablename__ = 'vault_items'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    type = db.Column(db.String(20), nullable=False)  # photo, video, document
    name = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    thumbnail_path = db.Column(db.String(500))
    file_size = db.Column(db.Integer, nullable=False)  # in bytes
    mime_type = db.Column(db.String(100))
    is_encrypted = db.Column(db.Boolean, default=False)
    tags = db.Column(db.Text)  # JSON array of tags
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'type': self.type,
            'name': self.name,
            'path': self.file_path,
            'thumbnailPath': self.thumbnail_path,
            'size': self.file_size,
            'mimeType': self.mime_type,
            'isEncrypted': self.is_encrypted,
            'tags': self.tags.split(',') if self.tags else [],
            'createdAt': self.created_at.isoformat(),
        }

class OTP(db.Model):
    """OTP model for verification"""
    __tablename__ = 'otps'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'))
    type = db.Column(db.String(10), nullable=False)  # email, mobile
    value = db.Column(db.String(120), nullable=False)  # email or phone
    code = db.Column(db.String(10), nullable=False)
    is_verified = db.Column(db.Boolean, default=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

