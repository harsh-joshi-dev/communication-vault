import {io, Socket} from 'socket.io-client';
import {Platform} from 'react-native';
import {Message, Chat} from '../types';
import {uuidv4} from '../utils/uuid';
import {mediaService} from './MediaService';
import {deviceService} from './DeviceService';
import {messageStorageService} from './MessageStorageService';
import axios from 'axios';

// Backend API URL - Update this to your server URL
// For Android physical device, use your computer's IP address
// For Android emulator, use 10.0.2.2
const API_BASE_URL = __DEV__
  ? (Platform.OS === 'android' ? 'http://192.168.1.16:5001' : 'http://localhost:5001')
  : 'https://communication-vault.onrender.com';

class ChatService {
  private socket: Socket | null = null;
  private messageListeners: ((message: Message) => void)[] = [];
  private chatListeners: ((chat: Chat) => void)[] = [];
  private messageStatusListeners: ((update: {
    messageId: string;
    chatId: string;
    status: Message['status'];
    deliveredAt?: string;
    readAt?: string;
  }) => void)[] = [];

  get socketInstance(): Socket | null {
    return this.socket;
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      // Get device info for authentication
      deviceService.getDeviceInfo().then(deviceInfo => {
        // Update API URL for Android (physical device or emulator)
        const apiUrl = __DEV__ && Platform.OS === 'android'
          ? 'http://192.168.1.16:5001'
          : (__DEV__ ? 'http://localhost:5001' : 'https://communication-vault.onrender.com');

        this.socket = io(apiUrl, {
          auth: {
            deviceId: deviceInfo.deviceId,
            uniqueCode: deviceInfo.uniqueCode,
            deviceName: deviceInfo.deviceName,
          },
          transports: ['websocket'],
        });

        this.socket.on('connect', () => {
          console.log('Chat connected');
          resolve();
        });

        this.socket.on('disconnect', () => {
          console.log('Chat disconnected');
        });

        this.socket.on('new_message', async (message: Message) => {
          // Store message locally (non-blocking for speed)
          messageStorageService.saveMessage(message).catch(err => 
            console.error('Error saving message:', err)
          );
          
          // Notify listeners immediately (optimistic update)
          this.messageListeners.forEach(listener => listener(message));
        });

        this.socket.on('chat_updated', (chat: Chat) => {
          this.chatListeners.forEach(listener => listener(chat));
        });

        // Listen for message status updates
        this.socket.on('message_status_update', async (update: {
          messageId: string;
          chatId: string;
          status: Message['status'];
          deliveredAt?: string;
          readAt?: string;
        }) => {
          // Update local storage (non-blocking)
          messageStorageService.updateMessageStatus(
            update.chatId,
            update.messageId,
            update.status,
            update.deliveredAt,
            update.readAt,
          ).catch(err => console.error('Error updating status:', err));
          
          // Notify listeners immediately
          this.messageStatusListeners.forEach(listener => listener(update));
        });

        // Listen for message deletion
        this.socket.on('message_deleted', async (data: {chatId: string; messageId: string}) => {
          messageStorageService.deleteMessage(data.chatId, data.messageId).catch(err => 
            console.error('Error deleting message:', err)
          );
          // Notify listeners immediately
          this.messageListeners.forEach(listener => {
        const deletedMessage: Message = {
          id: data.messageId,
          chatId: data.chatId,
          senderId: '',
          receiverId: '',
          type: 'text',
          content: '',
          isDeleted: true,
          isViewOnce: false,
          status: 'sent',
          createdAt: new Date().toISOString(),
        };
            listener(deletedMessage);
          });
        });
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onMessage(listener: (message: Message) => void) {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  onChatUpdate(listener: (chat: Chat) => void) {
    this.chatListeners.push(listener);
    return () => {
      this.chatListeners = this.chatListeners.filter(l => l !== listener);
    };
  }

  onMessageStatusUpdate(listener: (update: {
    messageId: string;
    chatId: string;
    status: Message['status'];
    deliveredAt?: string;
    readAt?: string;
  }) => void) {
    this.messageStatusListeners.push(listener);
    return () => {
      this.messageStatusListeners = this.messageStatusListeners.filter(l => l !== listener);
    };
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to chat server');
    }

    // Mark as deleted locally immediately
    await messageStorageService.deleteMessage(chatId, messageId);

    // Emit delete event to server
    this.socket.emit('delete_message', {chatId, messageId});
  }

  async sendMessage(
    chatId: string,
    receiverId: string | undefined,
    type: Message['type'],
    content: string,
    mediaUri?: string,
    options?: {
      isViewOnce?: boolean;
      autoDeleteAfter?: number;
      phoneNumber?: string;
      contactName?: string;
      email?: string;
      isAppUser?: boolean;
      fileName?: string;
      fileSize?: number;
      duration?: number;
    },
  ): Promise<Message> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to chat server');
    }

    // Upload media file if provided
    let mediaUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;

    if (mediaUri && type !== 'text') {
      try {
        // Determine media type from message type
        let mediaType: 'image' | 'video' | 'document' | 'voice' = 'image';
        if (type === 'video') mediaType = 'video';
        else if (type === 'document') mediaType = 'document';
        else if (type === 'voice') mediaType = 'voice';

        const uploadResult = await mediaService.uploadMedia(
          mediaUri,
          mediaType,
          options?.fileName,
        );
        mediaUrl = uploadResult.mediaUrl;
        thumbnailUrl = uploadResult.thumbnailUrl;
        fileName = uploadResult.fileName;
        fileSize = uploadResult.fileSize;
      } catch (error: any) {
        console.error('Media upload failed:', error);
        throw new Error(`Failed to upload media: ${error.message}`);
      }
    }

    // Get device info for sender
    const deviceInfo = await deviceService.getDeviceInfo();

    // Allow sending to non-app users (receiverId can be undefined)
    const message: Message = {
      id: uuidv4(),
      chatId,
      senderId: deviceInfo.deviceId, // Use device ID as sender
      receiverId: receiverId || '',
      type,
      content,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      duration: options?.duration,
      isViewOnce: options?.isViewOnce || false,
      autoDeleteAfter: options?.autoDeleteAfter,
      isDeleted: false,
      status: 'sending', // Initial status
      createdAt: new Date().toISOString(),
    };

    // Add non-app user info to message data
    const messageData: any = {...message};
    if (options && !options.isAppUser) {
      messageData.phoneNumber = options.phoneNumber;
      messageData.contactName = options.contactName;
      messageData.email = options.email;
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      // Store message locally immediately (optimistic update)
      messageStorageService.saveMessage(message).catch(err => 
        console.error('Error storing message locally:', err)
      );

      this.socket.emit('send_message', messageData, async (response: any) => {
        if (response.error) {
          // Check for specific error types
          if (response.error.includes('not registered') || response.error.includes('not invited')) {
            reject(new Error('User is not registered or invited. Please invite them first.'));
          } else {
            reject(new Error(response.error));
          }
        } else {
          // Update local storage with server response (includes server ID, timestamps, etc.)
          const serverMessage = response.message;
          await messageStorageService.saveMessage(serverMessage);
          resolve(serverMessage);
        }
      });
    });
  }

