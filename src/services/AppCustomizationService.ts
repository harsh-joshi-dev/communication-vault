import {NativeModules, Platform} from 'react-native';

const {AppCustomization} = NativeModules;

interface AppCustomizationInterface {
  setAppName(appName: string): Promise<boolean>;
  getAppName(): Promise<string | null>;
  setAppIcon(iconName: string): Promise<boolean>;
  hideApp(hide: boolean, phoneTrigger: string): Promise<boolean>;
  isAppHidden(): Promise<boolean>;
  getPhoneTrigger(): Promise<string | null>;
  restartApp(): Promise<boolean>;
}

class AppCustomizationService {
  private module: AppCustomizationInterface | null = null;

  constructor() {
    if (Platform.OS === 'android') {
      if (AppCustomization) {
        this.module = AppCustomization as AppCustomizationInterface;
        console.log('[AppCustomizationService] Native module loaded successfully');
      } else {
        console.warn('[AppCustomizationService] AppCustomization native module not found. Make sure the app has been rebuilt after adding the native module.');
      }
    } else {
      console.log('[AppCustomizationService] App customization is only available on Android');
    }
  }

  async setAppName(appName: string): Promise<boolean> {
    if (!this.module) {
      console.warn('AppCustomization module not available');
      return false;
    }
    try {
      const result = await this.module.setAppName(appName);
      console.log('[AppCustomizationService] setAppName result:', result);
      return result === true;
    } catch (error: any) {
      console.error('[AppCustomizationService] Error setting app name:', error);
      console.error('[AppCustomizationService] Error details:', {
        message: error?.message,
        code: error?.code,
        nativeError: error?.nativeError,
      });
      return false;
    }
  }

  async getAppName(): Promise<string | null> {
    if (!this.module) {
      return null;
    }
    try {
      return await this.module.getAppName();
    } catch (error) {
      console.error('Error getting app name:', error);
      return null;
    }
  }

  async setAppIcon(iconName: string): Promise<boolean> {
    if (!this.module) {
      console.warn('AppCustomization module not available');
      return false;
    }
    try {
      return await this.module.setAppIcon(iconName);
    } catch (error) {
      console.error('Error setting app icon:', error);
      return false;
    }
  }

  async hideApp(hide: boolean, phoneTrigger: string): Promise<boolean> {
    if (!this.module) {
      console.warn('AppCustomization module not available');
      return false;
    }
    try {
      return await this.module.hideApp(hide, phoneTrigger);
    } catch (error) {
      console.error('Error hiding app:', error);
      return false;
    }
  }

  async isAppHidden(): Promise<boolean> {
    if (!this.module) {
      return false;
    }
    try {
      return await this.module.isAppHidden();
    } catch (error) {
      console.error('Error checking app hidden status:', error);
      return false;
    }
  }

  async getPhoneTrigger(): Promise<string | null> {
    if (!this.module) {
      return null;
    }
    try {
      return await this.module.getPhoneTrigger();
    } catch (error) {
      console.error('Error getting phone trigger:', error);
      return null;
    }
  }

  async restartApp(): Promise<boolean> {
    if (!this.module) {
      console.warn('AppCustomization module not available');
      return false;
    }
    try {
      return await this.module.restartApp();
    } catch (error) {
      console.error('Error restarting app:', error);
      return false;
    }
  }
}

export const appCustomizationService = new AppCustomizationService();

