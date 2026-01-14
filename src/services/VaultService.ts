import {VaultItem} from '../types';
import {uuidv4} from '../utils/uuid';
import RNFS from 'react-native-fs';
import {capturePhoto, captureVideo} from './CameraService';
import DocumentPicker from 'react-native-document-picker';

const VAULT_DIR = `${RNFS.DocumentDirectoryPath}/vault`;

class VaultService {
  private async ensureDirectories() {
    const dirs = ['photos', 'videos', 'documents'];
    for (const dir of dirs) {
      await RNFS.mkdir(`${VAULT_DIR}/${dir}`, {
        NSURLIsExcludedFromBackupKey: true,
      });
    }
  }

  async initialize() {
    await this.ensureDirectories();
  }

  async addPhoto(): Promise<VaultItem> {
    try {
      const filePath = await capturePhoto();
      const stats = await RNFS.stat(filePath);
      const fileName = filePath.split('/').pop() || 'photo.jpg';

      const item: VaultItem = {
        id: uuidv4(),
        type: 'photo',
        name: fileName,
        path: filePath,
        size: stats.size,
        mimeType: 'image/jpeg',
        createdAt: new Date().toISOString(),
        isEncrypted: false,
      };

      return item;
    } catch (error) {
      throw new Error('Failed to add photo');
    }
  }

  async addVideo(): Promise<VaultItem> {
    try {
      const filePath = await captureVideo();
      const stats = await RNFS.stat(filePath);
      const fileName = filePath.split('/').pop() || 'video.mp4';

      const item: VaultItem = {
        id: uuidv4(),
        type: 'video',
        name: fileName,
        path: filePath,
        size: stats.size,
        mimeType: 'video/mp4',
        createdAt: new Date().toISOString(),
        isEncrypted: false,
      };

      return item;
    } catch (error) {
      throw new Error('Failed to add video');
    }
  }

  async addDocument(): Promise<VaultItem> {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });

      if (result.length === 0) {
        throw new Error('No file selected');
      }

      const file = result[0];
      const destPath = `${VAULT_DIR}/documents/${file.name}`;

      await RNFS.copyFile(file.uri, destPath);
      const stats = await RNFS.stat(destPath);

      const item: VaultItem = {
        id: uuidv4(),
        type: 'document',
        name: file.name || 'document',
        path: destPath,
        size: stats.size,
        mimeType: file.type || 'application/octet-stream',
        createdAt: new Date().toISOString(),
        isEncrypted: false,
      };

      return item;
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        throw new Error('Document picker cancelled');
      }
      throw new Error('Failed to add document');
    }
  }

  async getItems(): Promise<VaultItem[]> {
    // In production, load from database or storage
    return [];
  }

  async deleteItem(itemId: string): Promise<void> {
    // In production, delete file and remove from storage
  }

  async exportItem(item: VaultItem): Promise<string> {
    // In production, copy to export location
    return item.path;
  }

  async getStorageUsage(): Promise<number> {
    try {
      const photos = await RNFS.readDir(`${VAULT_DIR}/photos`);
      const videos = await RNFS.readDir(`${VAULT_DIR}/videos`);
      const documents = await RNFS.readDir(`${VAULT_DIR}/documents`);

      let totalSize = 0;

      for (const file of [...photos, ...videos, ...documents]) {
        if (file.isFile()) {
          totalSize += file.size;
        }
      }

      return totalSize / 1024 / 1024; // Return in MB
    } catch (error) {
      return 0;
    }
  }
}

export const vaultService = new VaultService();
export {VaultService};

