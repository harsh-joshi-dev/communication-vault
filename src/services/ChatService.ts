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

const getApiUrl = (path: string) => `${getApiBaseUrl().replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;

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
  private lastFetchPendingErrorLog = 0;

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

    const maxAttempts = 4;
    const authTimeoutMs = 90000;
    const retryDelayMs = 5000;

    this.connectionPromise = (async () => {
      let deviceInfo: {deviceId: string; uniqueCode: string; deviceName: string};
      try {
        deviceInfo = await deviceService.getDeviceInfo();
      } catch {
        this.connectionPromise = null;
        return;
      }
      const apiUrl = getApiBaseUrl();

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt === 1) {
            console.log(`🔌 Connecting (${attempt}/${maxAttempts}): ${apiUrl}`);
          }
          await this._doOneConnectAttempt(apiUrl, deviceInfo, authTimeoutMs);
          this.connectionPromise = null;
          return;
        } catch (e: any) {
          if (attempt < maxAttempts) {
            // Only log retry on first few attempts to reduce spam
            if (attempt <= 2) {
              console.warn(`🔌 Attempt ${attempt} failed, retry in ${retryDelayMs / 1000}s`);
            }
            await new Promise(r => setTimeout(r, retryDelayMs));
          } else {
            // Only log final failure once to avoid spam
            console.warn('🔌 Connect failed after', maxAttempts, 'attempts. Messages will sync when server is reachable.');
            this.connectionPromise = null;
            return;
          }
        }
      }
    })();

    return this.connectionPromise;
  }

  private _doOneConnectAttempt(
    apiUrl: string,
    deviceInfo: {deviceId: string; uniqueCode: string; deviceName: string},
    authTimeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }
      this.isAuthenticated = false;

      const socket = io(apiUrl, {
        auth: { deviceId: deviceInfo.deviceId, uniqueCode: deviceInfo.uniqueCode, deviceName: deviceInfo.deviceName },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
        timeout: 45000,
        forceNew: true,
      });
      this.socket = socket;

      let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        timer = null;
        socket.removeAllListeners();
        socket.disconnect();
        if (this.socket === socket) this.socket = null;
        this.isAuthenticated = false;
        reject(new Error('Auth timeout'));
      }, authTimeoutMs);

      socket.on('connect', () => { console.log('✅ Socket connected:', socket.id); });

      socket.on('connected', (data: any) => {
        if (timer) { clearTimeout(timer); timer = null; }
        this.isAuthenticated = true;
        console.log('✅ Authenticated');
        if (socket.connected) {
          const did = data.deviceId || deviceInfo.deviceId;
          const code = data.uniqueCode || deviceInfo.uniqueCode;
          socket.emit('join_chat', {chatId: `device_${did}`});
          if (code) socket.emit('join_chat', {chatId: `code_${code}`});
          console.log('✅ Joined device and code rooms');
        }
        // Fetch pending messages immediately after connecting
        this.fetchPendingMessages().catch(() => {});
        resolve();
      });

      socket.on('connect_error', () => {
        if (timer) { clearTimeout(timer); timer = null; }
        socket.removeAllListeners();
        socket.disconnect();
        if (this.socket === socket) this.socket = null;
        this.isAuthenticated = false;
        reject(new Error('Connect error'));
      });

      socket.on('disconnect', (reason: string) => {
        this.isAuthenticated = false;
        if (reason === 'io server disconnect') socket.connect();
      });

      this.setupEventListeners();
    });
  }

  /**
   * Process an incoming message (socket or REST pending). Dedupes, saves, updates chat, notifies.
   */
  private async processIncomingMessage(messageData: any): Promise<void> {
    const rawId = messageData?.id || messageData?._id;
    if (rawId && this.recentNewMessageIds.has(rawId)) return;
    if (rawId) {
      this.recentNewMessageIds.add(rawId);
      // 5 min dedupe: avoid double-processing when same message arrives via socket then fetchPending
      setTimeout(() => { this.recentNewMessageIds.delete(rawId); }, 300000);
    }
    try {
      console.log('📥 RECEIVED NEW MESSAGE!', { id: rawId, chatId: messageData.chatId || messageData.chat_id, senderId: messageData.senderId || messageData.sender_id, receiverId: messageData.receiverId || messageData.receiver_id });
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
      const deviceInfo = await deviceService.getDeviceInfo();
      
      // Message is for me if:
      // 1. receiverId matches my deviceId or uniqueCode (I'm the receiver)
      // 2. OR senderId matches my deviceId or uniqueCode (I'm the sender - my own message echoed back)
      const isReceiverMe = message.receiverId === deviceInfo.deviceId || message.receiverId === deviceInfo.uniqueCode;
      const isSenderMe = message.senderId === deviceInfo.deviceId || message.senderId === deviceInfo.uniqueCode;
      
      // If message comes via socket new_message event, it's already delivered to my room, so it's for me
      // If message comes via fetchPending, it's already filtered by my deviceId, so it's for me
      // Process all messages that come through - they should all be for this device
      console.log(`📥 Processing message: receiver=${message.receiverId || 'none'}, sender=${message.senderId}, my deviceId=${deviceInfo.deviceId}, my code=${deviceInfo.uniqueCode}`);
      console.log(`   Is receiver me: ${isReceiverMe}, Is sender me: ${isSenderMe}`);
      
      if (message.chatId && this.socket?.connected && this.isAuthenticated) {
        await this.joinChat(message.chatId);
        console.log('✅ Joined chat room for received message:', message.chatId);
      }
      await messageStorageService.saveMessage(message);
      console.log('✅ Message saved locally');
      
      try {
        const {chatStorageService} = await import('./ChatStorageService');
        const normalizedChatId = message.chatId?.startsWith('chat_') ? message.chatId : `chat_${message.chatId}`;
        const messageWithStatus = { ...message, chatId: normalizedChatId, status: message.status || 'delivered' };
        
        // Determine if message is from me or to me
        const isFromMe = message.senderId === deviceInfo.deviceId || message.senderId === deviceInfo.uniqueCode;
        const otherUserId = isFromMe ? message.receiverId : message.senderId;
        
        console.log(`📝 Creating/updating chat: ${normalizedChatId}, isFromMe: ${isFromMe}, otherUserId: ${otherUserId}`);
        
        // Update or create chat - this ensures chat appears in chat list
        // incrementUnread should be true only if message is NOT from me (it's from another user)
        await chatStorageService.updateChatWithMessage(normalizedChatId, messageWithStatus, !isFromMe);
        console.log('✅ Chat updated/created with new message:', normalizedChatId);
        
        // Notify chat list to refresh immediately
        this.notifyChatListRefresh();
        
        // Also trigger chat listeners with minimal chat data
        const minimalChat: Chat = {
          id: normalizedChatId,
          participantIds: [message.senderId, message.receiverId].filter(Boolean) as string[],
          otherUser: { 
            id: otherUserId, 
            name: (message as any).receiverName || (message as any).receiverPhoneNumber || 'Unknown User', 
            isAppUser: true 
          },
          lastMessage: messageWithStatus,
          updatedAt: new Date().toISOString(),
          unreadCount: isFromMe ? 0 : 1, // Only increment unread if message is NOT from me
          isBlocked: false,
          createdAt: new Date().toISOString(),
        };
        
        // Notify chat listeners
        this.chatListeners.forEach((l) => { 
          try { 
            l(minimalChat); 
          } catch (err) {
            console.error('Error in chat listener:', err);
          }
        });
        
        // Trigger multiple refreshes to ensure UI updates
        setTimeout(() => { this.notifyChatListRefresh(); }, 100);
        setTimeout(() => { this.notifyChatListRefresh(); }, 500);
        setTimeout(() => { this.notifyChatListRefresh(); }, 1000);
      } catch (e: any) { 
        console.error('❌ Error updating chat:', e);
        // Still notify chat list refresh even on error
        this.notifyChatListRefresh();
      }
      // Notify all message listeners (for ChatDetailScreen)
      this.messageListeners.forEach((l, i) => { 
        try { 
          l(message); 
        } catch (e) { 
          console.error(`Message listener ${i} error:`, e); 
        } 
      });
      
      // Notify chat listeners to refresh chat list (with delays to ensure UI updates)
      setTimeout(() => { 
        this.notifyChatListRefresh();
        this.chatListeners.forEach(l => { 
          try { 
            l(minimalChat); 
          } catch (_) {} 
        }); 
      }, 100);
      setTimeout(() => { 
        this.notifyChatListRefresh();
      }, 500);
      setTimeout(() => { 
        this.notifyChatListRefresh();
      }, 1000);
    } catch (e: any) {
      console.error('❌ processIncomingMessage error:', e);
    }
  }

  /**
   * Fetch pending messages from REST (cross-instance / receiver was offline).
   * This is critical for receiving messages when socket is disconnected.
   * Silently handles network errors - server might be temporarily unavailable.
   */
  async fetchPendingMessages(): Promise<void> {
    try {
      const {deviceService} = await import('./DeviceService');
      const deviceInfo = await deviceService.getDeviceInfo();
      const deviceId = deviceInfo.deviceId;
      
      // Backend endpoint: /api/messages/pending?deviceId=...
      const url = getApiUrl(`/api/messages/pending?deviceId=${encodeURIComponent(deviceId)}`);
      
      const doFetch = async (): Promise<{pending?: any[]; error?: string} | null> => {
        try {
          const res = await axios.get<{pending?: any[]; error?: string}>(url, {
            timeout: 10000, // Reduced timeout
            validateStatus: () => true,
          });
          return res?.data ?? null;
        } catch (e: any) {
          throw e;
        }
      };

      const doNativeFetch = (): Promise<{pending?: any[]; error?: string}> =>
        new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 10000);
          fetch(url, { 
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          })
            .then(r => {
              if (!r.ok) {
                throw new Error(`HTTP ${r.status}`);
              }
              return r.json().catch(() => ({pending: []}));
            })
            .then(d => { clearTimeout(t); resolve(d); })
            .catch(e => { clearTimeout(t); reject(e); });
        });

      // Try axios first, fallback to native fetch
      let data: {pending?: any[]; error?: string} | null = null;
      try {
        data = await doFetch();
      } catch (axErr: any) {
        try { 
          data = await doNativeFetch(); 
        } catch (nativeErr: any) {
          // Both failed - server is likely unreachable
          // Don't log error every time to avoid spam
          const now = Date.now();
          if (now - this.lastFetchPendingErrorLog > 300000) { // 5 minutes
            this.lastFetchPendingErrorLog = now;
            // Silently handle - server connection will be retried
          }
          return;
        }
      }
      
      const list = data?.pending;
      if (!Array.isArray(list) || list.length === 0) {
        // No pending messages - this is normal
        return;
      }
      
      console.log(`📥 fetchPending: got ${list.length} message(s) for device ${deviceId.slice(0, 8)}...`);
      
      // Process all messages
      for (const m of list) {
        try {
          await this.processIncomingMessage(m);
        } catch (err) {
          console.error('Error processing pending message:', err);
        }
      }
      
      console.log(`✅ fetchPending: processed ${list.length} message(s), chat list should update`);
    } catch (e: any) {
      // Silently handle any unexpected errors - don't spam logs
      const now = Date.now();
      if (now - this.lastFetchPendingErrorLog > 300000) { // 5 minutes
        this.lastFetchPendingErrorLog = now;
        console.warn('📥 fetchPending unexpected error:', e?.message || e);
      }
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // When server asks us to join a chat room (so we can receive new_message via chat_ room too)
    this.socket.on('join_chat', (data: any) => {
      const cid = data?.chatId;
      if (cid) {
        const full = (cid as string).startsWith('chat_') ? cid : `chat_${cid}`;
        this.joinChat(full);
        console.log('📥 Joined chat room (server requested):', full);
      }
    });

    this.socket.on('new_message', async (messageData: any) => {
      await this.processIncomingMessage(messageData);
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

    // Try to connect if not connected (connect retries up to 4x for Render cold start)
    if (!this.socket?.connected || !this.isAuthenticated) {
      try {
        await this.connect();
        // One more try if still not connected
        if (!this.socket?.connected || !this.isAuthenticated) {
          await this.connect();
        }
      } catch {
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
            // Notify chat list to refresh so new chat appears
            this.notifyChatListRefresh();
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
              // Notify chat list to refresh so new chat appears
              this.notifyChatListRefresh();
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
          chatStorageService.updateChatWithMessage(chatId, message, false).then(() => {
            // Notify chat list to refresh so new chat appears
            this.notifyChatListRefresh();
          })
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
