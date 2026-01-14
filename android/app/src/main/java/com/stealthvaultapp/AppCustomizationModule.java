package com.stealthvaultapp;

import android.app.Activity;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.content.pm.ActivityInfo;
import android.content.pm.ShortcutManager;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.content.SharedPreferences;
import java.util.Arrays;
import java.util.List;
import java.util.ArrayList;

public class AppCustomizationModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "AppCustomization";
    private static final String PREFS_NAME = "AppCustomizationPrefs";
    private static final String KEY_APP_NAME = "app_name";
    private static final String KEY_APP_ICON = "app_icon";
    private static final String KEY_APP_HIDDEN = "app_hidden";
    private static final String KEY_PHONE_TRIGGER = "phone_trigger";

    public AppCustomizationModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void setAppName(String appName, Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity");
                return;
            }

            if (appName == null || appName.trim().isEmpty()) {
                promise.reject("INVALID_NAME", "App name cannot be empty");
                return;
            }

            String trimmedName = appName.trim();
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            prefs.edit().putString(KEY_APP_NAME, trimmedName).apply();

            PackageManager pm = activity.getPackageManager();
            String packageName = activity.getPackageName();

            // Use activity aliases for all Android versions
            // This ensures the main app icon/name changes in launcher
            // Activity aliases are the primary way to change app name in launcher
            String[] aliases = {"default", "calculator", "camera", "notes", "weather", "scanner"};
            String aliasToEnable = "default";
            String lowerName = trimmedName.toLowerCase().trim();
            
            // Try to match to existing aliases based on name (case-insensitive)
            // Match exact names first, then partial matches
            if (lowerName.equals("calculator") || lowerName.contains("calc")) {
                aliasToEnable = "calculator";
                android.util.Log.d("AppCustomization", "Matched name '" + trimmedName + "' to calculator alias");
            } else if (lowerName.equals("camera") || lowerName.contains("cam")) {
                aliasToEnable = "camera";
                android.util.Log.d("AppCustomization", "Matched name '" + trimmedName + "' to camera alias");
            } else if (lowerName.equals("notes") || lowerName.equals("note") || lowerName.contains("note")) {
                aliasToEnable = "notes";
                android.util.Log.d("AppCustomization", "Matched name '" + trimmedName + "' to notes alias");
            } else if (lowerName.equals("weather") || lowerName.contains("weather")) {
                aliasToEnable = "weather";
                android.util.Log.d("AppCustomization", "Matched name '" + trimmedName + "' to weather alias");
            } else if (lowerName.equals("scanner") || lowerName.contains("scan")) {
                aliasToEnable = "scanner";
                android.util.Log.d("AppCustomization", "Matched name '" + trimmedName + "' to scanner alias");
            } else {
                android.util.Log.d("AppCustomization", "No alias match for '" + trimmedName + "', using default");
            }

            ComponentName newAlias = new ComponentName(
                packageName,
                packageName + ".MainActivity." + aliasToEnable
            );

            boolean newAliasEnabled = false;
            String finalAlias = aliasToEnable;
            
            // CRITICAL: Enable the new alias FIRST before disabling others
            // This prevents the app from disappearing from launcher
            // NEVER disable all aliases at once - always keep at least one enabled
            try {
                // Verify component exists and enable it
                android.content.pm.ActivityInfo info = pm.getActivityInfo(newAlias, 0);
                if (info != null) {
                    // Enable the new alias FIRST - CRITICAL: Do this before disabling others
                    pm.setComponentEnabledSetting(
                        newAlias,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                    );
                    
                    // Wait a moment to ensure it's enabled
                    try {
                        Thread.sleep(50);
                    } catch (InterruptedException ie) {
                        // Ignore
                    }
                    
                    // Verify it's actually enabled
                    int state = pm.getComponentEnabledSetting(newAlias);
                    if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || 
                        state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                        newAliasEnabled = true;
                        finalAlias = aliasToEnable;
                        android.util.Log.d("AppCustomization", "Successfully enabled alias: " + aliasToEnable);
                    } else {
                        android.util.Log.w("AppCustomization", "Alias enabled but state check failed: " + state);
                        // Still mark as enabled if no exception was thrown
                        newAliasEnabled = true;
                    }
                }
            } catch (android.content.pm.PackageManager.NameNotFoundException e) {
                android.util.Log.w("AppCustomization", "Alias not found: " + aliasToEnable + ", using default");
                // Use default as fallback
                finalAlias = "default";
                newAlias = new ComponentName(packageName, packageName + ".MainActivity.default");
                try {
                    android.content.pm.ActivityInfo defaultInfo = pm.getActivityInfo(newAlias, 0);
                    if (defaultInfo != null) {
                        pm.setComponentEnabledSetting(
                            newAlias,
                            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                            PackageManager.DONT_KILL_APP
                        );
                        int state = pm.getComponentEnabledSetting(newAlias);
                        if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || 
                            state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                            newAliasEnabled = true;
                            android.util.Log.d("AppCustomization", "Successfully enabled default alias as fallback");
                        }
                    }
                } catch (Exception ex) {
                    android.util.Log.e("AppCustomization", "CRITICAL: Failed to enable default alias: " + ex.getMessage(), ex);
                }
            } catch (Exception e) {
                android.util.Log.e("AppCustomization", "Error enabling alias " + aliasToEnable + ": " + e.getMessage(), e);
                // Try default as last resort
                try {
                    finalAlias = "default";
                    newAlias = new ComponentName(packageName, packageName + ".MainActivity.default");
                    pm.setComponentEnabledSetting(
                        newAlias,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                    );
                    newAliasEnabled = true;
                    android.util.Log.d("AppCustomization", "Enabled default alias as last resort");
                } catch (Exception ex) {
                    android.util.Log.e("AppCustomization", "CRITICAL: All aliases failed: " + ex.getMessage());
                }
            }
            
            // CRITICAL: Only disable other aliases if we successfully enabled the new one
            // AND verify the new alias is still enabled before disabling others
            if (newAliasEnabled) {
                // Double-check the new alias is still enabled before disabling others
                int verifyState = pm.getComponentEnabledSetting(newAlias);
                if (verifyState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                    verifyState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                    // Now safe to disable other aliases - FORCE disable ALL others
                    // CRITICAL: Always explicitly disable, even if state appears disabled
                    // This ensures no aliases remain in DEFAULT state (which is still active)
                    for (String alias : aliases) {
                        if (!alias.equals(finalAlias)) {
                            try {
                                ComponentName aliasComponent = new ComponentName(
                                    packageName,
                                    packageName + ".MainActivity." + alias
                                );
                                // ALWAYS explicitly disable, regardless of current state
                                // This is critical because DEFAULT state (from manifest) is still active
                                int currentState = pm.getComponentEnabledSetting(aliasComponent);
                                pm.setComponentEnabledSetting(
                                    aliasComponent,
                                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                    PackageManager.DONT_KILL_APP
                                );
                                android.util.Log.d("AppCustomization", "Explicitly disabled alias: " + alias + " (was state: " + currentState + ")");
                                
                                // Verify it's actually disabled
                                int disabledState = pm.getComponentEnabledSetting(aliasComponent);
                                if (disabledState != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
                                    android.util.Log.w("AppCustomization", "WARNING: Alias " + alias + " still not disabled after attempt (state: " + disabledState + ")");
                                }
                            } catch (Exception e) {
                                // Log but continue - we want to disable all others
                                android.util.Log.w("AppCustomization", "Failed to disable alias " + alias + ": " + e.getMessage());
                            }
                        }
                    }
                    // Wait a moment after disabling to ensure changes are processed
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException ie) {
                        // Ignore
                    }
                    
                    // CRITICAL: Final verification - ensure ONLY the target alias is enabled
                    // This prevents multiple apps from appearing in launcher
                    android.util.Log.d("AppCustomization", "Verifying only one alias is enabled...");
                    for (String alias : aliases) {
                        try {
                            ComponentName aliasComponent = new ComponentName(
                                packageName,
                                packageName + ".MainActivity." + alias
                            );
                            int state = pm.getComponentEnabledSetting(aliasComponent);
                            if (alias.equals(finalAlias)) {
                                // Target alias should be enabled
                                if (state != PackageManager.COMPONENT_ENABLED_STATE_ENABLED &&
                                    state != PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                                    android.util.Log.w("AppCustomization", "WARNING: Target alias " + alias + " is not enabled (state: " + state + ")");
                                } else {
                                    android.util.Log.d("AppCustomization", "✓ Target alias " + alias + " is enabled (state: " + state + ")");
                                }
                            } else {
                                // All other aliases should be DISABLED
                                if (state != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
                                    android.util.Log.w("AppCustomization", "WARNING: Alias " + alias + " is still active (state: " + state + "), forcing disable...");
                                    // Force disable again
                                    pm.setComponentEnabledSetting(
                                        aliasComponent,
                                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                        PackageManager.DONT_KILL_APP
                                    );
                                } else {
                                    android.util.Log.d("AppCustomization", "✓ Alias " + alias + " is properly disabled");
                                }
                            }
                        } catch (Exception e) {
                            android.util.Log.w("AppCustomization", "Error verifying alias " + alias + ": " + e.getMessage());
                        }
                    }
                } else {
                    android.util.Log.e("AppCustomization", "CRITICAL: New alias not enabled! Not disabling others to prevent app disappearance.");
                    // Don't disable others if new alias isn't enabled
                }
            } else {
                // If we failed to enable the new alias, ensure default is enabled
                android.util.Log.e("AppCustomization", "Failed to enable new alias, ensuring default is enabled");
                try {
                    ComponentName defaultAlias = new ComponentName(packageName, packageName + ".MainActivity.default");
                    pm.setComponentEnabledSetting(
                        defaultAlias,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                    );
                    finalAlias = "default";
                    newAlias = defaultAlias;
                    newAliasEnabled = true;
                    android.util.Log.d("AppCustomization", "Ensured default alias is enabled");
                } catch (Exception ex) {
                    android.util.Log.e("AppCustomization", "CRITICAL: Could not ensure default alias is enabled!");
                }
            }

            // Step 3: Send multiple broadcasts to force launcher refresh
            if (newAliasEnabled) {
                // Double-check that our enabled alias is still active
                int finalState = pm.getComponentEnabledSetting(newAlias);
                if (finalState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                    finalState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                    android.util.Log.d("AppCustomization", "App name change successful. Active alias: " + finalAlias);
                    
                    // Force launcher to refresh by sending multiple broadcasts
                    // This ensures all launchers pick up the changes
                    
                    // 1. Package changed broadcast - most important
                    Intent packageChanged = new Intent(Intent.ACTION_PACKAGE_CHANGED);
                    packageChanged.setData(android.net.Uri.parse("package:" + packageName));
                    packageChanged.putExtra(Intent.EXTRA_CHANGED_COMPONENT_NAME_LIST, 
                        new String[]{newAlias.getClassName()});
                    packageChanged.putExtra(Intent.EXTRA_DONT_KILL_APP, false);
                    activity.sendBroadcast(packageChanged);
                    
                    // 2. Package replaced broadcast
                    Intent packageReplaced = new Intent(Intent.ACTION_PACKAGE_REPLACED);
                    packageReplaced.setData(android.net.Uri.parse("package:" + packageName));
                    activity.sendBroadcast(packageReplaced);
                    
                    // 3. Package added broadcast (forces re-indexing)
                    Intent packageAdded = new Intent(Intent.ACTION_PACKAGE_ADDED);
                    packageAdded.setData(android.net.Uri.parse("package:" + packageName));
                    activity.sendBroadcast(packageAdded);
                    
                    // 4. Force launcher refresh by querying package info
                    try {
                        pm.getPackageInfo(packageName, 0);
                    } catch (Exception e) {
                        // Ignore
                    }
                    
                    // 5. Additional delay to ensure launcher processes the changes
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException ie) {
                        // Ignore
                    }
                    
                    promise.resolve(true);
                } else {
                    android.util.Log.e("AppCustomization", "WARNING: Enabled alias state changed unexpectedly");
                    promise.resolve(true); // Still resolve - the alias should be active
                }
            } else {
                // Failed to enable any alias - this should never happen if default exists
                android.util.Log.e("AppCustomization", "CRITICAL: Failed to enable any alias! App may disappear from launcher.");
                promise.reject("SET_APP_NAME_ERROR", "Failed to enable app alias. Please reinstall the app if it disappeared.");
            }
        } catch (Exception e) {
            android.util.Log.e("AppCustomization", "setAppName error: " + e.getMessage(), e);
            promise.reject("SET_APP_NAME_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getAppName(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            String appName = prefs.getString(KEY_APP_NAME, null);
            promise.resolve(appName);
        } catch (Exception e) {
            promise.reject("GET_APP_NAME_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setAppIcon(String iconName, Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity");
                return;
            }

            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            prefs.edit().putString(KEY_APP_ICON, iconName).apply();

            PackageManager pm = activity.getPackageManager();
            String packageName = activity.getPackageName();

            // Determine which alias to enable based on icon name
            // This should match the alias that was enabled by setAppName
            String[] aliases = {"default", "calculator", "camera", "notes", "weather", "scanner"};
            String aliasToEnable = iconName != null ? iconName : "default";
            if (!java.util.Arrays.asList(aliases).contains(aliasToEnable)) {
                aliasToEnable = "default";
            }
            
            // IMPORTANT: The icon is already defined in the manifest for each alias
            // setAppName already enables the correct alias, so we just need to verify it's enabled
            // This prevents conflicts between setAppName and setAppIcon
            ComponentName aliasComponent = new ComponentName(
                packageName,
                packageName + ".MainActivity." + aliasToEnable
            );
            
            try {
                // Verify the alias exists and is enabled
                int state = pm.getComponentEnabledSetting(aliasComponent);
                if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                    state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                    android.util.Log.d("AppCustomization", "Icon alias already enabled: " + aliasToEnable);
                    promise.resolve(true);
                } else {
                    // If not enabled, enable it (this shouldn't happen if setAppName was called first)
                    android.util.Log.w("AppCustomization", "Icon alias not enabled, enabling: " + aliasToEnable);
                    pm.setComponentEnabledSetting(
                        aliasComponent,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                    );
                    promise.resolve(true);
                }
            } catch (Exception e) {
                android.util.Log.e("AppCustomization", "Error verifying icon alias: " + e.getMessage(), e);
                // Still resolve true - the alias should be enabled by setAppName
                promise.resolve(true);
            }
        } catch (Exception e) {
            android.util.Log.e("AppCustomization", "setAppIcon error: " + e.getMessage(), e);
            promise.reject("SET_APP_ICON_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void hideApp(boolean hide, String phoneTrigger, Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity");
                return;
            }

            PackageManager pm = activity.getPackageManager();
            ComponentName componentName = new ComponentName(
                activity.getPackageName(),
                "com.stealthvaultapp.MainActivity"
            );

            int newState = hide 
                ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                : PackageManager.COMPONENT_ENABLED_STATE_ENABLED;

            pm.setComponentEnabledSetting(
                componentName,
                newState,
                PackageManager.DONT_KILL_APP
            );

            // Save state
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            prefs.edit()
                .putBoolean(KEY_APP_HIDDEN, hide)
                .putString(KEY_PHONE_TRIGGER, phoneTrigger)
                .apply();

            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("HIDE_APP_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isAppHidden(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            boolean hidden = prefs.getBoolean(KEY_APP_HIDDEN, false);
            promise.resolve(hidden);
        } catch (Exception e) {
            promise.reject("IS_APP_HIDDEN_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getPhoneTrigger(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS_NAME, Activity.MODE_PRIVATE);
            String trigger = prefs.getString(KEY_PHONE_TRIGGER, null);
            promise.resolve(trigger);
        } catch (Exception e) {
            promise.reject("GET_PHONE_TRIGGER_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void restartApp(Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity");
                return;
            }

            String packageName = activity.getPackageName();
            PackageManager pm = activity.getPackageManager();
            
            // Find which alias is currently enabled
            String[] aliases = {"default", "calculator", "camera", "notes", "weather", "scanner"};
            final String[] enabledAliasRef = {"default"}; // Use array to make it effectively final
            
            for (String alias : aliases) {
                ComponentName aliasComponent = new ComponentName(
                    packageName,
                    packageName + ".MainActivity." + alias
                );
                try {
                    int state = pm.getComponentEnabledSetting(aliasComponent);
                    if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                        state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                        enabledAliasRef[0] = alias;
                        break;
                    }
                } catch (Exception e) {
                    // Ignore
                }
            }
            
            final String enabledAlias = enabledAliasRef[0]; // Final variable for inner class
            
            // Restart the app using the enabled alias
            // This ensures the launcher shows the correct name
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    try {
                        // Launch using the enabled alias
                        Intent intent = new Intent(Intent.ACTION_MAIN);
                        intent.setComponent(new ComponentName(packageName, packageName + ".MainActivity." + enabledAlias));
                        intent.addCategory(Intent.CATEGORY_LAUNCHER);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                        
                        // Send broadcast to refresh launcher
                        activity.sendBroadcast(new Intent(Intent.ACTION_PACKAGE_CHANGED).setData(
                            android.net.Uri.parse("package:" + packageName)
                        ));
                        
                        // Start the new activity
                        activity.startActivity(intent);
                        
                        // Small delay before killing process to ensure new activity starts
                        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                activity.finish();
                                android.os.Process.killProcess(android.os.Process.myPid());
                            }
                        }, 300);
                    } catch (Exception e) {
                        android.util.Log.e("AppCustomization", "Error in restart: " + e.getMessage(), e);
                        // Fallback: just exit
                        activity.finish();
                        android.os.Process.killProcess(android.os.Process.myPid());
                    }
                }
            }, 500); // Small delay to ensure changes are saved

            promise.resolve(true);
        } catch (Exception e) {
            android.util.Log.e("AppCustomization", "restartApp error: " + e.getMessage(), e);
            promise.reject("RESTART_ERROR", e.getMessage());
        }
    }
}

