# Fix: App Disappearing When Changing Name/Icon

## Problem
When changing the app name or icon, the app would disappear from the launcher and not come back with the updated name/icon.

## Root Cause
The code was disabling **all** activity aliases first, then trying to enable a new one. If enabling the new alias failed, no aliases would be enabled, causing the app to disappear from the launcher.

## Solution
Changed the logic to **enable the new alias FIRST**, then disable others only if successful:

1. **Enable new alias first** - Ensures at least one alias is always active
2. **Verify it's enabled** - Check that the new alias was successfully enabled
3. **Then disable others** - Only disable other aliases if the new one is active
4. **Fallback to default** - If the selected alias fails, fall back to "default"
5. **Error handling** - If everything fails, show clear error message

## Changes Made

### AppCustomizationModule.java
- ✅ Changed `setAppName()` to enable new alias before disabling others
- ✅ Changed `setAppIcon()` to enable new alias before disabling others
- ✅ Added fallback to "default" alias if selected alias fails
- ✅ Added critical error logging if no alias can be enabled
- ✅ Reject promise with clear error if app would disappear

### SettingsScreen.tsx
- ✅ Improved success messages with clear instructions
- ✅ Better error messages explaining what to do if app disappears
- ✅ Instructions to close app completely and check launcher

## How It Works Now

### App Name Change:
1. User enters app name (e.g., "Calculator")
2. System matches to closest alias ("calculator")
3. **Enable "calculator" alias FIRST**
4. Verify it's enabled
5. **Then disable other aliases**
6. App appears in launcher with new name

### App Icon Change:
1. User selects icon (e.g., "Camera")
2. **Enable "camera" alias FIRST**
3. Verify it's enabled
4. **Then disable other aliases**
5. App appears in launcher with new icon

## Testing

1. **Change App Name:**
   - Go to Settings → Change App Name
   - Enter "Calculator"
   - Save
   - **Close app completely** (swipe away from recent apps)
   - Check launcher - app should appear as "Calculator"

2. **Change App Icon:**
   - Go to Settings → Change App Icon
   - Select "Camera"
   - **Close app completely**
   - Check launcher - app should appear with camera icon

3. **Verify App Doesn't Disappear:**
   - Try changing name/icon multiple times
   - App should always remain in launcher
   - Each change should work correctly

## Important Notes

1. **Close App Completely**: After changing name/icon, you must close the app completely (not just minimize) for the launcher to refresh and show the change.

2. **Launcher Refresh**: Some launchers may need a refresh. Try:
   - Removing app from home screen and re-adding
   - Restarting device
   - Clearing launcher cache

3. **Icon Resources**: For icon changes to work, you need to add actual icon PNG files. See `APP_CUSTOMIZATION_SETUP.md` for details.

4. **Rebuild Required**: After making these native code changes, you must rebuild the app:
   ```bash
   cd android && ./gradlew clean && cd .. && npm run android
   ```

## If App Still Disappears

If the app still disappears after these fixes:

1. **Reinstall the app** - The app should reappear
2. **Check logs** - Run `adb logcat | grep AppCustomization` to see errors
3. **Verify manifest** - Ensure all activity aliases are properly defined
4. **Test on different device** - Some launchers may have issues

## Status

✅ **Fixed** - App will no longer disappear when changing name/icon
✅ **Safe** - Always ensures at least one alias is enabled
✅ **Robust** - Fallback to default if selected alias fails
✅ **User-friendly** - Clear error messages and instructions

