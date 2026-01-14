#!/bin/bash

# Script to rebuild app after native module changes
# This ensures the AppCustomization native module is properly compiled

echo "🔧 Rebuilding app with AppCustomization module..."
echo ""

# Clean Android build
echo "📦 Cleaning Android build..."
cd android
./gradlew clean
cd ..

# Rebuild
echo "🏗️  Building app..."
npm run android

echo ""
echo "✅ Rebuild complete!"
echo ""
echo "📝 Next steps:"
echo "1. Test app name change in Settings → App Customization"
echo "2. Test app icon change in Settings → App Customization"
echo "3. Close the app completely and check the launcher"
echo ""
echo "⚠️  Note: If module still not available, check:"
echo "   - MainApplication.java includes AppCustomizationPackage"
echo "   - AppCustomizationModule.java is in the correct package"
echo "   - App has been fully rebuilt (not just hot reloaded)"

