#!/bin/bash

# Script to update app name in AndroidManifest.xml and strings.xml
# Usage: ./scripts/update-app-name.sh "New App Name"

APP_NAME="$1"

if [ -z "$APP_NAME" ]; then
    echo "Usage: ./scripts/update-app-name.sh \"New App Name\""
    exit 1
fi

ANDROID_STRINGS_XML="android/app/src/main/res/values/strings.xml"
ANDROID_MANIFEST_XML="android/app/src/main/AndroidManifest.xml"

# Update strings.xml
if [ -f "$ANDROID_STRINGS_XML" ]; then
    sed -i '' "s/<string name=\"app_name\">.*<\/string>/<string name=\"app_name\">$APP_NAME<\/string>/" "$ANDROID_STRINGS_XML"
    echo "✅ Updated $ANDROID_STRINGS_XML"
else
    echo "❌ File not found: $ANDROID_STRINGS_XML"
fi

echo "✅ App name updated to: $APP_NAME"
echo "⚠️  Rebuild the app to see changes in launcher"

