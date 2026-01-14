# Fix: App Name and Icon Change Not Working

## Why It's Not Working

The app name and icon change feature is **not working** because:

1. **Native Module Not Loaded**: The app needs to be **rebuilt** after adding native modules. The logs show "AppCustomization module not available" which means the native code hasn't been compiled into the app yet.

2. **Missing Icon Resources**: All activity aliases are using the same default icon (`@android:drawable/ic_menu_myplaces`). You need to add actual icon files for each alias.

3. **App Not Rebuilt**: After making changes to native Java code, you must do a full rebuild, not just a hot reload.

## Quick Fix Steps

### Step 1: Rebuild the App
```bash
# Option 1: Use the rebuild script
./scripts/rebuild-app-customization.sh

# Option 2: Manual rebuild
cd android
./gradlew clean
cd ..
npm run android
```

### Step 2: Verify Module is Loaded
After rebuilding, check the logs:
```bash
adb logcat | grep AppCustomization
```

You should see logs like:
```
AppCustomization: Successfully enabled alias: calculator
```

If you still see "AppCustomization module not available", the rebuild didn't work. Try:
1. Uninstall the app completely
2. Clean build: `cd android && ./gradlew clean && cd ..`
3. Rebuild: `npm run android`

### Step 3: Add Icon Resources (Required for Icon Change)

The icon change feature requires actual icon files. Currently all aliases use the same default icon.

**Create icon files** for each alias:
- `ic_launcher_calculator.png`
- `ic_launcher_camera.png`
- `ic_launcher_notes.png`
- `ic_launcher_weather.png`
- `ic_launcher_scanner.png`

Place them in:
```
android/app/src/main/res/mipmap-*/ic_launcher_*.png
```

See `APP_CUSTOMIZATION_SETUP.md` for detailed instructions.

### Step 4: Update AndroidManifest.xml

After adding icons, update the manifest to reference them:
```xml
<activity-alias
    android:name=".MainActivity.calculator"
    android:icon="@mipmap/ic_launcher_calculator"
    ... />
```

## How to Test

1. **Rebuild the app** (Step 1)
2. Open the app
3. Go to **Settings → App Customization**
4. Try **Change App Name** - enter "Calculator" or "Camera"
5. Try **Change App Icon** - select an icon
6. **Close the app completely** (not just minimize)
7. Check your **launcher/home screen**
8. The app name/icon should have changed

## Current Limitations

### App Name Change
- ✅ Works with predefined names: Calculator, Camera, Notes, Weather, Scanner
- ❌ Custom names (like "My App") won't change the launcher name
- ℹ️ Custom names are saved but matched to closest predefined alias

### App Icon Change
- ✅ Works if icon resources are added
- ❌ Currently all icons are the same (default icon)
- ℹ️ Need to add actual icon PNG files for each alias

## Why This Approach?

Android doesn't allow truly dynamic app name/icon changes without:
- Root access (not practical)
- App rebuild (defeats the purpose)
- Activity aliases (what we're using - requires predefined options)

**Activity Aliases** are the best solution because:
- ✅ No root required
- ✅ Works on all Android devices
- ✅ Changes are immediate (after launcher refresh)
- ✅ Multiple users can have different icons/names
- ❌ Limited to predefined options

## Making It a Feature

To make this a **real feature** for your users:

1. **Add More Predefined Options**
   - Add more activity aliases for common app names
   - Create icon sets for different themes/styles
   - Let users choose from a curated list

2. **Add Icon Resources**
   - Create 5-10 different icon designs
   - Place them in mipmap folders
   - Update manifest to reference them

3. **Improve UX**
   - Show icon previews in the selection screen
   - Add more app name options
   - Provide clear instructions

4. **Test Thoroughly**
   - Test on different Android versions
   - Test on different launchers
   - Verify changes persist after app restart

## Next Steps

1. ✅ **Rebuild the app** - This will make the module available
2. ⏳ **Add icon resources** - Create actual icon files
3. ⏳ **Test the feature** - Verify it works after rebuild
4. ⏳ **Add more options** - Expand predefined aliases

## Support

If it still doesn't work after rebuilding:
1. Check `APP_CUSTOMIZATION_SETUP.md` for detailed setup
2. Verify `MainApplication.java` includes `AppCustomizationPackage`
3. Check Android logs for errors
4. Ensure you're testing on a physical device (emulator may have issues)

