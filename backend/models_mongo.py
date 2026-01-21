"""
MongoDB models using MongoEngine
"""

from mongoengine import Document, StringField, BooleanField, DateTimeField, IntField, FloatField, ListField, ReferenceField, DictField
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import uuid

class User(Document):
    """User model"""
    meta = {'collection': 'users'}
    
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    username = StringField(required=True, unique=True)
    email = StringField(required=True, unique=True)
    mobile = StringField(required=True, unique=True)
    unique_code = StringField(required=True, unique=True)  # Unique identifier for QR codes
    name = StringField(required=True)
    password_hash = StringField(required=True)
    avatar = StringField()
    is_verified = BooleanField(default=False)
    
    # Privacy settings
    allow_mobile_discovery = BooleanField(default=True)
    allow_username_discovery = BooleanField(default=True)
    invite_only = BooleanField(default=False)
    show_online_status = BooleanField(default=True)
    show_last_seen = BooleanField(default=True)
    
    # Subscription
    subscription_plan = StringField(default='free')  # free, premium, family, business
    storage_limit_mb = IntField(default=1024)
    used_storage_mb = FloatField(default=0.0)
    subscription_expires_at = DateTimeField()
    
    # Timestamps
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)
    last_seen = DateTimeField(default=datetime.utcnow)
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary"""
        data = {
            'id': str(self.id),
            'username': self.username,
            'email': self.email if include_sensitive else None,
            'mobile': self.mobile if include_sensitive else None,
            'uniqueCode': self.unique_code,
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
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'lastSeen': self.last_seen.isoformat() if self.last_seen else None,
        }
        return data

class Chat(Document):
    """Chat model for one-to-one conversations"""
    meta = {'collection': 'chats'}
    
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user1_id = StringField(required=True)  # Always the app user
    user2_id = StringField()  # Optional - only if other user has app
    # For non-app users
    contact_phone_number = StringField()
    contact_name = StringField()
    contact_email = StringField()
    is_non_app_user = BooleanField(default=False)  # True if user2_id is None
    
    last_message_id = StringField()
    unread_count_user1 = IntField(default=0)
    unread_count_user2 = IntField(default=0)
    is_blocked = BooleanField(default=False)
    blocked_by = StringField()
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)
    
    def to_dict(self, user_id):
        """Convert to dictionary"""
        is_user1 = self.user1_id == user_id
        other_user_id = self.user2_id if is_user1 else self.user1_id
        other_user = User.objects(id=other_user_id).first() if other_user_id else None
        unread_count = self.unread_count_user1 if is_user1 else self.unread_count_user2
        
        last_message = None
        if self.last_message_id:
            last_msg = Message.objects(id=self.last_message_id).first()
            if last_msg:
                last_message = last_msg.to_dict()
        
        # Build participant info
        participant_ids = [self.user1_id]
        if self.user2_id:
            participant_ids.append(self.user2_id)
        
        return {
            'id': str(self.id),
            'participantIds': participant_ids,
            'otherUser': other_user.to_dict() if other_user else {
                'id': None,
                'name': self.contact_name,
                'phoneNumber': self.contact_phone_number,
                'email': self.contact_email,
                'isAppUser': False,
            },
            'lastMessage': last_message,
            'unreadCount': unread_count,
            'isBlocked': self.is_blocked,
            'isNonAppUser': self.is_non_app_user,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }

class Message(Document):
    """Message model"""
    meta = {'collection': 'messages', 'indexes': ['chat_id', 'created_at']}
    
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id = StringField(required=True)
    sender_id = StringField(required=True)
    receiver_id = StringField()  # Optional - for non-app users
    # For non-app user messages
    receiver_phone_number = StringField()
    receiver_name = StringField()
    
    # Message content
    type = StringField(required=True)  # text, image, video, voice, document, contact
    content = StringField()
    media_url = StringField()
    thumbnail_url = StringField()
    file_name = StringField()
    file_size = IntField()  # in bytes
    duration = IntField()  # for voice/video, in seconds
    contact_data = StringField()  # JSON string for contact messages
    
    # Privacy features
    is_view_once = BooleanField(default=False)
    auto_delete_after = IntField()  # hours
    is_deleted = BooleanField(default=False)
    
    # Message status: pending, sending, sent, delivered, read
    status = StringField(default='pending')  # pending, sending, sent, delivered, read
    
    # Timestamps
    created_at = DateTimeField(default=datetime.utcnow)
    sent_at = DateTimeField()
    delivered_at = DateTimeField()
    read_at = DateTimeField()
    
    def to_dict(self):
        """Convert to dictionary"""
        result = {
            'id': str(self.id),
            'chatId': self.chat_id,
            'senderId': self.sender_id,
            'receiverId': self.receiver_id,
            'receiverPhoneNumber': self.receiver_phone_number,
            'receiverName': self.receiver_name,
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
            'status': self.status,
            'sentAt': self.sent_at.isoformat() if self.sent_at else None,
            'deliveredAt': self.delivered_at.isoformat() if self.delivered_at else None,
            'readAt': self.read_at.isoformat() if self.read_at else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }
        # Parse contact_data if it exists
        if self.contact_data:
            try:
                import json
                result['contactData'] = json.loads(self.contact_data)
            except:
                result['contactData'] = self.contact_data
        return result

class Contact(Document):
    """Contact model for app contacts"""
    meta = {'collection': 'contacts', 'indexes': ['user_id']}
    
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    contact_user_id = StringField()
    name = StringField(required=True)
    phone_number = StringField()
    email = StringField()
    avatar = StringField()
    is_app_user = BooleanField(default=False)
    is_invited = BooleanField(default=False)
    qr_code_data = StringField()
    created_at = DateTimeField(default=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'userId': self.contact_user_id,
            'name': self.name,
            'phoneNumber': self.phone_number,
            'email': self.email,
            'avatar': self.avatar,
            'isAppUser': self.is_app_user,
            'isInvited': self.is_invited,
            'qrCode': self.qr_code_data,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }

class VaultItem(Document):
    """Vault item model"""
    meta = {'collection': 'vault_items', 'indexes': ['user_id', 'created_at']}
    
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField(required=True)
    type = StringField(required=True)  # photo, video, document
    name = StringField(required=True)
    file_path = StringField(required=True)
    thumbnail_path = StringField()
    file_size = IntField(required=True)  # in bytes
    mime_type = StringField()
    is_encrypted = BooleanField(default=False)
    tags = ListField(StringField())
    created_at = DateTimeField(default=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'type': self.type,
            'name': self.name,
            'path': self.file_path,
            'thumbnailPath': self.thumbnail_path,
            'size': self.file_size,
            'mimeType': self.mime_type,
            'isEncrypted': self.is_encrypted,
            'tags': self.tags or [],
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }

class PendingMessage(Document):
    """Pending message for when receiver was offline; delivered on reconnect (cross-instance)."""
    meta = {'collection': 'pending_messages', 'indexes': ['receiver_device_id', 'created_at']}

    receiver_device_id = StringField(required=True)
    message_dict = DictField(required=True)
    created_at = DateTimeField(default=datetime.utcnow)


class OTP(Document):
    """OTP model for verification"""
    meta = {'collection': 'otps'}
    
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = StringField()
    type = StringField(required=True)  # email, mobile
    value = StringField(required=True)  # email or phone
    code = StringField(required=True)
    is_verified = BooleanField(default=False)
    expires_at = DateTimeField(required=True)
    created_at = DateTimeField(default=datetime.utcnow)

