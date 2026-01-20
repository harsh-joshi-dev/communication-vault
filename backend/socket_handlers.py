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
            
            # CRITICAL: Skip MongoDB queries - deliver message IMMEDIATELY
            # MongoDB operations will happen AFTER delivery
            mongo_available = False  # Assume unavailable initially
            receiver_device_id = data.get('receiverId')
            receiver_unique_code = data.get('receiverUniqueCode')
            
            # Use chat_id from request, or generate new one
            if chat_id:
                clean_chat_id = chat_id.replace('chat_', '') if chat_id.startswith('chat_') else chat_id
                chat_id_str = clean_chat_id
            else:
                import uuid
                chat_id_str = str(uuid.uuid4())
            
            # Create in-memory chat object (no MongoDB needed for delivery)
            class TempChat:
                def __init__(self, chat_id, user1, user2):
                    self.id = chat_id
                    self.user1_id = user1
                    self.user2_id = user2
                    self.is_non_app_user = False
                    self.contact_phone_number = None
                    self.contact_name = None
                    self.contact_email = None
            
            # Determine receiver ID
            receiver_actual_device_id = receiver_device_id
            if receiver_unique_code:
                # Find actual deviceId from active connections
                for sid, session_data in device_sessions.items():
                    if session_data.get('unique_code') == receiver_unique_code:
                        receiver_actual_device_id = session_data.get('device_id')
                        print(f"✅ Found receiver device: {receiver_actual_device_id} for uniqueCode: {receiver_unique_code}")
                        break
            
            receiver_id = receiver_actual_device_id or receiver_device_id or receiver_unique_code
            
            # Create temp chat (no MongoDB)
            chat = TempChat(chat_id_str, device_id, receiver_id)
            
            print(f"⚡ Using in-memory chat (fast delivery, MongoDB optional): {chat_id_str}")
            
            # Try MongoDB in background (non-blocking)
            try:
                # Quick test if MongoDB is available (don't block)
                from mongoengine import get_db
                get_db().command('ping')
                mongo_available = True
                print(f"✅ MongoDB is available (will save after delivery)")
            except:
                mongo_available = False
                print(f"⚠️ MongoDB unavailable (messages will still deliver)")
            
            # Ensure both devices join the chat room immediately
            join_room(f'chat_{chat_id_str}')
            
            # Notify receiver to join chat room (if connected)
            if receiver_actual_device_id and receiver_actual_device_id != receiver_unique_code:
                socketio_instance.emit('join_chat', {'chatId': chat_id_str}, room=f'device_{receiver_actual_device_id}')
                print(f"📥 Notified receiver via device room to join chat: {chat_id_str}")
            if receiver_unique_code:
                socketio_instance.emit('join_chat', {'chatId': chat_id_str}, room=f'code_{receiver_unique_code}')
                print(f"📥 Notified receiver via code room to join chat: {chat_id_str}")
            
            # Receiver info
            receiver_phone_number = phone_number
            receiver_name = contact_name
            receiver_unique_code = data.get('receiverUniqueCode')  # From QR code - PRIMARY
            receiver_device_id_from_data = data.get('receiverId')  # From frontend
            
            # Get additional message data
            file_name = data.get('fileName')
            file_size = data.get('fileSize', 0)
            duration = data.get('duration')
            is_view_once = data.get('isViewOnce', False)
            auto_delete_after = data.get('autoDeleteAfter')
            thumbnail_url = data.get('thumbnailUrl')
            
            # CRITICAL: Create message dict FIRST (works without MongoDB)
            # Deliver message immediately, save to MongoDB after
            import uuid
            message_id = str(uuid.uuid4())
            chat_id_str = str(chat.id) if hasattr(chat, 'id') else chat_id or str(uuid.uuid4())
            
            # Ensure chatId has 'chat_' prefix for consistency with frontend
            chat_id_for_message = chat_id_str if str(chat_id_str).startswith('chat_') else ('chat_%s' % chat_id_str)
            message_dict = {
                'id': message_id,
                'chatId': chat_id_for_message,
                'senderId': device_id,
                'receiverId': receiver_id or '',
                'receiverPhoneNumber': receiver_phone_number,
                'receiverName': receiver_name,
                'type': message_type,
                'content': content,
                'mediaUrl': media_url,
                'thumbnailUrl': thumbnail_url,
                'fileName': file_name,
                'fileSize': file_size,
                'duration': duration,
                'isViewOnce': is_view_once or False,
                'autoDeleteAfter': auto_delete_after,
                'status': 'sent',
                'sentAt': datetime.utcnow().isoformat(),
                'createdAt': datetime.utcnow().isoformat(),
            }
            
            receiver_actual_device_id = None
            receiver_code_room = None  # exact room receiver joined (code_X), for reliable delivery

            # Priority 1: Find by uniqueCode (from QR code) - case-insensitive
            if receiver_unique_code:
                rc = (receiver_unique_code or '').strip().upper()
                print(f"🔍 Looking for device with uniqueCode: {receiver_unique_code} (normalized: {rc})")
                print(f"   Active sessions: {len(device_sessions)} devices connected")
                for sid, session_data in device_sessions.items():
                    su = (session_data.get('unique_code') or '').strip().upper()
                    if su and su == rc:
                        receiver_actual_device_id = session_data.get('device_id')
                        # use exact room name the receiver joined (case-sensitive)
                        receiver_code_room = 'code_{}'.format(session_data.get('unique_code') or receiver_unique_code)
                        print(f"✅ FOUND: Device {receiver_actual_device_id} has uniqueCode {receiver_unique_code}, room={receiver_code_room}")
                        break
            
            # Priority 2: Use receiverId from data if not found
            if not receiver_actual_device_id and receiver_device_id_from_data:
                for sid, session_data in device_sessions.items():
                    if session_data.get('device_id') == receiver_device_id_from_data:
                        receiver_actual_device_id = receiver_device_id_from_data
                        print(f"✅ FOUND: Device {receiver_actual_device_id} from data")
                        break
            
            # Priority 3: Use receiver_id from chat as fallback
            if not receiver_actual_device_id and receiver_id:
                if len(receiver_id) > 10:  # Looks like a deviceId
                    for sid, session_data in device_sessions.items():
                        if session_data.get('device_id') == receiver_id:
                            receiver_actual_device_id = receiver_id
                            print(f"✅ FOUND: Device {receiver_actual_device_id} from chat")
                            break
            
            if not receiver_actual_device_id:
                print(f"⚠️ Receiver device not found. Will use code room: code_{receiver_unique_code}")
            
            # CRITICAL: DELIVER MESSAGE FIRST (works without MongoDB)
            print(f"🚀 DELIVERING MESSAGE IMMEDIATELY (MongoDB-independent):")
            join_room(f'chat_{chat_id_str}')
            
            # 1. Emit to chat room
            socketio_instance.emit('new_message', message_dict, room=f'chat_{chat_id_str}')
            print(f"   ✅ [1/6] Emitted to chat room: chat_{chat_id_str}")
            
            # 2. Emit to receiver's code room (use exact room they joined; fallback to code_{receiver_unique_code})
            if receiver_code_room:
                socketio_instance.emit('new_message', message_dict, room=receiver_code_room)
                print(f"📤 [2] ⭐ Emitted to code room: {receiver_code_room} (RECEIVER IS HERE)")
            elif receiver_unique_code:
                socketio_instance.emit('new_message', message_dict, room=f'code_{receiver_unique_code}')
                print(f"📤 [2] Emitted to code room (fallback): code_{receiver_unique_code}")
            
            # 3. Emit to receiver's device room (if we have actual deviceId)
            if receiver_actual_device_id and receiver_actual_device_id != receiver_unique_code:
                socketio_instance.emit('new_message', message_dict, room=f'device_{receiver_actual_device_id}')
                print(f"📤 [3] Emitted to device room: device_{receiver_actual_device_id}")
            
            # 4. Also try receiver_id from data (fallback)
            if receiver_device_id_from_data and receiver_device_id_from_data != receiver_unique_code and receiver_device_id_from_data != receiver_actual_device_id:
                # Check if deviceId or code
                if len(receiver_device_id_from_data) > 10:
                    socketio_instance.emit('new_message', message_dict, room=f'device_{receiver_device_id_from_data}')
                    print(f"📤 [4] Emitted to device room (data): device_{receiver_device_id_from_data}")
                else:
                    socketio_instance.emit('new_message', message_dict, room=f'code_{receiver_device_id_from_data}')
                    print(f"📤 [4] Emitted to code room (data): code_{receiver_device_id_from_data}")
            
            # 5. Also try receiver_id from chat (fallback)
            if receiver_id and receiver_id != receiver_unique_code and receiver_id != receiver_actual_device_id and receiver_id != receiver_device_id_from_data:
                if len(receiver_id) > 10:
                    socketio_instance.emit('new_message', message_dict, room=f'device_{receiver_id}')
                    print(f"📤 [5] Emitted to device room (chat): device_{receiver_id}")
                else:
                    socketio_instance.emit('new_message', message_dict, room=f'code_{receiver_id}')
                    print(f"📤 [5] Emitted to code room (chat): code_{receiver_id}")
            
            # 6. Send to sender
            socketio_instance.emit('new_message', message_dict, room=f'device_{device_id}')
            print(f"   ✅ [6/6] Emitted to sender: device_{device_id}")
            
            print(f"✅✅✅ MESSAGE DELIVERED! Receiver should receive it now.")
            
            # NOW try to save to MongoDB (optional - message already delivered)
            if mongo_available:
                try:
                    message = Message(
                        id=message_id,
                        chat_id=chat_id_str,
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
                        status='delivered',
                        sent_at=datetime.utcnow(),
                        delivered_at=datetime.utcnow(),
                    )
                    message.save()
                    print(f"✅ Message saved to MongoDB: {message.id}")
                    
                    # Update chat (if it's a real MongoDB object)
                    if hasattr(chat, 'save'):
                        try:
                            chat.last_message_id = str(message.id)
                            chat.updated_at = datetime.utcnow()
                            if receiver_id:
                                if chat.user1_id == receiver_id:
                                    chat.unread_count_user1 += 1
                                else:
                                    chat.unread_count_user2 += 1
                            chat.save()
                            print(f"✅ Chat updated in MongoDB")
                        except Exception as e:
                            print(f"⚠️ Failed to update chat: {e}")
                    # Update message_dict with saved data
                    message_dict = message.to_dict()
                except Exception as e:
                    print(f"⚠️ Failed to save to MongoDB (message already delivered): {e}")
            else:
                print(f"⚠️ MongoDB unavailable - message delivered but not saved")
            
            # Send status update to sender
            message_dict['status'] = 'delivered'
            message_dict['deliveredAt'] = datetime.utcnow().isoformat()
            
            if receiver_id or receiver_unique_code:
                socketio_instance.emit('message_status_update', {
                    'messageId': message_id,
                    'chatId': chat_id_str,
                    'status': 'delivered',
                    'deliveredAt': datetime.utcnow().isoformat()
                }, room=f'device_{device_id}')
                print(f"✅ Status update sent to sender")
            
            # Return success response via callback if provided
            response = {'message': message_dict}
            if callback:
                try:
                    callback(response)
                    print(f"✅ Callback sent successfully for message {message_id}")
                except Exception as e:
                    print(f"❌ Error calling callback: {e}")
            else:
                print(f"⚠️ No callback provided for message {message_id}")
            print(f"✅✅✅ MESSAGE COMPLETE: {message_id}")
            print(f"   Summary: Sender={device_id}, Receiver={receiver_id or receiver_unique_code}, Chat={chat_id_str}")
            print(f"   Delivery: ✅ Delivered | MongoDB: {'✅ Saved' if mongo_available else '⚠️ Unavailable'}")
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
        """Handle typing indicator - broadcasts to all possible rooms for reliability"""
        try:
            from flask import request
            session_data = device_sessions.get(request.sid, {})
            device_id = session_data.get('device_id') or getattr(request, 'sid_device_id', None)
            device_name = session_data.get('device_name') or getattr(request, 'sid_device_name', 'Unknown Device')
            chat_id = data.get('chatId')
            is_typing = data.get('isTyping', False)
            
            if not device_id or not chat_id:
                print(f"⚠️ Typing event missing device_id or chat_id")
                return
            
            print(f"⌨️ Typing event: device={device_id}, chat={chat_id}, typing={is_typing}")
            
            # Normalize chatId (handle both with/without prefix)
            chat_id_str = str(chat_id)
            clean_chat_id = chat_id_str.replace('chat_', '') if chat_id_str.startswith('chat_') else chat_id_str
            
            # Try to get chat info (optional - typing works even if chat doesn't exist in DB yet)
            receiver_id = None
            try:
                # Try multiple chatId formats to find chat
                chat = Chat.objects(id=clean_chat_id).first()
                if not chat and chat_id_str.startswith('chat_'):
                    chat = Chat.objects(id=chat_id_str).first()
                if not chat:
                    chat = Chat.objects(id=f'chat_{clean_chat_id}').first()
                
                if chat:
                    # Get receiver device ID
                    receiver_id = chat.user2_id if chat.user1_id == device_id else chat.user1_id
                    print(f"📋 Found chat, receiver_id: {receiver_id}")
                else:
                    print(f"📋 Chat not found in DB (may not exist yet), will broadcast to all rooms")
            except Exception as e:
                print(f"⚠️ Could not fetch chat for typing: {e}")
                receiver_id = None
            
            # Typing data to emit
            typing_data = {
                'deviceId': device_id,
                'deviceName': device_name,
                'chatId': chat_id_str,  # Use original chatId format
                'isTyping': is_typing
            }
            
            print(f"⌨️ Broadcasting typing event: {device_name} {'typing' if is_typing else 'stopped'} in chat {chat_id_str}")
            
            # CRITICAL: Emit to ALL possible rooms to ensure delivery (same as messages)
            # 1. Chat room (primary) - try multiple formats
            socketio_instance.emit('user_typing', typing_data, room=f'chat_{clean_chat_id}', include_self=False)
            if chat_id_str != f'chat_{clean_chat_id}':
                socketio_instance.emit('user_typing', typing_data, room=f'chat_{chat_id_str}', include_self=False)
            
            # 2. Receiver's device room (if we know it)
            if receiver_id:
                socketio_instance.emit('user_typing', typing_data, room=f'device_{receiver_id}', include_self=False)
                print(f"✅ Emitted typing to receiver device room: device_{receiver_id}")
            
            # 3. Also broadcast to all active device sessions (for device-based chats)
            # This ensures typing works even if chat doesn't exist in DB
            emitted_count = 0
            for sid, session_info in device_sessions.items():
                if sid != request.sid:  # Not the sender
                    session_device_id = session_info.get('device_id')
                    if session_device_id and session_device_id != device_id:
                        # Emit to this device's room
                        socketio_instance.emit('user_typing', typing_data, room=f'device_{session_device_id}', include_self=False, skip_sid=request.sid)
                        emitted_count += 1
            
            print(f"✅ Typing indicator broadcasted to {emitted_count} device room(s) and chat room(s)")
            print(f"✅ Typing event: {device_name} {'typing' if is_typing else 'stopped'} in chat {chat_id_str}")
            
        except Exception as e:
            print(f"❌ Typing error: {e}")
            import traceback
            traceback.print_exc()
    
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

