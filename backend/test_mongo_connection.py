#!/usr/bin/env python3
"""
Test MongoDB connection script
Run this to verify MongoDB connection works
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from mongoengine import connect, disconnect
from models_mongo import User, Chat, Message

def test_mongodb_connection():
    """Test MongoDB connection and create sample data"""
    print("=" * 60)
    print("MongoDB Connection Test")
    print("=" * 60)
    
    try:
        uri = Config.MONGODB_URI
        db_name = Config.MONGODB_DB_NAME
        
        print(f"\n📋 Connection Details:")
        print(f"   URI: {uri.split('@')[1] if '@' in uri else 'hidden'}")
        print(f"   Database: {db_name}")
        
        # Ensure database name is in URI
        uri_with_db = uri
        if '@' in uri:
            after_at = uri.split('@')[1]
            if '/' not in after_at.split('?')[0]:
                if '?' in uri:
                    uri_with_db = uri.split('?')[0] + '/' + db_name + '?' + uri.split('?')[1]
                else:
                    uri_with_db = uri + '/' + db_name
        
        print(f"\n🔌 Connecting to MongoDB...")
        connect(
            db=db_name,
            host=uri_with_db,
            alias='default',
            connect=True,
            serverSelectionTimeoutMS=10000,
        )
        
        # Test connection
        from mongoengine import get_db
        db = get_db()
        result = db.command('ping')
        print(f"✅ Connection successful! Ping result: {result}")
        
        # List existing databases
        print(f"\n📊 Available databases:")
        client = db.client
        for db_name_list in client.list_database_names():
            print(f"   - {db_name_list}")
        
        # Check if our database exists
        if db_name in client.list_database_names():
            print(f"\n✅ Database '{db_name}' exists!")
        else:
            print(f"\n⚠️  Database '{db_name}' doesn't exist yet (will be created on first use)")
        
        # List collections in our database
        collections = db.list_collection_names()
        if collections:
            print(f"\n📁 Collections in '{db_name}':")
            for coll in collections:
                count = db[coll].count_documents({})
                print(f"   - {coll}: {count} documents")
        else:
            print(f"\n⚠️  No collections yet (will be created when first data is saved)")
        
        # Try to create a test document to ensure write works
        print(f"\n🧪 Testing write operation...")
        try:
            # Create a test user (will fail if collection exists with different schema, but that's OK)
            test_user = User(
                id='test-connection-id',
                username='test_connection',
                email='test@connection.com',
                mobile='1234567890',
                unique_code='TEST123',
                name='Test Connection',
            )
            test_user.set_password('test')
            test_user.save()
            print(f"✅ Write test successful!")
            
            # Clean up test user
            test_user.delete()
            print(f"✅ Cleanup successful!")
        except Exception as e:
            print(f"⚠️  Write test failed (might be expected if collection exists): {e}")
        
        print(f"\n" + "=" * 60)
        print("✅ MongoDB connection test PASSED!")
        print("=" * 60)
        
        disconnect()
        return True
        
    except Exception as e:
        print(f"\n❌ MongoDB connection test FAILED!")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_mongodb_connection()
    sys.exit(0 if success else 1)
