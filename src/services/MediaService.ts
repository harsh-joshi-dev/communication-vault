import axios from 'axios';
import {Platform} from 'react-native';

const getApiBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://192.168.1.16:5001/api';
    }
    return 'http://localhost:5001/api';
  }
  return 'https://your-api-domain.com/api';
};

const API_BASE_URL = getApiBaseUrl();

export interface UploadMediaResponse {
  mediaUrl: string;
  thumbnailUrl?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

class MediaService {
  async uploadMedia(
    fileUri: string,
    fileType: 'image' | 'video' | 'document' | 'voice',
    fileName?: string,
  ): Promise<UploadMediaResponse> {
    try {
      const EncryptedStorage = require('react-native-encrypted-storage').default;
      const token = await EncryptedStorage.getItem('access_token');

      // Create form data
      const formData = new FormData();
      
      // Determine file name
      const name = fileName || fileUri.split('/').pop() || 'file';
      
      // Determine MIME type based on file extension
      const ext = name.split('.').pop()?.toLowerCase();
      let mimeType = 'application/octet-stream';
      
      if (fileType === 'image') {
        mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext || 'jpeg'}`;
      } else if (fileType === 'video') {
        mimeType = `video/${ext || 'mp4'}`;
      } else if (fileType === 'voice') {
        mimeType = `audio/${ext || 'm4a'}`;
      } else {
        // Document
        const mimeTypes: {[key: string]: string} = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          txt: 'text/plain',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
      }

      formData.append('file', {
        uri: fileUri,
        type: mimeType,
        name: name,
      } as any);
      formData.append('type', fileType);

      const response = await axios.post(
        `${API_BASE_URL}/media/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 60000, // 60 seconds for large files
        },
      );

      const result = response.data;
      
      // Ensure URLs are full URLs
      if (result.mediaUrl && !result.mediaUrl.startsWith('http')) {
        result.mediaUrl = `${API_BASE_URL.replace('/api', '')}${result.mediaUrl}`;
      }
      if (result.thumbnailUrl && !result.thumbnailUrl.startsWith('http')) {
        result.thumbnailUrl = `${API_BASE_URL.replace('/api', '')}${result.thumbnailUrl}`;
      }
      
      return result;
    } catch (error: any) {
      console.error('Media upload error:', error);
      throw new Error(
        error?.response?.data?.error || error?.message || 'Failed to upload media',
      );
    }
  }

  getMediaUrl(filename: string): string {
    const baseUrl = getApiBaseUrl().replace('/api', '');
    return `${baseUrl}/api/media/file/${filename}`;
  }

  getThumbnailUrl(filename: string): string {
    const baseUrl = getApiBaseUrl().replace('/api', '');
    return `${baseUrl}/api/media/thumbnail/${filename}`;
  }
}

export const mediaService = new MediaService();
export {MediaService};

