"""
Media upload routes for chat
"""

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from models_mongo import User
from config import Config
import os
import uuid
from PIL import Image
import mimetypes

media_bp = Blueprint('media', __name__)

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv', 'webm'}
ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar'}
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus'}

def allowed_file(filename, file_type):
    """Check if file extension is allowed for the given type"""
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()
    
    if file_type == 'image':
        return ext in ALLOWED_IMAGE_EXTENSIONS
    elif file_type == 'video':
        return ext in ALLOWED_VIDEO_EXTENSIONS
    elif file_type == 'document':
        return ext in ALLOWED_DOCUMENT_EXTENSIONS
    elif file_type == 'voice':
        return ext in ALLOWED_AUDIO_EXTENSIONS
    return False

@media_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_media():
    """Upload media file for chat"""
    try:
        user_id = get_jwt_identity()
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        file_type = request.form.get('type', 'image')  # image, video, document, voice
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename, file_type):
            return jsonify({'error': f'File type not allowed for {file_type}'}), 400
        
        # Generate unique filename
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_ext}"
        original_filename = secure_filename(file.filename)
        
        # Determine folder based on type
        if file_type == 'image':
            folder = os.path.join(Config.CHAT_MEDIA_FOLDER, 'images')
        elif file_type == 'video':
            folder = os.path.join(Config.CHAT_MEDIA_FOLDER, 'videos')
        elif file_type == 'voice':
            folder = os.path.join(Config.CHAT_MEDIA_FOLDER, 'voice')
        else:
            folder = os.path.join(Config.CHAT_MEDIA_FOLDER, 'documents')
        
        os.makedirs(folder, exist_ok=True)
        
        file_path = os.path.join(folder, unique_filename)
        file.save(file_path)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        # Generate thumbnail for images
        thumbnail_url = None
        if file_type == 'image':
            try:
                img = Image.open(file_path)
                img.thumbnail((200, 200), Image.Resampling.LANCZOS)
                thumbnail_filename = f"thumb_{unique_filename}"
                thumbnail_path = os.path.join(Config.CHAT_MEDIA_FOLDER, 'thumbnails', thumbnail_filename)
                os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
                img.save(thumbnail_path)
                thumbnail_url = f"/api/media/thumbnail/{thumbnail_filename}"
            except Exception as e:
                print(f"Error generating thumbnail: {e}")
        
        # Generate URL for the file
        media_url = f"/api/media/file/{unique_filename}"
        
        return jsonify({
            'mediaUrl': media_url,
            'thumbnailUrl': thumbnail_url,
            'fileName': original_filename,
            'fileSize': file_size,
            'mimeType': mimetypes.guess_type(file_path)[0] or 'application/octet-stream',
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@media_bp.route('/file/<filename>', methods=['GET'])
@jwt_required()
def get_file(filename):
    """Serve uploaded media file"""
    try:
        # Security: only allow alphanumeric, dash, underscore, and dot
        if not all(c.isalnum() or c in '-_.' for c in filename):
            return jsonify({'error': 'Invalid filename'}), 400
        
        # Try to find file in any media subfolder
        for subfolder in ['images', 'videos', 'documents', 'voice']:
            file_path = os.path.join(Config.CHAT_MEDIA_FOLDER, subfolder, filename)
            if os.path.exists(file_path):
                return send_file(file_path)
        
        return jsonify({'error': 'File not found'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@media_bp.route('/thumbnail/<filename>', methods=['GET'])
@jwt_required()
def get_thumbnail(filename):
    """Serve thumbnail image"""
    try:
        # Security: only allow alphanumeric, dash, underscore, and dot
        if not all(c.isalnum() or c in '-_.' for c in filename):
            return jsonify({'error': 'Invalid filename'}), 400
        
        thumbnail_path = os.path.join(Config.CHAT_MEDIA_FOLDER, 'thumbnails', filename)
        if os.path.exists(thumbnail_path):
            return send_file(thumbnail_path)
        
        return jsonify({'error': 'Thumbnail not found'}), 404
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

