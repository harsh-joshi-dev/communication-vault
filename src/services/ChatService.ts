import {io, Socket} from 'socket.io-client';
import {Platform} from 'react-native';
import {Message, Chat, Contact} from '../types';
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
    // CRITICAL: Check if already connected and authenticated - STABLE CONNECTION CHECK
    // Don't over-check - trust socket.io's connection state to prevent unnecessary reconnections
    if (this.socket?.connected && this.isAuthenticated && this.socket.id) {
      // Simple check - if socket says connected and authenticated, trust it
      // Don't check readyState aggressively - this causes false disconnections and instability
      return Promise.resolve();
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const maxAttempts = 5; // More attempts for better reliability
    const authTimeoutMs = 30000; // 30s timeout - give more time for connection
    const retryDelayMs = 2000; // 2s retry delay - reasonable retry interval

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
      // CRITICAL: Only create new socket if current one is truly dead
      // Don't disconnect working connections - this causes instability
      if (this.socket) {
        // Only cleanup if socket is truly dead (not just reporting as disconnected)
        const engineState = this.socket.io?.engine?.readyState;
        const isTrulyDead = !this.socket.connected && 
                           engineState !== 'connecting' &&
                           engineState !== 'opening';
        if (isTrulyDead) {
          console.log('🔄 Cleaning up dead socket before reconnecting...');
          try {
            this.socket.removeAllListeners();
            this.socket.disconnect();
          } catch (e) {
            // Ignore cleanup errors
          }
          this.socket = null;
          this.isAuthenticated = false;
        } else if (this.socket.connected && this.isAuthenticated) {
          // Socket is already good - resolve immediately (STABLE CONNECTION)
          console.log('✅ Socket already connected and authenticated - reusing existing connection');
          resolve();
          return;
        } else if (this.socket.connected) {
          // Socket connected but not authenticated yet - wait for authentication
          console.log('⏳ Socket connected but not authenticated yet, waiting...');
          const authCheck = setInterval(() => {
            if (this.isAuthenticated) {
              clearInterval(authCheck);
              resolve();
            }
            // Timeout after 10 seconds
            setTimeout(() => clearInterval(authCheck), 10000);
          }, 100);
          return;
        }
      }

      // Create new socket connection
      console.log('🔌 Creating new socket connection...');
      const socket = io(apiUrl, {
        auth: { deviceId: deviceInfo.deviceId, uniqueCode: deviceInfo.uniqueCode, deviceName: deviceInfo.deviceName },
        transports: ['websocket', 'polling'], // WebSocket first for better performance
        reconnection: true, // CRITICAL: Enable automatic reconnection
        reconnectionAttempts: Infinity, // Keep trying forever
        reconnectionDelay: 1000, // Start with 1s delay
        reconnectionDelayMax: 5000, // Max 5s delay
        timeout: 20000, // 20s timeout
        forceNew: false, // CRITICAL: Reuse existing connection - this prevents connection instability
        autoConnect: true,
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
        console.log('✅ Authenticated successfully');
        
        // CRITICAL: Join device and code rooms immediately after authentication
        if (socket.connected) {
          const did = data.deviceId || deviceInfo.deviceId;
          const code = data.uniqueCode || deviceInfo.uniqueCode;
          
          // Join device room
          socket.emit('join_chat', {chatId: `device_${did}`});
          console.log(`✅ Joined device room: device_${did}`);
          
          // Join code room if available
          if (code) {
            socket.emit('join_chat', {chatId: `code_${code}`});
            console.log(`✅ Joined code room: code_${code}`);
          }
          
          console.log('✅ Successfully joined all required rooms');
        }
        
        // Fetch pending messages immediately after connecting (CRITICAL for receiver device)
        // Don't block on this - resolve immediately so connection is marked as ready
        this.fetchPendingMessages().then(() => {
          console.log('✅ Pending messages fetched after connection');
        }).catch(() => {
          console.log('⚠️ Pending messages fetch failed after connection (non-critical)');
        });
        
        // Resolve connection promise - connection is ready
        resolve();
      });

      socket.on('connect_error', (error: Error) => {
        console.log('⚠️ Socket connect_error:', error.message);
        // CRITICAL: Don't reject immediately - socket.io will auto-reconnect
        // Only reject if this is the first attempt and we have a timer
        // For subsequent attempts, let socket.io handle reconnection automatically
        if (timer) {
          // First connection attempt failed - clear timer but don't reject yet
          // Let socket.io's auto-reconnection handle it
          clearTimeout(timer);
          timer = null;
          
          // Only reject if it's a critical error that won't auto-recover
          // For network errors, socket.io will keep trying
          if (error.message && (error.message.includes('xhr poll error') || error.message.includes('timeout'))) {
            // These are recoverable - socket.io will retry
            console.log('ℹ️ Network error, socket.io will auto-reconnect...');
            // Don't reject - let socket.io handle reconnection
            // The promise will resolve when 'connected' event fires
          } else {
            // Other errors might be critical
            console.log('⚠️ Connection error, will retry...');
            // Still don't reject - let socket.io handle it
          }
        }
        // Don't remove listeners or disconnect - let socket.io handle reconnection
      });

      socket.on('disconnect', (reason: string) => {
        console.log('⚠️ Socket disconnected:', reason);
        this.isAuthenticated = false;
        
        // CRITICAL: Don't manually reconnect - let socket.io handle it automatically
        // Socket.io will auto-reconnect if reconnection: true and reconnectionAttempts: Infinity
        // Manual reconnection can cause conflicts and instability
        
        // Only handle server-initiated disconnects (server closed connection)
        if (reason === 'io server disconnect') {
          console.log('🔄 Server closed connection, will auto-reconnect...');
          // Socket.io will handle reconnection automatically
          this.connectionPromise = null; // Reset so new connection can be initiated if needed
        } else {
          // Transport errors, client disconnects - socket.io handles automatically
          console.log('ℹ️ Connection lost, socket.io will auto-reconnect...');
        }
      });
      
      // Handle reconnection events - CRITICAL for stable connection
      socket.on('reconnect', (attemptNumber: number) => {
        console.log(`✅ Socket reconnected after ${attemptNumber} attempts`);
        // After reconnection, need to re-authenticate
        // The 'connected' event will be emitted again, which sets isAuthenticated
        // But we need to manually re-join rooms since authentication might have changed
        
        // Wait a bit for authentication to complete, then rejoin rooms
        setTimeout(() => {
          if (socket.connected) {
            const did = deviceInfo.deviceId;
            const code = deviceInfo.uniqueCode;
            socket.emit('join_chat', {chatId: `device_${did}`});
            if (code) socket.emit('join_chat', {chatId: `code_${code}`});
            console.log('✅ Rejoined device and code rooms after reconnect');
            
            // Re-fetch pending messages after reconnection
            this.fetchPendingMessages().catch(() => {});
          }
        }, 500);
      });
      
      socket.on('reconnect_attempt', (attemptNumber: number) => {
        console.log(`🔄 Reconnection attempt ${attemptNumber} - socket.io handling automatically`);
      });
      
      socket.on('reconnect_error', (error: Error) => {
        // Don't spam logs - socket.io will keep trying
        if (error.message && !error.message.includes('xhr poll error')) {
          console.warn('⚠️ Reconnection error:', error.message);
        }
      });
      
      socket.on('reconnect_failed', () => {
        console.error('❌ Socket.io reconnection failed after all attempts');
        // Reset connection state to allow manual reconnect
        this.connectionPromise = null;
        this.isAuthenticated = false;
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
      // Parse contact data if it's a contact message
      let contactData: any = undefined;
      if (messageData.type === 'contact' || messageData.type === 'contact') {
        try {
          if (messageData.contactData) {
            contactData = typeof messageData.contactData === 'string' 
              ? JSON.parse(messageData.contactData) 
              : messageData.contactData;
          } else if (messageData.content) {
            contactData = JSON.parse(messageData.content);
          }
        } catch (e) {
          console.error('Error parsing contact data:', e);
        }
      }

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
        contactData: contactData,
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
      
      // CRITICAL: If message is from me and I just sent it, check if it already exists in storage
      // This prevents duplicate messages when socket echoes back my own message
      if (isFromMe) {
        try {
          const existingMessages = await messageStorageService.getMessages(message.chatId || '');
          const messageExists = existingMessages.find(m => 
            (m.id === message.id || m.id === (message as any)._id) ||
            ((m.content === message.content || m.content === message.content) && 
             Math.abs(new Date(m.sentAt || m.createdAt || 0).getTime() - new Date(message.sentAt || message.createdAt || 0).getTime()) < 5000)
          );
          
          if (messageExists && messageExists.status && messageExists.status !== 'sending') {
            console.log('⚠️ Ignoring echo-back of my own message - already processed:', message.id);
            // Still update chat and notify listeners, but don't save message again
            const {chatStorageService} = await import('./ChatStorageService');
            const normalizedChatId = message.chatId?.startsWith('chat_') ? message.chatId : `chat_${message.chatId}`;
            const messageWithStatus = { ...message, chatId: normalizedChatId, status: message.status || 'sent' };
            await chatStorageService.updateChatWithMessage(normalizedChatId, messageWithStatus, false);
            
            // Notify listeners with existing message to update status if needed
            this.messageListeners.forEach(l => { 
              try { 
                l({...messageExists, ...messageWithStatus}); 
              } catch (e) {} 
            });
            return; // Exit early - don't process further
          }
        } catch (e) {
          console.error('Error checking for existing message:', e);
        }
      }
      
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
      
      // Notify chat listeners immediately with minimalChat (this is CRITICAL for receiver device to see new chat)
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
      // Pass minimalChat to listeners multiple times to ensure it's processed
      console.log('📢 Notifying chat list to refresh multiple times (receiver should see new chat)');
      
      // Immediate: notify with minimalChat if available
      if (minimalChat) {
        this.chatListeners.forEach(l => { 
          try { 
            l(minimalChat!); 
          } catch (_) {} 
        });
      }
      this.notifyChatListRefresh(); // Also trigger full reload
      
      // Delayed refreshes with minimalChat
      setTimeout(() => { 
        if (minimalChat) {
          this.chatListeners.forEach(l => { 
            try { 
              l(minimalChat!); 
            } catch (_) {} 
          });
        }
        this.notifyChatListRefresh();
      }, 100);
      setTimeout(() => { 
        if (minimalChat) {
          this.chatListeners.forEach(l => { 
            try { 
              l(minimalChat!); 
            } catch (_) {} 
          });
        }
        this.notifyChatListRefresh(); 
      }, 500);
      setTimeout(() => { 
        if (minimalChat) {
          this.chatListeners.forEach(l => { 
            try { 
              l(minimalChat!); 
            } catch (_) {} 
          });
        }
        this.notifyChatListRefresh(); 
      }, 1000);
      setTimeout(() => { 
        if (minimalChat) {
          this.chatListeners.forEach(l => { 
            try { 
              l(minimalChat!); 
            } catch (_) {} 
          });
        }
        this.notifyChatListRefresh(); 
      }, 2000); // Extra delay for receiver
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

    // Handle chat creation request (when someone scans your QR code)
    this.socket.on('create_chat', async (data: {deviceId: string; deviceName: string; uniqueCode: string}) => {
      console.log('📨 Socket create_chat event received:', data);
      try {
        const {chatStorageService} = await import('./ChatStorageService');
        // Auto-create chat on this side when other person scans QR
        const chat = await chatStorageService.getOrCreateChat(
          data.deviceId,
          data.deviceName || 'Unknown User',
          data.uniqueCode
        );
        console.log('✅ Chat auto-created on receiver side:', chat.id);
        // Notify chat list to refresh
        this.notifyChatListRefresh();
        this.chatListeners.forEach(l => { 
          try { 
            l(chat); 
          } catch (e) {} 
        });
      } catch (error) {
        console.error('❌ Error creating chat from socket event:', error);
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
      contactData?: Contact;
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

    // CRITICAL: Normalize chatId to ensure consistency
    // Always use format: chat_<deviceId> for consistency
    const normalizedChatId = chatId.startsWith('chat_') ? chatId : `chat_${chatId}`;

    // Parse contact data if it's a contact message
    let contactData: any = undefined;
    if (type === 'contact' && options?.contactData) {
      contactData = options.contactData;
    } else if (type === 'contact' && content) {
      try {
        contactData = JSON.parse(content);
      } catch (e) {
        console.error('Error parsing contact content:', e);
      }
    }

    // Create optimistic message
    const message: Message = {
      id: uuidv4(),
      chatId: normalizedChatId, // Use normalized chatId
      senderId: deviceInfo.deviceId,
      receiverId: receiverId || '',
      type,
      content,
      mediaUrl,
      thumbnailUrl,
      fileName,
      fileSize,
      duration: options?.duration,
      contactData: contactData,
      isViewOnce: options?.isViewOnce || false,
      autoDeleteAfter: options?.autoDeleteAfter,
      isDeleted: false,
      status: 'sending',
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Save locally immediately (ALWAYS succeeds) - use normalized chatId
    await messageStorageService.saveMessage(message);
    console.log('✅ Message saved locally:', message.id, 'chatId:', normalizedChatId);

    // Update chat immediately so it appears in chat list (CRITICAL - must happen before socket send)
    // Use normalized chatId for consistency
    try {
      const {chatStorageService} = await import('./ChatStorageService');
      await chatStorageService.updateChatWithMessage(normalizedChatId, message, false);
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

    // Prepare message data - use normalized chatId
    const messageData: any = {
      chatId: normalizedChatId, // Use normalized chatId
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
      contactData: options?.contactData ? JSON.stringify(options.contactData) : undefined,
    };

    // Resolve immediately - message is already saved and chat updated
    // Then try to send via socket in background (non-blocking)
    const sendPromise = (async () => {
      // CRITICAL: Simple connection check - trust socket.io's state for stability
      // Don't over-check readyState - it causes false disconnections and connection instability
      let isConnected = this.socket?.connected && this.isAuthenticated;
      
      if (!isConnected) {
        try {
          console.log('🔄 Socket not connected for message send, connecting...');
          // Give connection 3 seconds to establish
          // Message is already saved locally, so socket send is non-critical
          await Promise.race([
            this.connect(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
          
          // Simple check - trust socket.io's connection state
          isConnected = this.socket?.connected && this.isAuthenticated;
          
          if (isConnected) {
            console.log('✅ Connected for message sending');
          } else {
            console.log('⚠️ Connection not ready - message saved locally, will sync when connected');
          }
        } catch (error) {
          console.log('⚠️ Connection error - message saved locally:', error);
          isConnected = false;
          // Continue - message already saved locally, will sync when connected
        }
      }

      // Send message via socket if connected
          if (isConnected && this.socket?.connected && this.isAuthenticated) {
            console.log('📤 Sending message via socket:', {
              chatId: normalizedChatId, // Use normalized chatId
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
            message.chatId = normalizedChatId; // Ensure normalized chatId
            await messageStorageService.saveMessage(message);
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(normalizedChatId, message, false);
            this.notifyChatListRefresh();
          } catch (e) {}
        }, 15000);
        
        this.socket.emit('send_message', messageData, async (response: any) => {
          clearTimeout(timeout);
          
          if (response?.error) {
            console.log('⚠️ Server error (message already saved):', response.error);
            message.status = 'pending';
            message.chatId = normalizedChatId; // Ensure normalized chatId
            await messageStorageService.saveMessage(message);
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(normalizedChatId, message, false);
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
            const cur = await messageStorageService.getMessages(serverMessage.chatId || normalizedChatId);
            const without = cur.filter(m => (m.id || (m as any)._id) !== message.id);
            const idx = without.findIndex(m => (m.id || (m as any)._id) === serverMessage.id);
            const toSave = idx >= 0
              ? without.map((m, i) => (i === idx ? serverMessage : m))
              : [...without, serverMessage];
            await messageStorageService.saveMessages(serverMessage.chatId || normalizedChatId, toSave);
            
            const {chatStorageService} = await import('./ChatStorageService');
            if (serverMessage.chatId !== normalizedChatId) {
              try {
                await chatStorageService.updateChatId(normalizedChatId, serverMessage.chatId);
              } catch (e) {}
            }
            await chatStorageService.updateChatWithMessage(serverMessage.chatId || normalizedChatId, serverMessage, false);
            await this.joinChat(serverMessage.chatId || chatId);
            this.notifyChatListRefresh();
          } else {
            // Server responded but no message - assume success
            console.log('✅ Server confirmed (no message data), assuming success');
            message.status = 'sent';
            message.chatId = normalizedChatId; // Ensure normalized chatId
            await messageStorageService.saveMessage(message);
            await this.joinChat(normalizedChatId);
            const {chatStorageService} = await import('./ChatStorageService');
            await chatStorageService.updateChatWithMessage(normalizedChatId, message, false);
            this.notifyChatListRefresh();
          }
        });
      } else {
        // Socket not connected - message already saved, will sync later
        console.log('📤 Message saved locally (socket not connected, will sync when connected)');
        message.status = 'pending';
        // Use normalized chatId when saving
        message.chatId = normalizedChatId;
        await messageStorageService.saveMessage(message);
        // Try to connect in background for future messages
        this.connect().catch(() => {});
      }
    })();

    // Don't wait for socket send - resolve immediately
    // Message is already saved and chat updated
    // Return message with normalized chatId
    return Promise.resolve({...message, chatId: normalizedChatId});
  }

  async createChat(params: {
    userId?: string;
    phoneNumber?: string;
    contactName?: string;
    contactEmail?: string;
    deviceId?: string;
    uniqueCode?: string;
  }): Promise<Chat> {
    const chatId = params.userId ? `chat_${params.userId}` : params.deviceId ? `chat_${params.deviceId}` : `chat_${params.phoneNumber}`;
    
    const chat: Chat = {
      id: chatId,
      participantIds: params.userId ? [params.userId] : params.deviceId ? [params.deviceId] : [],
      otherUser: params.userId ? undefined : {
        id: params.deviceId,
        name: params.contactName || 'Unknown User',
        uniqueCode: params.uniqueCode,
        isAppUser: !!params.deviceId,
      },
      lastMessage: undefined,
      unreadCount: 0,
      isBlocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    return chat;
  }

  /**
   * Notify other device to create chat (when QR code is scanned)
   */
  async notifyCreateChat(deviceId: string, deviceName: string, uniqueCode: string): Promise<void> {
    if (this.socket?.connected && this.isAuthenticated) {
      try {
        console.log('📤 Notifying other device to create chat:', {deviceId, deviceName, uniqueCode});
        // Emit to the other device's room
        this.socket.emit('create_chat', {
          deviceId,
          deviceName,
          uniqueCode,
        });
        console.log('✅ Create chat notification sent');
      } catch (error) {
        console.error('❌ Error notifying create chat:', error);
      }
    } else {
      console.log('⚠️ Cannot notify create chat - socket not connected');
    }
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
    // CRITICAL: Simple connection check - don't over-check readyState
    // If socket says connected and authenticated, trust it for stability
    if (this.socket?.connected && this.isAuthenticated) {
      try {
        console.log('📥 Joining chat room:', chatId);
        this.socket.emit('join_chat', {chatId});
        return;
      } catch (error) {
        console.warn('⚠️ Error joining chat:', error);
        // Error joining - will retry after connection
      }
    }
    
    // Socket not connected - connect first
    try {
      await this.connect();
      if (this.socket?.connected && this.isAuthenticated) {
        console.log('📥 Joining chat room after connection:', chatId);
        this.socket.emit('join_chat', {chatId});
      } else {
        console.log('📥 Chat room join queued (socket connecting):', chatId);
        // Retry join after authentication completes
        const retryJoin = setInterval(() => {
          if (this.socket?.connected && this.isAuthenticated) {
            clearInterval(retryJoin);
            this.socket.emit('join_chat', {chatId});
            console.log('📥 Retried join chat room:', chatId);
          }
        }, 500);
        // Clear after 10 seconds
        setTimeout(() => clearInterval(retryJoin), 10000);
      }
    } catch (error) {
      console.log('📥 Chat room join failed (will retry when connected):', chatId);
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
      
      // Filter out deleted messages and unsent messages (status 'sending' or 'pending')
      // This ensures unsent messages don't appear in the chat view
      const visibleMessages = messages.filter(msg => {
        if (msg.isDeleted) return false;
        // Filter out messages with 'sending' or 'pending' status (unsent messages)
        const status = msg.status || 'sent';
        return status !== 'sending' && status !== 'pending';
      });
      
      // Sort by timestamp (oldest first) - WhatsApp style
      // Use consistent timestamp field for perfect chronological ordering
      const getMessageTimestamp = (msg: Message): number => {
        // Prefer sentAt (when message was actually sent) over createdAt
        const timestamp = msg.sentAt || msg.createdAt;
        if (!timestamp) return 0;
        const date = new Date(timestamp).getTime();
        return isNaN(date) ? 0 : date;
      };
      
      return visibleMessages.sort((a, b) => {
        const dateA = getMessageTimestamp(a);
        const dateB = getMessageTimestamp(b);
        
        // Primary sort: by timestamp (ascending - oldest first)
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        
        // Secondary sort: by message ID (stable sort for messages at same timestamp)
        const idA = (a.id || '').toString();
        const idB = (b.id || '').toString();
        if (idA && idB) {
          return idA.localeCompare(idB);
        }
        
        // Tertiary sort: by content (safety fallback)
        return (a.content || '').localeCompare(b.content || '');
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }
}

export const chatService = new ChatService();