  async createChat(params: {
    userId?: string;
    phoneNumber?: string;
    contactName?: string;
    contactEmail?: string;
  }): Promise<Chat> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to chat server');
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      // Use HTTP API for creating chat (more reliable)
      const apiUrl = __DEV__ && Platform.OS === 'android'
        ? 'http://192.168.1.16:5001'
        : (__DEV__ ? 'http://localhost:5001' : 'https://communication-vault.onrender.com');

      // For now, we'll create chat via socket or handle it in the component
      // The backend will create chat automatically when first message is sent
      resolve({
        id: params.userId ? `chat_${params.userId}` : `chat_${params.phoneNumber}`,
        participantIds: params.userId ? [params.userId] : [],
        otherUser: params.userId ? undefined : {
          id: undefined,
          name: params.contactName,
          isAppUser: false,
        },
        lastMessage: undefined,
        unreadCount: 0,
        isBlocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async getChats(): Promise<Chat[]> {
    // In production, fetch from API
    return [];
  }

  async getMessages(chatId: string): Promise<Message[]> {
    try {
      // Get messages from local storage (primary source)
      // Socket.io will sync messages in real-time
      const localMessages = await messageStorageService.getMessages(chatId);
      
      // Return sorted messages
      return localMessages.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  async markAsRead(chatId: string, messageIds: string[]): Promise<void> {
    if (!this.socket?.connected) return;

    this.socket.emit('mark_read', {chatId, messageIds});
    
    // Also call HTTP API as backup
    try {
      const EncryptedStorage = require('react-native-encrypted-storage').default;
      const token = await EncryptedStorage.getItem('access_token');
      
      const apiUrl = __DEV__ && Platform.OS === 'android'
        ? 'http://192.168.1.16:5001/api'
        : (__DEV__ ? 'http://localhost:5001/api' : 'https://communication-vault.onrender.com/api');

      await axios.get(
        `${apiUrl}/messages/chats/${chatId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

}

export const chatService = new ChatService();
export {ChatService};

