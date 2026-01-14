# Render Deployment Guide

This guide will help you deploy the Stealth Vault Backend to Render.

## Prerequisites

1. A Render account (sign up at https://render.com)
2. A MongoDB database (MongoDB Atlas recommended)
3. Your repository pushed to GitHub/GitLab/Bitbucket

## Step 1: Prepare Your Repository

Make sure your `backend` folder contains:
- `requirements.txt` ✅
- `app.py` ✅
- `gunicorn_config.py` ✅
- `render.yaml` ✅ (optional, for automated setup)

## Step 2: Create MongoDB Database

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Get your connection string (MONGODB_URI)
5. Whitelist Render's IP addresses (or use 0.0.0.0/0 for development)

## Step 3: Deploy on Render

### Option A: Using Render Dashboard

1. **Create New Web Service**
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your repository

2. **Configure Service**
   - **Name**: `stealth-vault-backend`
   - **Environment**: `Python 3`
   - **Build Command**: `cd backend && pip install -r requirements.txt`
   - **Start Command**: `cd backend && gunicorn --config gunicorn_config.py app:app`

3. **Set Environment Variables**
   Add these in Render Dashboard → Environment:
   ```
   SECRET_KEY=<generate-a-random-string>
   JWT_SECRET_KEY=<generate-a-random-string>
   MONGODB_URI=<your-mongodb-connection-string>
   PORT=5000
   LOG_LEVEL=info
   ```

### Option B: Using render.yaml (Automated)

1. Push `render.yaml` to your repository
2. In Render Dashboard, select "New +" → "Blueprint"
3. Connect your repository
4. Render will automatically detect and use `render.yaml`

## Step 4: Required Environment Variables

Set these in Render Dashboard → Environment:

### Required:
- `SECRET_KEY` - Flask secret key (generate random string)
- `JWT_SECRET_KEY` - JWT signing key (generate random string)
- `MONGODB_URI` - Your MongoDB connection string

### Optional:
- `PORT` - Server port (default: 5000, Render sets this automatically)
- `LOG_LEVEL` - Logging level (info/debug)
- `ASYNC_MODE` - Socket.io async mode (eventlet/threading)

### For OTP Features (Optional):
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio phone number
- `MAIL_SERVER` - SMTP server
- `MAIL_PORT` - SMTP port
- `MAIL_USERNAME` - Email username
- `MAIL_PASSWORD` - Email password

## Step 5: Generate Secret Keys

You can generate secure random keys using:

```bash
# Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Or online
# Visit: https://randomkeygen.com/
```

## Step 6: Update Frontend

After deployment, update your React Native app:

1. Update API URLs in:
   - `src/services/AuthService.ts`
   - `src/services/ChatService.ts`
   - `src/services/MediaService.ts`

2. Change from:
   ```typescript
   const API_BASE_URL = __DEV__
     ? 'http://192.168.1.16:5001/api'
     : 'https://your-api-domain.com/api';
   ```

3. To:
   ```typescript
   const API_BASE_URL = __DEV__
     ? 'http://192.168.1.16:5001/api'
     : 'https://your-render-app.onrender.com/api';
   ```

## Step 7: Test Deployment

1. Visit: `https://your-app.onrender.com/api/health`
2. Should return: `{"status": "ok", "message": "Server is running"}`

## Important Notes

### File Storage
- Render's file system is **ephemeral** - files are lost on restart
- For production, use **AWS S3** or similar for file storage
- Update `config.py` to use S3 for uploads

### WebSocket Support
- Render supports WebSockets on paid plans
- Free tier has limitations
- Socket.io will work but may have connection issues on free tier

### Scaling
- Free tier: 1 instance
- Starter plan: Better performance, more reliable
- For production: Use paid plan with Redis for Socket.io scaling

### Health Checks
- Render automatically checks `/` endpoint
- Our health check is at `/api/health`
- Configure in Render Dashboard → Settings → Health Check Path: `/api/health`

## Troubleshooting

### Build Fails
- Check build logs in Render Dashboard
- Ensure all dependencies are in `requirements.txt`
- Check Python version compatibility

### App Crashes
- Check logs in Render Dashboard
- Verify MongoDB connection string
- Check environment variables are set correctly

### Socket.io Not Working
- Verify WebSocket support on your plan
- Check CORS settings
- Ensure `ASYNC_MODE=eventlet` is set

### Files Not Persisting
- Use S3 or similar cloud storage
- Don't rely on local file system on Render

## Production Checklist

- [ ] Set strong SECRET_KEY and JWT_SECRET_KEY
- [ ] Use MongoDB Atlas (not local MongoDB)
- [ ] Configure S3 for file storage
- [ ] Set up proper CORS origins (not *)
- [ ] Enable HTTPS (automatic on Render)
- [ ] Set up monitoring/logging
- [ ] Configure Redis for Socket.io scaling
- [ ] Set up database backups
- [ ] Test all endpoints
- [ ] Update frontend API URLs

## Support

For issues:
1. Check Render logs
2. Check MongoDB connection
3. Verify environment variables
4. Test locally first

