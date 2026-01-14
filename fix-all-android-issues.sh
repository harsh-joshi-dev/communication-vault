#!/bin/bash

# Comprehensive Android build fix script
# Fixes all compatibility issues before running the app

set -e

echo "🔧 Fixing Android build configuration issues..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MODULES="$PROJECT_ROOT/node_modules"

# 1. Fix Kotlin version consistency
echo -e "${YELLOW}1. Setting Kotlin version to 2.0.21 across all modules...${NC}"

# Fix react-native-gesture-handler
if [ -f "$NODE_MODULES/react-native-gesture-handler/android/gradle.properties" ]; then
    sed -i '' 's/RNGH_kotlinVersion=.*/RNGH_kotlinVersion=2.0.21/' "$NODE_MODULES/react-native-gesture-handler/android/gradle.properties"
    echo "  ✓ Fixed react-native-gesture-handler Kotlin version"
fi

# Fix react-native-gesture-handler build.gradle
if [ -f "$NODE_MODULES/react-native-gesture-handler/android/build.gradle" ]; then
    sed -i '' "s/safeExtGet('kotlinVersion', project.properties.getOrDefault('RNGH_kotlinVersion', '.*'))/safeExtGet('kotlinVersion', project.properties.getOrDefault('RNGH_kotlinVersion', '2.0.21'))/" "$NODE_MODULES/react-native-gesture-handler/android/build.gradle"
fi

# Fix react-native-audio-recorder-player
if [ -f "$NODE_MODULES/react-native-audio-recorder-player/android/build.gradle" ]; then
    sed -i '' "s/kotlinVersion = '.*'/kotlinVersion = '2.0.21'/" "$NODE_MODULES/react-native-audio-recorder-player/android/build.gradle"
    echo "  ✓ Fixed react-native-audio-recorder-player Kotlin version"
fi

# 2. Fix namespace declarations
echo -e "${YELLOW}2. Fixing namespace declarations...${NC}"

NAMESPACE_MODULES=(
    "react-native-background-timer:com.ocetnik.timer"
    "react-native-biometrics:com.rnbiometrics"
)

for module_info in "${NAMESPACE_MODULES[@]}"; do
    IFS=':' read -r module namespace <<< "$module_info"
    build_file="$NODE_MODULES/$module/android/build.gradle"
    if [ -f "$build_file" ] && ! grep -q "namespace" "$build_file"; then
        # Add namespace after android { line
        if grep -q "android {" "$build_file"; then
            sed -i '' "/^android {/a\\
    namespace \"$namespace\"
" "$build_file"
            echo "  ✓ Added namespace to $module"
        fi
    fi
done

# 3. Fix buildConfig requirements
echo -e "${YELLOW}3. Fixing buildConfig requirements...${NC}"

BUILDCONFIG_MODULES=(
    "react-native-compressor"
    "react-native-document-picker"
    "react-native-image-picker"
    "react-native-vector-icons"
    "react-native-reanimated"
)

for module in "${BUILDCONFIG_MODULES[@]}"; do
    build_file="$NODE_MODULES/$module/android/build.gradle"
    if [ -f "$build_file" ]; then
        # Check if buildFeatures block exists
        if grep -q "buildFeatures" "$build_file"; then
            # Add buildConfig true if not present
            if ! grep -q "buildConfig true" "$build_file"; then
                sed -i '' "s/buildFeatures {/buildFeatures {\n        buildConfig true/" "$build_file"
                echo "  ✓ Added buildConfig to $module"
            fi
        else
            # Add buildFeatures block after android {
            if grep -q "^android {" "$build_file"; then
                sed -i '' "/^android {/a\\
    buildFeatures {\
        buildConfig true\
    }
" "$build_file"
                echo "  ✓ Added buildFeatures block to $module"
            fi
        fi
    fi
done

# 4. Verify debug keystore exists
echo -e "${YELLOW}4. Checking debug keystore...${NC}"
if [ ! -f "$PROJECT_ROOT/android/app/debug.keystore" ]; then
    echo "  Creating debug keystore..."
    cd "$PROJECT_ROOT/android/app"
    keytool -genkey -v -keystore debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" 2>&1 | grep -v "Warning:"
    echo "  ✓ Created debug keystore"
fi

# 5. Verify local.properties exists
echo -e "${YELLOW}5. Checking local.properties...${NC}"
if [ ! -f "$PROJECT_ROOT/android/local.properties" ]; then
    echo "  Creating local.properties..."
    echo "sdk.dir=$HOME/Library/Android/sdk" > "$PROJECT_ROOT/android/local.properties"
    echo "  ✓ Created local.properties"
fi

# 6. Clean build cache
echo -e "${YELLOW}6. Cleaning build cache...${NC}"
cd "$PROJECT_ROOT/android"
./gradlew clean > /dev/null 2>&1 || true
echo "  ✓ Build cache cleaned"

echo -e "\n${GREEN}✅ All Android build issues fixed!${NC}"
echo -e "${GREEN}Ready to run the app.${NC}\n"

