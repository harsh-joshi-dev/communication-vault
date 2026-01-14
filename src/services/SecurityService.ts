import {Platform, PermissionsAndroid} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {takeSelfie} from './CameraService';

let failedAttempts = 0;
const MAX_FAILED_ATTEMPTS = 3;

export const preventScreenshot = async (enable: boolean): Promise<void> => {
  if (Platform.OS === 'android') {
    try {
      const ScreenshotPrevent = require('react-native-screenshot-prevent').default;
      ScreenshotPrevent.enabled(enable);
    } catch (error) {
      console.error('Screenshot prevention error:', error);
    }
  }
  // iOS screenshot prevention requires native module implementation
};

export const detectScreenRecording = (callback: () => void): (() => void) => {
  // This requires native module implementation
  // For now, return cleanup function
  return () => {};
};

export const handleFailedUnlockAttempt = async (): Promise<void> => {
  failedAttempts++;
  
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    // Trigger break-in alert
    await triggerBreakInAlert();
    failedAttempts = 0; // Reset after alert
  }
};

export const resetFailedAttempts = (): void => {
  failedAttempts = 0;
};

const triggerBreakInAlert = async (): Promise<void> => {
  try {
    // Take selfie silently
    const selfiePath = await takeSelfie();
    
    // Get device info
    const deviceInfo = {
      deviceId: await DeviceInfo.getUniqueId(),
      deviceName: await DeviceInfo.getDeviceName(),
      model: DeviceInfo.getModel(),
      systemVersion: DeviceInfo.getSystemVersion(),
      timestamp: new Date().toISOString(),
      selfiePath,
    };

    // In production, send this to your backend/security service
    console.log('Break-in alert triggered:', deviceInfo);
    
    // Store locally as backup
    const EncryptedStorage = require('react-native-encrypted-storage').default;
    await EncryptedStorage.setItem(
      'break_in_alert',
      JSON.stringify(deviceInfo),
    );
  } catch (error) {
    console.error('Break-in alert error:', error);
  }
};

export const requestPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissions);
      
      return Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }
  return true; // iOS permissions handled in Info.plist
};

