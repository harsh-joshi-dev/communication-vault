# MongoDB Connection Error Fix

## Error: "super(type, obj): obj must be an instance or subtype of type"

This error typically indicates a MongoDB connection issue. Follow these steps:

## Step 1: Check MongoDB Atlas Cluster Status

1. **Go to MongoDB Atlas Dashboard**: https://cloud.mongodb.com
2. **Check your cluster** (`project0.e1kmvyv.mongodb.net`)
3. **Verify cluster is RUNNING** (not paused)
   - If paused, click the **"Resume"** button
   - Free tier clusters pause after 1 hour of inactivity

## Step 2: Verify Network Access (IP Whitelist)

1. In MongoDB Atlas, go to **Network Access**
2. Click **"Add IP Address"**
3. Add `0.0.0.0/0` (allows all IPs) - **Required for Render deployment**
4. Click **"Confirm"**
5. Wait 1-2 minutes for changes to propagate

## Step 3: Verify Database User Credentials

1. Go to **Database Access** in MongoDB Atlas
2. Find user: `kellyharrisoninfo`
3. Verify password: `1gNy7ZxN8VoQHDE9`
4. User should have **"Read and write to any database"** permissions
5. If password is wrong, reset it and update the connection string

## Step 4: Test Connection Locally

Run the test script to diagnose:

```bash
cd backend
python test_mongodb_connection.py
```

This will test both PyMongo and MongoEngine connections.

## Step 5: Update Connection String (if needed)

If the connection string needs updating:

1. In MongoDB Atlas, click **"Connect"** on your cluster
2. Choose **"Connect your application"**
3. Copy the connection string
4. Format: `mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority`
5. Update `MONGODB_URI` in Render environment variables

## Step 6: Check Render Environment Variables

In Render dashboard:
1. Go to your backend service
2. Go to **Environment** tab
3. Verify `MONGODB_URI` is set correctly
4. Verify `MONGODB_DB_NAME` is set to `stealth_vault`
5. Click **"Save Changes"** and redeploy

## Common Issues

### Issue: Cluster is Paused
**Solution**: Resume the cluster in MongoDB Atlas

### Issue: IP Not Whitelisted
**Solution**: Add `0.0.0.0/0` to Network Access

### Issue: Wrong Password
**Solution**: Reset password in Database Access and update connection string

### Issue: Connection String Format
**Solution**: Ensure format is: `mongodb+srv://user:pass@cluster.net/dbname?params`

## Quick Fix Checklist

- [ ] Cluster is running (not paused)
- [ ] IP whitelist includes `0.0.0.0/0`
- [ ] Database user exists and password is correct
- [ ] Connection string format is correct
- [ ] Render environment variables are set
- [ ] Backend service is redeployed after changes

## Still Having Issues?

1. Check MongoDB Atlas logs for connection attempts
2. Verify connection string works locally first
3. Check Render logs for detailed error messages
4. Try connecting with MongoDB Compass using the same credentials

