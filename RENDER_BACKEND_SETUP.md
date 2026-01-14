# Render Backend Setup - Complete ✅

## Backend URL
**Production Backend:** `https://communication-vault.onrender.com`

## What Was Updated

### Frontend Services (All Updated ✅)
1. **AuthService.ts** - Authentication endpoints
2. **ChatService.ts** - Chat and Socket.io connections
3. **MediaService.ts** - Media upload/download endpoints
4. **QRScannerScreen.tsx** - QR code scanning API calls
5. **ChatDetailScreen.tsx** - Media URL handling

### Configuration
- All services now use `https://communication-vault.onrender.com` in production
- Development mode still uses localhost/192.168.1.16 for local testing
- Socket.io connections configured for Render backend

## How It Works

### Development Mode (`__DEV__ = true`)
- **Android Physical Device:** `http://192.168.1.16:5001`
- **Android Emulator:** `http://10.0.2.2:5001` (if needed)
- **iOS Simulator:** `http://localhost:5001`

### Production Mode (`__DEV__ = false`)
- **All Platforms:** `https://communication-vault.onrender.com`

## QR Code Scanning Flow

1. **User A** generates QR code with their `uniqueCode`
2. **User B** scans the QR code
3. Frontend extracts `uniqueCode` from QR data
4. Frontend calls: `GET https://communication-vault.onrender.com/api/contacts/by-code/{uniqueCode}`
5. Backend returns user data
6. Frontend creates contact and enables chat

## Testing Checklist

### ✅ Backend Health Check
```bash
curl https://communication-vault.onrender.com/api/health
```

### ✅ Authentication
- [ ] Sign up new user
- [ ] Login with existing user
- [ ] JWT token generation works

### ✅ QR Code Features
- [ ] Generate QR code (shows uniqueCode)
- [ ] Scan QR code from another device
- [ ] Contact added successfully after scan
- [ ] Chat can be initiated with scanned contact

### ✅ Chat Features
- [ ] Send text messages
- [ ] Send images
- [ ] Send videos
- [ ] Send audio messages
- [ ] Send documents
- [ ] Real-time message delivery
- [ ] Message status (sent, delivered, read)
- [ ] Typing indicators

### ✅ Socket.io Connection
- [ ] Socket connects to Render backend
- [ ] Real-time messages work
- [ ] Typing indicators work
- [ ] Message status updates work

## Important Notes

1. **CORS Configuration**: Backend is configured to allow all origins (`*`) for now. This works for development and testing.

2. **MongoDB Connection**: Ensure your MongoDB Atlas cluster is:
   - Running (not paused)
   - Network access configured (0.0.0.0/0 for Render)
   - Connection string is correct in Render environment variables

3. **Environment Variables on Render**:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
   SECRET_KEY=<32-char-random-string>
   JWT_SECRET_KEY=<32-char-random-string>
   PORT=5000
   LOG_LEVEL=info
   ```

4. **Socket.io on Render**: 
   - Uses eventlet worker class
   - Configured for WebSocket support
   - Should work with Render's infrastructure

## Troubleshooting

### QR Code Not Working
- Check if backend is accessible: `curl https://communication-vault.onrender.com/api/health`
- Verify `uniqueCode` is in QR data
- Check network logs in React Native debugger

### Socket.io Not Connecting
- Verify backend is running on Render
- Check Render logs for Socket.io errors
- Ensure WebSocket support is enabled on Render

### API Calls Failing
- Check CORS configuration
- Verify JWT token is being sent in headers
- Check Render logs for error messages

## Next Steps

1. **Test the app** with the new backend URL
2. **Verify QR scanning** works end-to-end
3. **Test all chat features** (text, media, audio)
4. **Monitor Render logs** for any errors
5. **Update CORS** to specific origins if needed for production

---

**Last Updated:** After Render deployment setup
**Backend URL:** `https://communication-vault.onrender.com`

