#!/bin/bash
# Script to fix Android namespace issues for packages

echo "Fixing Android namespace issues..."

# react-native-background-timer
if [ -f "node_modules/react-native-background-timer/android/build.gradle" ]; then
    if ! grep -q "namespace" node_modules/react-native-background-timer/android/build.gradle; then
        sed -i '' '/^android {/a\
    namespace "com.ocetnik.timer"
' node_modules/react-native-background-timer/android/build.gradle
        echo "Fixed react-native-background-timer"
    fi
fi

# react-native-biometrics
if [ -f "node_modules/react-native-biometrics/android/build.gradle" ]; then
    if ! grep -q "namespace" node_modules/react-native-biometrics/android/build.gradle; then
        sed -i '' '/^android {/a\
    namespace "com.rnbiometrics"
' node_modules/react-native-biometrics/android/build.gradle
        echo "Fixed react-native-biometrics"
    fi
fi

# Auto-fix all packages
for pkg in node_modules/react-native-*/android/build.gradle; do
    if [ -f "$pkg" ]; then
        pkg_dir=$(dirname "$pkg")
        manifest="$pkg_dir/src/main/AndroidManifest.xml"
        
        # Fix namespace
        if [ -f "$manifest" ]; then
            package_name=$(grep -o 'package="[^"]*"' "$manifest" | cut -d'"' -f2)
            if [ -n "$package_name" ] && ! grep -q "namespace" "$pkg"; then
                echo "Fixing $pkg_dir with namespace: $package_name"
                sed -i '' "/^android {/a\\
    namespace \"$package_name\"
" "$pkg"
            fi
        fi
        
        # Fix buildConfig if needed
        if grep -q "buildConfigField" "$pkg" && ! grep -q "buildFeatures" "$pkg"; then
            echo "Enabling buildConfig for $pkg_dir"
            sed -i '' "/^android {/a\\
    buildFeatures {\\
        buildConfig true\\
    }
" "$pkg"
        fi
    fi
done

echo "Done!"

