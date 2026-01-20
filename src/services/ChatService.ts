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
        // Fetch pending messages immediately after connecting (CRITICAL for receiver device)
        console.log('📥 Fetching pending messages immediately after connection...');
        this.fetchPendingMessages().then(() => {
          console.log('✅ Pending messages fetched after connection');
        }).catch(() => {
          console.log('⚠️ Pending messages fetch failed after connection');
        });
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
      
      // Determine if message is from me or to me
      const isFromMe = message.senderId === deviceInfo.deviceId || message.senderId === deviceInfo.uniqueCode;
      const otherUserId = isFromMe ? message.receiverId : message.senderId;
      
      let minimalChat: Chat | null = null;
      
      try {
        const {chatStorageService} = await import('./ChatStorageService');
        const normalizedChatId = message.chatId?.startsWith('chat_') ? message.chatId : `chat_${message.chatId}`;
        const messageWithStatus = { ...message, chatId: normalizedChatId, status: message.status || 'delivered' };
        
        console.log(`📝 Creating/updating chat: ${normalizedChatId}, isFromMe: ${isFromMe}, otherUserId: ${otherUserId}`);
        
        // Update or create chat - this ensures chat appears in chat list (CRITICAL for receiver device)
        // incrementUnread should be true only if message is NOT from me (it's from another user)
        await chatStorageService.updateChatWithMessage(normalizedChatId, messageWithStatus, !isFromMe);
        console.log('✅ Chat updated/created with new message:', normalizedChatId);
        
        // Create minimal chat object for listeners
        minimalChat = {
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
        
      } catch (e: any) { 
        console.error('❌ Error updating chat:', e);
      }
      
      // Notify all message listeners (for ChatDetailScreen)
      this.messageListeners.forEach((l, i) => { 
        try { 
          l(message); 
        } catch (e) { 
          console.error(`Message listener ${i} error:`, e); 
        } 
      });
      
      // Notify chat listeners immediately (this is CRITICAL for receiver device to see new chat)
      if (minimalChat) {
        console.log('📢 Triggering chat listeners immediately with minimal chat');
        this.chatListeners.forEach(l => { 
          try { 
            l(minimalChat!); 
          } catch (err) {
            console.error('Error in chat listener:', err);
          } 
        });
      }
      
      // Trigger multiple refreshes to ensure UI updates (important for receiver device)
      console.log('📢 Notifying chat list to refresh multiple times (receiver should see new chat)');
      this.notifyChatListRefresh(); // Immediate
      setTimeout(() => { 
        this.notifyChatListRefresh();
        if (minimalChat) {
          this.chatListeners.forEach(l => { 
            try { 
              l(minimalChat!); 
            } catch (_) {} 
          });
        }
      }, 100);
      setTimeout(() => { this.notifyChatListRefresh(); }, 500);
      setTimeout(() => { this.notifyChatListRefresh(); }, 1000);
      setTimeout(() => { this.notifyChatListRefresh(); }, 2000); // Extra delay for receiver
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
            console.log('📥 Processing pending message:', {
              id: m?.id || m?._id,
              chatId: m?.chatId || m?.chat_id,
              senderId: m?.senderId || m?.sender_id,
              receiverId: m?.receiverId || m?.receiver_id,
              content: m?.content?.substring(0, 30) || m?.type,
            });
            await this.processIncomingMessage(m);
            console.log('✅ Pending message processed successfully');
          } catch (err) {
            console.error('❌ Error processing pending message:', err);
          }
        }
        
        console.log(`✅ fetchPending: processed ${list.length} message(s), chat list should update`);
        
        // Force chat list refresh after processing all pending messages
        this.notifyChatListRefresh();
        setTimeout(() => { this.notifyChatListRefresh(); }, 500);
        setTimeout(() => { this.notifyChatListRefresh(); }, 1500);
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
      console.log('📨 Socket new_message event received:', {
        id: messageData?.id || messageData?._id,
        chatId: messageData?.chatId || messageData?.chat_id,
        senderId: messageData?.senderId || messageData?.sender_id,
        receiverId: messageData?.receiverId || messageData?.receiver_id,
        content: messageData?.content?.substring(0, 30) || messageData?.type,
      });
      try {
        await this.processIncomingMessage(messageData);
        console.log('✅ Socket message processed successfully');
      } catch (error) {
        console.error('❌ Error processing socket message:', error);
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

    // Save locally immediately (ALWAYS succeeds)
    await messageStorageService.saveMessage(message);
    console.log('✅ Message saved locally:', message.id);

    // Update chat immediately so it appears in chat list (CRITICAL - must happen before socket send)
    try {
      const {chatStorageService} = await import('./ChatStorageService');
      await chatStorageService.updateChatWithMessage(chatId, message, false);
      console.log('✅ Chat updated immediately - should appear in chat list');
      // Notify chat list immediately (CRITICAL for new chats)
      this.notifyChatListRefresh();
      this.chatListeners.forEach(l => { 
        try { 
          l({} as Chat); 
        } catch (e) {} 
      });
    } catch (e) {
      console.error('❌ Error updating chat immediately:', e);
      // Still notify even on error
      this.notifyChatListRefresh();
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

    // Resolve immediately - message is already saved and chat updated
    // Then try to send via socket in background (non-blocking)
    const sendPromise = (async () => {
      // Try to connect if not connected (non-blocking - don't wait long)
      let isConnected = this.socket?.connected && this.isAuthenticated;
      if (!isConnected) {
        try {
          // Give connection 2 seconds max, then proceed
          await Promise.race([
            this.connect(),
            new Promise(resolve => setTimeout(resolve, 2000))
          ]);
          isConnected = this.socket?.connected && this.isAuthenticated;
        } catch {
          isConnected = false;
        }
      }

      // Send message via socket if connected
      if (isConnected && this.socket?.connected && this.isAuthenticated) {
        console.log('📤 Sending message via socket:', {
          chatId, 
          type, 
          contentLength: content.length,
          receiverId: receiverId,
          receiverUniqueCode: options?.receiverUniqueCode,
        });
        
        const timeout = setTimeout(async () => {
          console.log('⏱️ No response from server after 15s (message already saved locally)');
          // Message already saved, just update status
          try {
            message.status = 'sent';
            await messageStorageService.saveMessage(message);
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(chatId, message, false);
            this.notifyChatListRefresh();
          } catch (e) {}
        }, 15000);
        
        this.socket.emit('send_message', messageData, async (response: any) => {
          clearTimeout(timeout);
          
          if (response?.error) {
            console.log('⚠️ Server error (message already saved):', response.error);
            message.status = 'pending';
            await messageStorageService.saveMessage(message);
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(chatId, message, false);
            this.notifyChatListRefresh();
            return;
          }

          if (response?.message) {
            console.log('✅ Message confirmed by server!', {
              messageId: response.message.id || response.message._id,
              chatId: response.message.chatId || response.message.chat_id,
            });
            const serverMessage: Message = {
              ...message,
              id: response.message.id || response.message._id || message.id,
              chatId: response.message.chatId || response.message.chat_id || message.chatId,
              status: response.message.status || 'sent',
              sentAt: response.message.sentAt || response.message.sent_at || message.sentAt,
              deliveredAt: response.message.deliveredAt || response.message.delivered_at,
            };
            
            // Replace optimistic message with server message
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
              } catch (e) {}
            }
            await chatStorageService.updateChatWithMessage(serverMessage.chatId || chatId, serverMessage, false);
            await this.joinChat(serverMessage.chatId || chatId);
            this.notifyChatListRefresh();
          } else {
            // Server responded but no message - assume success
            console.log('✅ Server confirmed (no message data), assuming success');
            message.status = 'sent';
            await messageStorageService.saveMessage(message);
            await this.joinChat(chatId);
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(chatId, message, false);
            this.notifyChatListRefresh();
          }
        });
      } else {
        // Socket not connected - message already saved, will sync later
        console.log('📤 Message saved locally (socket not connected, will sync when connected)');
        message.status = 'pending';
        await messageStorageService.saveMessage(message);
        // Try to connect in background for future messages
        this.connect().catch(() => {});
      }
    })();

    // Don't wait for socket send - resolve immediately
    // Message is already saved and chat updated
    return Promise.resolve(message);
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
      return;
    }
    
    // Socket not connected - try to connect first, but don't throw error
    try {
      await this.connect();
      if (this.socket?.connected && this.isAuthenticated) {
        console.log('📥 Joining chat room after connection:', chatId);
        this.socket.emit('join_chat', {chatId});
      } else {
        // Connection failed or still not authenticated - will retry later
        // Don't log as error, just info - it will retry when socket connects
        console.log('📥 Chat room join queued (socket connecting):', chatId);
      }
    } catch (error) {
      // Connection failed - don't throw, just log
      // Messages will still work via pending fetch
      console.log('📥 Chat room join queued (connection failed, will retry):', chatId);
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
