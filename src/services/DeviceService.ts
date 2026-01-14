import DeviceInfo from 'react-native-device-info';
import EncryptedStorage from 'react-native-encrypted-storage';

/**
 * Service to manage device-based unique identification
 * Uses device ID to generate and store unique codes for QR scanning
 */
class DeviceService {
  private static UNIQUE_CODE_KEY = 'device_unique_code';
  private static DEVICE_ID_KEY = 'device_id';
  private static DEVICE_NAME_KEY = 'device_name';

  /**
   * Get or generate unique code for this device
   * The unique code is derived from device ID and stored locally
   */
  async getUniqueCode(): Promise<string> {
    try {
      // Try to get stored unique code
      const storedCode = await EncryptedStorage.getItem(DeviceService.UNIQUE_CODE_KEY);
      if (storedCode) {
        return storedCode;
      }

      // Generate new unique code from device ID
      const deviceId = await DeviceInfo.getUniqueId();
      const deviceName = await DeviceInfo.getDeviceName();
      
      // Create a unique code from device ID (first 8 chars + hash)
      // This ensures it's consistent for the same device
      const uniqueCode = this.generateUniqueCodeFromDeviceId(deviceId);
      
      // Store for future use
      await EncryptedStorage.setItem(DeviceService.UNIQUE_CODE_KEY, uniqueCode);
      await EncryptedStorage.setItem(DeviceService.DEVICE_ID_KEY, deviceId);
      await EncryptedStorage.setItem(DeviceService.DEVICE_NAME_KEY, deviceName);
      
      return uniqueCode;
    } catch (error) {
      console.error('Error getting unique code:', error);
      // Fallback: generate a temporary code
      return this.generateFallbackCode();
    }
  }

  /**
   * Get device ID
   */
  async getDeviceId(): Promise<string> {
    try {
      const stored = await EncryptedStorage.getItem(DeviceService.DEVICE_ID_KEY);
      if (stored) {
        return stored;
      }
      const deviceId = await DeviceInfo.getUniqueId();
      await EncryptedStorage.setItem(DeviceService.DEVICE_ID_KEY, deviceId);
      return deviceId;
    } catch (error) {
      console.error('Error getting device ID:', error);
      return 'unknown-device';
    }
  }

  /**
   * Get device name
   */
  async getDeviceName(): Promise<string> {
    try {
      const stored = await EncryptedStorage.getItem(DeviceService.DEVICE_NAME_KEY);
      if (stored) {
        return stored;
      }
      const deviceName = await DeviceInfo.getDeviceName();
      await EncryptedStorage.setItem(DeviceService.DEVICE_NAME_KEY, deviceName);
      return deviceName;
    } catch (error) {
      console.error('Error getting device name:', error);
      return 'Unknown Device';
    }
  }

  /**
   * Generate unique code from device ID
   * Uses first 8 characters of device ID and adds a hash
   */
  private generateUniqueCodeFromDeviceId(deviceId: string): string {
    // Take first 8 chars and make it uppercase alphanumeric
    const base = deviceId.replace(/[^A-Za-z0-9]/g, '').substring(0, 8).toUpperCase();
    
    // If too short, pad with device ID hash
    if (base.length < 8) {
      const hash = this.simpleHash(deviceId);
      return (base + hash.toString().substring(0, 8 - base.length)).substring(0, 8);
    }
    
    return base.substring(0, 8);
  }

  /**
   * Simple hash function for device ID
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate fallback code if device ID fails
   */
  private generateFallbackCode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return (timestamp + random).substring(0, 8);
  }

  /**
   * Get device info for QR code
   */
  async getDeviceInfo(): Promise<{
    uniqueCode: string;
    deviceId: string;
    deviceName: string;
  }> {
    const [uniqueCode, deviceId, deviceName] = await Promise.all([
      this.getUniqueCode(),
      this.getDeviceId(),
      this.getDeviceName(),
    ]);

    return {
      uniqueCode,
      deviceId,
      deviceName,
    };
  }
}

export const deviceService = new DeviceService();

