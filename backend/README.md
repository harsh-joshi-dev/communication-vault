# Stealth Vault App - Backend Server

Python Flask backend with Socket.io for real-time chat.

## Features

- ✅ User authentication (JWT)
- ✅ User signup/login
- ✅ OTP verification (Email/SMS)
- ✅ Real-time chat (Socket.io)
- ✅ Contact management
- ✅ Vault file storage
- ✅ Backup/restore
- ✅ Storage limits
- ✅ Privacy settings

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

**Required for basic functionality:**
- `SECRET_KEY` - Flask secret key
- `JWT_SECRET_KEY` - JWT signing key

**Optional (for OTP):**
- Twilio credentials (for SMS OTP)
- Email credentials (for Email OTP)

**Optional (for production):**
- PostgreSQL database URL
- Redis URL
- AWS S3 credentials
- Google Drive credentials

### 3. Run Database Migrations

```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```

### 4. Run the Server

**Development:**
```bash
python app.py
```

**Production:**
```bash
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 run:app
```

Or using the run script:
```bash
python run.py
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User signup
- `POST /api/auth/login` - User login
- `POST /api/auth/check-username` - Check username availability
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/refresh` - Refresh access token

### Users
- `GET /api/users/me` - Get current user
- `PUT /api/users/me` - Update current user
- `GET /api/users/search` - Search users

### Messages
- `GET /api/messages/chats` - Get all chats
- `GET /api/messages/chats/<chat_id>/messages` - Get messages
- `POST /api/messages/chats/<chat_id>/messages` - Send message
- `POST /api/messages/chats` - Create chat
- `DELETE /api/messages/messages/<message_id>` - Delete message

### Contacts
- `GET /api/contacts` - Get contacts
- `POST /api/contacts` - Add contact
- `GET /api/contacts/qr-code` - Get QR code data

### Vault
- `GET /api/vault/items` - Get vault items
- `POST /api/vault/items` - Upload file
- `DELETE /api/vault/items/<item_id>` - Delete item
- `GET /api/vault/storage` - Get storage info

### Backup
- `POST /api/backup/create` - Create backup
- `POST /api/backup/restore` - Restore backup

## Socket.io Events

### Client → Server
- `connect` - Connect with auth token
- `join_chat` - Join a chat room
- `leave_chat` - Leave a chat room
- `send_message` - Send a message
- `typing` - Typing indicator

### Server → Client
- `connected` - Connection confirmed
- `new_message` - New message received
- `user_typing` - User typing indicator
- `error` - Error message

## Database Schema

- **users** - User accounts
- **chats** - Chat conversations
- **messages** - Chat messages
- **contacts** - App contacts
- **vault_items** - Vault files
- **otps** - OTP records

## File Storage

Files are stored in:
- `uploads/vault/` - Vault items
- `uploads/chat_media/` - Chat media files

## Development Notes

- In development mode, OTP codes are printed to console if Twilio/Email not configured
- SQLite is used by default (change to PostgreSQL for production)
- Socket.io uses eventlet for async support
- JWT tokens expire after 24 hours (access) and 30 days (refresh)

## Production Deployment

1. Use PostgreSQL instead of SQLite
2. Set up Redis for Socket.io scaling
3. Use AWS S3 or similar for file storage
4. Configure proper CORS origins
5. Use environment variables for all secrets
6. Set up SSL/HTTPS
7. Use a process manager (PM2, supervisor, etc.)

## Testing

Update the React Native app to use:
- Development: `http://localhost:5000/api`
- Production: `https://your-domain.com/api`

Update in:
- `src/services/AuthService.ts`
- `src/services/ChatService.ts`

