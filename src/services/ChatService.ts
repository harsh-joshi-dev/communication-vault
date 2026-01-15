import {io, Socket} from 'socket.io-client';
import {Platform} from 'react-native';
import {Message, Chat} from '../types';
import {uuidv4} from '../utils/uuid';
import {mediaService} from './MediaService';
import {deviceService} from './DeviceService';
import {messageStorageService} from './MessageStorageService';
import axios from 'axios';

// Backend API URL - Using Render production URL
const API_BASE_URL = 'https://communication-vault.onrender.com';

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
      console.log('✅ Socket already connected');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Get device info for authentication
      deviceService.getDeviceInfo().then(deviceInfo => {
        // Always use Render production URL
        const apiUrl = 'https://communication-vault.onrender.com';

        console.log(`🔌 Connecting to chat server: ${apiUrl}`);

        // Disconnect existing socket if any
        if (this.socket) {
          this.socket.disconnect();
          this.socket = null;
        }

        this.socket = io(apiUrl, {
          auth: {
            deviceId: deviceInfo.deviceId,
            uniqueCode: deviceInfo.uniqueCode,
            deviceName: deviceInfo.deviceName,
          },
          transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
          reconnection: true,
          reconnectionAttempts: Infinity, // Keep trying forever
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          forceNew: true, // Force new connection
          upgrade: true, // Allow upgrade from polling to websocket
          rememberUpgrade: false,
        });

        let resolved = false;
        let connectionTimeout: NodeJS.Timeout | null = null;

        // Set up connection timeout (longer for Render cold starts)
        connectionTimeout = setTimeout(() => {
          if (!this.socket?.connected && !resolved) {
            console.warn('⏱️ Connection timeout - but will keep retrying in background');
            // Don't reject - let reconnection handle it
            // The socket will keep trying to reconnect
            if (!resolved) {
              resolved = true;
              // Resolve anyway so app can continue (socket will reconnect in background)
              resolve();
            }
          }
        }, 30000); // 30 seconds timeout

        this.socket.on('connect', () => {
          console.log('✅ Chat connected successfully');
          console.log('Socket ID:', this.socket?.id);
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        this.socket.on('connect_error', (error: any) => {
          console.warn('⚠️ Connection error (will retry):', error.message);
          // Don't reject - let reconnection handle it
          // The socket will automatically retry
        });

        this.socket.on('disconnect', (reason) => {
          console.log('⚠️ Chat disconnected:', reason);
          if (reason === 'io server disconnect') {
            // Server disconnected, reconnect manually
            this.socket?.connect();
          }
        });

        this.socket.on('connected', (data) => {
          console.log('✅ Connection confirmed by server:', data);
        });

        // Set up event listeners
        this.setupEventListeners();

        // If socket connects quickly, resolve immediately
        if (this.socket.connected) {
          console.log('✅ Socket connected immediately');
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }
      }).catch((error) => {
        console.error('❌ Error getting device info:', error);
        reject(error);
      });
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('new_message', async (message: Message) => {
      console.log('📨 New message received:', message.id, 'from:', message.senderId);
      
      // Store message locally (non-blocking for speed)
      messageStorageService.saveMessage(message).catch(err => 
        console.error('Error saving message:', err)
      );
      
      // Ensure chat exists for this message (create if needed)
      try {
        const {chatStorageService} = await import('./ChatStorageService');
        const {deviceService} = await import('./DeviceService');
        const currentDevice = await deviceService.getDeviceInfo();
        
        // Check if chat exists
        const chats = await chatStorageService.getChats();
        let chat = chats.find(c => c.id === message.chatId);
        
        // If not found by chatId, try to find by participant IDs
        if (!chat) {
          chat = chats.find(c => 
            c.participantIds?.includes(message.senderId) || 
            c.participantIds?.includes(message.receiverId)
          );
        }
        
        if (!chat && message.senderId !== currentDevice.deviceId) {
          // Create chat for unknown device with "Unknown User" name
          const senderDeviceId = message.senderId;
          const senderUniqueCode = senderDeviceId.substring(0, 8).toUpperCase();
          const senderName = 'Unknown User'; // Default name until user edits it
          
          console.log('📝 Creating new chat for unknown device:', senderDeviceId);
          
          chat = await chatStorageService.getOrCreateChat(
            senderDeviceId,
            senderName,
            senderUniqueCode
          );
          
          // Update message chatId if chat was created with different ID
          if (chat.id !== message.chatId) {
            message.chatId = chat.id;
            await messageStorageService.saveMessage(message);
          }
        }
        
        // Update chat with message (increments unread count if from other user)
        if (chat) {
          await chatStorageService.updateChatWithMessage(chat.id, message);
          console.log('✅ Chat updated with message:', chat.id);
        }
      } catch (error) {
        console.error('❌ Error ensuring chat exists:', error);
      }
      
      // Notify listeners immediately (optimistic update)
      console.log('🔔 Notifying message listeners');
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
      receiverUniqueCode?: string;
    },
  ): Promise<Message> {
    // CRITICAL: Try to connect if not connected (non-blocking)
    if (!this.socket?.connected) {
      console.log('⚠️ Socket not connected, attempting to connect in background...');
      // Start connection in background (don't wait)
      this.connect().catch(err => {
        console.warn('Background connection attempt:', err.message);
        // Connection will retry automatically
      });
      
      // Wait a bit for quick connections
      let retries = 0;
      while (!this.socket?.connected && retries < 5) {
        await new Promise(resolve => setTimeout(resolve, 200));
        retries++;
      }
    }

    // Log connection status but don't throw error
    if (!this.socket || !this.socket.connected) {
      console.warn('⚠️ Socket not connected, message will be sent optimistically');
      console.log('Socket state:', {
        exists: !!this.socket,
        connected: this.socket?.connected,
        disconnected: this.socket?.disconnected,
      });
      // Don't throw - allow optimistic sending
    } else {
      console.log('✅ Socket connected, sending message...');
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

    // Add non-app user info and receiverUniqueCode to message data
    const messageData: any = {...message};
    if (options && !options.isAppUser) {
      messageData.phoneNumber = options.phoneNumber;
      messageData.contactName = options.contactName;
      messageData.email = options.email;
    }
    if (options?.receiverUniqueCode) {
      messageData.receiverUniqueCode = options.receiverUniqueCode;
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

      console.log('📤 Emitting send_message:', {
        chatId,
        receiverId,
        receiverUniqueCode: options?.receiverUniqueCode,
        type,
        contentLength: content.length,
      });

      // If socket is not connected, resolve optimistically and queue for later
      if (!this.socket?.connected) {
        console.warn('⚠️ Socket not connected, message will be sent when connection is restored');
        // Resolve optimistically - message is saved locally
        // When socket reconnects, it will sync
        resolve(message);
        return;
      }

      // Set up response timeout
      const responseTimeout = setTimeout(() => {
        console.warn('⏱️ No response from server, using optimistic message');
        resolve(message); // Resolve optimistically
      }, 10000); // 10 second timeout

      this.socket.emit('send_message', messageData, async (response: any) => {
        try {
          clearTimeout(responseTimeout);
          console.log('📥 Received response from server:', response);
          
          // Handle undefined or null response
          if (!response) {
            console.warn('⚠️ No response from server, using optimistic message');
            resolve(message);
            return;
          }

          if (response.error) {
            console.error('❌ Server error:', response.error);
            // Check for specific error types
            if (response.error.includes('not registered') || response.error.includes('not invited')) {
              reject(new Error('User is not registered or invited. Please invite them first.'));
            } else {
              // For other errors, still resolve optimistically
              console.warn('⚠️ Server error but keeping message locally:', response.error);
              resolve(message);
            }
          } else if (response.message) {
            console.log('✅ Message sent successfully:', response.message.id);
            // Update local storage with server response (includes server ID, timestamps, etc.)
            const serverMessage = response.message;
            await messageStorageService.saveMessage(serverMessage);
            
            // Also update chat with the sent message
            try {
              const {chatStorageService} = await import('./ChatStorageService');
              await chatStorageService.updateChatWithMessage(chatId, serverMessage);
            } catch (err) {
              console.error('Error updating chat:', err);
            }
            
            resolve(serverMessage);
          } else {
            // If no error and no message, assume success and use the optimistic message
            console.warn('⚠️ Server response missing message field, using optimistic message');
            resolve(message);
          }
        } catch (error: any) {
          clearTimeout(responseTimeout);
          console.error('❌ Error handling send_message response:', error);
          // Resolve optimistically instead of rejecting
          console.warn('⚠️ Resolving optimistically due to error');
          resolve(message);
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

