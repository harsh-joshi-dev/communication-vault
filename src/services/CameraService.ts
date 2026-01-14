import {Platform} from 'react-native';
import {launchCamera, ImagePickerResponse} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import {uuidv4} from '../utils/uuid';

const VAULT_DIR = `${RNFS.DocumentDirectoryPath}/vault`;

export const takeSelfie = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: false, // Don't save to gallery
      },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) {
          reject(new Error('Camera cancelled or error'));
          return;
        }

        if (response.assets && response.assets[0]) {
          const asset = response.assets[0];
          const fileName = `selfie_${Date.now()}.jpg`;
          const destPath = `${VAULT_DIR}/security/${fileName}`;

          try {
            // Ensure directory exists
            await RNFS.mkdir(`${VAULT_DIR}/security`, {
              NSURLIsExcludedFromBackupKey: true,
            });

            // Move file to vault
            if (asset.uri) {
              await RNFS.moveFile(asset.uri, destPath);
              resolve(destPath);
            } else {
              reject(new Error('No file path'));
            }
          } catch (error) {
            console.error('Error saving selfie:', error);
            reject(error);
          }
        } else {
          reject(new Error('No image captured'));
        }
      },
    );
  });
};

export const capturePhoto = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.9,
        saveToPhotos: false,
      },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) {
          reject(new Error('Camera cancelled'));
          return;
        }

        if (response.assets && response.assets[0]) {
          const asset = response.assets[0];
          const fileId = uuidv4();
          const fileName = `${fileId}.jpg`;
          const destPath = `${VAULT_DIR}/photos/${fileName}`;

          try {
            await RNFS.mkdir(`${VAULT_DIR}/photos`, {
              NSURLIsExcludedFromBackupKey: true,
            });

            if (asset.uri) {
              await RNFS.moveFile(asset.uri, destPath);
              resolve(destPath);
            } else {
              reject(new Error('No file path'));
            }
          } catch (error) {
            console.error('Error saving photo:', error);
            reject(error);
          }
        } else {
          reject(new Error('No image captured'));
        }
      },
    );
  });
};

export const captureVideo = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    launchCamera(
      {
        mediaType: 'video',
        videoQuality: 'high',
        saveToPhotos: false,
      },
      async (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) {
          reject(new Error('Camera cancelled'));
          return;
        }

        if (response.assets && response.assets[0]) {
          const asset = response.assets[0];
          const fileId = uuidv4();
          const extension = asset.uri?.split('.').pop() || 'mp4';
          const fileName = `${fileId}.${extension}`;
          const destPath = `${VAULT_DIR}/videos/${fileName}`;

          try {
            await RNFS.mkdir(`${VAULT_DIR}/videos`, {
              NSURLIsExcludedFromBackupKey: true,
            });

            if (asset.uri) {
              await RNFS.moveFile(asset.uri, destPath);
              resolve(destPath);
            } else {
              reject(new Error('No file path'));
            }
          } catch (error) {
            console.error('Error saving video:', error);
            reject(error);
          }
        } else {
          reject(new Error('No video captured'));
        }
      },
    );
  });
};

