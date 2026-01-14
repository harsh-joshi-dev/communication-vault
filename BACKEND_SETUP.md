# Backend Setup Guide

## ✅ Complete Python Backend Created!

I've created a complete Python Flask backend with Socket.io for real-time chat.

## 📁 Backend Structure

```
backend/
├── app.py                 # Main Flask app with Socket.io
├── config.py             # Configuration settings
├── models.py             # Database models (User, Chat, Message, etc.)
├── routes/               # API routes
│   ├── auth.py          # Authentication endpoints
│   ├── users.py         # User management
│   ├── messages.py      # Chat messages
│   ├── contacts.py      # Contacts management
│   ├── vault.py         # Vault file storage
│   └── backup.py        # Backup/restore
├── socket_handlers.py    # Socket.io event handlers
├── utils/
│   └── otp_service.py   # OTP sending (Email/SMS)
├── requirements.txt      # Python dependencies
└── README.md            # Backend documentation
```

## 🚀 Quick Start

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Set Up Environment Variables

Create a `.env` file in the `backend/` folder:

```bash
# Required
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here

# Optional (for OTP)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
```

### 3. Run the Server

```bash
python app.py
```

Server will run on `http://localhost:5000`

## 📡 What the Backend Does

### ✅ Authentication
- User signup with validation
- Login with JWT tokens
- Username availability check
- OTP generation and verification (Email/SMS)
- Token refresh

### ✅ Real-Time Chat
- Socket.io server for real-time messaging
- Message storage in database
- Chat rooms
- Typing indicators
- Online status

### ✅ Data Storage
- **Users** - All user accounts and settings
- **Chats** - Chat conversations
- **Messages** - All chat messages (text, images, videos, voice, documents)
- **Contacts** - App contacts
- **Vault Items** - Files stored in vault
- **OTPs** - OTP records

### ✅ File Storage
- Vault files stored in `uploads/vault/`
- Chat media in `uploads/chat_media/`
- Storage limit enforcement
- File type validation

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/check-username` - Check username
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP

### Messages
- `GET /api/messages/chats` - Get all chats
- `GET /api/messages/chats/<id>/messages` - Get messages
- `POST /api/messages/chats/<id>/messages` - Send message
- `POST /api/messages/chats` - Create chat

### Contacts
- `GET /api/contacts` - Get contacts
- `POST /api/contacts` - Add contact
- `GET /api/contacts/qr-code` - Get QR code

### Vault
- `GET /api/vault/items` - Get vault items
- `POST /api/vault/items` - Upload file
- `DELETE /api/vault/items/<id>` - Delete item

## 🔄 Socket.io Events

**Client → Server:**
- `connect` - Connect with token
- `join_chat` - Join chat room
- `send_message` - Send message
- `typing` - Typing indicator

**Server → Client:**
- `connected` - Connection confirmed
- `new_message` - New message
- `user_typing` - User typing

## 📱 Connect React Native App

The React Native app is already configured to connect to:
- Development: `http://localhost:5000`
- Production: Update in `src/services/AuthService.ts` and `src/services/ChatService.ts`

## 🗄️ Database

- **Default**: SQLite (for development)
- **Production**: PostgreSQL recommended

To use PostgreSQL:
```bash
DATABASE_URL=postgresql://user:password@localhost/stealth_vault
```

## 📝 What You Need to Provide

### Required (for basic functionality):
1. **Secret Keys** - Generate random strings for `SECRET_KEY` and `JWT_SECRET_KEY`

### Optional (for OTP):
2. **Twilio Account** - For SMS OTP
   - Sign up at https://www.twilio.com
   - Get Account SID, Auth Token, Phone Number

3. **Email Service** - For Email OTP
   - Gmail with App Password
   - Or any SMTP service

### Optional (for production):
4. **PostgreSQL Database**
5. **Redis** (for scaling Socket.io)
6. **AWS S3** (for cloud file storage)
7. **Google Drive API** (for backup)

## 🧪 Testing

1. Start the backend:
```bash
cd backend
python app.py
```

2. Test health endpoint:
```bash
curl http://localhost:5000/api/health
```

3. Test signup:
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "mobile": "+1234567890",
    "username": "testuser",
    "password": "password123"
  }'
```

## 🎯 Next Steps

1. **Install dependencies**: `pip install -r requirements.txt`
2. **Set up `.env` file** with your keys
3. **Run the server**: `python app.py`
4. **Test with React Native app** - it should connect automatically

The backend is **fully functional** and ready to use! 🚀

