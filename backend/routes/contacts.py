"""
Contact routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models_mongo import Contact, User
import json

contacts_bp = Blueprint('contacts', __name__)

@contacts_bp.route('', methods=['GET'])
@jwt_required()
def get_contacts():
    """Get all contacts for current user"""
    try:
        user_id = get_jwt_identity()
        
        contacts = Contact.objects(user_id=user_id)
        
        return jsonify({
            'contacts': [contact.to_dict() for contact in contacts]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@contacts_bp.route('', methods=['POST'])
@jwt_required()
def add_contact():
    """Add a new contact"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        # Check if contact is an app user by unique_code or userId
        contact_user = None
        if data.get('uniqueCode'):
            contact_user = User.objects(unique_code=data['uniqueCode']).first()
        elif data.get('userId'):
            contact_user = User.objects(id=data['userId']).first()
        elif data.get('phoneNumber'):
            contact_user = User.objects(mobile=data['phoneNumber']).first()
        elif data.get('email'):
            contact_user = User.objects(email=data['email']).first()
        
        if not contact_user:
            return jsonify({'error': 'User not found'}), 404
        
        # Don't allow adding yourself
        if contact_user.id == user_id:
            return jsonify({'error': 'Cannot add yourself as contact'}), 400
        
        # Check if contact already exists
        existing = Contact.objects(
            user_id=user_id,
            contact_user_id=str(contact_user.id)
        ).first()
        
        if existing:
            return jsonify({'contact': existing.to_dict()}), 200
        
        # Create contact
        contact = Contact(
            user_id=user_id,
            contact_user_id=str(contact_user.id),
            name=contact_user.name,
            phone_number=contact_user.mobile,
            email=contact_user.email,
            avatar=contact_user.avatar,
            is_app_user=True,
            is_invited=False,
            qr_code_data=data.get('qrCode'),
        )
        contact.save()
        
        return jsonify({'contact': contact.to_dict()}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@contacts_bp.route('/qr-code', methods=['GET'])
@jwt_required()
def get_qr_code():
    """Get QR code data for current user"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(id=user_id).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        qr_data = {
            'uniqueCode': user.unique_code,
            'userId': user.id,
            'name': user.name,
            'username': user.username,
            'avatar': user.avatar,
        }
        
        return jsonify({'qrData': qr_data}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@contacts_bp.route('/by-code/<unique_code>', methods=['GET'])
@jwt_required()
def get_user_by_code(unique_code):
    """Get user by unique code (for QR scanning)"""
    try:
        user_id = get_jwt_identity()
        user = User.objects(unique_code=unique_code).first()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Don't return yourself
        if user.id == user_id:
            return jsonify({'error': 'Cannot add yourself'}), 400
        
        return jsonify({
            'user': {
                'id': str(user.id),
                'uniqueCode': user.unique_code,
                'name': user.name,
                'username': user.username,
                'avatar': user.avatar,
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

