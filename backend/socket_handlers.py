"""
Socket.io event handlers for real-time chat
"""

from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from models_mongo import User, Chat, Message
from datetime import datetime

def register_socket_handlers(socketio_instance):
    """Register all Socket.io event handlers"""
    global socketio
    socketio = socketio_instance
    
    @socketio_instance.on('connect')
    def handle_connect(auth):
        """Handle client connection"""
        try:
            if not auth or 'token' not in auth:
                return False
            
            # Verify token
            decoded = decode_token(auth['token'])
            user_id = decoded['sub']
            
            # Store user_id in session
            from flask import request
            request.sid_user_id = user_id
            
            # Join user's personal room
            join_room(f'user_{user_id}')
            
            # Update user online status
            user = User.objects(id=user_id).first()
            if user:
                user.last_seen = datetime.utcnow()
                user.save()
            
            emit('connected', {'userId': user_id})
            print(f"User {user_id} connected")
            return True
            
        except Exception as e:
            print(f"Connection error: {e}")
            return False
    
    @socketio_instance.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection"""
        try:
            from flask import request
            user_id = getattr(request, 'sid_user_id', None)
            
            if user_id:
                leave_room(f'user_{user_id}')
                print(f"User {user_id} disconnected")
        except Exception as e:
            print(f"Disconnect error: {e}")
    
    @socketio_instance.on('join_chat')
    def handle_join_chat(data):
        """Join a chat room"""
        try:
            from flask import request
            user_id = getattr(request, 'sid_user_id', None)
            chat_id = data.get('chatId')
            
            if not user_id or not chat_id:
                return
            
            # Verify user is part of chat
            chat = Chat.objects(id=chat_id).first()
            if chat and (chat.user1_id == user_id or chat.user2_id == user_id):
                join_room(f'chat_{chat_id}')
                emit('joined_chat', {'chatId': chat_id})
                print(f"User {user_id} joined chat {chat_id}")
        except Exception as e:
            print(f"Join chat error: {e}")
    
    @socketio_instance.on('leave_chat')
    def handle_leave_chat(data):
        """Leave a chat room"""
        try:
            from flask import request
            user_id = getattr(request, 'sid_user_id', None)
            chat_id = data.get('chatId')
            
            if not user_id or not chat_id:
                return
            
            leave_room(f'chat_{chat_id}')
            emit('left_chat', {'chatId': chat_id})
            print(f"User {user_id} left chat {chat_id}")
        except Exception as e:
            print(f"Leave chat error: {e}")
    
    @socketio_instance.on('send_message')
    def handle_send_message(data):
        """Handle real-time message sending"""
        try:
            from flask import request
            user_id = getattr(request, 'sid_user_id', None)
            
            if not user_id:
                emit('error', {'message': 'Not authenticated'})
                return
            
            chat_id = data.get('chatId')
            message_type = data.get('type', 'text')
            content = data.get('content', '')
            media_url = data.get('mediaUrl')
            phone_number = data.get('phoneNumber')
            contact_name = data.get('contactName')
            contact_email = data.get('email')
            
            # Get or create chat
            chat = None
            if chat_id:
                # Try to find by ID first
                try:
                    chat = Chat.objects(id=chat_id).first()
                except:
                    pass
            
            if not chat:
                # Try to find existing chat by phone number
                if phone_number:
                    chat = Chat.objects(
                        user1_id=user_id,
                        contact_phone_number=phone_number,
                        is_non_app_user=True
                    ).first()
            
            if not chat:
                # Create new chat
                if phone_number or contact_name:
                    # Non-app user chat
                    import uuid
                    new_chat_id = str(uuid.uuid4())
                    chat = Chat(
                        id=new_chat_id,
                        user1_id=user_id,
                        user2_id=None,
                        contact_phone_number=phone_number,
                        contact_name=contact_name,
                        contact_email=contact_email,
                        is_non_app_user=True,
                    )
                    chat.save()
                else:
                    emit('error', {'message': 'Chat not found and cannot create without contact info'})
                    return
            
            # Verify user is part of chat
            if chat.user1_id != user_id:
                emit('error', {'message': 'Chat not found'})
                return
            
            # Determine receiver
            if chat.is_non_app_user:
                # Non-app user chat - allow messaging
                receiver_id = None
                receiver_phone_number = chat.contact_phone_number
                receiver_name = chat.contact_name
            else:
                # App user chat
                receiver_id = chat.user2_id if chat.user1_id == user_id else chat.user1_id
                receiver_phone_number = None
                receiver_name = None
                
                # Validate receiver exists (only for app users)
                receiver = User.objects(id=receiver_id).first()
                if not receiver:
                    emit('error', {'message': 'Receiver not found or not registered. Please invite them first.'}, callback=True)
                    return {'error': 'Receiver not found or not registered'}
            
            # Get additional message data
            file_name = data.get('fileName')
            file_size = data.get('fileSize', 0)
            duration = data.get('duration')
            is_view_once = data.get('isViewOnce', False)
            auto_delete_after = data.get('autoDeleteAfter')
            thumbnail_url = data.get('thumbnailUrl')
            
            # Create message with status
            message = Message(
                chat_id=str(chat.id),
                sender_id=user_id,
                receiver_id=receiver_id,
                receiver_phone_number=receiver_phone_number,
                receiver_name=receiver_name,
                type=message_type,
                content=content,
                media_url=media_url,
                thumbnail_url=thumbnail_url,
                file_name=file_name,
                file_size=file_size,
                duration=duration,
                is_view_once=is_view_once,
                auto_delete_after=auto_delete_after,
                status='sent',  # Message is sent immediately
                sent_at=datetime.utcnow(),
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
            
            # Emit to chat room
            socketio_instance.emit('new_message', message.to_dict(), room=f'chat_{chat.id}')
            
            # Also notify receiver directly (only if app user)
            if receiver_id:
                socketio_instance.emit('new_message', message.to_dict(), room=f'user_{receiver_id}')
                # Mark as delivered if receiver is online
                message.status = 'delivered'
                message.delivered_at = datetime.utcnow()
                message.save()
                # Emit status update
                socketio_instance.emit('message_status_update', {
                    'messageId': str(message.id),
                    'status': 'delivered',
                    'deliveredAt': message.delivered_at.isoformat()
                }, room=f'chat_{chat.id}')
            
            # Return success response
            return {'message': message.to_dict()}
            
        except Exception as e:
            print(f"Send message error: {e}")
            emit('error', {'message': str(e)}, callback=True)
            return {'error': str(e)}
    
    @socketio_instance.on('typing')
    def handle_typing(data):
        """Handle typing indicator"""
        try:
            from flask import request
            user_id = getattr(request, 'sid_user_id', None)
            chat_id = data.get('chatId')
            is_typing = data.get('isTyping', False)
            
            if not user_id or not chat_id:
                return
            
            # Verify user is part of chat
            chat = Chat.objects(id=chat_id).first()
            if not chat or (chat.user1_id != user_id and chat.user2_id != user_id):
                return
            
            # Get user info
            user = User.objects(id=user_id).first()
            if not user:
                return
            
            # Emit to other users in chat
            socketio_instance.emit('user_typing', {
                'userId': user_id,
                'userName': user.name,
                'chatId': chat_id,
                'isTyping': is_typing
            }, room=f'chat_{chat_id}', include_self=False)
            
        except Exception as e:
            print(f"Typing error: {e}")
    
    @socketio_instance.on('mark_read')
    def handle_mark_read(data):
        """Mark messages as read"""
        try:
            from flask import request
            user_id = getattr(request, 'sid_user_id', None)
            chat_id = data.get('chatId')
            message_ids = data.get('messageIds', [])
            
            if not user_id or not chat_id:
                return
            
            # Verify user is part of chat
            chat = Chat.objects(id=chat_id).first()
            if not chat or (chat.user1_id != user_id and chat.user2_id != user_id):
                return
            
            # Mark messages as read
            updated_messages = []
            for msg_id in message_ids:
                message = Message.objects(id=msg_id).first()
                if message and message.receiver_id == user_id and not message.read_at:
                    message.status = 'read'
                    message.read_at = datetime.utcnow()
                    message.save()
                    updated_messages.append(message.to_dict())
            
            # Update unread count
            if chat.user1_id == user_id:
                chat.unread_count_user1 = 0
            else:
                chat.unread_count_user2 = 0
            chat.save()
            
            # Emit read receipts to sender
            if updated_messages:
                sender_id = updated_messages[0]['senderId']
                socketio_instance.emit('messages_read', {
                    'chatId': chat_id,
                    'messageIds': message_ids,
                    'readAt': datetime.utcnow().isoformat()
                }, room=f'user_{sender_id}')
            
        except Exception as e:
            print(f"Mark read error: {e}")

