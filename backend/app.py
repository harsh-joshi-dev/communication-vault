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
def init_mongodb():
    """Initialize MongoDB connection with retry logic"""
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            uri = Config.MONGODB_URI
            
            # Validate URI format
            if not uri or not uri.startswith('mongodb'):
                print(f"Invalid MongoDB URI format: {uri}")
                return False
            
            # Try connecting with mongoengine (lazy connection)
            connect(
                db=Config.MONGODB_DB_NAME,
                host=uri,
                alias='default',
                connect=False,  # Lazy connection - connect on first use
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000,
                socketTimeoutMS=10000,
            )
            print(f"✅ MongoDB connection initialized for database: {Config.MONGODB_DB_NAME}")
            print(f"   URI: {uri.split('@')[1] if '@' in uri else 'hidden'}")
            return True
        except Exception as e:
            retry_count += 1
            error_msg = str(e)
            print(f"❌ MongoDB connection attempt {retry_count}/{max_retries} failed: {error_msg}")
            
            # Check if it's a DNS error
            if 'DNS query name does not exist' in error_msg or 'does not exist' in error_msg:
                print("   ⚠️  DNS Error: The MongoDB cluster may not exist or is paused.")
                print("   💡 Solutions:")
                print("      1. Verify cluster exists in MongoDB Atlas")
                print("      2. Check if cluster is paused (free tier) - click 'Resume'")
                print("      3. Get correct connection string from Atlas 'Connect' button")
                print("      4. Verify cluster name matches in connection string")
            
            if retry_count >= max_retries:
                print(f"\n❌ MongoDB connection failed after {max_retries} attempts")
                print("   App will continue but MongoDB operations will fail.")
                print("   Please check your MONGODB_URI in Render environment variables.")
                return False
            import time
            time.sleep(3)  # Wait before retry
    
    return False

# Initialize MongoDB (non-blocking)
init_mongodb()

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

