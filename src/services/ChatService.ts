import {io, Socket} from 'socket.io-client';
import {Platform} from 'react-native';
import {Message, Chat} from '../types';
import {uuidv4} from '../utils/uuid';
import {mediaService} from './MediaService';
import {deviceService} from './DeviceService';
import {messageStorageService} from './MessageStorageService';
import axios from 'axios';

// Backend API URL helper - Socket.io doesn't use /api path
const getApiBaseUrl = () => {
  if (__DEV__) {
    // Android: Use computer's IP for physical device, 10.0.2.2 for emulator
    if (Platform.OS === 'android') {
      return 'http://192.168.1.16:5001';
    }
    // iOS simulator and web can use localhost
    return 'http://localhost:5001';
  }
  return 'https://communication-vault.onrender.com';
};

class ChatService {
  private socket: Socket | null = null;
  private isAuthenticated: boolean = false;
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
    if (this.socket?.connected && this.isAuthenticated) {
      console.log('✅ Socket already connected and authenticated');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Get device info for authentication
      deviceService.getDeviceInfo().then(deviceInfo => {
        // Get API URL based on environment
        const apiUrl = getApiBaseUrl();

        console.log(`🔌 Connecting to chat server: ${apiUrl}`);

        // Reset authentication status
        this.isAuthenticated = false;

        // Disconnect existing socket if any
        if (this.socket) {
          // Remove all listeners to prevent duplicates
          this.socket.removeAllListeners();
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
        let authTimeout: NodeJS.Timeout | null = null;

        // Set up connection timeout (longer for Render cold starts)
        connectionTimeout = setTimeout(() => {
          if (!this.socket?.connected && !resolved) {
            console.error('❌ Connection timeout after 30 seconds');
            if (!resolved) {
              resolved = true;
              reject(new Error('Connection timeout'));
            }
          }
        }, 30000); // 30 seconds timeout

        // Set up authentication timeout - CRITICAL: Don't resolve if not authenticated
        authTimeout = setTimeout(() => {
          if (!this.isAuthenticated && !resolved) {
            console.error('❌ Authentication timeout after 15 seconds');
            if (!resolved) {
              resolved = true;
              reject(new Error('Authentication timeout'));
            }
          }
        }, 15000); // 15 seconds for auth (increased from 10)

        this.socket.on('connect', () => {
          console.log('✅ Socket connected, waiting for authentication...');
          console.log('Socket ID:', this.socket?.id);
          // Don't resolve yet - wait for 'connected' event
        });

        this.socket.on('connect_error', (error: any) => {
          console.error('❌ Connection error:', error.message);
          this.isAuthenticated = false;
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        });

        this.socket.on('disconnect', (reason) => {
          console.log('⚠️ Chat disconnected:', reason);
          this.isAuthenticated = false;
          if (reason === 'io server disconnect') {
            // Server disconnected, reconnect manually
            this.socket?.connect();
          }
        });

        // CRITICAL: Wait for server authentication confirmation
        this.socket.on('connected', (data) => {
          console.log('✅ Connection confirmed by server (authenticated):', data);
          this.isAuthenticated = true;
          
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          if (authTimeout) {
            clearTimeout(authTimeout);
          }
          
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        // Set up event listeners
        this.setupEventListeners();

        // If socket connects quickly, still wait for authentication
        if (this.socket.connected) {
          console.log('✅ Socket connected immediately, waiting for authentication...');
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
    // Mark as deleted locally immediately (optimistic)
    await messageStorageService.deleteMessage(chatId, messageId);

    // Emit delete event to server if connected
    if (this.socket?.connected) {
      this.socket.emit('delete_message', {chatId, messageId});
    } else {
      console.warn('⚠️ Socket not connected, deletion saved locally and will sync when connected');
      // Try to connect in background
      this.connect().catch(err => console.warn('Background connection failed:', err));
    }
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
    // CRITICAL: Ensure socket is connected AND authenticated before sending
    if (!this.socket?.connected || !this.isAuthenticated) {
      console.log('⚠️ Socket not connected/authenticated, attempting to connect...');
      try {
        // Try to connect and wait for authentication - this will throw if it fails
        await this.connect();
        
        // Double-check authentication after connect
        if (!this.isAuthenticated || !this.socket?.connected) {
          throw new Error('Socket not authenticated after connection');
        }
        
        console.log('✅ Socket connected and authenticated successfully');
      } catch (err: any) {
        console.error('❌ Connection attempt failed:', err.message);
        // Try one more time after a short delay
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.connect();
          
          if (!this.isAuthenticated || !this.socket?.connected) {
            throw new Error('Socket still not authenticated after retry');
          }
        } catch (retryErr: any) {
          console.error('❌ Retry connection also failed:', retryErr.message);
          // Still allow optimistic sending, but log the error
        }
      }
    }

    // Verify connection and authentication status
    if (!this.socket || !this.socket.connected || !this.isAuthenticated) {
      console.error('❌ Socket not available/authenticated:', {
        exists: !!this.socket,
        connected: this.socket?.connected,
        authenticated: this.isAuthenticated,
      });
      // Still proceed with optimistic sending, but try to connect in background
      if (!this.socket) {
        this.connect().catch(err => console.error('Background connection failed:', err));
      } else {
        this.connect().catch(err => console.error('Background reconnection failed:', err));
      }
    } else {
      console.log('✅ Socket connected and authenticated, sending message...');
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

    return new Promise((resolve) => {
      // Store message locally immediately (optimistic update)
      messageStorageService.saveMessage(message).catch(err => 
        console.error('Error storing message locally:', err)
      );

      // Set up response timeout
      const responseTimeout = setTimeout(() => {
        console.warn('⏱️ No response from server after 10 seconds, using optimistic message');
        resolve(message); // Resolve optimistically
      }, 10000); // 10 second timeout

      // If socket is not initialized, not connected, or not authenticated, try to connect first
      if (!this.socket || !this.socket.connected || !this.isAuthenticated) {
        console.warn('⚠️ Socket not available/authenticated, attempting connection before sending...');
        
        // Try to connect synchronously one more time
        this.connect()
          .then(() => {
            // Connection successful, proceed with sending
            if (this.socket?.connected && this.isAuthenticated) {
              this.sendMessageToServer(messageData, message, resolve, responseTimeout);
            } else {
              console.warn('⚠️ Still not authenticated after connect, saving locally');
              clearTimeout(responseTimeout);
              resolve(message);
            }
          })
          .catch((err) => {
            console.error('❌ Final connection attempt failed, saving locally:', err);
            clearTimeout(responseTimeout);
            // Resolve optimistically - message is saved locally
            resolve(message);
          });
        return;
      }

      // Socket is connected and authenticated, send message
      this.sendMessageToServer(messageData, message, resolve, responseTimeout);
    });
  }

  private sendMessageToServer(
    messageData: any,
    optimisticMessage: Message,
    resolve: (message: Message) => void,
    responseTimeout: NodeJS.Timeout
  ) {
    if (!this.socket || !this.socket.connected || !this.isAuthenticated) {
      console.error('❌ Cannot send message: socket not authenticated');
      resolve(optimisticMessage);
      return;
    }

    console.log('📤 Emitting send_message:', {
      chatId: messageData.chatId,
      receiverId: messageData.receiverId,
      receiverUniqueCode: messageData.receiverUniqueCode,
      type: messageData.type,
      contentLength: messageData.content?.length || 0,
    });

    this.socket.emit('send_message', messageData, async (response: any) => {
      try {
        clearTimeout(responseTimeout);
        console.log('📥 Received response from server:', response);
        
        // Handle undefined or null response
        if (!response) {
          console.warn('⚠️ No response from server, using optimistic message');
          resolve(optimisticMessage);
          return;
        }

        if (response.error) {
          console.error('❌ Server error:', response.error);
          // For all errors, resolve optimistically (message is saved locally)
          console.warn('⚠️ Server error but keeping message locally:', response.error);
          resolve(optimisticMessage);
        } else if (response.message) {
          console.log('✅ Message sent successfully:', response.message.id);
          // Update local storage with server response (includes server ID, timestamps, etc.)
          const serverMessage = response.message;
          await messageStorageService.saveMessage(serverMessage);
          
          // Also update chat with the sent message
          try {
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(optimisticMessage.chatId, serverMessage);
          } catch (err) {
            console.error('Error updating chat:', err);
          }
          
          resolve(serverMessage);
        } else {
          // If no error and no message, assume success and use the optimistic message
          console.warn('⚠️ Server response missing message field, using optimistic message');
          resolve(optimisticMessage);
        }
      } catch (error: any) {
        clearTimeout(responseTimeout);
        console.error('❌ Error handling send_message response:', error);
        // Resolve optimistically instead of rejecting
        console.warn('⚠️ Resolving optimistically due to error');
        resolve(optimisticMessage);
      }
    });
  }

  async createChat(params: {
    userId?: string;
    phoneNumber?: string;
    contactName?: string;
    contactEmail?: string;
  }): Promise<Chat> {
    // Create chat locally (optimistic)
    const chatId = params.userId ? `chat_${params.userId}` : `chat_${params.phoneNumber}`;
    
    return new Promise((resolve) => {
      // Return chat immediately (optimistic)
      const chat: Chat = {
        id: chatId,
        participantIds: params.userId ? [params.userId] : [],
        otherUser: params.userId ? undefined : {
          id: undefined,
          name: params.contactName || 'Unknown User',
          isAppUser: false,
        },
        lastMessage: undefined,
        unreadCount: 0,
        isBlocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      resolve(chat);
      
      // Try to sync with server if connected
      if (this.socket?.connected) {
        // Server sync can happen in background
      } else {
        console.warn('⚠️ Socket not connected, chat created locally');
        this.connect().catch(err => console.warn('Background connection failed:', err));
      }

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
    // Ensure socket is connected and authenticated before marking as read
    if (!this.socket?.connected || !this.isAuthenticated) {
      console.log('⚠️ Socket not connected/authenticated, attempting to connect...');
      try {
        await this.connect();
        
        // Double-check after connection
        if (!this.socket?.connected || !this.isAuthenticated) {
          console.warn('⚠️ Still not authenticated after connect, skipping mark as read');
          return;
        }
      } catch (err: any) {
        console.error('❌ Connection failed for mark as read:', err.message);
        return;
      }
    }
    
    // Use socket.io for marking as read
    if (this.socket?.connected && this.isAuthenticated) {
      console.log('📖 Marking messages as read via socket:', {chatId, messageIds});
      this.socket.emit('mark_read', {chatId, messageIds});
    } else {
      console.warn('⚠️ Socket not connected/authenticated, skipping mark as read');
    }
  }

}

export const chatService = new ChatService();
export {ChatService};

