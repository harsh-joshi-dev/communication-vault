# Render Deployment - Complete Guide

## 🚀 Quick Start

1. **Push code to GitHub**
2. **Create Render Web Service**
3. **Set environment variables**
4. **Deploy!**

See `QUICK_DEPLOY.md` for step-by-step instructions.

## 📋 Files Created for Render

- `gunicorn_config.py` - Production server configuration
- `Procfile` - Process file for Render
- `render.yaml` - Blueprint configuration (optional)
- `runtime.txt` - Python version specification
- `build.sh` - Build script (optional)

## ⚙️ Configuration

### Required Environment Variables

```bash
SECRET_KEY=<random-32-char-string>
JWT_SECRET_KEY=<random-32-char-string>
MONGODB_URI=<mongodb-connection-string>
```

### Optional Environment Variables

```bash
PORT=5000                    # Auto-set by Render
LOG_LEVEL=info              # info, debug, warning, error
WORKERS=2                    # Number of worker processes
ASYNC_MODE=eventlet          # eventlet or threading
```

## 🔧 Render Dashboard Settings

### Basic Settings
- **Name**: `stealth-vault-backend`
- **Environment**: `Python 3`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your default branch)
- **Root Directory**: `backend` ⚠️ **IMPORTANT**

### Build & Deploy
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn --config gunicorn_config.py app:app`

### Health Check
- **Health Check Path**: `/api/health`

## 📁 Project Structure

```
backend/
├── app.py                  # Main application
├── config.py               # Configuration
├── gunicorn_config.py      # Gunicorn config
├── Procfile                # Process file
├── requirements.txt        # Dependencies
├── runtime.txt             # Python version
├── render.yaml             # Blueprint (optional)
└── routes/                 # API routes
```

## 🗄️ Database Setup

### MongoDB Atlas (Recommended)

1. Create account at https://www.mongodb.com/cloud/atlas
2. Create free cluster
3. Create database user
4. Get connection string
5. Whitelist IP: `0.0.0.0/0` (for development) or Render IPs

**Connection String Format:**
```
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

## 📤 File Storage Warning

⚠️ **IMPORTANT**: Render's file system is **ephemeral**. Files are deleted on:
- App restart
- Deployment
- Service restart

### Solution: Use AWS S3

1. Create S3 bucket
2. Set environment variables:
   ```
   AWS_ACCESS_KEY_ID=<your-key>
   AWS_SECRET_ACCESS_KEY=<your-secret>
   AWS_BUCKET_NAME=<bucket-name>
   AWS_REGION=us-east-1
   ```
3. Update code to use S3 for uploads (future enhancement)

## 🔌 WebSocket Support

- **Free Tier**: Limited WebSocket support
- **Paid Tier**: Full WebSocket support
- Socket.io will work but may have connection issues on free tier

## 📊 Monitoring

### View Logs
- Render Dashboard → Your Service → Logs
- Real-time logs available
- Download logs for analysis

### Metrics
- CPU usage
- Memory usage
- Request count
- Response times

## 🔒 Security Checklist

- [ ] Strong SECRET_KEY (32+ characters)
- [ ] Strong JWT_SECRET_KEY (32+ characters)
- [ ] MongoDB with strong password
- [ ] CORS configured (not `*` in production)
- [ ] HTTPS enabled (automatic on Render)
- [ ] Environment variables secured
- [ ] No secrets in code

## 🐛 Common Issues

### Issue: Build Fails
**Solution**: 
- Check `requirements.txt` exists
- Verify Python version in `runtime.txt`
- Check build logs for errors

### Issue: App Crashes on Start
**Solution**:
- Check MongoDB connection string
- Verify all required env vars are set
- Check logs for error messages

### Issue: 502 Bad Gateway
**Solution**:
- Check if app is running (logs)
- Verify start command is correct
- Check health endpoint works

### Issue: Files Not Persisting
**Solution**:
- Use S3 or similar cloud storage
- Don't rely on local file system

## 📈 Scaling

### Free Tier
- 1 instance
- 512MB RAM
- Sleeps after 15 min inactivity

### Starter Plan ($7/month)
- Better performance
- No sleep
- More reliable WebSockets

### Standard Plan ($25/month)
- Auto-scaling
- Better for production

## 🔄 Auto-Deploy

Enable in Render Dashboard:
- Settings → Auto-Deploy
- Deploys on every push to main branch

## 📝 Testing After Deployment

1. **Health Check**: `GET /api/health`
2. **Signup**: `POST /api/auth/signup`
3. **Login**: `POST /api/auth/login`
4. **Get Chats**: `GET /api/messages/chats`

## 🆘 Support

- Render Docs: https://render.com/docs
- Render Status: https://status.render.com
- Check logs first for errors

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Render service created
- [ ] Root directory set to `backend`
- [ ] Build command set
- [ ] Start command set
- [ ] Environment variables set
- [ ] MongoDB configured
- [ ] Health check path set
- [ ] Tested health endpoint
- [ ] Updated frontend API URLs
- [ ] Tested authentication
- [ ] Tested chat functionality

