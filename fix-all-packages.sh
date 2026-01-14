#!/bin/bash

# Comprehensive fix for all Android packages
# Ensures all packages are compatible and properly configured

set -e

echo "🔧 Fixing all package compatibility issues..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MODULES="$PROJECT_ROOT/node_modules"

# Use Kotlin 1.9.24 which is compatible with React Native 0.72.6
KOTLIN_VERSION="1.9.24"

echo "1. Setting Kotlin version to $KOTLIN_VERSION (compatible with RN 0.72.6)..."

# Fix root build.gradle
sed -i '' "s/kotlinVersion = \".*\"/kotlinVersion = \"$KOTLIN_VERSION\"/" "$PROJECT_ROOT/android/build.gradle"
sed -i '' "s/kotlin-gradle-plugin:.*/kotlin-gradle-plugin:$KOTLIN_VERSION\"/" "$PROJECT_ROOT/android/build.gradle"

# Fix react-native-gesture-handler - use compatible Kotlin version
if [ -f "$NODE_MODULES/react-native-gesture-handler/android/gradle.properties" ]; then
    sed -i '' "s/RNGH_kotlinVersion=.*/RNGH_kotlinVersion=$KOTLIN_VERSION/" "$NODE_MODULES/react-native-gesture-handler/android/gradle.properties"
fi

if [ -f "$NODE_MODULES/react-native-gesture-handler/android/build.gradle" ]; then
    sed -i '' "s/safeExtGet('kotlinVersion', project.properties.getOrDefault('RNGH_kotlinVersion', '.*'))/safeExtGet('kotlinVersion', project.properties.getOrDefault('RNGH_kotlinVersion', '$KOTLIN_VERSION'))/" "$NODE_MODULES/react-native-gesture-handler/android/build.gradle"
fi

# Fix react-native-audio-recorder-player
if [ -f "$NODE_MODULES/react-native-audio-recorder-player/android/build.gradle" ]; then
    sed -i '' "s/kotlinVersion = '.*'/kotlinVersion = '$KOTLIN_VERSION'/" "$NODE_MODULES/react-native-audio-recorder-player/android/build.gradle"
fi

echo "   ✓ Kotlin version set to $KOTLIN_VERSION"

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

fix_buildconfig() {
    local module=$1
    local build_file="$NODE_MODULES/$module/android/build.gradle"
    
    if [ -f "$build_file" ]; then
        if grep -q "buildFeatures" "$build_file"; then
            if ! grep -q "buildConfig true" "$build_file"; then
                sed -i '' '/buildFeatures {/a\
        buildConfig true
' "$build_file"
            fi
        else
            sed -i '' '/^android {/a\
    buildFeatures {\
        buildConfig true\
    }
' "$build_file"
        fi
    fi
}

fix_buildconfig "react-native-compressor"
fix_buildconfig "react-native-document-picker"
fix_buildconfig "react-native-image-picker"
fix_buildconfig "react-native-vector-icons"
fix_buildconfig "react-native-reanimated"

echo "   ✓ buildConfig issues fixed"

# 4. Ensure debug keystore exists
echo "4. Checking debug keystore..."
if [ ! -f "$PROJECT_ROOT/android/app/debug.keystore" ]; then
    keytool -genkey -v -keystore "$PROJECT_ROOT/android/app/debug.keystore" \
        -storepass android -alias androiddebugkey -keypass android \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US" 2>&1 | grep -v "Warning:" || true
    echo "   ✓ Debug keystore created"
else
    echo "   ✓ Debug keystore exists"
fi

# 5. Clean build directories
echo "5. Cleaning build directories..."
cd "$PROJECT_ROOT/android"
rm -rf .gradle build app/build */build 2>/dev/null || true
cd "$PROJECT_ROOT"

echo ""
echo "✅ All package fixes applied!"
echo ""

