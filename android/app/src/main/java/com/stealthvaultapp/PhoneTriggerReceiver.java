package com.stealthvaultapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;

public class PhoneTriggerReceiver extends BroadcastReceiver {
    private static final String PREFS_NAME = "AppCustomizationPrefs";
    private static final String KEY_PHONE_TRIGGER = "phone_trigger";
    private static final String KEY_APP_HIDDEN = "app_hidden";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_NEW_OUTGOING_CALL.equals(intent.getAction())) {
            String phoneNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER);
            
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String triggerNumber = prefs.getString(KEY_PHONE_TRIGGER, null);
            boolean isHidden = prefs.getBoolean(KEY_APP_HIDDEN, false);
            
            if (isHidden && triggerNumber != null && phoneNumber != null && phoneNumber.equals(triggerNumber)) {
                // Re-enable the app
                PackageManager pm = context.getPackageManager();
                android.content.ComponentName componentName = new android.content.ComponentName(
                    context.getPackageName(),
                    "com.stealthvaultapp.MainActivity"
                );
                
                pm.setComponentEnabledSetting(
                    componentName,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
                );
                
                // Launch the app
                Intent launchIntent = new Intent(context, MainActivity.class);
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(launchIntent);
                
                // Cancel the call
                setResultData(null);
            }
        }
    }
}

