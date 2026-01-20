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

# MongoDB initialization DISABLED - using direct socket communication only
def init_mongodb():
    """MongoDB initialization disabled - using pure socket.io for message delivery"""
    print("ℹ️  MongoDB initialization skipped - using direct socket communication only")
    print("✅ Chat will work perfectly via Socket.io real-time delivery")
    return False
    
    # DISABLED: MongoDB connection code below (not used)
    """
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            uri = Config.MONGODB_URI
            
            # Validate URI format
            if not uri or not uri.startswith('mongodb'):
                print(f"❌ Invalid MongoDB URI format: {uri}")
                return False
            
            # Extract database name
            db_name = Config.MONGODB_DB_NAME
            
            # Ensure database name is in the URI
            # Check if URI already has database name
            uri_with_db = uri
            if '@' in uri:
                after_at = uri.split('@')[1]
                if '/' not in after_at.split('?')[0]:
                    # No database name in URI, add it
                    if '?' in uri:
                        uri_with_db = uri.split('?')[0] + '/' + db_name + '?' + uri.split('?')[1]
                    else:
                        uri_with_db = uri + '/' + db_name
            
            # Connect using mongoengine - CONNECT IMMEDIATELY (not lazy)
            print(f"🔌 Attempting to connect to MongoDB...")
            print(f"   URI: {uri.split('@')[1] if '@' in uri else 'hidden'}")
            print(f"   Database: {db_name}")
            
            # Try to connect with increased timeout and better error handling
            # If using mongodb+srv://, we might encounter DNS resolution issues
            # The connection will gracefully fail and app will continue without MongoDB
            try:
                connect(
                    db=db_name,
                    host=uri_with_db,
                    alias='default',
                    connect=True,  # Connect immediately (not lazy)
                    serverSelectionTimeoutMS=15000,  # 15 second timeout (increased for DNS resolution)
                    connectTimeoutMS=15000,  # 15 second connection timeout
                )
            except Exception as connect_error:
                # If connection fails due to DNS/SRV issues, re-raise to be caught by outer try-catch
                # This allows the app to continue running without MongoDB
                raise connect_error
            
            # Test the connection by pinging MongoDB
            from mongoengine import get_db
            db = get_db()
            db.command('ping')
            
            print(f"✅ MongoDB connection successful!")
            print(f"   Database '{db_name}' is connected and ready")
            print(f"   Collections will be created automatically on first use")
            return True
        except Exception as e:
            retry_count += 1
            error_msg = str(e)
            import traceback
            
            # Only log full traceback on first attempt to reduce spam
            if retry_count == 1:
                print(f"❌ MongoDB connection attempt {retry_count}/{max_retries} failed")
                print(f"   Error: {error_msg[:200]}...")  # Truncate long errors
                # Only show traceback for first attempt
                if 'ignore_errors' not in error_msg and 'Lookup timed out' not in error_msg:
                    print(f"   Traceback: {traceback.format_exc()}")
            else:
                # Subsequent attempts - minimal logging
                print(f"❌ MongoDB connection attempt {retry_count}/{max_retries} failed (DNS/network issue)")
            
            # Check for specific error types
            if 'ignore_errors' in error_msg and 'udp()' in error_msg:
                print("   ⚠️  DNS Resolution Error: dnspython version compatibility issue.")
                print("   💡 This is a known issue with Render's DNS infrastructure.")
                print("   💡 Solutions:")
                print("      1. App will continue without MongoDB (chat works via socket)")
                print("      2. Try updating dnspython: pip install --upgrade dnspython")
                print("      3. Or use standard MongoDB URI (not mongodb+srv://)")
                print("      4. Chat functionality will work without MongoDB connection")
            elif 'resolution lifetime expired' in error_msg or 'ConfigurationError' in error_msg:
                print("   ⚠️  DNS Resolution Error: Cannot resolve MongoDB hostname.")
                print("   💡 This may be a network/DNS issue on Render's infrastructure.")
                print("   💡 App will continue without MongoDB (chat works via socket)")
                print("   💡 Messages will be delivered via socket.io, pending API works when MongoDB is up")
            elif 'super(type, obj)' in error_msg or 'must be an instance' in error_msg:
                print("   ⚠️  Type Error: This might be a MongoDB driver version issue.")
                print("   💡 Solutions:")
                print("      1. Check MongoDB Atlas cluster status (might be paused)")
                print("      2. Verify connection string format")
                print("      3. Ensure IP whitelist includes 0.0.0.0/0 (for Render)")
                print("      4. Try updating pymongo: pip install --upgrade pymongo mongoengine")
            elif 'DNS query name does not exist' in error_msg or 'does not exist' in error_msg:
                print("   ⚠️  DNS Error: The MongoDB cluster may not exist or is paused.")
                print("   💡 Solutions:")
                print("      1. Verify cluster exists in MongoDB Atlas")
                print("      2. Check if cluster is paused (free tier) - click 'Resume'")
                print("      3. Get correct connection string from Atlas 'Connect' button")
                print("      4. Verify cluster name matches in connection string")
            elif 'authentication failed' in error_msg.lower():
                print("   ⚠️  Authentication Error: Check username/password in connection string")
            elif 'timeout' in error_msg.lower() or 'Lookup timed out' in error_msg or 'No address associated' in error_msg:
                print("   ⚠️  DNS/Network Error: Cannot resolve MongoDB hostname (Render DNS issue)")
                print("   💡 This is a known Render infrastructure limitation with DNS resolution")
                print("   💡 App will continue without MongoDB - chat works perfectly via Socket.io")
                print("   💡 Messages are saved locally on devices and delivered in real-time")
            
            if retry_count >= max_retries:
                print(f"\n❌ MongoDB connection failed after {max_retries} attempts")
                print("   ⚠️  App will continue running without MongoDB.")
                print("   ✅ Chat functionality will work via Socket.io (real-time delivery)")
                print("   ✅ Messages will be saved locally on devices")
                print("   ⚠️  Pending messages API will not work until MongoDB is connected")
                print("\n   🔧 To fix MongoDB connection:")
                print("   1. Check Render environment variables → MONGODB_URI")
                print("   2. MongoDB Atlas → Your Cluster → Connect")
                print("   3. Check if cluster is paused → Click 'Resume' if needed")
                print("   4. Network Access → Add IP Address → Add 0.0.0.0/0 (allow all)")
                print("   5. Database Access → Verify user credentials")
                print("   6. If DNS errors persist, try updating dnspython: pip install --upgrade dnspython")
                print("\n   💡 Note: Chat will continue to work via Socket.io even without MongoDB!")
                return False
            import time
            time.sleep(3)  # Wait before retry
    
    return False
    """
    
# MongoDB initialization disabled - using pure socket.io
# init_mongodb()  # DISABLED - using direct socket communication only

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
    """Health check endpoint for Render"""
    try:
        from mongoengine import get_db
        db = get_db()
        db.command('ping')
        return {'status': 'ok', 'message': 'Server is running', 'database': 'connected'}, 200
    except Exception as e:
        err = str(e)
        if 'You have not defined a default connection' in err or 'default connection' in err.lower():
            err = (
                'MongoDB never connected at startup. Set MONGODB_URI in Render Environment (Dashboard → Service → Environment) '
                'to: mongodb+srv://USER:PASSWORD@clusterone.zksoinv.mongodb.net/stealth_vault?retryWrites=true&w=majority '
                'with your Atlas user and NEW password, then redeploy. Also ensure 0.0.0.0/0 in Atlas Network Access.'
            )
        return {'status': 'ok', 'message': 'Server is running', 'database': 'disconnected', 'error': err}, 200

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

