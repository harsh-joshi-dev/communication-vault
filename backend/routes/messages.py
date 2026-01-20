"""
Message routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models_mongo import Message, Chat, User, PendingMessage
from datetime import datetime, timedelta
import os
from werkzeug.utils import secure_filename
from config import Config

messages_bp = Blueprint('messages', __name__)


@messages_bp.route('/pending', methods=['GET'])
def get_pending_messages():
    """Get pending messages for a device (receiver was offline). No JWT; deviceId in query. Cross-instance fallback."""
    try:
        device_id = (request.args.get('deviceId') or '').strip()
        if not device_id:
            return jsonify({'pending': []}), 200
        cutoff = datetime.utcnow() - timedelta(hours=24)
        docs = list(PendingMessage.objects(
            receiver_device_id=device_id,
            created_at__gte=cutoff
        ).order_by('+created_at').limit(100))
        pending = [d.message_dict for d in docs]
        for d in docs:
            d.delete()
        return jsonify({'pending': pending}), 200
    except Exception as e:
        return jsonify({'pending': [], 'error': str(e)}), 200

@messages_bp.route('/chats', methods=['GET'])
@jwt_required()
def get_chats():
    """Get all chats for current user"""
    try:
        user_id = get_jwt_identity()
        
        # Get all chats where user is participant
        chats = Chat.objects(
            (Chat.user1_id == user_id) | (Chat.user2_id == user_id)
        ).order_by('-updated_at')
        
        return jsonify({
            'chats': [chat.to_dict(user_id) for chat in chats]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@messages_bp.route('/chats/<chat_id>/messages', methods=['GET'])
@jwt_required()
def get_messages(chat_id):
    """Get messages for a chat"""
    try:
        user_id = get_jwt_identity()
        
        # Verify user is part of chat
        chat = Chat.objects(id=chat_id).first()
        if not chat or (chat.user1_id != user_id and chat.user2_id != user_id):
            return jsonify({'error': 'Chat not found'}), 404
        
        # Get messages
        skip = request.args.get('skip', 0, type=int)
        limit = request.args.get('limit', 50, type=int)
        
        messages = Message.objects(
            chat_id=chat_id,
            is_deleted=False
        ).order_by('-created_at').skip(skip).limit(limit)
        
        # Mark messages as read
        unread_messages = Message.objects(
            chat_id=chat_id,
            receiver_id=user_id,
            read_at=None
        )
        
        message_ids = []
        for msg in unread_messages:
            msg.read_at = datetime.utcnow()
            msg.status = 'read'
            msg.save()
            message_ids.append(str(msg.id))
        
        # Update unread count
        if chat.user1_id == user_id:
            chat.unread_count_user1 = 0
        else:
            chat.unread_count_user2 = 0
        chat.save()
        
        # Emit read receipts to sender
        if message_ids:
            sender_id = chat.user2_id if chat.user1_id == user_id else chat.user1_id
            if sender_id:
                from app import socketio
                socketio.emit('messages_read', {
                    'chatId': chat_id,
                    'messageIds': message_ids,
                    'readAt': datetime.utcnow().isoformat()
                }, room=f'user_{sender_id}')
        
        messages_list = list(messages)
        has_more = len(messages_list) == limit
        
        return jsonify({
            'messages': [msg.to_dict() for msg in reversed(messages_list)],
            'hasMore': has_more,
            'skip': skip,
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@messages_bp.route('/chats/<chat_id>/messages', methods=['POST'])
@jwt_required()
def send_message(chat_id):
    """Send a message"""
    try:
        user_id = get_jwt_identity()
        
        # Verify user is part of chat
        chat = Chat.objects(id=chat_id).first()
        if not chat or (chat.user1_id != user_id and chat.user2_id != user_id):
            return jsonify({'error': 'Chat not found'}), 404
        
        data = request.get_json()
        message_type = data.get('type', 'text')
        content = data.get('content', '')
        media_url = data.get('mediaUrl')
        file_name = data.get('fileName')
        file_size = data.get('fileSize', 0)
        duration = data.get('duration')
        is_view_once = data.get('isViewOnce', False)
        auto_delete_after = data.get('autoDeleteAfter')
        
        # Determine receiver
        if chat.is_non_app_user:
            # Non-app user chat
            receiver_id = None
            receiver_phone_number = chat.contact_phone_number
            receiver_name = chat.contact_name
        else:
            # App user chat
            receiver_id = chat.user2_id if chat.user1_id == user_id else chat.user1_id
            receiver_phone_number = None
            receiver_name = None
        
        # Create message
        message = Message(
            chat_id=chat_id,
            sender_id=user_id,
            receiver_id=receiver_id,
            receiver_phone_number=receiver_phone_number,
            receiver_name=receiver_name,
            type=message_type,
            content=content,
            media_url=media_url,
            file_name=file_name,
            file_size=file_size,
            duration=duration,
            is_view_once=is_view_once,
            auto_delete_after=auto_delete_after,
        )
        
        message.save()
        
        # Update chat
        chat.last_message_id = str(message.id)
        chat.updated_at = datetime.utcnow()
        
        # Update unread count (only for app users)
        if receiver_id:
            if chat.user1_id == receiver_id:
                chat.unread_count_user1 += 1
            else:
                chat.unread_count_user2 += 1
        # For non-app users, we don't track unread count
        chat.save()
        
        # Emit via Socket.io (handled in socket_handlers.py)
        from app import socketio
        socketio.emit('new_message', message.to_dict(), room=chat_id)
        
        return jsonify({'message': message.to_dict()}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@messages_bp.route('/messages/<message_id>', methods=['DELETE'])
@jwt_required()
def delete_message(message_id):
    """Delete a message"""
    try:
        user_id = get_jwt_identity()
        
        message = Message.objects(id=message_id).first()
        if not message or message.sender_id != user_id:
            return jsonify({'error': 'Message not found'}), 404
        
        message.is_deleted = True
        message.save()
        
        return jsonify({'message': 'Message deleted'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@messages_bp.route('/chats', methods=['POST'])
@jwt_required()
def create_chat():
    """Create a new chat with another user or non-app contact"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        other_user_id = data.get('userId')
        phone_number = data.get('phoneNumber')
        contact_name = data.get('contactName')
        contact_email = data.get('contactEmail')
        
        # Support both app users and non-app contacts
        if other_user_id:
            # Chat with app user
            # Check if chat already exists
            existing_chat = Chat.objects(
                ((Chat.user1_id == user_id) & (Chat.user2_id == other_user_id)) |
                ((Chat.user1_id == other_user_id) & (Chat.user2_id == user_id))
            ).first()
            
            if existing_chat:
                return jsonify({'chat': existing_chat.to_dict(user_id)}), 200
            
            # Create new chat with app user
            chat = Chat(
                user1_id=user_id,
                user2_id=other_user_id,
                is_non_app_user=False,
            )
            chat.save()
        elif phone_number or contact_name:
            # Chat with non-app user
            # Check if chat already exists with this phone number
            existing_chat = Chat.objects(
                user1_id=user_id,
                contact_phone_number=phone_number,
                is_non_app_user=True
            ).first()
            
            if existing_chat:
                return jsonify({'chat': existing_chat.to_dict(user_id)}), 200
            
            # Create new chat with non-app user
            chat = Chat(
                user1_id=user_id,
                user2_id=None,
                contact_phone_number=phone_number,
                contact_name=contact_name,
                contact_email=contact_email,
                is_non_app_user=True,
            )
            chat.save()
        else:
            return jsonify({'error': 'User ID, phone number, or contact name required'}), 400
        
        return jsonify({'chat': chat.to_dict(user_id)}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

