# MongoDB Connection Troubleshooting

## Error: DNS query name does not exist

This error means MongoDB Atlas SRV record cannot be resolved. Here are solutions:

### Solution 1: Verify MongoDB Atlas Cluster

1. Go to MongoDB Atlas Dashboard
2. Check if cluster `pythonlearning` exists
3. Verify cluster is **not paused** (free tier clusters pause after inactivity)
4. If paused, click "Resume" to wake it up

### Solution 2: Get Correct Connection String

1. In MongoDB Atlas:
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your actual password
   - Replace `<dbname>` with `stealth_vault`

### Solution 3: Check Network Access

1. Go to Network Access in MongoDB Atlas
2. Click "Add IP Address"
3. Add `0.0.0.0/0` (allows all IPs) - for development
4. Or add Render's specific IP ranges
5. Save changes

### Solution 4: Verify Database User

1. Go to Database Access
2. Verify user `harsh` exists
3. Check password is correct: `Abc1234`
4. User should have "Read and write to any database" permissions

### Solution 5: Use Standard Connection String (Alternative)

If SRV doesn't work, you can use standard connection string format:

```
mongodb://harsh:Abc1234@pythonlearning-shard-00-00.mttdmok.mongodb.net:27017,pythonlearning-shard-00-01.mttdmok.mongodb.net:27017,pythonlearning-shard-00-02.mttdmok.mongodb.net:27017/stealth_vault?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin&retryWrites=true&w=majority
```

**Note:** You need to get the actual replica set hostnames from MongoDB Atlas.

### Solution 6: Test Connection Locally

Test the connection string locally first:

```python
from pymongo import MongoClient
import os

uri = "mongodb+srv://harsh:Abc1234@pythonlearning.mttdmok.mongodb.net/stealth_vault?retryWrites=true&w=majority"
try:
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.server_info()  # Force connection
    print("Connection successful!")
except Exception as e:
    print(f"Connection failed: {e}")
```

## Common Issues

### Cluster Name Mismatch
- Verify cluster name in Atlas matches connection string
- Cluster name is case-sensitive

### Password Special Characters
- If password has special characters, URL encode them:
  - `@` → `%40`
  - `#` → `%23`
  - `$` → `%24`
  - etc.

### Database Name
- Database will be created automatically on first write
- Or create it manually in Atlas

## Recommended Connection String Format

```
mongodb+srv://harsh:Abc1234@pythonlearning.mttdmok.mongodb.net/stealth_vault?retryWrites=true&w=majority
```

Make sure:
- ✅ Cluster is running (not paused)
- ✅ Network access allows Render IPs
- ✅ Database user exists and has correct password
- ✅ Connection string is properly formatted

