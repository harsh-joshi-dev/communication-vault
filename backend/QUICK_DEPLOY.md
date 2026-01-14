# Quick Deploy to Render

## Fast Setup (5 minutes)

### 1. Push to GitHub
```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### 2. Create Render Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select your repository

### 3. Configure Service

**Settings:**
- **Name**: `stealth-vault-backend`
- **Environment**: `Python 3`
- **Root Directory**: `backend` (important!)
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn --config gunicorn_config.py app:app`

### 4. Set Environment Variables

Click "Environment" tab and add:

```
SECRET_KEY=<generate-random-string>
JWT_SECRET_KEY=<generate-random-string>
MONGODB_URI=<your-mongodb-connection-string>
```

**Generate keys:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. Deploy!

Click "Create Web Service" and wait for deployment.

### 6. Get Your URL

After deployment, you'll get a URL like:
`https://stealth-vault-backend.onrender.com`

### 7. Test

Visit: `https://your-app.onrender.com/api/health`

Should return: `{"status": "ok", ...}`

### 8. Update Frontend

Update API URLs in your React Native app to use:
`https://your-app.onrender.com/api`

## Important Notes

⚠️ **File Storage**: Render's file system is temporary. Files are lost on restart.
   - For production, use AWS S3 (configure in environment variables)

⚠️ **Free Tier**: 
   - App sleeps after 15 minutes of inactivity
   - WebSocket support is limited
   - Consider upgrading for production

✅ **What Works**:
   - All API endpoints
   - MongoDB connection
   - Authentication
   - Real-time chat (with limitations on free tier)

## Troubleshooting

**Build fails?**
- Check build logs
- Ensure `requirements.txt` is in `backend/` folder
- Verify Python version (3.11.0)

**App crashes?**
- Check logs in Render Dashboard
- Verify MongoDB URI is correct
- Check all environment variables are set

**Can't connect?**
- Verify MongoDB allows connections from Render IPs
- Check CORS settings
- Test health endpoint first

## Next Steps

1. Set up MongoDB Atlas (if not done)
2. Configure S3 for file storage (recommended)
3. Set up custom domain (optional)
4. Enable auto-deploy from Git
5. Set up monitoring

