import React, {createContext, useContext, useState, useEffect} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {SecuritySettings} from '../types';
import {
  getSecuritySettings,
  saveSecuritySettings,
} from '../services/StorageService';
import {SecurityService} from '../services/SecurityService';

interface SecurityContextType {
  securitySettings: SecuritySettings | null;
  isLocked: boolean;
  lockApp: () => void;
  unlockApp: (password: string) => Promise<boolean>;
  updateSecuritySettings: (settings: Partial<SecuritySettings>) => Promise<void>;
  checkFakePassword: (password: string) => boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(
  undefined,
);

export const SecurityProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [securitySettings, setSecuritySettings] =
    useState<SecuritySettings | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );

  useEffect(() => {
    loadSecuritySettings();
    setupAppStateListener();
    return () => {
      AppState.removeEventListener('change', handleAppStateChange);
    };
  }, []);

  useEffect(() => {
    if (securitySettings?.autoLockEnabled && !isLocked) {
      const timer = setTimeout(() => {
        if (appState !== 'active') {
          lockApp();
        }
      }, securitySettings.autoLockDelay * 1000);

      return () => clearTimeout(timer);
    }
  }, [appState, securitySettings, isLocked]);

  const loadSecuritySettings = async () => {
    try {
      const settings = await getSecuritySettings();
      if (settings) {
        // Ensure passwordEnabled is set
        const updatedSettings = {
          ...settings,
          passwordEnabled: settings.passwordEnabled !== undefined 
            ? settings.passwordEnabled 
            : (settings.appPassword ? true : false),
        };
        setSecuritySettings(updatedSettings);
        // Only lock if password is enabled
        if (updatedSettings.passwordEnabled) {
          setIsLocked(true);
        } else {
          // If password is not enabled, don't lock
          setIsLocked(false);
        }
      }
    } catch (error) {
      console.error('Error loading security settings:', error);
    }
  };

  const setupAppStateListener = () => {
    AppState.addEventListener('change', handleAppStateChange);
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      appState.match(/inactive|background/) &&
      nextAppState === 'active' &&
      securitySettings?.autoLockEnabled
    ) {
      // App came to foreground, check if should lock
      lockApp();
    }
    setAppState(nextAppState);
  };

  const lockApp = () => {
    setIsLocked(true);
  };

  const unlockApp = async (password: string): Promise<boolean> => {
    if (!securitySettings) return false;

    // Check fake password first
    if (
      securitySettings.fakePassword &&
      password === securitySettings.fakePassword
    ) {
      // Show dummy data
      return true; // This should show fake interface
    }

    // Check real password
    if (password === securitySettings.appPassword) {
      setIsLocked(false);
      return true;
    }

    // Wrong password - trigger break-in alert
    await SecurityService.handleFailedUnlockAttempt();
    return false;
  };

  const updateSecuritySettings = async (
    settings: Partial<SecuritySettings>,
  ) => {
    try {
      const updated = {
        ...securitySettings,
        ...settings,
        // Ensure passwordEnabled is set correctly
        passwordEnabled: settings.passwordEnabled !== undefined 
          ? settings.passwordEnabled 
          : (securitySettings?.passwordEnabled || false),
      } as SecuritySettings;
      setSecuritySettings(updated);
      await saveSecuritySettings(updated);
    } catch (error) {
      console.error('Error updating security settings:', error);
    }
  };

  const checkFakePassword = (password: string): boolean => {
    return (
      !!securitySettings?.fakePassword &&
      password === securitySettings.fakePassword
    );
  };

  return (
    <SecurityContext.Provider
      value={{
        securitySettings,
        isLocked,
        lockApp,
        unlockApp,
        updateSecuritySettings,
        checkFakePassword,
      }}>
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within SecurityProvider');
  }
  return context;
};

