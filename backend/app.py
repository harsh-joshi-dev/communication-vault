"""
Stealth Vault App - Backend Server
Main Flask application with Socket.io for real-time chat
"""

from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from flask_jwt_extended import JWTManager
import os
from dotenv import load_dotenv
# MongoDB imports DISABLED - using pure socket.io communication only
# from mongoengine import connect, disconnect

from config import Config
# MongoDB model imports DISABLED - using pure socket.io communication only
# from models_mongo import User, Chat, Message, Contact, VaultItem, OTP
from routes.auth import auth_bp
from routes.users import users_bp
from routes.contacts import contacts_bp
from routes.messages import messages_bp
from routes.vault import vault_bp
from routes.backup import backup_bp
from routes.media import media_bp
from socket_handlers import register_socket_handlers

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)

# Initialize upload directories
Config.init_app(app)

# MongoDB initialization COMPLETELY DISABLED - using pure socket.io communication only
# All MongoDB operations removed - chat works perfectly via Socket.io
def init_mongodb():
    """MongoDB initialization completely disabled - using pure socket.io for message delivery"""
    print("ℹ️  MongoDB initialization disabled - using pure socket.io communication only")
    print("✅ Chat works perfectly via Socket.io real-time delivery")
    print("✅ Messages delivered instantly, saved locally on devices")
    print("✅ No database dependencies - pure socket communication")
    return False

# MongoDB initialization disabled - using pure socket.io
# init_mongodb()  # DISABLED - not called anywhere, all MongoDB operations removed

# Initialize extensions
CORS(app, resources={r"/*": {"origins": "*"}})
jwt = JWTManager(app)

# Initialize Socket.io
# Use eventlet for production, threading for development
async_mode = os.environ.get('ASYNC_MODE', 'eventlet')
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode=async_mode,
    logger=os.environ.get('LOG_LEVEL', 'info') == 'debug',
    engineio_logger=os.environ.get('LOG_LEVEL', 'info') == 'debug',
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e8,  # 100MB for file uploads
    allow_upgrades=True,
    transports=['websocket', 'polling'],  # Allow both transports
    cookie=False,  # Don't use cookies for better compatibility
    always_connect=True  # Always allow connections
)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(users_bp, url_prefix='/api/users')
app.register_blueprint(contacts_bp, url_prefix='/api/contacts')
app.register_blueprint(messages_bp, url_prefix='/api/messages')
app.register_blueprint(vault_bp, url_prefix='/api/vault')
app.register_blueprint(backup_bp, url_prefix='/api/backup')
app.register_blueprint(media_bp, url_prefix='/api/media')

# Register Socket.io handlers
register_socket_handlers(socketio)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for Render - MongoDB DISABLED, using pure socket.io"""
    # MongoDB DISABLED - all operations use pure socket.io
    return {'status': 'ok', 'message': 'Server is running', 'database': 'disabled', 'mode': 'socket-io-only'}, 200

@app.route('/', methods=['GET'])
def root():
    """Root endpoint for Render health checks"""
    return {'status': 'ok', 'message': 'Stealth Vault Backend API', 'version': '1.0.0'}, 200

# Export app and socketio for gunicorn
# This allows gunicorn to import: from app import app, socketio

if __name__ == '__main__':
    # Development server
    port = int(os.environ.get('PORT', 5000))
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=os.environ.get('FLASK_DEBUG', 'False').lower() == 'true',
        allow_unsafe_werkzeug=True
    )

