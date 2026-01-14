"""
Vault routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from models_mongo import VaultItem, User
from config import Config
import os
import uuid

vault_bp = Blueprint('vault', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'pdf', 'doc', 'docx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@vault_bp.route('/items', methods=['GET'])
@jwt_required()
def get_vault_items():
    """Get all vault items for current user"""
    try:
        user_id = get_jwt_identity()
        item_type = request.args.get('type')  # photo, video, document, or all
        
        query = VaultItem.objects(user_id=user_id)
        
        if item_type and item_type != 'all':
            query = query.filter(type=item_type)
        
        items = query.order_by('-created_at')
        
        return jsonify({
            'items': [item.to_dict() for item in items]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@vault_bp.route('/items', methods=['POST'])
@jwt_required()
def upload_vault_item():
    """Upload a file to vault"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        item_type = request.form.get('type', 'document')
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Check storage limit
        file_size = len(file.read())
        file.seek(0)  # Reset file pointer
        
        new_storage_mb = (user.used_storage_mb * 1024 * 1024 + file_size) / (1024 * 1024)
        
        if new_storage_mb > user.storage_limit_mb:
            return jsonify({
                'error': 'Storage limit exceeded',
                'used': user.used_storage_mb,
                'limit': user.storage_limit_mb
            }), 400
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_ext}"
        
        # Determine folder based on type
        if item_type == 'photo':
            folder = os.path.join(Config.VAULT_FOLDER, 'photos')
        elif item_type == 'video':
            folder = os.path.join(Config.VAULT_FOLDER, 'videos')
        else:
            folder = os.path.join(Config.VAULT_FOLDER, 'documents')
        
        os.makedirs(folder, exist_ok=True)
        
        file_path = os.path.join(folder, unique_filename)
        file.save(file_path)
        
        # Create vault item
        vault_item = VaultItem(
            user_id=user_id,
            type=item_type,
            name=file.filename,
            file_path=file_path,
            file_size=file_size,
            mime_type=file.content_type,
        )
        vault_item.save()
        
        # Update user storage
        user.used_storage_mb = new_storage_mb
        user.save()
        
        return jsonify({'item': vault_item.to_dict()}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@vault_bp.route('/items/<item_id>', methods=['DELETE'])
@jwt_required()
def delete_vault_item(item_id):
    """Delete a vault item"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        item = VaultItem.objects(id=item_id).first()
        if not item or item.user_id != user_id:
            return jsonify({'error': 'Item not found'}), 404
        
        # Delete file
        if os.path.exists(item.file_path):
            os.remove(item.file_path)
        
        # Update user storage
        user.used_storage_mb = max(0, user.used_storage_mb - (item.file_size / (1024 * 1024)))
        user.save()
        
        item.delete()
        
        return jsonify({'message': 'Item deleted'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@vault_bp.route('/storage', methods=['GET'])
@jwt_required()
def get_storage_info():
    """Get storage usage info"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        return jsonify({
            'used': user.used_storage_mb,
            'limit': user.storage_limit_mb,
            'available': max(0, user.storage_limit_mb - user.used_storage_mb),
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

