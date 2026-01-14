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
from mongoengine import connect, disconnect

from config import Config
from models_mongo import User, Chat, Message, Contact, VaultItem, OTP
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

# Initialize MongoDB
try:
    connect(
        host=Config.MONGODB_URI,
        alias='default'
    )
    print(f"Connected to MongoDB: {Config.MONGODB_DB_NAME}")
except Exception as e:
    print(f"MongoDB connection error: {e}")
    # Don't fail on startup, but log the error

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
    ping_interval=25
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
    """Health check endpoint for Render"""
    try:
        # Check MongoDB connection
        from mongoengine import get_db
        db = get_db()
        db.command('ping')
        return {'status': 'ok', 'message': 'Server is running', 'database': 'connected'}, 200
    except Exception as e:
        return {'status': 'ok', 'message': 'Server is running', 'database': 'disconnected', 'error': str(e)}, 200

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

