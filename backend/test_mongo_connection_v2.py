#!/usr/bin/env python3
"""
Enhanced MongoDB connection test with database/collection creation verification
"""

from mongoengine import connect, disconnect
from config import Config
from models_mongo import User, Chat, Message

def test_mongodb_connection():
    """Test MongoDB connection and verify database/collection creation"""
    try:
        print("🔌 Testing MongoDB Connection...")
        print(f"URI: {Config.MONGODB_URI[:50]}..." if len(Config.MONGODB_URI) > 50 else Config.MONGODB_URI)
        print(f"Database: {Config.MONGODB_DB_NAME}")
        
        # Connect
        uri = Config.MONGODB_URI
        db_name = Config.MONGODB_DB_NAME
        
        # Ensure database name is in URI
        uri_with_db = uri
        if '@' in uri:
            after_at = uri.split('@')[1]
            if '/' not in after_at.split('?')[0]:
                if '?' in uri:
                    uri_with_db = uri.split('?')[0] + '/' + db_name + '?' + uri.split('?')[1]
                else:
                    uri_with_db = uri + '/' + db_name
        
        print(f"\n📡 Connecting to MongoDB...")
        connect(
            db=db_name,
            host=uri_with_db,
            alias='default',
            connect=True,
            serverSelectionTimeoutMS=10000,
        )
        
        # Ping
        from mongoengine import get_db
        db = get_db()
        result = db.command('ping')
        print(f"✅ Ping successful: {result}")
        
        # List databases
        admin_db = db.client.admin
        db_list = admin_db.command('listDatabases')
        databases = [d['name'] for d in db_list['databases']]
        print(f"\n📚 Available databases: {', '.join(databases)}")
        
        if db_name in databases:
            print(f"✅ Database '{db_name}' exists!")
        else:
            print(f"⚠️  Database '{db_name}' NOT found (will be created on first write)")
        
        # List collections in target database
        collections = db.list_collection_names()
        print(f"\n📁 Collections in '{db_name}': {', '.join(collections) if collections else 'None (will be created on first write)'}")
        
        # Try to create a test document
        print(f"\n🧪 Testing write operation...")
        try:
            test_user = User(
                email='test@example.com',
                username='testuser',
                name='Test User',
                mobile='1234567890',
                plan='free'
            )
            test_user.save()
            print(f"✅ Successfully created test User document (ID: {test_user.id})")
            
            # Clean up
            test_user.delete()
            print(f"✅ Test document deleted")
        except Exception as e:
            print(f"❌ Failed to create test document: {e}")
            import traceback
            traceback.print_exc()
        
        # Try to create a test chat
        print(f"\n🧪 Testing Chat document creation...")
        try:
            test_chat = Chat(
                participant_ids=['device1', 'device2'],
                chat_type='direct'
            )
            test_chat.save()
            print(f"✅ Successfully created test Chat document (ID: {test_chat.id})")
            
            # Clean up
            test_chat.delete()
            print(f"✅ Test chat deleted")
        except Exception as e:
            print(f"❌ Failed to create test chat: {e}")
            import traceback
            traceback.print_exc()
        
        # List collections again
        collections_after = db.list_collection_names()
        print(f"\n📁 Collections after test: {', '.join(collections_after) if collections_after else 'None'}")
        
        disconnect()
        print(f"\n✅✅✅ MongoDB connection test completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌❌❌ MongoDB connection test FAILED!")
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    test_mongodb_connection()
