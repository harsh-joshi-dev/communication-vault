"""
User routes
"""

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from models_mongo import User
from datetime import datetime
from werkzeug.utils import secure_filename
from config import Config
import os
import uuid
from PIL import Image

users_bp = Blueprint('users', __name__)

@users_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user profile"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'user': user.to_dict(include_sensitive=True)}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@users_bp.route('/me', methods=['PUT'])
@jwt_required()
def update_current_user():
    """Update current user profile"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json()
        
        # Update allowed fields
        if 'name' in data:
            user.name = data['name']
        if 'avatar' in data:
            user.avatar = data['avatar']
        if 'privacySettings' in data:
            ps = data['privacySettings']
            if 'allowMobileDiscovery' in ps:
                user.allow_mobile_discovery = ps['allowMobileDiscovery']
            if 'allowUsernameDiscovery' in ps:
                user.allow_username_discovery = ps['allowUsernameDiscovery']
            if 'inviteOnly' in ps:
                user.invite_only = ps['inviteOnly']
            if 'showOnlineStatus' in ps:
                user.show_online_status = ps['showOnlineStatus']
            if 'showLastSeen' in ps:
                user.show_last_seen = ps['showLastSeen']
        
        user.updated_at = datetime.utcnow()
        user.save()
        
        return jsonify({'user': user.to_dict(include_sensitive=True)}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@users_bp.route('/me/avatar', methods=['POST'])
@jwt_required()
def upload_avatar():
    """Upload profile picture"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Only allow images
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        if '.' not in file.filename or file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
            return jsonify({'error': 'Only image files are allowed'}), 400
        
        # Create avatars folder
        avatars_folder = os.path.join(Config.UPLOAD_FOLDER, 'avatars')
        os.makedirs(avatars_folder, exist_ok=True)
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{user_id}_{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(avatars_folder, unique_filename)
        
        # Save file
        file.save(file_path)
        
        # Resize image to 200x200
        try:
            img = Image.open(file_path)
            img.thumbnail((200, 200), Image.Resampling.LANCZOS)
            img.save(file_path)
        except Exception as e:
            print(f"Error resizing avatar: {e}")
        
        # Delete old avatar if exists
        if user.avatar:
            old_path = os.path.join(Config.UPLOAD_FOLDER, 'avatars', user.avatar.split('/')[-1])
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except:
                    pass
        
        # Update user avatar
        user.avatar = f"/api/users/avatar/{unique_filename}"
        user.updated_at = datetime.utcnow()
        user.save()
        
        return jsonify({
            'avatar': user.avatar,
            'user': user.to_dict(include_sensitive=True)
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@users_bp.route('/avatar/<filename>', methods=['GET'])
def get_avatar(filename):
    """Serve avatar image"""
    try:
        # Security: only allow alphanumeric, dash, underscore, and dot
        if not all(c.isalnum() or c in '-_.' for c in filename):
            return jsonify({'error': 'Invalid filename'}), 400
        
        avatar_path = os.path.join(Config.UPLOAD_FOLDER, 'avatars', filename)
        if os.path.exists(avatar_path):
            return send_file(avatar_path)
        
        return jsonify({'error': 'Avatar not found'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@users_bp.route('/search', methods=['GET'])
@jwt_required()
def search_users():
    """Search for users by username or mobile"""
    try:
        user_id = get_jwt_identity()
        query = request.args.get('q', '')
        
        if not query:
            return jsonify({'users': []}), 200
        
        # Search by username or mobile (case-insensitive)
        from mongoengine import Q
        users = User.objects(
            Q(username__icontains=query) |
            Q(mobile__icontains=query)
        ).limit(20)
        
        # Filter based on privacy settings
        results = []
        for user in users:
            if user.id == user_id:
                continue
            
            # Check privacy settings
            if user.invite_only:
                continue
            
            if not user.allow_username_discovery and query in user.username:
                continue
            
            if not user.allow_mobile_discovery and query in user.mobile:
                continue
            
            results.append(user.to_dict())
        
        return jsonify({'users': results}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

