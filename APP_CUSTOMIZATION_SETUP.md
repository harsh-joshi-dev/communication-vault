
# App Name and Icon Customization Setup Guide

## Overview
This feature allows users to change the app name and icon directly from within the app, without needing to rebuild or modify code.

## How It Works

### App Name Change
- Uses Android Activity Aliases to switch between predefined app names
- Each alias has a different label (app name) defined in `strings.xml`
- The native module enables/disables aliases to change the launcher name
- Currently supports: Default, Calculator, Camera, Notes, Weather, Scanner

### App Icon Change
- Uses Android Activity Aliases to switch between different icons
- Each alias references a different icon resource
- Icons need to be added to `mipmap` folders
- The native module switches between aliases to change the launcher icon

## Setup Instructions

### 1. Rebuild the App
After making native module changes, you MUST rebuild the app:

```bash
# Clean build
cd android
./gradlew clean
cd ..

# Rebuild and run
npm run android
```

### 2. Add Icon Resources

You need to create icon resources for each alias. Create icons and place them in:

```
android/app/src/main/res/
├── mipmap-mdpi/
│   ├── ic_launcher_calculator.png (48x48)
│   ├── ic_launcher_camera.png (48x48)
│   ├── ic_launcher_notes.png (48x48)
│   ├── ic_launcher_weather.png (48x48)
│   └── ic_launcher_scanner.png (48x48)
├── mipmap-hdpi/
│   ├── ic_launcher_calculator.png (72x72)
│   ├── ic_launcher_camera.png (72x72)
│   ├── ic_launcher_notes.png (72x72)
│   ├── ic_launcher_weather.png (72x72)
│   └── ic_launcher_scanner.png (72x72)
├── mipmap-xhdpi/
│   ├── ic_launcher_calculator.png (96x96)
│   ├── ic_launcher_camera.png (96x96)
│   ├── ic_launcher_notes.png (96x96)
│   ├── ic_launcher_weather.png (96x96)
│   └── ic_launcher_scanner.png (96x96)
├── mipmap-xxhdpi/
│   ├── ic_launcher_calculator.png (144x144)
│   ├── ic_launcher_camera.png (144x144)
│   ├── ic_launcher_notes.png (144x144)
│   ├── ic_launcher_weather.png (144x144)
│   └── ic_launcher_scanner.png (144x144)
└── mipmap-xxxhdpi/
    ├── ic_launcher_calculator.png (192x192)
    ├── ic_launcher_camera.png (192x192)
    ├── ic_launcher_notes.png (192x192)
    ├── ic_launcher_weather.png (192x192)
    └── ic_launcher_scanner.png (192x192)
```

### 3. Update AndroidManifest.xml

After adding icons, update the `android:icon` attributes in `AndroidManifest.xml`:

```xml
<activity-alias
    android:name=".MainActivity.calculator"
    android:icon="@mipmap/ic_launcher_calculator"
    ... />

<activity-alias
    android:name=".MainActivity.camera"
    android:icon="@mipmap/ic_launcher_camera"
    ... />
```

### 4. Add More App Names (Optional)

To add more app name options:

1. Add string resource in `android/app/src/main/res/values/strings.xml`:
```xml
<string name="app_name_custom">My Custom Name</string>
```

2. Add activity alias in `AndroidManifest.xml`:
```xml
<activity-alias
    android:name=".MainActivity.custom"
    android:targetActivity=".MainActivity"
    android:label="@string/app_name_custom"
    android:icon="@mipmap/ic_launcher_custom"
    android:enabled="false"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity-alias>
```

3. Update the alias array in `AppCustomizationModule.java`:
```java
String[] aliases = {"default", "calculator", "camera", "notes", "weather", "scanner", "custom"};
```

## Troubleshooting

### Module Not Available Error
If you see "AppCustomization module not available":
1. Make sure you've rebuilt the app after adding the native module
2. Check that `AppCustomizationPackage` is registered in `MainApplication.java`
3. Verify the module is properly compiled (check `android/app/build/generated`)

### Icon Not Changing
1. Verify icons are in the correct `mipmap` folders
2. Check that `AndroidManifest.xml` references the correct icon resources
3. Ensure only one alias is enabled at a time
4. Try restarting the launcher or rebooting the device

### App Name Not Changing
1. Verify the string resources exist in `strings.xml`
2. Check that the activity alias has the correct `android:label` attribute
3. The name change may require launcher refresh - try removing and re-adding the app to home screen

## Testing

1. Open the app
2. Go to Settings → App Customization
3. Try changing the app name
4. Try changing the app icon
5. Close the app completely
6. Check the launcher - the name/icon should have changed
7. If not visible, try:
   - Removing the app from home screen and re-adding
   - Restarting the device
   - Clearing launcher cache

## Limitations

1. **Predefined Options Only**: App names and icons must be predefined in the manifest. Truly dynamic changes would require root access or app rebuild.

2. **Launcher Refresh**: Some launchers may require a refresh or restart to show changes.

3. **One Active Alias**: Only one activity alias can be enabled at a time.

4. **Icon Resources Required**: Icons must be added as resources before they can be used.

## Future Enhancements

- Add more predefined aliases for common app names
- Create an icon picker with preview
- Support for custom user-uploaded icons (would require app rebuild)
- iOS support (using alternate app icons feature)

