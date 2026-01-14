"""
Authentication routes
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from models_mongo import User, OTP
from datetime import datetime, timedelta
import random
import string

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/signup', methods=['POST'])
def signup():
    """User signup"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'email', 'mobile', 'username', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Check if user already exists
        if User.objects(email=data['email']).first():
            return jsonify({'error': 'Email already registered'}), 400
        
        if User.objects(mobile=data['mobile']).first():
            return jsonify({'error': 'Mobile number already registered'}), 400
        
        if User.objects(username=data['username']).first():
            return jsonify({'error': 'Username already taken'}), 400
        
        # Generate unique code for QR scanning
        def generate_unique_code():
            """Generate a unique 8-character alphanumeric code"""
            while True:
                code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
                if not User.objects(unique_code=code).first():
                    return code
        
        unique_code = generate_unique_code()
        
        # Create new user
        user = User(
            name=data['name'],
            email=data['email'],
            mobile=data['mobile'],
            username=data['username'],
            unique_code=unique_code,
        )
        user.set_password(data['password'])
        
        # Set subscription based on plan
        plan = data.get('plan', 'free')
        if plan == 'premium':
            user.subscription_plan = 'premium'
            user.storage_limit_mb = 10240  # 10GB
        else:
            user.subscription_plan = 'free'
            user.storage_limit_mb = 1024  # 1GB
        
        user.save()
        
        # Generate tokens
        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)
        
        return jsonify({
            'user': user.to_dict(include_sensitive=True),
            'access_token': access_token,
            'refresh_token': refresh_token,
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """User login"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password required'}), 400
        
        # Find user by email or mobile
        user = User.objects(
            (User.email == email) | (User.mobile == email)
        ).first()
        
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Update last seen
        user.last_seen = datetime.utcnow()
        user.save()
        
        # Generate tokens
        access_token = create_access_token(identity=user.id)
        refresh_token = create_refresh_token(identity=user.id)
        
        return jsonify({
            'user': user.to_dict(include_sensitive=True),
            'access_token': access_token,
            'refresh_token': refresh_token,
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/check-username', methods=['POST'])
def check_username():
    """Check username availability"""
    try:
        data = request.get_json()
        username = data.get('username')
        
        if not username:
            return jsonify({'error': 'Username required'}), 400
        
        exists = User.objects(username=username).first() is not None
        
        return jsonify({'available': not exists}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    """Send OTP for verification"""
    try:
        data = request.get_json()
        otp_type = data.get('type')  # 'email' or 'mobile'
        value = data.get('value')  # email address or phone number
        
        if not otp_type or not value:
            return jsonify({'error': 'Type and value required'}), 400
        
        # Generate OTP (always use 123456 for now)
        code = '123456'
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        # Find or create user
        user = None
        if otp_type == 'email':
            user = User.objects(email=value).first()
        elif otp_type == 'mobile':
            user = User.objects(mobile=value).first()
        
        # Create OTP record
        otp = OTP(
            user_id=str(user.id) if user else None,
            type=otp_type,
            value=value,
            code=code,
            expires_at=expires_at,
        )
        otp.save()
        
        # OTP service skipped - code is always 123456
        
        return jsonify({'message': 'OTP sent successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    """Verify OTP"""
    try:
        data = request.get_json()
        otp_type = data.get('type')
        value = data.get('value')
        code = data.get('code')
        
        if not all([otp_type, value, code]):
            return jsonify({'error': 'Type, value, and code required'}), 400
        
        # Accept 123456 as always valid, or check database
        if code == '123456':
            # Always accept 123456
            # Find user if exists
            user = None
            if otp_type == 'email':
                user = User.objects(email=value).first()
            elif otp_type == 'mobile':
                user = User.objects(mobile=value).first()
            
            if user:
                user.is_verified = True
                user.save()
        else:
            # Find OTP in database
            otp = OTP.objects(
                type=otp_type,
                value=value,
                code=code,
                is_verified=False
            ).order_by('-created_at').first()
            
            if not otp:
                return jsonify({'error': 'Invalid OTP'}), 400
            
            if otp.expires_at < datetime.utcnow():
                return jsonify({'error': 'OTP expired'}), 400
            
            # Mark as verified
            otp.is_verified = True
            otp.save()
            
            # If user exists, mark as verified
            if otp.user_id:
                user = User.objects(id=otp.user_id).first()
                if user:
                    user.is_verified = True
                    user.save()
        
        return jsonify({'message': 'OTP verified successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token"""
    try:
        user_id = get_jwt_identity()
        access_token = create_access_token(identity=user_id)
        return jsonify({'access_token': access_token}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

