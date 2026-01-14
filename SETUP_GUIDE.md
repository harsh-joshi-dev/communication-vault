# Setup Guide - Stealth Vault App

## What Has Been Created

I've built a comprehensive React Native application with the following structure:

### ✅ Completed Components

1. **Project Foundation**
   - Complete React Native project structure
   - TypeScript configuration
   - Navigation setup (Stack & Tabs)
   - Context providers (Theme, Auth, Security)

2. **Theme System (6 Themes)**
   - GST Calculator
   - EMI Calculator  
   - Photo Effects App
   - Notes & To-Do App
   - PDF Scanner
   - Weather Forecast

3. **Onboarding Flow**
   - Theme selection screen
   - Unlock guide screen
   - Signup with username availability check
   - OTP verification
   - Password setup (with fake password option)
   - Backup preferences

4. **Authentication**
   - Login screen
   - Unlock screen (theme-based)
   - Security context with auto-lock

5. **Main App Screens**
   - Chats screen
   - Vault/Gallery screen
   - Contacts screen
   - Settings screen

6. **Services**
   - Storage service (encrypted)
   - Auth service
   - Security service
   - Camera service
   - Chat service (Socket.io ready)
   - Vault service

7. **Platform Configuration**
   - Android manifest with permissions
   - iOS Info.plist with permissions
   - Build configurations

## What You Need to Do

### 1. Install Dependencies

```bash
npm install
```

For iOS:
```bash
cd ios && pod install && cd ..
```

### 2. Backend Setup Required

The app needs a backend server for:
- User authentication and signup
- OTP generation and verification
- Real-time chat (WebSocket/Socket.io)
- Contact discovery
- Message storage
- Backup/restore

**Update API URL in:**
- `src/services/AuthService.ts` (line 6)
- `src/services/ChatService.ts` (line 5)

### 3. Native Module Setup

Some packages require additional native configuration:

**For Android:**
- Update `android/app/build.gradle` with your package name
- Configure signing keys for release builds

**For iOS:**
- Update bundle identifier in Xcode
- Configure signing certificates

### 4. Missing Native Modules

Some packages may need additional setup:
- `react-native-screenshot-prevent` - May need custom native code
- `react-native-device-motion` - For shake detection
- `react-native-camera` - May need to use `react-native-vision-camera` instead

### 5. App Icons & Splash Screens

You need to create:
- App icons for each theme (6 different icons)
- Splash screens for each theme
- Update `android/app/src/main/res/` and `ios/` assets

### 6. Google Drive Integration

For backup feature:
- Set up Google Cloud project
- Enable Google Drive API
- Configure OAuth credentials
- Update `react-native-google-signin` configuration

### 7. In-App Purchases

For premium features:
- Configure App Store Connect (iOS)
- Configure Google Play Console (Android)
- Set up product IDs
- Implement purchase flow in Settings screen

### 8. Testing

Before running:
1. Ensure all permissions are properly configured
2. Test on both Android and iOS devices
3. Verify theme switching works
4. Test unlock triggers
5. Test contact access

## Running the App

### Development

```bash
# Start Metro bundler
npm start

# Run Android
npm run android

# Run iOS
npm run ios
```

### Production Build

**Android:**
```bash
cd android
./gradlew assembleRelease
```

**iOS:**
- Open `ios/StealthVaultApp.xcworkspace` in Xcode
- Archive and distribute

## Important Notes

1. **Security**: 
   - Passwords are currently stored in plain text for development
   - Implement proper hashing on backend
   - Use secure WebSocket (WSS) in production

2. **Permissions**:
   - All required permissions are declared
   - Request permissions at runtime using `react-native-permissions`

3. **Storage**:
   - Vault files are stored in app sandbox
   - Not accessible from phone gallery
   - Consider encryption for sensitive files

4. **Theme Icons**:
   - You need to create 6 different app icons
   - Consider using dynamic app icon feature (iOS 10.3+)
   - Android requires separate app variants or dynamic shortcuts

## Next Development Steps

1. **Backend Development**
   - Create REST API
   - Set up Socket.io server
   - Implement user authentication
   - Build contact discovery system

2. **Real-time Features**
   - Complete chat implementation
   - Add voice/video call functionality
   - Implement WebRTC for calls

3. **Advanced Features**
   - E2E encryption for messages
   - Cloud backup implementation
   - Premium subscription flow
   - Ad integration

4. **Polish**
   - Add loading states
   - Error handling
   - Animations
   - Dark mode support

## Support

If you encounter issues:
1. Check React Native version compatibility
2. Verify all native modules are properly linked
3. Check platform-specific requirements
4. Review console logs for errors

## Folder Structure Reference

```
stealth_vaultapp/
├── android/              # Android native code
├── ios/                  # iOS native code
├── src/
│   ├── contexts/         # React contexts
│   ├── navigation/      # Navigation config
│   ├── screens/         # All screens
│   ├── services/        # Business logic
│   ├── themes/          # Theme configs
│   ├── types/           # TypeScript types
│   └── App.tsx          # Root component
├── package.json
└── README.md
```

Good luck with your app development! 🚀

