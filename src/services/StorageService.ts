import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import {User, SecuritySettings, BackupSettings} from '../types';

const STORAGE_KEYS = {
  FIRST_LAUNCH: 'first_launch',
  THEME: 'theme',
  USER: 'user',
  SECURITY_SETTINGS: 'security_settings',
  BACKUP_SETTINGS: 'backup_settings',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  TRIGGER_CONFIG: 'trigger_config',
  SETUP_COMPLETE: 'setup_complete',
  APP_NAME: 'app_name',
  APP_ICON: 'app_icon',
};

export const checkFirstLaunch = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.FIRST_LAUNCH);
    return value === null;
  } catch (error) {
    console.error('Error checking first launch:', error);
    return true;
  }
};

export const setFirstLaunchComplete = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FIRST_LAUNCH, 'false');
  } catch (error) {
    console.error('Error setting first launch:', error);
  }
};

export const getStoredTheme = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.THEME);
  } catch (error) {
    console.error('Error getting theme:', error);
    return null;
  }
};

export const saveTheme = async (themeId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.THEME, themeId);
  } catch (error) {
    console.error('Error saving theme:', error);
  }
};

export const getStoredUser = async (): Promise<User | null> => {
  try {
    const userJson = await EncryptedStorage.getItem(STORAGE_KEYS.USER);
    if (userJson) {
      return JSON.parse(userJson);
    }
    return null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

export const saveUser = async (user: User): Promise<void> => {
  try {
    await EncryptedStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (error) {
    console.error('Error saving user:', error);
  }
};

export const clearUserData = async (): Promise<void> => {
  try {
    await EncryptedStorage.removeItem(STORAGE_KEYS.USER);
    await AsyncStorage.removeItem(STORAGE_KEYS.THEME);
  } catch (error) {
    console.error('Error clearing user data:', error);
  }
};

export const getSecuritySettings = async (): Promise<SecuritySettings | null> => {
  try {
    const settingsJson = await EncryptedStorage.getItem(
      STORAGE_KEYS.SECURITY_SETTINGS,
    );
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
    return null;
  } catch (error) {
    console.error('Error getting security settings:', error);
    return null;
  }
};

export const saveSecuritySettings = async (
  settings: SecuritySettings,
): Promise<void> => {
  try {
    await EncryptedStorage.setItem(
      STORAGE_KEYS.SECURITY_SETTINGS,
      JSON.stringify(settings),
    );
  } catch (error) {
    console.error('Error saving security settings:', error);
  }
};

export const getBackupSettings = async (): Promise<BackupSettings | null> => {
  try {
    const settingsJson = await AsyncStorage.getItem(
      STORAGE_KEYS.BACKUP_SETTINGS,
    );
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
    return null;
  } catch (error) {
    console.error('Error getting backup settings:', error);
    return null;
  }
};

export const saveBackupSettings = async (
  settings: BackupSettings,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.BACKUP_SETTINGS,
      JSON.stringify(settings),
    );
  } catch (error) {
    console.error('Error saving backup settings:', error);
  }
};

export const isOnboardingComplete = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE);
    return value === 'true';
  } catch (error) {
    return false;
  }
};

export const setOnboardingComplete = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
  } catch (error) {
    console.error('Error setting onboarding complete:', error);
  }
};

export const saveTriggerConfig = async (
  themeId: string,
  config: any,
): Promise<void> => {
  try {
    const allConfigs = await getTriggerConfigs();
    allConfigs[themeId] = config;
    await AsyncStorage.setItem(
      STORAGE_KEYS.TRIGGER_CONFIG,
      JSON.stringify(allConfigs),
    );
  } catch (error) {
    console.error('Error saving trigger config:', error);
  }
};

export const getTriggerConfig = async (
  themeId: string,
): Promise<any | null> => {
  try {
    const allConfigs = await getTriggerConfigs();
    return allConfigs[themeId] || null;
  } catch (error) {
    console.error('Error getting trigger config:', error);
    return null;
  }
};

export const getTriggerConfigs = async (): Promise<Record<string, any>> => {
  try {
    const configsJson = await AsyncStorage.getItem(STORAGE_KEYS.TRIGGER_CONFIG);
    if (configsJson) {
      return JSON.parse(configsJson);
    }
    return {};
  } catch (error) {
    console.error('Error getting trigger configs:', error);
    return {};
  }
};

export const isSetupComplete = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.SETUP_COMPLETE);
    return value === 'true';
  } catch (error) {
    return false;
  }
};

export const setSetupComplete = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETUP_COMPLETE, 'true');
  } catch (error) {
    console.error('Error setting setup complete:', error);
  }
};

export const saveAppName = async (appName: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.APP_NAME, appName);
  } catch (error) {
    console.error('Error saving app name:', error);
  }
};

export const getAppName = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.APP_NAME);
  } catch (error) {
    console.error('Error getting app name:', error);
    return null;
  }
};

export const saveAppIcon = async (iconName: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.APP_ICON, iconName);
  } catch (error) {
    console.error('Error saving app icon:', error);
  }
};

export const getAppIcon = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.APP_ICON);
  } catch (error) {
    console.error('Error getting app icon:', error);
    return null;
  }
};

