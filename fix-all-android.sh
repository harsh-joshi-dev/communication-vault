#!/bin/bash

# Comprehensive Android build fix script
# Fixes all compatibility issues before running the app

set -e

echo "🔧 Fixing all Android build configuration issues..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MODULES="$PROJECT_ROOT/node_modules"

# 1. Fix Kotlin version to 2.0.21 (required by react-native-gesture-handler 2.13.4+)
echo "1. Setting Kotlin version to 2.0.21..."

# Fix root build.gradle
sed -i '' 's/kotlinVersion = ".*"/kotlinVersion = "2.0.21"/' "$PROJECT_ROOT/android/build.gradle"
sed -i '' 's/kotlin-gradle-plugin:.*/kotlin-gradle-plugin:2.0.21"/' "$PROJECT_ROOT/android/build.gradle"

# Fix react-native-gesture-handler
if [ -f "$NODE_MODULES/react-native-gesture-handler/android/gradle.properties" ]; then
    sed -i '' 's/RNGH_kotlinVersion=.*/RNGH_kotlinVersion=2.0.21/' "$NODE_MODULES/react-native-gesture-handler/android/gradle.properties"
fi

if [ -f "$NODE_MODULES/react-native-gesture-handler/android/build.gradle" ]; then
    sed -i '' "s/safeExtGet('kotlinVersion', project.properties.getOrDefault('RNGH_kotlinVersion', '.*'))/safeExtGet('kotlinVersion', project.properties.getOrDefault('RNGH_kotlinVersion', '2.0.21'))/" "$NODE_MODULES/react-native-gesture-handler/android/build.gradle"
fi

# Fix react-native-audio-recorder-player
if [ -f "$NODE_MODULES/react-native-audio-recorder-player/android/build.gradle" ]; then
    sed -i '' "s/kotlinVersion = '.*'/kotlinVersion = '2.0.21'/" "$NODE_MODULES/react-native-audio-recorder-player/android/build.gradle"
fi

echo "   ✓ Kotlin version fixed"

# 2. Fix namespace declarations
echo "2. Fixing namespace declarations..."

# react-native-background-timer
if [ -f "$NODE_MODULES/react-native-background-timer/android/build.gradle" ]; then
    if ! grep -q "namespace" "$NODE_MODULES/react-native-background-timer/android/build.gradle"; then
        sed -i '' '/^android {/a\
    namespace "com.ocetnik.timer"
' "$NODE_MODULES/react-native-background-timer/android/build.gradle"
    fi
fi

# react-native-biometrics
if [ -f "$NODE_MODULES/react-native-biometrics/android/build.gradle" ]; then
    if ! grep -q "namespace" "$NODE_MODULES/react-native-biometrics/android/build.gradle"; then
        sed -i '' '/^android {/a\
    namespace "com.rnbiometrics"
' "$NODE_MODULES/react-native-biometrics/android/build.gradle"
    fi
fi

echo "   ✓ Namespace declarations fixed"

# 3. Fix buildConfig issues
echo "3. Fixing buildConfig issues..."

MODULES_WITH_BUILDCONFIG=(
    "react-native-compressor"
    "react-native-document-picker"
    "react-native-image-picker"
    "react-native-vector-icons"
    "react-native-reanimated"
)

for module in "${MODULES_WITH_BUILDCONFIG[@]}"; do
    if [ -f "$NODE_MODULES/$module/android/build.gradle" ]; then
        if ! grep -q "buildFeatures" "$NODE_MODULES/$module/android/build.gradle" || ! grep -q "buildConfig true" "$NODE_MODULES/$module/android/build.gradle"; then
            if grep -q "buildFeatures" "$NODE_MODULES/$module/android/build.gradle"; then
                sed -i '' '/buildFeatures {/a\
        buildConfig true
' "$NODE_MODULES/$module/android/build.gradle"
            else
                sed -i '' '/^android {/a\
    buildFeatures {\
        buildConfig true\
    }
' "$NODE_MODULES/$module/android/build.gradle"
            fi
        fi
    fi
done

echo "   ✓ buildConfig issues fixed"

# 4. Ensure debug keystore exists
echo "4. Checking debug keystore..."
if [ ! -f "$PROJECT_ROOT/android/app/debug.keystore" ]; then
    keytool -genkey -v -keystore "$PROJECT_ROOT/android/app/debug.keystore" \
        -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US" 2>&1 | grep -v "Warning:"
    echo "   ✓ Debug keystore created"
else
    echo "   ✓ Debug keystore exists"
fi

# 5. Remove problematic multidex config file reference if it doesn't exist
if [ -f "$PROJECT_ROOT/android/app/build.gradle" ]; then
    if grep -q "multiDexKeepFile" "$PROJECT_ROOT/android/app/build.gradle" && [ ! -f "$PROJECT_ROOT/android/app/multidex-config.txt" ]; then
        sed -i '' '/multiDexKeepFile/d' "$PROJECT_ROOT/android/app/build.gradle"
    fi
fi

echo ""
echo "✅ All fixes applied! Ready to build."
echo ""

