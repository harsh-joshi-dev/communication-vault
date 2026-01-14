# Running on Android 📱

## Prerequisites

1. **Java Development Kit (JDK)**
   - Install JDK 11 or higher
   - Set `JAVA_HOME` environment variable

2. **Android Studio**
   - Download and install Android Studio
   - Install Android SDK (API 33)
   - Install Android SDK Build Tools

3. **Android Device or Emulator**
   - Physical device with USB debugging enabled
   - OR Android Emulator (via Android Studio)

4. **Environment Variables**
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   ```

## Quick Start

### Step 1: Install Dependencies

```bash
# Install Node modules
npm install

# For iOS (if needed later)
cd ios && pod install && cd ..
```

### Step 2: Start Metro Bundler

```bash
npm start
```

Keep this terminal running.

### Step 3: Run on Android

**Option A: Using npm script**
```bash
npm run android
```

**Option B: Using React Native CLI**
```bash
npx react-native run-android
```

**Option C: Using Android Studio**
1. Open `android/` folder in Android Studio
2. Wait for Gradle sync
3. Click "Run" button or press `Shift+F10`

## Troubleshooting

### Issue: "SDK location not found"
**Solution:**
```bash
# Create local.properties in android/ folder
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

### Issue: "Gradle build failed"
**Solution:**
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Issue: "Metro bundler not found"
**Solution:**
```bash
# Start Metro in a separate terminal
npm start

# Then run Android in another terminal
npm run android
```

### Issue: "Device not found"
**Solution:**
```bash
# Check connected devices
adb devices

# If no devices, enable USB debugging on your phone:
# Settings > Developer Options > USB Debugging
```

### Issue: "Port 8081 already in use"
**Solution:**
```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use different port
npm start -- --port 8082
```

## Running on Physical Device

1. **Enable Developer Options:**
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times

2. **Enable USB Debugging:**
   - Settings > Developer Options > USB Debugging

3. **Connect Device:**
   ```bash
   # Check if device is detected
   adb devices
   
   # Should show your device
   ```

4. **Run App:**
   ```bash
   npm run android
   ```

## Running on Emulator

1. **Open Android Studio**
2. **Open AVD Manager:**
   - Tools > Device Manager
   - Or click the device icon in toolbar

3. **Create Virtual Device:**
   - Click "Create Device"
   - Choose device (e.g., Pixel 5)
   - Choose system image (API 33 recommended)
   - Finish setup

4. **Start Emulator:**
   - Click play button next to your device

5. **Run App:**
   ```bash
   npm run android
   ```

## Build Commands

### Debug Build
```bash
npm run android
```

### Release Build
```bash
cd android
./gradlew assembleRelease
```

APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

## Hot Reload

- Press `R` twice in Metro bundler to reload
- Press `M` to open developer menu on device
- Shake device to open developer menu

## Debugging

1. **Open Developer Menu:**
   - Shake device
   - Or `adb shell input keyevent 82`

2. **Enable Remote JS Debugging:**
   - Developer Menu > Debug

3. **View Logs:**
   ```bash
   npx react-native log-android
   ```

## Common Commands

```bash
# Clean build
cd android && ./gradlew clean && cd ..

# Clear Metro cache
npm start -- --reset-cache

# Rebuild everything
rm -rf node_modules
npm install
cd android && ./gradlew clean && cd ..
npm run android
```

## Network Configuration

If backend is on localhost, update API URLs:

**For Physical Device:**
- Use your computer's IP address instead of `localhost`
- Find IP: `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows)
- Update in `src/services/AuthService.ts` and `ChatService.ts`

**Example:**
```typescript
const API_BASE_URL = __DEV__
  ? 'http://192.168.1.100:5000/api'  // Your computer's IP
  : 'https://your-api-domain.com/api';
```

## Success! 🎉

If everything works, you should see:
- Metro bundler running
- App building in terminal
- App launching on device/emulator
- App showing onboarding screen

## Next Steps

1. Test all features
2. Check permissions (contacts, camera, etc.)
3. Test backend connection
4. Test theme switching
5. Test unlock triggers

Happy coding! 🚀

