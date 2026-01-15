import {io, Socket} from 'socket.io-client';
import {Platform} from 'react-native';
import {Message, Chat} from '../types';
import {uuidv4} from '../utils/uuid';
import {mediaService} from './MediaService';
import {deviceService} from './DeviceService';
import {messageStorageService} from './MessageStorageService';
import axios from 'axios';

// Backend API URL - Always use production URL
const getApiBaseUrl = () => {
  return 'https://communication-vault.onrender.com';
};

class ChatService {
  private socket: Socket | null = null;
  private isAuthenticated: boolean = false;
  private connectionPromise: Promise<void> | null = null;
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
    // If already connected and authenticated, return immediately
    if (this.socket?.connected && this.isAuthenticated && this.socket.id) {
      return Promise.resolve();
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Start new connection
    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        const deviceInfo = await deviceService.getDeviceInfo();
        const apiUrl = getApiBaseUrl();

        console.log(`🔌 Connecting to chat server: ${apiUrl}`);

        // Disconnect existing socket if any
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        this.isAuthenticated = false;

        // Create socket with simpler configuration
        this.socket = io(apiUrl, {
          auth: {
            deviceId: deviceInfo.deviceId,
            uniqueCode: deviceInfo.uniqueCode,
            deviceName: deviceInfo.deviceName,
          },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          // Remove forceNew - let socket.io manage connections naturally
        });

        let authReceived = false;

        // Connection successful
        this.socket.on('connect', () => {
          console.log('✅ Socket connected, Socket ID:', this.socket?.id);
        });

        // Authentication confirmed by server
        this.socket.on('connected', (data) => {
          console.log('✅ Authenticated:', data);
          this.isAuthenticated = true;
          authReceived = true;
          
          if (this.connectionPromise) {
            this.connectionPromise = null;
          }
          resolve();
        });

        // Connection errors
        this.socket.on('connect_error', (error: any) => {
          console.error('❌ Connection error:', error.message);
          this.isAuthenticated = false;
          
          // Only reject if we haven't received auth yet
          if (!authReceived) {
            setTimeout(() => {
              if (!this.isAuthenticated && !authReceived) {
                this.connectionPromise = null;
                reject(error);
              }
            }, 5000);
          }
        });

        // Disconnect handler
        this.socket.on('disconnect', (reason) => {
          console.log('⚠️ Disconnected:', reason);
          this.isAuthenticated = false;
          
          // Auto-reconnect will handle it, but reset auth
          if (reason === 'io server disconnect') {
            this.socket?.connect();
          }
        });

        // Set up event listeners
        this.setupEventListeners();

        // Timeout after 30 seconds if no auth
        setTimeout(() => {
          if (!this.isAuthenticated && !authReceived) {
            console.error('❌ Authentication timeout');
            this.connectionPromise = null;
            reject(new Error('Authentication timeout'));
          }
        }, 30000);

      } catch (error: any) {
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // New message received
    this.socket.on('new_message', async (messageData: any) => {
      try {
        const message: Message = {
          id: messageData.id || messageData._id || uuidv4(),
          chatId: messageData.chatId || messageData.chat_id,
          senderId: messageData.senderId || messageData.sender_id,
          receiverId: messageData.receiverId || messageData.receiver_id,
          type: messageData.type || 'text',
          content: messageData.content || '',
          mediaUrl: messageData.mediaUrl || messageData.media_url,
          thumbnailUrl: messageData.thumbnailUrl || messageData.thumbnail_url,
          fileName: messageData.fileName || messageData.file_name,
          fileSize: messageData.fileSize || messageData.file_size,
          duration: messageData.duration,
          isViewOnce: messageData.isViewOnce || messageData.is_view_once || false,
          autoDeleteAfter: messageData.autoDeleteAfter || messageData.auto_delete_after,
          status: messageData.status || 'sent',
          sentAt: messageData.sentAt || messageData.sent_at || new Date().toISOString(),
          deliveredAt: messageData.deliveredAt || messageData.delivered_at,
          readAt: messageData.readAt || messageData.read_at,
          createdAt: messageData.createdAt || messageData.created_at || new Date().toISOString(),
        };

        // Save to local storage
        await messageStorageService.saveMessage(message);

        // Notify listeners
        this.messageListeners.forEach(listener => listener(message));
      } catch (error: any) {
        console.error('Error handling new message:', error);
      }
    });

    // Message status update
    this.socket.on('message_status_update', (update: any) => {
      this.messageStatusListeners.forEach(listener => listener({
        messageId: update.messageId || update.message_id,
        chatId: update.chatId || update.chat_id,
        status: update.status,
        deliveredAt: update.deliveredAt || update.delivered_at,
        readAt: update.readAt || update.read_at,
      }));
    });

    // Chat updated
    this.socket.on('chat_updated', (chatData: any) => {
      const chat: Chat = {
        id: chatData.id || chatData._id,
        participantIds: chatData.participantIds || chatData.participant_ids || [],
        otherUser: chatData.otherUser || chatData.other_user,
        lastMessage: chatData.lastMessage || chatData.last_message,
        unreadCount: chatData.unreadCount || chatData.unread_count || 0,
        isBlocked: chatData.isBlocked || chatData.is_blocked || false,
        createdAt: chatData.createdAt || chatData.created_at,
        updatedAt: chatData.updatedAt || chatData.updated_at,
      };
      this.chatListeners.forEach(listener => listener(chat));
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isAuthenticated = false;
    this.connectionPromise = null;
  }

  onMessage(listener: (message: Message) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  onChatUpdate(listener: (chat: Chat) => void): () => void {
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
    await messageStorageService.deleteMessage(chatId, messageId);
    if (this.socket?.connected && this.isAuthenticated) {
      this.socket.emit('delete_message', {chatId, messageId});
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
    // Upload media if provided
    let mediaUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;

    if (mediaUri && type !== 'text') {
      try {
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

    // Get device info
    const deviceInfo = await deviceService.getDeviceInfo();

    // Create optimistic message
    const message: Message = {
      id: uuidv4(),
      chatId,
      senderId: deviceInfo.deviceId,
      receiverId,
      type,
      content,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      duration: options?.duration,
      isViewOnce: options?.isViewOnce || false,
      autoDeleteAfter: options?.autoDeleteAfter,
      status: 'sending',
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Save locally immediately
    await messageStorageService.saveMessage(message);

    // Try to connect if not connected
    if (!this.socket?.connected || !this.isAuthenticated) {
      try {
        await this.connect();
      } catch (error) {
        console.warn('⚠️ Could not connect, message saved locally:', error);
        // Update status to failed but keep message
        message.status = 'failed';
        await messageStorageService.saveMessage(message);
        return message;
      }
    }

    // Prepare message data
    const messageData: any = {
      chatId,
      receiverId,
      receiverUniqueCode: options?.receiverUniqueCode,
      type,
      content,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      duration: options?.duration,
      isViewOnce: options?.isViewOnce,
      autoDeleteAfter: options?.autoDeleteAfter,
      phoneNumber: options?.phoneNumber,
      contactName: options?.contactName,
      email: options?.email,
    };

    return new Promise((resolve) => {
      // Set timeout for response
      const timeout = setTimeout(() => {
        console.warn('⏱️ No response from server, using optimistic message');
        message.status = 'sent';
        messageStorageService.saveMessage(message).catch(console.error);
        resolve(message);
      }, 15000);

      // Send message
      if (this.socket?.connected && this.isAuthenticated) {
        console.log('📤 Sending message:', {chatId, type, contentLength: content.length});
        
        this.socket.emit('send_message', messageData, async (response: any) => {
          clearTimeout(timeout);
          
          if (response?.error) {
            console.error('❌ Server error:', response.error);
            message.status = 'failed';
            await messageStorageService.saveMessage(message);
            resolve(message);
            return;
          }

          if (response?.message) {
            console.log('✅ Message sent successfully');
            const serverMessage: Message = {
              ...message,
              id: response.message.id || response.message._id || message.id,
              status: 'sent',
              sentAt: response.message.sentAt || response.message.sent_at || message.sentAt,
            };
            await messageStorageService.saveMessage(serverMessage);
            resolve(serverMessage);
          } else {
            // No error but no message - assume success
            message.status = 'sent';
            await messageStorageService.saveMessage(message);
            resolve(message);
          }
        });
      } else {
        clearTimeout(timeout);
        console.warn('⚠️ Socket not connected, message saved locally');
        message.status = 'failed';
        await messageStorageService.saveMessage(message);
        resolve(message);
      }
    });
  }

  async createChat(params: {
    userId?: string;
    phoneNumber?: string;
    contactName?: string;
    contactEmail?: string;
  }): Promise<Chat> {
    const chatId = params.userId ? `chat_${params.userId}` : `chat_${params.phoneNumber}`;
    
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
    
    return chat;
  }

  async markAsRead(chatId: string, messageIds: string[]): Promise<void> {
    if (this.socket?.connected && this.isAuthenticated) {
      this.socket.emit('mark_read', {
        chatId,
        messageIds,
      });
    }
    
    // Update locally regardless
    for (const messageId of messageIds) {
      await messageStorageService.updateMessageStatus(chatId, messageId, 'read');
    }
  }

  async joinChat(chatId: string): Promise<void> {
    if (this.socket?.connected && this.isAuthenticated) {
      this.socket.emit('join_chat', {chatId});
    }
  }

  async leaveChat(chatId: string): Promise<void> {
    if (this.socket?.connected && this.isAuthenticated) {
      this.socket.emit('leave_chat', {chatId});
    }
  }

  async sendTypingIndicator(chatId: string, isTyping: boolean): Promise<void> {
    if (this.socket?.connected && this.isAuthenticated) {
      this.socket.emit('typing', {chatId, isTyping});
    }
  }
}

export const chatService = new ChatService();
