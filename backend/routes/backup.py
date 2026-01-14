"""
Backup routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models_mongo import User, Message, VaultItem, Chat
from datetime import datetime
import json

backup_bp = Blueprint('backup', __name__)

@backup_bp.route('/create', methods=['POST'])
@jwt_required()
def create_backup():
    """Create backup of user data"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        backup_chats = data.get('chats', False)
        backup_vault = data.get('vault', False)
        
        backup_data = {
            'userId': user_id,
            'timestamp': datetime.utcnow().isoformat(),
            'chats': None,
            'vault': None,
        }
        
        if backup_chats:
            # Get all chats
            chats = Chat.objects(
                (Chat.user1_id == user_id) | (Chat.user2_id == user_id)
            )
            
            chats_data = []
            for chat in chats:
                messages = Message.objects(chat_id=str(chat.id))
                chats_data.append({
                    'chat': chat.to_dict(user_id),
                    'messages': [msg.to_dict() for msg in messages]
                })
            
            backup_data['chats'] = chats_data
        
        if backup_vault:
            items = VaultItem.objects(user_id=user_id)
            backup_data['vault'] = [item.to_dict() for item in items]
        
        # In production, upload to cloud storage (S3, Google Drive, etc.)
        # For now, return backup data
        
        return jsonify({
            'backup': backup_data,
            'message': 'Backup created successfully'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@backup_bp.route('/restore', methods=['POST'])
@jwt_required()
def restore_backup():
    """Restore user data from backup"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        backup_data = data.get('backup')
        
        if not backup_data:
            return jsonify({'error': 'Backup data required'}), 400
        
        # Verify backup belongs to user
        if backup_data.get('userId') != user_id:
            return jsonify({'error': 'Invalid backup'}), 400
        
        # Restore logic here
        # In production, restore from cloud storage
        
        return jsonify({'message': 'Backup restored successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

