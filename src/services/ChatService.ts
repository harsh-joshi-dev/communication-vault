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
  private deletedChatIdListeners: ((chatId: string) => void)[] = [];
  private recentNewMessageIds: Set<string> = new Set();

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

        // Create socket with configuration optimized for Render cold starts
        this.socket = io(apiUrl, {
          auth: {
            deviceId: deviceInfo.deviceId,
            uniqueCode: deviceInfo.uniqueCode,
            deviceName: deviceInfo.deviceName,
          },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 8000,
          timeout: 45000,
          forceNew: false,
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
          
          // Join device room and unique code room for receiving messages
          if (this.socket?.connected) {
            const deviceId = data.deviceId || deviceInfo.deviceId;
            const uniqueCode = data.uniqueCode || deviceInfo.uniqueCode;
            
            // Join device room (for direct messages)
            this.socket.emit('join_chat', {chatId: `device_${deviceId}`});
            
            // Join unique code room (for messages by code)
            if (uniqueCode) {
              this.socket.emit('join_chat', {chatId: `code_${uniqueCode}`});
            }
            
            console.log('✅ Joined device and code rooms for receiving messages');
          }
          
          if (this.connectionPromise) {
            this.connectionPromise = null;
          }
          resolve();
        });

        this.socket.on('connect_error', () => {
          this.isAuthenticated = false;
        });

        this.socket.on('disconnect', (reason: string) => {
          this.isAuthenticated = false;
          if (reason === 'io server disconnect') {
            this.socket?.connect();
          }
        });

        // Set up event listeners
        this.setupEventListeners();

        setTimeout(() => {
          if (!this.isAuthenticated && !authReceived && this.connectionPromise) {
            this.connectionPromise = null;
            resolve();
          }
        }, 60000);

      } catch {
        this.connectionPromise = null;
        resolve();
      }
    });

    return this.connectionPromise;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // New message received - dedupe when backend emits to both code_ and device_ (receiver gets 2x)
    this.socket.on('new_message', async (messageData: any) => {
      const rawId = messageData?.id || messageData?._id;
      if (rawId && this.recentNewMessageIds.has(rawId)) {
        return;
      }
      if (rawId) {
        this.recentNewMessageIds.add(rawId);
        setTimeout(() => { this.recentNewMessageIds.delete(rawId); }, 6000);
      }
      try {
        console.log('📥 📥 📥 RECEIVED NEW MESSAGE!', {
          id: rawId,
          chatId: messageData.chatId || messageData.chat_id,
          senderId: messageData.senderId || messageData.sender_id,
          receiverId: messageData.receiverId || messageData.receiver_id,
          content: messageData.content?.substring(0, 50),
          type: messageData.type,
        });
        
        const message: Message = {
          id: messageData.id || messageData._id || uuidv4(),
          chatId: messageData.chatId || messageData.chat_id,
          senderId: messageData.senderId || messageData.sender_id,
          receiverId: messageData.receiverId || messageData.receiver_id || '',
          type: messageData.type || 'text',
          content: messageData.content || '',
          mediaUrl: messageData.mediaUrl || messageData.media_url,
          thumbnailUrl: messageData.thumbnailUrl || messageData.thumbnail_url,
          fileName: messageData.fileName || messageData.file_name,
          fileSize: messageData.fileSize || messageData.file_size,
          duration: messageData.duration,
          isViewOnce: messageData.isViewOnce || messageData.is_view_once || false,
          autoDeleteAfter: messageData.autoDeleteAfter || messageData.auto_delete_after,
          isDeleted: messageData.isDeleted || messageData.is_deleted || false,
          status: messageData.status || 'sent',
          sentAt: messageData.sentAt || messageData.sent_at || new Date().toISOString(),
          deliveredAt: messageData.deliveredAt || messageData.delivered_at,
          readAt: messageData.readAt || messageData.read_at,
          createdAt: messageData.createdAt || messageData.created_at || new Date().toISOString(),
        };

        // Check if this is a message for current device
        const deviceInfo = await deviceService.getDeviceInfo();
        const isForMe = message.receiverId === deviceInfo.deviceId || 
                       message.receiverId === deviceInfo.uniqueCode ||
                       message.senderId !== deviceInfo.deviceId;
        
        console.log(`📥 Message is for me: ${isForMe} (receiver: ${message.receiverId}, my deviceId: ${deviceInfo.deviceId}, my code: ${deviceInfo.uniqueCode})`);

        // Ensure we're joined to the chat room for this message
        if (message.chatId && this.socket?.connected && this.isAuthenticated) {
          await this.joinChat(message.chatId);
          console.log('✅ Joined chat room for received message:', message.chatId);
        }

        // Save to local storage (ALWAYS, even if duplicate)
        await messageStorageService.saveMessage(message);
        console.log('✅ Message saved locally');

        // Update chat with new message - CRITICAL: Creates chat if doesn't exist
        try {
          const {chatStorageService} = await import('./ChatStorageService');
          
          // Normalize chatId for chat creation
          const normalizedChatId = message.chatId?.startsWith('chat_') 
            ? message.chatId 
            : `chat_${message.chatId}`;
          
          // Ensure message has proper status
          const messageWithStatus = {
            ...message,
            status: message.status || 'delivered', // Default to delivered for received messages
          };
          
          await chatStorageService.updateChatWithMessage(normalizedChatId, messageWithStatus, true);
          console.log('✅ Chat updated/created with new message:', normalizedChatId, 'status:', messageWithStatus.status);
          
          // Notify chat listeners so ChatsScreen refreshes (both sides)
          const msgBase = (message.chatId || '').replace(/^chat_/, '');
          this.chatListeners.forEach((listener, index) => {
            try {
              chatStorageService.getChats().then(chats => {
                const c = chats.find(ch => {
                  const base = (ch.id || '').replace(/^chat_/, '');
                  return base === msgBase || ch.id === message.chatId || ch.id === normalizedChatId;
                });
                listener(c || ({} as Chat));
              }).catch(() => listener({} as Chat));
            } catch {
              listener({} as Chat);
            }
          });
        } catch (error: any) {
          console.error('❌ Error updating chat:', error);
        }

        console.log(`📢 Notifying ${this.messageListeners.length} message listener(s)`);
        this.messageListeners.forEach((listener, i) => {
          try { listener(message); } catch (e) { console.error(`Message listener ${i} error:`, e); }
        });
        console.log('✅ All listeners notified');
        // Delayed chat list refresh so ChatsScreen can read after EncryptedStorage settles (receiver may get [] on first load)
        setTimeout(() => { this.chatListeners.forEach(l => { try { l({} as Chat); } catch (_) {} }); }, 400);
        setTimeout(() => { this.chatListeners.forEach(l => { try { l({} as Chat); } catch (_) {} }); }, 900);
        setTimeout(() => { this.chatListeners.forEach(l => { try { l({} as Chat); } catch (_) {} }); }, 1500);
      } catch (error: any) {
        console.error('❌ CRITICAL: Error handling new message:', error);
        console.error('Error stack:', error.stack);
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

    this.socket.on('chat_deleted_for_everyone', (data: any) => {
      const id = (data?.chatId || '').toString();
      if (id) this.deletedChatIdListeners.forEach(l => { try { l(id); } catch (_) {} });
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

  /** Notify chat list to refresh (e.g. after clear history) */
  notifyChatListRefresh(): void {
    this.chatListeners.forEach(l => { try { l({} as Chat); } catch (e) {} });
  }

  onChatDeletedForEveryone(listener: (chatId: string) => void): () => void {
    this.deletedChatIdListeners.push(listener);
    return () => { this.deletedChatIdListeners = this.deletedChatIdListeners.filter(l => l !== listener); };
  }

  deleteChatForEveryone(chatId: string, receiverId?: string, receiverUniqueCode?: string): void {
    if (this.socket?.connected && this.isAuthenticated) {
      this.socket.emit('delete_chat_for_everyone', { chatId, receiverId: receiverId || '', receiverUniqueCode: receiverUniqueCode || '' });
    }
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
        // Update status to pending but keep message
        message.status = 'pending';
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
      // Set timeout for response (increased for better reliability)
      const timeout = setTimeout(async () => {
        console.warn('⏱️ No response from server after 20s, using optimistic message');
        message.status = 'sent';
        messageStorageService.saveMessage(message).catch(console.error);
        try {
          const {chatStorageService} = await import('./ChatStorageService');
          await chatStorageService.updateChatWithMessage(chatId, message, false);
        } catch (e) {}
        this.chatListeners.forEach(l => { try { l({} as Chat); } catch (e) {} });
        resolve(message);
      }, 20000);

      // Send message
      if (this.socket?.connected && this.isAuthenticated) {
        console.log('📤 Sending message:', {
          chatId, 
          type, 
          contentLength: content.length,
          receiverId: receiverId,
          receiverUniqueCode: options?.receiverUniqueCode,
        });
        
        this.socket.emit('send_message', messageData, async (response: any) => {
          clearTimeout(timeout);
          
          if (response?.error) {
            console.error('❌ Server error:', response.error);
            message.status = 'pending';
            messageStorageService.saveMessage(message).catch(console.error);
            import('./ChatStorageService').then(({chatStorageService}) =>
              chatStorageService.updateChatWithMessage(chatId, message, false)
            ).catch(() => {});
            this.chatListeners.forEach(l => { try { l({} as Chat); } catch (e) {} });
            resolve(message);
            return;
          }

          if (response?.message) {
            console.log('✅ Message sent successfully!', {
              messageId: response.message.id || response.message._id,
              chatId: response.message.chatId || response.message.chat_id,
              status: response.message.status,
            });
            const serverMessage: Message = {
              ...message,
              id: response.message.id || response.message._id || message.id,
              chatId: response.message.chatId || response.message.chat_id || message.chatId,
              status: response.message.status || 'sent',
              sentAt: response.message.sentAt || response.message.sent_at || message.sentAt,
              deliveredAt: response.message.deliveredAt || response.message.delivered_at,
            };
            
            if (serverMessage.chatId !== chatId) {
              console.log(`📝 Chat ID updated: ${chatId} -> ${serverMessage.chatId}`);
              await this.joinChat(serverMessage.chatId);
            } else {
              await this.joinChat(chatId);
            }

            // Replace optimistic message with server message in storage (avoid duplicates)
            const cur = await messageStorageService.getMessages(serverMessage.chatId || chatId);
            const without = cur.filter(m => (m.id || (m as any)._id) !== message.id);
            const idx = without.findIndex(m => (m.id || (m as any)._id) === serverMessage.id);
            const toSave = idx >= 0
              ? without.map((m, i) => (i === idx ? serverMessage : m))
              : [...without, serverMessage];
            await messageStorageService.saveMessages(serverMessage.chatId || chatId, toSave);
            const {chatStorageService} = await import('./ChatStorageService');
            if (serverMessage.chatId !== chatId) {
              try {
                await chatStorageService.updateChatId(chatId, serverMessage.chatId);
              } catch (e) {
                console.error('Error updating chat ID:', e);
              }
            }
            await chatStorageService.updateChatWithMessage(serverMessage.chatId || chatId, serverMessage, false);
            this.chatListeners.forEach(l => { try { l({} as Chat); } catch (e) {} });
            resolve(serverMessage);
          } else {
            console.warn('⚠️ Server responded but no message in response, assuming success');
            message.status = 'sent';
            await messageStorageService.saveMessage(message);
            await this.joinChat(chatId);
            try {
              const {chatStorageService} = await import('./ChatStorageService');
              await chatStorageService.updateChatWithMessage(chatId, message, false);
            } catch (e) {}
            this.chatListeners.forEach(l => { try { l({} as Chat); } catch (e) {} });
            resolve(message);
          }
        });
      } else {
        clearTimeout(timeout);
        console.warn('⚠️ Socket not connected, message saved locally');
        message.status = 'pending';
        messageStorageService.saveMessage(message).catch(console.error);
        import('./ChatStorageService').then(({chatStorageService}) =>
          chatStorageService.updateChatWithMessage(chatId, message, false)
        ).catch(() => {});
        this.chatListeners.forEach(l => { try { l({} as Chat); } catch (e) {} });
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
      console.log('📥 Joining chat room:', chatId);
      this.socket.emit('join_chat', {chatId});
    } else {
      console.warn('⚠️ Cannot join chat - socket not connected/authenticated');
      // Try to connect first
      try {
        await this.connect();
        if (this.socket?.connected && this.isAuthenticated) {
          console.log('📥 Joining chat room after reconnection:', chatId);
          this.socket.emit('join_chat', {chatId});
        }
      } catch (error) {
        console.error('❌ Failed to connect before joining chat:', error);
      }
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

  /**
   * Get messages for a chat from local storage
   * This loads the chat history when opening a chat (like WhatsApp)
   */
  async getMessages(chatId: string): Promise<Message[]> {
    try {
      // Load messages from local storage
      const messages = await messageStorageService.getMessages(chatId);
      
      // Filter out deleted messages
      const visibleMessages = messages.filter(msg => !msg.isDeleted);
      
      // Sort by createdAt (oldest first) - WhatsApp style
      return visibleMessages.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.sentAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.sentAt || 0).getTime();
        return dateA - dateB;
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }
}

export const chatService = new ChatService();
