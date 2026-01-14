package com.stealthvaultapp;

import android.content.pm.PackageManager;
import android.content.ComponentName;
import android.content.pm.ActivityInfo;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;

public class MainActivity extends ReactActivity {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "stealth-vault-app";
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. Here we use a util class {@link
   * DefaultReactActivityDelegate} which allows you to easily enable Fabric and Concurrent React
   * (aka React 18) with two boolean flags.
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new DefaultReactActivityDelegate(
        this,
        getMainComponentName(),
        // If you opted-in for the New Architecture, we enable the Fabric Renderer.
        DefaultNewArchitectureEntryPoint.getFabricEnabled());
  }

  @Override
  protected void onResume() {
    super.onResume();
    // Update the activity title based on the current alias
    updateActivityTitle();
  }

  private void updateActivityTitle() {
    try {
      PackageManager pm = getPackageManager();
      String packageName = getPackageName();
      String[] aliases = {"default", "calculator", "camera", "notes", "weather", "scanner"};
      
      for (String alias : aliases) {
        ComponentName aliasComponent = new ComponentName(
            packageName,
            packageName + ".MainActivity." + alias
        );
        int state = pm.getComponentEnabledSetting(aliasComponent);
        if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
            state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
          try {
            ActivityInfo info = pm.getActivityInfo(aliasComponent, 0);
            if (info != null && info.labelRes != 0) {
              String title = getString(info.labelRes);
              if (getActionBar() != null) {
                getActionBar().setTitle(title);
              }
              // Also set window title
              setTitle(title);
            }
          } catch (Exception e) {
            // Ignore
          }
          break;
        }
      }
    } catch (Exception e) {
      // Ignore errors
    }
  }
}

