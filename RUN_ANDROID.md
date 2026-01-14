# 🚀 Run on Android - Quick Guide

## Step 1: Install Dependencies

```bash
npm install --legacy-peer-deps
```

## Step 2: Start Metro Bundler

Open a terminal and run:
```bash
npm start
```

Keep this running!

## Step 3: Run on Android

Open another terminal and run:
```bash
npm run android
```

## Prerequisites Checklist

✅ **Java JDK 11+** installed
✅ **Android Studio** installed
✅ **Android SDK** (API 33) installed
✅ **Android Emulator** running OR **Physical device** connected with USB debugging

## Quick Setup

### If you get "SDK not found" error:

```bash
# Create local.properties
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

### If build fails:

```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Check connected devices:

```bash
adb devices
```

## Network Setup (for Backend)

If running backend on localhost, update API URLs in:
- `src/services/AuthService.ts`
- `src/services/ChatService.ts`

Change `localhost` to your computer's IP:
```typescript
const API_BASE_URL = __DEV__
  ? 'http://192.168.1.XXX:5000/api'  // Your IP
  : 'https://your-api-domain.com/api';
```

Find your IP:
- Mac: `ipconfig getifaddr en0`
- Windows: `ipconfig`

## That's it! 🎉

The app should build and launch on your Android device/emulator.

For detailed troubleshooting, see `ANDROID_RUN.md`

