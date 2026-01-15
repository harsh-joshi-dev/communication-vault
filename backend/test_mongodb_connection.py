"""
Test MongoDB connection script
Run this to diagnose MongoDB connection issues
"""

import os
from dotenv import load_dotenv
from pymongo import MongoClient
from mongoengine import connect, disconnect

# Load environment variables
load_dotenv()

def test_pymongo_connection():
    """Test connection using pymongo directly"""
    print("=" * 60)
    print("Testing MongoDB connection with PyMongo...")
    print("=" * 60)
    
    uri = os.environ.get('MONGODB_URI') or 'mongodb+srv://kellyharrisoninfo:1gNy7ZxN8VoQHDE9@project0.e1kmvyv.mongodb.net/stealth_vault?retryWrites=true&w=majority&appName=Project0'
    db_name = os.environ.get('MONGODB_DB_NAME') or 'stealth_vault'
    
    print(f"URI: {uri.split('@')[0]}@***")
    print(f"Database: {db_name}")
    
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        # Test connection
        client.server_info()
        print("✅ PyMongo connection successful!")
        
        # Test database access
        db = client[db_name]
        collections = db.list_collection_names()
        print(f"✅ Database '{db_name}' accessible!")
        print(f"   Collections: {collections}")
        
        client.close()
        return True
    except Exception as e:
        print(f"❌ PyMongo connection failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_mongoengine_connection():
    """Test connection using mongoengine"""
    print("\n" + "=" * 60)
    print("Testing MongoDB connection with MongoEngine...")
    print("=" * 60)
    
    uri = os.environ.get('MONGODB_URI') or 'mongodb+srv://kellyharrisoninfo:1gNy7ZxN8VoQHDE9@project0.e1kmvyv.mongodb.net/stealth_vault?retryWrites=true&w=majority&appName=Project0'
    db_name = os.environ.get('MONGODB_DB_NAME') or 'stealth_vault'
    
    try:
        # Disconnect any existing connections
        disconnect()
        
        # Connect using mongoengine
        connect(
            db=db_name,
            host=uri,
            alias='default',
            connect=False,
        )
        print("✅ MongoEngine connection initialized!")
        
        # Try to actually connect
        from mongoengine.connection import get_db
        db = get_db()
        collections = db.list_collection_names()
        print(f"✅ Database '{db_name}' accessible via MongoEngine!")
        print(f"   Collections: {collections}")
        
        return True
    except Exception as e:
        print(f"❌ MongoEngine connection failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("\n🔍 MongoDB Connection Diagnostic Tool\n")
    
    # Test PyMongo first
    pymongo_ok = test_pymongo_connection()
    
    # Test MongoEngine
    mongoengine_ok = test_mongoengine_connection()
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"PyMongo: {'✅ OK' if pymongo_ok else '❌ FAILED'}")
    print(f"MongoEngine: {'✅ OK' if mongoengine_ok else '❌ FAILED'}")
    
    if not pymongo_ok:
        print("\n⚠️  PyMongo connection failed. Check:")
        print("   1. MongoDB Atlas cluster is running (not paused)")
        print("   2. IP whitelist includes 0.0.0.0/0 (for Render)")
        print("   3. Username/password are correct")
        print("   4. Connection string format is correct")
    
    if pymongo_ok and not mongoengine_ok:
        print("\n⚠️  MongoEngine connection failed but PyMongo works.")
        print("   This might be a version compatibility issue.")
        print("   Try: pip install --upgrade mongoengine pymongo")

