# Stealth Vault App

A dual-purpose React Native application that appears as a normal utility app but functions as a secure messaging and private vault system.

## Features

### 🎭 Theme Disguise System
- 6 different themes (GST Calculator, EMI Calculator, Photo App, Notes, File Scanner, Weather)
- Each theme has unique icon, name, and UI
- Secret unlock triggers for each theme

### 🔐 Security Features
- Hidden access via secret triggers (sliders, tap sequences, long press, shake)
- App password protection
- Fake password mode (shows dummy data)
- Break-in alert with selfie capture
- Auto-lock functionality
- Screenshot blocking
- Screen recording detection

### 💬 Chat System
- One-to-one encrypted messaging
- Text, images, videos, voice notes, documents
- View-once messages
- Auto-delete messages
- Chat request system

### 📱 Contact Management
- Access phone contacts
- QR code scanning for adding contacts
- App-only contacts (not saved to phone)
- Invite system for non-app users

### 🗄️ Vault System
- Private gallery for photos, videos, documents
- Storage limits (1GB free, higher for premium)
- Export functionality
- Everything stored in app sandbox (not visible in phone gallery)

### 📞 Voice & Video Calls
- End-to-end encrypted calls
- Call history (not visible in phone logs)
- Ad support for free users

### ☁️ Backup & Restore
- Local backup
- Cloud backup (Google Drive)
- Selective backup (chats, vault, or both)

### 💰 Monetization
- Free plan: 1GB storage, ads during calls
- Premium plan: No ads, higher storage, advanced features

## Setup Instructions

### Prerequisites
- Node.js >= 18
- React Native development environment set up
- Android Studio (for Android)
- Xcode (for iOS)

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **iOS Setup:**
```bash
cd ios
pod install
cd ..
```

3. **Android Setup:**
   - Open `android/app/build.gradle` and configure your app
   - Update package name in `AndroidManifest.xml`

4. **Configure Native Modules:**
   - Some modules require native configuration
   - Follow individual package documentation for setup

### Running the App

**Android:**
```bash
npm run android
```

**iOS:**
```bash
npm run ios
```

## Project Structure

```
src/
├── contexts/          # React contexts (Theme, Auth, Security)
├── navigation/         # Navigation setup
├── screens/           # All screens
│   ├── onboarding/   # First-time setup screens
│   ├── auth/         # Login/unlock screens
│   ├── themes/       # Theme disguise screens
│   └── main/         # Main app screens
├── services/          # Business logic services
├── themes/            # Theme configurations
├── types/             # TypeScript types
└── utils/             # Utility functions
```

## Important Notes

### Backend Integration
This app requires a backend server for:
- User authentication
- Chat messaging (WebSocket/Socket.io)
- Contact discovery
- Backup/restore
- OTP verification

Update the API base URL in `src/services/AuthService.ts`

### Permissions Required
- Contacts (read/write)
- Camera
- Microphone
- Storage
- Phone state

### Security Considerations
- All sensitive data is encrypted using `react-native-encrypted-storage`
- Passwords should be hashed on the backend
- Implement proper E2E encryption for messages
- Use secure WebSocket connections (WSS)

## Development Status

✅ Completed:
- Project structure
- Theme system
- Onboarding flow
- Basic UI screens
- Navigation structure
- Security context setup

🚧 In Progress:
- Backend integration
- Real-time messaging
- Voice/video calls
- Cloud backup

## Next Steps

1. Set up backend API
2. Implement WebSocket for real-time chat
3. Add native modules for advanced features
4. Configure app icons and splash screens for each theme
5. Set up Google Drive API for backup
6. Implement in-app purchases for premium
7. Add analytics and crash reporting

## License

Private - All rights reserved

