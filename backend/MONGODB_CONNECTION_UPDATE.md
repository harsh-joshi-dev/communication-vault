# MongoDB Connection String Update

## ✅ Found Your Cluster!

Your MongoDB cluster is **"F2D"** and it's **RUNNING** ✅

## Connection String from MongoDB Atlas

From the "Connect" modal, your connection string is:
```
mongodb+srv://<db_username>:<db_password>@f2d.i5afjk2.mongodb.net/
```

## Complete Connection String

Replace the placeholders with your actual credentials:

**Format:**
```
mongodb+srv://USERNAME:PASSWORD@f2d.i5afjk2.mongodb.net/stealth_vault?retryWrites=true&w=majority
```

**Example (if username is `kellyharrisoninfo` and password is `1gNy7ZxN8VoQHDE9`):**
```
mongodb+srv://kellyharrisoninfo:1gNy7ZxN8VoQHDE9@f2d.i5afjk2.mongodb.net/stealth_vault?retryWrites=true&w=majority
```

## Steps to Fix

### Step 1: Verify Database Username and Password

1. In MongoDB Atlas, go to **"Database Access"**
2. Find your database user (likely `kellyharrisoninfo`)
3. Verify the password matches: `1gNy7ZxN8VoQHDE9`
4. If password is different, either:
   - Update the connection string with correct password, OR
   - Reset the password in Database Access

### Step 2: Check Network Access (CRITICAL!)

1. In MongoDB Atlas, go to **"Network Access"**
2. Click **"Add IP Address"**
3. Add `0.0.0.0/0` (allows all IPs) - **REQUIRED for Render**
4. Click **"Confirm"**
5. Wait 1-2 minutes for changes to propagate

### Step 3: Update Render Environment Variable

1. Go to **Render Dashboard** → Your Backend Service
2. Click **"Environment"** tab
3. Find `MONGODB_URI` variable
4. Update it with the complete connection string from above
5. Make sure it includes:
   - Username
   - Password
   - Hostname: `f2d.i5afjk2.mongodb.net`
   - Database name: `stealth_vault`
   - Parameters: `?retryWrites=true&w=majority`
6. Click **"Save Changes"**
7. Render will automatically redeploy

### Step 4: Verify Connection

After updating, check Render logs:
1. Go to Render → Your Service → **"Logs"**
2. Look for: `✅ MongoDB connection initialized for database: stealth_vault`
3. If you see errors, check the error message for details

## Quick Checklist

- [ ] Got connection string from "F2D" cluster "Connect" button
- [ ] Verified database username in Database Access
- [ ] Verified database password matches
- [ ] Added `0.0.0.0/0` to Network Access
- [ ] Updated `MONGODB_URI` in Render with complete connection string
- [ ] Waited 1-2 minutes after Network Access changes
- [ ] Checked Render logs for connection success

## Common Issues

### Issue: "Authentication failed"
**Solution**: Verify username and password in Database Access match the connection string

### Issue: "Connection timeout"
**Solution**: Ensure `0.0.0.0/0` is added to Network Access

### Issue: "DNS query name does not exist"
**Solution**: Verify hostname `f2d.i5afjk2.mongodb.net` is correct (from Connect modal)

## Test Connection Locally (Optional)

You can test the connection locally before deploying:

```bash
cd backend
python test_mongodb_connection.py
```

This will test both PyMongo and MongoEngine connections.

