"""
Socket.io event handlers for real-time chat
"""

from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from models_mongo import User, Chat, Message
from datetime import datetime

# Global dictionary to store device_id by socket session ID
# This is more reliable than request attributes which may not persist
device_sessions = {}

def register_socket_handlers(socketio_instance):
    """Register all Socket.io event handlers"""
    global socketio
    socketio = socketio_instance
    
    @socketio_instance.on('connect')
    def handle_connect(auth):
        """Handle client connection with device-based authentication"""
        try:
            from flask import request
            
            if not auth:
                print("❌ Connection rejected: No auth data provided")
                return False
            
            # Get device info from auth (deviceId, uniqueCode, deviceName)
            device_id = auth.get('deviceId')
            unique_code = auth.get('uniqueCode')
            device_name = auth.get('deviceName', 'Unknown Device')
            
            if not device_id:
                print("❌ Connection rejected: Missing deviceId")
                return False
            
            # Store device_id in global dictionary using socket session ID
            # This is more reliable than request attributes
            device_sessions[request.sid] = {
                'device_id': device_id,
                'unique_code': unique_code,
                'device_name': device_name
            }
            
            # Also store in request for backward compatibility
            request.sid_device_id = device_id
            request.sid_unique_code = unique_code
            request.sid_device_name = device_name
            
            # Join device's personal room
            join_room(f'device_{device_id}')
            
            # Also join room by unique code for easier lookup
            if unique_code:
                join_room(f'code_{unique_code}')
            
            emit('connected', {
                'deviceId': device_id,
                'uniqueCode': unique_code,
                'deviceName': device_name
            })
            print(f"✅ Device {device_id} ({device_name}) connected with code {unique_code}, Socket ID: {request.sid}")
            return True
            
        except Exception as e:
            print(f"❌ Connection error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    @socketio_instance.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection"""
        try:
            from flask import request
            
            # Get device_id from global dictionary
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            unique_code = session_data.get('unique_code') or getattr(request, 'sid_unique_code', None)
            
            # Remove from global dictionary
            if request.sid in device_sessions:
                del device_sessions[request.sid]
            
            if device_id:
                leave_room(f'device_{device_id}')
                if unique_code:
                    leave_room(f'code_{unique_code}')
                print(f"⚠️ Device {device_id} disconnected, Socket ID: {request.sid}")
        except Exception as e:
            print(f"Disconnect error: {e}")
    
    @socketio_instance.on('join_chat')
    def handle_join_chat(data):
        """Join a chat room, device room, or code room"""
        try:
            from flask import request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            chat_id = data.get('chatId')
            
            if not device_id or not chat_id:
                print(f"⚠️ Join chat failed: device_id={device_id}, chat_id={chat_id}")
                return
            
            # Handle different room types
            if chat_id.startswith('device_'):
                # Device room - allow joining own device room
                room_device_id = chat_id.replace('device_', '')
                if room_device_id == device_id:
                    join_room(chat_id)
                    print(f"✅ Device {device_id} joined device room {chat_id}")
                else:
                    print(f"⚠️ Device {device_id} cannot join other device room {chat_id}")
            elif chat_id.startswith('code_'):
                # Code room - allow joining own code room
                room_code = chat_id.replace('code_', '')
                unique_code = session_data.get('unique_code') or getattr(request, 'sid_unique_code', None)
                if room_code == unique_code:
                    join_room(chat_id)
                    print(f"✅ Device {device_id} joined code room {chat_id}")
                else:
                    print(f"⚠️ Device {device_id} cannot join code room {chat_id} (has {unique_code})")
            else:
                # Regular chat room - verify device is part of chat
                # Handle both UUID and prefixed formats
                clean_chat_id = chat_id.replace('chat_', '') if chat_id.startswith('chat_') else chat_id
                
                try:
                    chat = Chat.objects(id=clean_chat_id).first()
                    if chat:
                        # Verify device is part of chat
                        if chat.user1_id == device_id or chat.user2_id == device_id:
                            room_name = f'chat_{chat.id}'
                            join_room(room_name)
                            emit('joined_chat', {'chatId': str(chat.id)})
                            print(f"✅ Device {device_id} joined chat room {room_name} (chat ID: {chat.id})")
                        else:
                            print(f"⚠️ Device {device_id} not authorized for chat {chat.id}")
                    else:
                        # Chat doesn't exist yet - this is OK, it will be created when first message is sent
                        print(f"⚠️ Chat {clean_chat_id} not found, but allowing join (will be created on first message)")
                        # Still join the room so messages can be received when chat is created
                        room_name = f'chat_{clean_chat_id}'
                        join_room(room_name)
                        emit('joined_chat', {'chatId': clean_chat_id})
                except Exception as e:
                    print(f"⚠️ Error finding chat {clean_chat_id}: {e}")
                    # Still try to join the room
                    room_name = f'chat_{clean_chat_id}'
                    join_room(room_name)
                    emit('joined_chat', {'chatId': clean_chat_id})
        except Exception as e:
            print(f"❌ Join chat error: {e}")
            import traceback
            traceback.print_exc()
    
    @socketio_instance.on('leave_chat')
    def handle_leave_chat(data):
        """Leave a chat room"""
        try:
            from flask import request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            chat_id = data.get('chatId')
            
            if not device_id or not chat_id:
                return
            
            leave_room(f'chat_{chat_id}')
            emit('left_chat', {'chatId': chat_id})
            print(f"Device {device_id} left chat {chat_id}")
        except Exception as e:
            print(f"Leave chat error: {e}")
    
    @socketio_instance.on('send_message')
    def handle_send_message(data, callback=None):
        """Handle real-time message sending"""
        try:
            from flask import request
            
            # Get device_id from global dictionary first, then fallback to request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            device_name = session_data.get('device_name') or getattr(request, 'sid_device_name', 'Unknown Device')
            
            if not device_id:
                print(f"❌ Send message failed: device_id not found. Socket ID: {request.sid}")
                print(f"   Session data: {device_sessions.get(request.sid, 'Not found')}")
                print(f"   Available sessions: {list(device_sessions.keys())}")
                if callback:
                    callback({'error': 'Not authenticated'})
                return {'error': 'Not authenticated'}
            
            print(f"📤 Processing message from device {device_id} (Socket: {request.sid})")
            
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
                # Try to find by ID first (handle both UUID and prefixed formats)
                try:
                    # Remove 'chat_' prefix if present
                    clean_chat_id = chat_id.replace('chat_', '') if chat_id.startswith('chat_') else chat_id
                    chat = Chat.objects(id=clean_chat_id).first()
                except Exception as e:
                    print(f"Error finding chat by ID {chat_id}: {e}")
                    pass
            
            if not chat:
                # Try to find existing chat by phone number, device ID, or unique code
                receiver_device_id = data.get('receiverId')  # This is now deviceId
                receiver_unique_code = data.get('receiverUniqueCode')  # Also check unique code
                
                if receiver_device_id:
                    # Try to find chat between these two devices
                    chat = Chat.objects(
                        ((Chat.user1_id == device_id) & (Chat.user2_id == receiver_device_id)) |
                        ((Chat.user1_id == receiver_device_id) & (Chat.user2_id == device_id))
                    ).first()
                
                # If not found by device ID, try by unique code
                if not chat and receiver_unique_code:
                    # Try finding by unique code (stored as user2_id for app users)
                    chat = Chat.objects(
                        ((Chat.user1_id == device_id) & (Chat.user2_id == receiver_unique_code)) |
                        ((Chat.user1_id == receiver_unique_code) & (Chat.user2_id == device_id))
                    ).first()
                
                # If not found by device ID, try by unique code (if we have a way to map it)
                # For now, we'll use receiver_device_id or receiverUniqueCode as receiver_id
                if not chat and phone_number:
                    chat = Chat.objects(
                        user1_id=device_id,
                        contact_phone_number=phone_number,
                        is_non_app_user=True
                    ).first()
            
            if not chat:
                # Create new chat
                receiver_device_id = data.get('receiverId')
                receiver_unique_code = data.get('receiverUniqueCode')
                
                # Use receiverUniqueCode if available, otherwise use receiverId
                receiver_id = receiver_unique_code if receiver_unique_code else receiver_device_id
                
                if receiver_id:
                    # App user chat (device to device)
                    import uuid
                    new_chat_id = str(uuid.uuid4())
                    chat = Chat(
                        id=new_chat_id,
                        user1_id=device_id,
                        user2_id=receiver_id,  # Can be deviceId or uniqueCode
                        is_non_app_user=False,
                    )
                    chat.save()
                    print(f"✅ Created new app user chat: {new_chat_id} between {device_id} and {receiver_id}")
                elif phone_number or contact_name:
                    # Non-app user chat
                    import uuid
                    new_chat_id = str(uuid.uuid4())
                    chat = Chat(
                        id=new_chat_id,
                        user1_id=device_id,
                        user2_id=None,
                        contact_phone_number=phone_number,
                        contact_name=contact_name,
                        contact_email=contact_email,
                        is_non_app_user=True,
                    )
                    chat.save()
                    print(f"✅ Created new non-app user chat: {new_chat_id} with {contact_name or phone_number}")
                else:
                    error_msg = 'Chat not found and cannot create without contact info'
                    print(f"❌ {error_msg}")
                    if callback:
                        callback({'error': error_msg})
                    return {'error': error_msg}
            
            # Verify device is part of chat
            if chat.user1_id != device_id and chat.user2_id != device_id:
                error_msg = 'Chat not found or access denied'
                print(f"❌ {error_msg}: device {device_id} not in chat {chat.id}")
                if callback:
                    callback({'error': error_msg})
                return {'error': error_msg}
            
            # Determine receiver
            if chat.is_non_app_user:
                # Non-app user chat - allow messaging
                receiver_id = None
                receiver_phone_number = chat.contact_phone_number
                receiver_name = chat.contact_name
            else:
                # App user chat (device to device)
                receiver_id = chat.user2_id if chat.user1_id == device_id else chat.user1_id
                receiver_phone_number = None
                receiver_name = None
            
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
                sender_id=device_id,
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
            print(f"✅ Message saved: {message.id} in chat {chat.id}")
            
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
            
            # Emit to all relevant rooms simultaneously for ultra-fast delivery
            message_dict = message.to_dict()
            
            # Ensure both sender and receiver join the chat room
            # Join sender to chat room
            join_room(f'chat_{chat.id}')
            
            # Emit to chat room (both sender and receiver)
            socketio_instance.emit('new_message', message_dict, room=f'chat_{chat.id}')
            print(f"📤 Emitted to chat room: chat_{chat.id}")
            
            # Also notify receiver directly via device room (ensures delivery even if not in chat room)
            if receiver_id:
                socketio_instance.emit('new_message', message_dict, room=f'device_{receiver_id}')
                print(f"📤 Emitted to device room: device_{receiver_id}")
                
                # Also emit to unique code room if we have receiverUniqueCode
                receiver_unique_code = data.get('receiverUniqueCode')
                if receiver_unique_code:
                    socketio_instance.emit('new_message', message_dict, room=f'code_{receiver_unique_code}')
                    print(f"📤 Emitted to code room: code_{receiver_unique_code}")
                
                # Also try emitting to receiver_id as code room (in case it's a unique code)
                if receiver_id != receiver_unique_code:  # Avoid duplicate emission
                    socketio_instance.emit('new_message', message_dict, room=f'code_{receiver_id}')
                    print(f"📤 Emitted to code room (receiver_id): code_{receiver_id}")
                
                # Mark as delivered immediately (optimistic)
                message.status = 'delivered'
                message.delivered_at = datetime.utcnow()
                message.save()
                
                # Emit status update to sender immediately
                socketio_instance.emit('message_status_update', {
                    'messageId': str(message.id),
                    'chatId': str(chat.id),
                    'status': 'delivered',
                    'deliveredAt': message.delivered_at.isoformat()
                }, room=f'device_{device_id}')
            
            # Also send message back to sender (so they see it in their chat immediately)
            socketio_instance.emit('new_message', message_dict, room=f'device_{device_id}')
            print(f"📤 Emitted to sender device room: device_{device_id}")
            
            # Return success response via callback if provided
            response = {'message': message_dict}
            if callback:
                callback(response)
            print(f"✅ Message sent successfully: {message.id}")
            return response
            
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Send message error: {error_msg}")
            import traceback
            traceback.print_exc()
            if callback:
                callback({'error': error_msg})
            return {'error': error_msg}
    
    @socketio_instance.on('typing')
    def handle_typing(data):
        """Handle typing indicator"""
        try:
            from flask import request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            device_name = session_data.get('device_name') or getattr(request, 'sid_device_name', 'Unknown Device')
            chat_id = data.get('chatId')
            is_typing = data.get('isTyping', False)
            
            if not device_id or not chat_id:
                return
            
            # Verify device is part of chat
            chat = Chat.objects(id=chat_id).first()
            if not chat or (chat.user1_id != device_id and chat.user2_id != device_id):
                return
            
            # Emit to other devices in chat
            socketio_instance.emit('user_typing', {
                'deviceId': device_id,
                'deviceName': device_name,
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
            
            # Get device_id from global dictionary first, then fallback to request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            chat_id = data.get('chatId')
            message_ids = data.get('messageIds', [])
            
            if not device_id or not chat_id:
                print(f"⚠️ Mark read failed: device_id={device_id}, chat_id={chat_id}")
                return
            
            # Verify device is part of chat
            chat = Chat.objects(id=chat_id).first()
            if not chat or (chat.user1_id != device_id and chat.user2_id != device_id):
                return
            
            # Mark messages as read
            updated_messages = []
            for msg_id in message_ids:
                message = Message.objects(id=msg_id).first()
                if message and message.receiver_id == device_id and not message.read_at:
                    message.status = 'read'
                    message.read_at = datetime.utcnow()
                    message.save()
                    updated_messages.append(message.to_dict())
            
            # Update unread count
            if chat.user1_id == device_id:
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
                }, room=f'device_{sender_id}')
            
        except Exception as e:
            print(f"Mark read error: {e}")
    
    @socketio_instance.on('delete_message')
    def handle_delete_message(data):
        """Delete a message (mark as deleted)"""
        try:
            from flask import request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            chat_id = data.get('chatId')
            message_id = data.get('messageId')
            
            if not device_id or not chat_id or not message_id:
                return
            
            # Verify device is part of chat
            chat = Chat.objects(id=chat_id).first()
            if not chat or (chat.user1_id != device_id and chat.user2_id != device_id):
                return
            
            # Mark message as deleted
            message = Message.objects(id=message_id).first()
            if message and message.sender_id == device_id:  # Only sender can delete
                message.is_deleted = True
                message.save()
                
                # Emit delete event to both devices in chat
                socketio_instance.emit('message_deleted', {
                    'chatId': chat_id,
                    'messageId': message_id,
                }, room=f'chat_{chat_id}')
                
                # Also notify both devices directly
                socketio_instance.emit('message_deleted', {
                    'chatId': chat_id,
                    'messageId': message_id,
                }, room=f'device_{chat.user1_id}')
                if chat.user2_id:
                    socketio_instance.emit('message_deleted', {
                        'chatId': chat_id,
                        'messageId': message_id,
                    }, room=f'device_{chat.user2_id}')
                
        except Exception as e:
            print(f"Delete message error: {e}")

