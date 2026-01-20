import {User} from '../types';
import {uuidv4} from '../utils/uuid';
import axios from 'axios';

// Backend API URL - both emulator and physical device use the same Render server
const getApiBaseUrl = () => 'https://communication-vault.onrender.com/api';

const API_BASE_URL = getApiBaseUrl();

class AuthService {
  async signup(userData: {
    name: string;
    email: string;
    mobile: string;
    username: string;
    password: string;
  }): Promise<User> {
    try {
      console.log('[AuthService] Signup called with:', {
        name: userData.name,
        email: userData.email,
        mobile: userData.mobile,
        username: userData.username,
        hasPassword: !!userData.password,
      });

      // Try to call backend API first
      try {
        const response = await axios.post(
          `${API_BASE_URL}/auth/signup`,
          {
            name: userData.name,
            email: userData.email,
            mobile: userData.mobile,
            username: userData.username,
            password: userData.password,
            plan: 'free', // Default to free plan
          },
          {
            timeout: 30000, // Increased timeout for Render cold starts
            headers: {
              'Content-Type': 'application/json',
            },
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
          },
        ).catch((error) => {
          // Better error handling - don't show XHR errors for non-critical operations
          if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNABORTED' || error.message?.includes('Network Error')) {
            console.warn('[AuthService] Network error during signup (continuing with local storage):', error.message);
            // Don't throw - will create local user instead
            throw error;
          }
          throw error;
        });

        console.log('[AuthService] Backend signup successful:', response.data);
        
        // Backend returns user data with tokens
        const backendUser = response.data.user;
        const newUser: User = {
          id: backendUser.id || uuidv4(),
          username: backendUser.username || userData.username,
          email: backendUser.email || userData.email,
          mobile: backendUser.mobile || userData.mobile,
          uniqueCode: backendUser.uniqueCode || backendUser.unique_code || '',
          name: backendUser.name || userData.name,
          isVerified: backendUser.is_verified || backendUser.isVerified || false,
          privacySettings: backendUser.privacy_settings || backendUser.privacySettings || {
            allowMobileDiscovery: true,
            allowUsernameDiscovery: true,
            inviteOnly: false,
            showOnlineStatus: true,
            showLastSeen: true,
          },
          subscription: backendUser.subscription || {
            plan: 'free',
            storageLimit: 1024,
            usedStorage: 0,
          },
          createdAt: backendUser.created_at || backendUser.createdAt || new Date().toISOString(),
        };

        // Store tokens if provided
        if (response.data.access_token) {
          const EncryptedStorage = require('react-native-encrypted-storage').default;
          await EncryptedStorage.setItem('access_token', response.data.access_token);
          if (response.data.refresh_token) {
            await EncryptedStorage.setItem('refresh_token', response.data.refresh_token);
          }
        }

        // Store password hash locally as backup
        await this.storePasswordHash(userData.password);

        return newUser;
      } catch (backendError: any) {
        // If backend fails, create local user (for offline development)
        console.warn('[AuthService] Backend signup failed, creating local user:', backendError?.response?.data || backendError?.message);
        
        // Generate a temporary unique code for local users
        const tempUniqueCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        const newUser: User = {
          id: uuidv4(),
          username: userData.username,
          email: userData.email,
          mobile: userData.mobile,
          uniqueCode: tempUniqueCode,
          name: userData.name,
          isVerified: true, // Mark as verified since OTP was already verified
          privacySettings: {
            allowMobileDiscovery: true,
            allowUsernameDiscovery: true,
            inviteOnly: false,
            showOnlineStatus: true,
            showLastSeen: true,
          },
          subscription: {
            plan: 'free',
            storageLimit: 1024, // 1GB in MB
            usedStorage: 0,
          },
          createdAt: new Date().toISOString(),
        };

        // Store password hash locally
        await this.storePasswordHash(userData.password);

        console.log('[AuthService] Created local user (backend unavailable)');
        return newUser;
      }
    } catch (error: any) {
      console.error('[AuthService] Signup error:', error?.message || error);
      throw new Error(error?.response?.data?.error || error?.message || 'Failed to create account');
    }
  }

  async login(email: string, password: string): Promise<User> {
    try {
      // Verify password
      const isValid = await this.verifyPassword(password);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Try to call backend API
      try {
        const response = await axios.post(
          `${API_BASE_URL}/auth/login`,
          {
            email: email,
            password: password,
          },
          {
            timeout: 30000, // Increased timeout for Render cold starts
            headers: {
              'Content-Type': 'application/json',
            },
            validateStatus: (status) => status < 500,
          },
        ).catch((error) => {
          if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNABORTED') {
            console.warn('[AuthService] Network error during login:', error.message);
            throw new Error('Network error. Please check your connection.');
          }
          throw error;
        });

        console.log('[AuthService] Backend login successful:', response.data);
        
        // Backend returns user data with tokens
        const backendUser = response.data.user;
        const user: User = {
          id: backendUser.id || uuidv4(),
          username: backendUser.username || 'user',
          email: backendUser.email || email,
          mobile: backendUser.mobile || '',
          uniqueCode: backendUser.uniqueCode || backendUser.unique_code || '',
          name: backendUser.name || 'User',
          isVerified: backendUser.is_verified || backendUser.isVerified || false,
          privacySettings: backendUser.privacy_settings || backendUser.privacySettings || {
            allowMobileDiscovery: true,
            allowUsernameDiscovery: true,
            inviteOnly: false,
            showOnlineStatus: true,
            showLastSeen: true,
          },
          subscription: backendUser.subscription || {
            plan: 'free',
            storageLimit: 1024,
            usedStorage: 0,
          },
          createdAt: backendUser.created_at || backendUser.createdAt || new Date().toISOString(),
        };

        // Store tokens if provided
        if (response.data.access_token) {
          const EncryptedStorage = require('react-native-encrypted-storage').default;
          await EncryptedStorage.setItem('access_token', response.data.access_token);
          if (response.data.refresh_token) {
            await EncryptedStorage.setItem('refresh_token', response.data.refresh_token);
          }
        }

        return user;
      } catch (backendError: any) {
        // If backend fails, use local verification
        console.warn('[AuthService] Backend login failed, using local verification:', backendError?.response?.data || backendError?.message);
        
        // Verify password locally
        const isValid = await this.verifyPassword(password);
        if (!isValid) {
          throw new Error('Invalid credentials');
        }

        // Return mock user for offline development
        const user: User = {
          id: 'user-123',
          username: 'testuser',
          email: email,
          mobile: '+1234567890',
          uniqueCode: 'TEST1234',
          name: 'Test User',
          isVerified: true,
          privacySettings: {
            allowMobileDiscovery: true,
            allowUsernameDiscovery: true,
            inviteOnly: false,
            showOnlineStatus: true,
            showLastSeen: true,
          },
          subscription: {
            plan: 'free',
            storageLimit: 1024,
            usedStorage: 0,
          },
          createdAt: new Date().toISOString(),
        };

        return user;
      }
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Invalid credentials');
    }
  }

  async logout(): Promise<void> {
    // Clear session, tokens, etc.
    // In production, call backend to invalidate session
  }

  async updateUser(user: User): Promise<User> {
    try {
      // In production, call backend API
      return user;
    } catch (error) {
      console.error('Update user error:', error);
      throw new Error('Failed to update user');
    }
  }

  async sendOTP(type: 'email' | 'mobile', value: string): Promise<void> {
    try {
      // Call backend API to send OTP
      // Backend always generates 123456 for now
      // Suppress errors for OTP sending - not critical for app to function
      axios.post(
        `${API_BASE_URL}/auth/send-otp`,
        {
          type: type,
          value: value,
        },
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ).catch((error) => {
        // Suppress network errors - app works without backend OTP
        console.warn('[AuthService] OTP send failed (non-critical):', error.message);
      });
      console.log(`OTP sent to ${type}: ${value} (use 123456 to verify)`);
    } catch (error: any) {
      console.error('Send OTP error:', error?.response?.data || error?.message || error);
      // Don't throw error - allow user to proceed with 123456
      console.warn('Backend unavailable, but you can use 123456 to verify');
    }
  }

  async verifyOTP(otp: string, type: 'email' | 'mobile', value?: string): Promise<boolean> {
    // Normalize OTP - remove all whitespace
    const normalizedOtp = otp.replace(/\s/g, '');
    console.log('[AuthService] verifyOTP called:', {otp, normalizedOtp, type, value, otpLength: normalizedOtp.length});
    
    // Always accept 123456 for development (even if backend is down)
    if (normalizedOtp === '123456') {
      console.log('[AuthService] ✅ Accepting 123456 as valid OTP (development mode)');
      // Try to call backend in background, but don't fail if it doesn't work
      axios.post(
        `${API_BASE_URL}/auth/verify-otp`,
        {
          type: type,
          value: value || '',
          code: '123456',
        },
        {
          timeout: 3000,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ).catch((error) => {
        // Ignore backend errors for 123456
        console.warn('[AuthService] Backend unavailable for 123456 (ignored):', error?.message || error);
      });
      
      console.log('[AuthService] ✅ Returning true for 123456');
      return true; // Return immediately, don't wait for backend
    }

    // For other OTPs, call backend API
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/verify-otp`,
        {
          type: type,
          value: value || '',
          code: otp,
        },
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status < 500,
        },
      ).catch((error) => {
        // If verify fails, return false (will fallback to local check for 123456)
        console.warn('[AuthService] OTP verify failed:', error.message);
        return {data: {verified: false}};
      });
      
      // Backend returns {message: 'OTP verified successfully'} on success
      return response.status === 200;
    } catch (error: any) {
      console.error('Verify OTP error:', error?.response?.data || error?.message || error);
      return false;
    }
  }

  async checkUsernameAvailability(username: string): Promise<boolean> {
    try {
      // Check with backend API
      // Suppress errors for username check - allow username even if check fails
      const response = await axios.post(
        `${API_BASE_URL}/auth/check-username`,
        {username: username.trim().toLowerCase()},
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status < 500,
        },
      ).catch((error) => {
        // If check fails, assume username is available (optimistic)
        console.warn('[AuthService] Username check failed (assuming available):', error.message);
        return {data: {available: true}};
      });
      
      // Backend returns {available: true/false}
      return response.data?.available ?? true;
    } catch (error: any) {
      // If backend is not available or network error, allow username (optimistic)
      // This prevents blocking users when backend is down
      console.warn('Username check error (allowing username):', error?.message || error);
      return true; // Allow username if check fails
    }
  }

  private async storePasswordHash(password: string): Promise<void> {
    // In production, password should be hashed on backend
    // For now, store encrypted locally
    const EncryptedStorage = require('react-native-encrypted-storage').default;
    await EncryptedStorage.setItem('user_password_hash', password);
  }

  private async verifyPassword(password: string): Promise<boolean> {
    // In production, verify with backend
    // For now, check against stored hash
    const EncryptedStorage = require('react-native-encrypted-storage').default;
    const storedHash = await EncryptedStorage.getItem('user_password_hash');
    return storedHash === password;
  }
}

export const authService = new AuthService();
export {AuthService};

