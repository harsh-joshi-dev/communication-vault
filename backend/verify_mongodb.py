"""
Script to verify MongoDB connection
Run this locally to test your MongoDB URI before deploying to Render
"""
import os
from pymongo import MongoClient
from urllib.parse import quote_plus

def test_connection(uri):
    """Test MongoDB connection"""
    print(f"Testing MongoDB connection...")
    print(f"URI: {uri.split('@')[1] if '@' in uri else uri[:50]}...")
    print()
    
    try:
        # Test connection
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        
        # Force connection
        client.server_info()
        print("✅ Connection successful!")
        
        # List databases
        db_list = client.list_database_names()
        print(f"✅ Available databases: {', '.join(db_list)}")
        
        # Test database access
        db = client.get_database('stealth_vault')
        collections = db.list_collection_names()
        print(f"✅ Database 'stealth_vault' accessible")
        print(f"   Collections: {', '.join(collections) if collections else 'None (will be created)'}")
        
        client.close()
        return True
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print()
        print("Troubleshooting:")
        print("1. Verify cluster exists in MongoDB Atlas")
        print("2. Check if cluster is paused - click 'Resume' if needed")
        print("3. Verify network access allows your IP (0.0.0.0/0 for all)")
        print("4. Check username and password are correct")
        print("5. Get fresh connection string from Atlas 'Connect' button")
        return False

if __name__ == '__main__':
    # Test with your URI
    uri = "mongodb+srv://harsh:Abc1234@pythonlearning.mttdmok.mongodb.net/stealth_vault?retryWrites=true&w=majority"
    
    print("=" * 60)
    print("MongoDB Connection Test")
    print("=" * 60)
    print()
    
    # You can also test with environment variable
    env_uri = os.environ.get('MONGODB_URI')
    if env_uri:
        print("Using MONGODB_URI from environment...")
        test_connection(env_uri)
    else:
        print("Using hardcoded URI...")
        test_connection(uri)
    
    print()
    print("=" * 60)

