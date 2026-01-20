import EncryptedStorage from 'react-native-encrypted-storage';
import {Chat, Message} from '../types';

/**
 * Service to manage chats locally (like WhatsApp)
 * Stores chats in local storage, not in contacts
 */
const CHATS_STORAGE_KEY = 'device_chats';

class ChatStorageService {
  private static MESSAGES_KEY_PREFIX = 'chat_messages_';
  private lastChatsCache: Chat[] = [];
  private lastWrittenAt: number = 0;

  /**
   * Get all chats. Retries when empty to handle races with concurrent save and EncryptedStorage timing.
   * Uses in-memory cache when EncryptedStorage returns [] on emulator/slow devices.
   */
  async getChats(): Promise<Chat[]> {
    const doGet = async (): Promise<Chat[]> => {
      const chatsJson = await EncryptedStorage.getItem(CHATS_STORAGE_KEY);
      if (!chatsJson || chatsJson === '') return [];
      try {
        const chats = JSON.parse(chatsJson);
        return Array.isArray(chats) ? chats : [];
      } catch {
        return [];
      }
    };

    try {
      let chats = await doGet();
      const delays = [80, 150, 250];
      for (const d of delays) {
        if (chats.length > 0) break;
        await new Promise(r => setTimeout(r, d));
        chats = await doGet();
      }
      if (chats.length === 0) {
        await new Promise(r => setTimeout(r, 500));
        chats = await doGet();
      }
      if (chats.length === 0) {
        if (this.lastChatsCache.length > 0 && (Date.now() - this.lastWrittenAt) < 60000) {
          console.log('📥 getChats: using in-memory cache (EncryptedStorage returned [])');
          return [...this.lastChatsCache].sort((a: Chat, b: Chat) => {
            const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return tB - tA;
          });
        }
        return [];
      }

      // Sort by updatedAt (most recent first)
      const sorted = chats.sort((a: Chat, b: Chat) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      });
      
      // Log chat details
      sorted.forEach((chat, index) => {
        console.log(`   Chat ${index + 1}: ${chat.id} - ${chat.otherUser?.name || 'Unknown'} (last: ${chat.lastMessage?.content?.substring(0, 20) || 'none'})`);
      });
      
      return sorted;
    } catch (error) {
      console.error('❌ Error getting chats:', error);
      return [];
    }
  }

  /**
   * Get or create a chat with a device
   */
  async getOrCreateChat(deviceId: string, deviceName: string, uniqueCode: string): Promise<Chat> {
    try {
      const chats = await this.getChats();
      
      // Check if chat already exists
      const existingChat = chats.find(
        chat => chat.participantIds?.includes(deviceId) || chat.id === `chat_${deviceId}`
      );

      if (existingChat) {
        return existingChat;
      }

      // Create new chat - use "Unknown User" as default name
      const newChat: Chat = {
        id: `chat_${deviceId}`,
        participantIds: [deviceId],
        otherUser: {
          id: deviceId,
          name: 'Unknown User', // Default name until user edits it
          uniqueCode: uniqueCode,
          isAppUser: true,
        },
        lastMessage: undefined,
        unreadCount: 0,
        isBlocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Add to chats
      chats.push(newChat);
      await this.saveChats(chats);

      return newChat;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  }

  /**
   * Save chats. Verifies after write; retries once if verification fails (handles EncryptedStorage timing).
   */
  private async saveChats(chats: Chat[]): Promise<void> {
    const doSave = async (): Promise<boolean> => {
      const chatsJson = JSON.stringify(chats);
      await EncryptedStorage.setItem(CHATS_STORAGE_KEY, chatsJson);
      const verify = await EncryptedStorage.getItem(CHATS_STORAGE_KEY);
      if (!verify) return false;
      try {
        const v = JSON.parse(verify);
        return Array.isArray(v) && (chats.length === 0 || v.length > 0);
      } catch {
        return false;
      }
    };
    try {
      let ok = await doSave();
      if (!ok && chats.length > 0) {
        await new Promise(r => setTimeout(r, 120));
        ok = await doSave();
      }
      if (!ok && chats.length > 0) {
        console.warn('⚠️ saveChats: verification failed after retry');
      }
      this.lastChatsCache = [...chats];
      this.lastWrittenAt = Date.now();
    } catch (error) {
      console.error('❌ Error saving chats:', error);
      throw error;
    }
  }

  /**
   * Update chat (e.g., when new message arrives)
   */
  async updateChat(chatId: string, updates: Partial<Chat>): Promise<void> {
    try {
      const chats = await this.getChats();
      const normalizedChatId = this.normalizeChatId(chatId);
      
      // Try to find chat by ID (normalized)
      let chatIndex = chats.findIndex(chat => {
        const chatBaseId = this.normalizeChatId(chat.id);
        return chat.id === chatId || chat.id === normalizedChatId || chatBaseId === normalizedChatId;
      });
      
      if (chatIndex >= 0) {
        chats[chatIndex] = {
          ...chats[chatIndex],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.saveChats(chats);
        console.log(`✅ Chat updated: ${chatId}`);
      } else {
        console.warn(`⚠️ Chat ${chatId} not found when updating`);
      }
    } catch (error) {
      console.error('❌ Error updating chat:', error);
    }
  }

  /**
   * Update chat name - allows both sides to set their own name for the chat
   */
  async updateChatName(chatId: string, newName: string): Promise<void> {
    try {
      const chats = await this.getChats();
      const normalizedChatId = this.normalizeChatId(chatId);
      
      // Try to find chat by ID (normalized)
      let chatIndex = chats.findIndex(chat => {
        const chatBaseId = this.normalizeChatId(chat.id);
        return chat.id === chatId || chat.id === normalizedChatId || chatBaseId === normalizedChatId;
      });
      
      if (chatIndex >= 0) {
        // Update otherUser name (this is the name the current user sees)
        if (!chats[chatIndex].otherUser) {
          chats[chatIndex].otherUser = {
            id: chats[chatIndex].participantIds?.[0] || '',
            name: newName,
            isAppUser: true,
          };
        } else {
          chats[chatIndex].otherUser.name = newName;
        }
        chats[chatIndex].updatedAt = new Date().toISOString();
        
        await this.saveChats(chats);
        console.log(`✅ Chat name updated: ${chatId} -> "${newName}"`);
      } else {
        console.warn(`⚠️ Chat ${chatId} not found when updating name`);
      }
    } catch (error) {
      console.error('❌ Error updating chat name:', error);
      throw error;
    }
  }

  /**
   * Get chat by ID - used to load chat name when screen opens
   */
  async getChat(chatId: string): Promise<Chat | null> {
    try {
      const chats = await this.getChats();
      const normalizedChatId = this.normalizeChatId(chatId);
      
      const chat = chats.find(chat => {
        const chatBaseId = this.normalizeChatId(chat.id);
        return chat.id === chatId || chat.id === normalizedChatId || chatBaseId === normalizedChatId;
      });
      
      return chat || null;
    } catch (error) {
      console.error('❌ Error getting chat:', error);
      return null;
    }
  }

  /**
   * Update chat ID (when server creates a new chat with UUID)
   */
  async updateChatId(oldChatId: string, newChatId: string): Promise<void> {
    try {
      const chats = await this.getChats();
      const chatIndex = chats.findIndex(chat => chat.id === oldChatId);
      
      if (chatIndex >= 0) {
        chats[chatIndex].id = newChatId;
        chats[chatIndex].updatedAt = new Date().toISOString();
        await this.saveChats(chats);
        
        // Also update messages storage key if needed
        try {
          const oldMessagesKey = `${ChatStorageService.MESSAGES_KEY_PREFIX}${oldChatId}`;
          const newMessagesKey = `${ChatStorageService.MESSAGES_KEY_PREFIX}${newChatId}`;
          const messagesJson = await EncryptedStorage.getItem(oldMessagesKey);
          if (messagesJson) {
            await EncryptedStorage.setItem(newMessagesKey, messagesJson);
            await EncryptedStorage.removeItem(oldMessagesKey);
          }
        } catch (error) {
          console.error('Error updating messages storage key:', error);
        }
      }
    } catch (error) {
      console.error('Error updating chat ID:', error);
    }
  }

  /**
   * Normalize chatId (handle both with/without 'chat_' prefix)
   * Always adds 'chat_' prefix for consistency in storage
   */
  private normalizeChatId(chatId: string): string {
    if (!chatId) return chatId;
    // Always add 'chat_' prefix for consistency
    return chatId.startsWith('chat_') ? chatId : `chat_${chatId}`;
  }

  /**
   * Get base chatId (without prefix) for comparison
   * Use this for comparing chatIds regardless of prefix
   */
  private getBaseChatId(chatId: string): string {
    if (!chatId) return chatId;
    return chatId.replace(/^chat_/, '');
  }


  /**
   * Update chat with last message - CRITICAL: Creates chat if doesn't exist
   */
  async updateChatWithMessage(chatId: string, message: Message, incrementUnread: boolean = true): Promise<void> {
    try {
      let chats = await this.getChats();
      const currentDeviceId = await this.getCurrentDeviceId();
      
      // Normalize chatId for consistent lookup
      const normalizedChatId = this.normalizeChatId(chatId);
      const baseChatId = this.getBaseChatId(chatId);
      
      console.log(`📝 updateChatWithMessage: chatId=${chatId}, normalized=${normalizedChatId}, base=${baseChatId}`);
      
      // Try to find chat by ID (try both formats)
      let chatIndex = chats.findIndex(chat => 
        chat.id === chatId || 
        chat.id === normalizedChatId || 
        chat.id === baseChatId ||
        this.getBaseChatId(chat.id) === baseChatId
      );
      
      // If not found, try to find by participant IDs
      if (chatIndex < 0) {
        chatIndex = chats.findIndex(chat => 
          chat.participantIds?.includes(message.senderId) || 
          chat.participantIds?.includes(message.receiverId) ||
          chat.otherUser?.id === message.senderId ||
          chat.otherUser?.id === message.receiverId
        );
      }
      
      if (chatIndex >= 0) {
        // Chat exists - update it
        // Only update lastMessage if message is successfully sent (not 'sending' status)
        // This ensures unsent messages don't appear in chat list
        const isMessageSent = message.status && message.status !== 'sending' && message.status !== 'pending';
        
        if (isMessageSent) {
          chats[chatIndex].lastMessage = message;
          chats[chatIndex].updatedAt = new Date().toISOString();
        } else {
          // Don't update lastMessage for unsent messages, but update timestamp if needed
          chats[chatIndex].updatedAt = new Date().toISOString();
        }
        
        // Ensure chatId matches normalized format
        if (chats[chatIndex].id !== normalizedChatId) {
          chats[chatIndex].id = normalizedChatId;
          console.log(`📝 Updated chat ID: ${chats[chatIndex].id} -> ${normalizedChatId}`);
        }
        
        // Increment unread count if message is from other user and incrementUnread is true
        // Only increment for successfully sent messages (not 'sending' status)
        if (message.senderId !== currentDeviceId && !message.isDeleted && incrementUnread && isMessageSent) {
          chats[chatIndex].unreadCount = (chats[chatIndex].unreadCount || 0) + 1;
        }
        
        await this.saveChats(chats);
        console.log(`✅ Updated existing chat: ${normalizedChatId} (Total chats: ${chats.length})`);
        
        // Notify chat list to refresh (ensures UI updates on receiver device)
        try {
          const {chatService} = await import('./ChatService');
          chatService.notifyChatListRefresh();
        } catch (e) {
          // Ignore if ChatService not loaded yet
        }
      } else {
        // Chat doesn't exist - retry getChats once to avoid overwriting due to flaky read
        if (chats.length === 0) {
          await new Promise(r => setTimeout(r, 50));
          const retried = await this.getChats();
          if (retried.length > 0) {
            chats = retried;
            chatIndex = chats.findIndex(chat =>
              chat.id === chatId || chat.id === normalizedChatId || chat.id === baseChatId ||
              this.getBaseChatId(chat.id) === baseChatId ||
              chat.participantIds?.includes(message.senderId) ||
              chat.participantIds?.includes(message.receiverId) ||
              chat.otherUser?.id === message.senderId ||
              chat.otherUser?.id === message.receiverId
            );
            if (chatIndex >= 0) {
              // Only update lastMessage if message is successfully sent (not 'sending' status)
              const isMessageSent = message.status && message.status !== 'sending' && message.status !== 'pending';
              
              if (isMessageSent) {
                chats[chatIndex].lastMessage = message;
                chats[chatIndex].updatedAt = new Date().toISOString();
              } else {
                chats[chatIndex].updatedAt = new Date().toISOString();
              }
              
              if (chats[chatIndex].id !== normalizedChatId) chats[chatIndex].id = normalizedChatId;
              if (message.senderId !== currentDeviceId && !message.isDeleted && incrementUnread && isMessageSent) {
                chats[chatIndex].unreadCount = (chats[chatIndex].unreadCount || 0) + 1;
              }
              await this.saveChats(chats);
              console.log(`✅ Updated existing chat after retry: ${normalizedChatId}`);
              return;
            }
          }
        }

        // CREATE new chat (CRITICAL for receiver device)
        console.log(`📝 Chat not found, creating new chat...`);
        const isFromMe = message.senderId === currentDeviceId;
        const otherDeviceId = isFromMe ? message.receiverId : message.senderId;
        
        console.log(`📝 Chat creation details: isFromMe=${isFromMe}, otherDeviceId=${otherDeviceId}, senderId=${message.senderId}, receiverId=${message.receiverId}, currentDeviceId=${currentDeviceId}`);
        
        // ALWAYS create chat if we have a message (even if otherDeviceId is empty - we'll use senderId/receiverId)
        const actualOtherId = otherDeviceId || (isFromMe ? message.receiverId : message.senderId) || 'unknown';
        
        if (actualOtherId && actualOtherId !== 'unknown') {
          const otherUniqueCode = actualOtherId.length >= 8 ? actualOtherId.substring(0, 8).toUpperCase() : actualOtherId.toUpperCase();
          // Try to get name from message metadata or use default
          const otherName = (message as any).receiverName || 
                           (message as any).receiverPhoneNumber || 
                           (message as any).senderName ||
                           (message as any).contactName ||
                           'Unknown User';
          
          // Only create chat with lastMessage if message is successfully sent (not 'sending' status)
          // This ensures unsent messages don't create empty chat entries
          const isMessageSent = message.status && message.status !== 'sending' && message.status !== 'pending';
          
          const newChat: Chat = {
            id: normalizedChatId,
            participantIds: [currentDeviceId, actualOtherId].filter(Boolean) as string[],
            otherUser: { 
              id: actualOtherId, 
              name: otherName, 
              uniqueCode: otherUniqueCode, 
              isAppUser: true 
            },
            lastMessage: isMessageSent ? message : undefined, // Only set lastMessage if message is sent
            unreadCount: isFromMe ? 0 : (incrementUnread && isMessageSent ? 1 : 0),
            isBlocked: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          chats.push(newChat);
          await this.saveChats(chats);
          console.log(`✅ Created new chat: ${normalizedChatId} with ${otherName} (${actualOtherId}) - should appear in chat list now!`);
          
          // Notify chat list to refresh immediately (CRITICAL for receiver device)
          const {chatService} = await import('./ChatService');
          chatService.notifyChatListRefresh();
          
          // Chat is now created - listeners will be notified by ChatService
        } else {
          console.warn(`⚠️ Cannot create chat - no valid device ID found. senderId=${message.senderId}, receiverId=${message.receiverId}, currentDeviceId=${currentDeviceId}`);
        }
      }
    } catch (error) {
      console.error('❌ Error updating chat with message:', error);
    }
  }

  /**
   * Mark chat as read
   */
  async markChatAsRead(chatId: string): Promise<void> {
    await this.updateChat(chatId, {unreadCount: 0});
  }

  /**
   * Clear whole chat history (messages + lastMessage on chat)
   */
  async clearChatHistory(chatId: string): Promise<void> {
    try {
      const {messageStorageService} = await import('./MessageStorageService');
      await messageStorageService.clearMessages(chatId);
      await this.updateChat(chatId, {lastMessage: undefined, unreadCount: 0});
    } catch (error) {
      console.error('Error clearing chat history:', error);
      throw error;
    }
  }

  /**
   * Get current device ID (helper)
   */
  private async getCurrentDeviceId(): Promise<string> {
    try {
      const {deviceService} = await import('./DeviceService');
      const deviceInfo = await deviceService.getDeviceInfo();
      return deviceInfo.deviceId;
    } catch (error) {
      return '';
    }
  }

  /**
   * Delete chat (removes from list and clears all message keys for this chat)
   */
  async deleteChat(chatId: string): Promise<void> {
    try {
      const {messageStorageService} = await import('./MessageStorageService');
      await messageStorageService.clearMessages(chatId);
      const chats = await this.getChats();
      const normalized = (id: string) => (id || '').replace(/^chat_/, '');
      const base = normalized(chatId);
      const filteredChats = chats.filter(
        c => normalized(c.id || '') !== base && c.id !== chatId
      );
      await this.saveChats(filteredChats);
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  }
}

export const chatStorageService = new ChatStorageService();

