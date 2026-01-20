import EncryptedStorage from 'react-native-encrypted-storage';
import {Chat, Message} from '../types';

/**
 * Service to manage chats locally (like WhatsApp)
 * Stores chats in local storage, not in contacts
 */
class ChatStorageService {
  private static CHATS_KEY = 'device_chats';
  private static MESSAGES_KEY_PREFIX = 'chat_messages_';

  /**
   * Get all chats
   */
  async getChats(): Promise<Chat[]> {
    try {
      const chatsJson = await EncryptedStorage.getItem(ChatStorageService.CHATS_KEY);
      if (!chatsJson) {
        console.log('📭 No chats found in storage (empty JSON)');
        return [];
      }
      const chats = JSON.parse(chatsJson);
      
      if (!Array.isArray(chats)) {
        console.error('❌ Chats data is not an array:', typeof chats);
        return [];
      }
      
      console.log(`📥 Loaded ${chats.length} chat(s) from storage`);
      
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
   * Save chats
   */
  private async saveChats(chats: Chat[]): Promise<void> {
    try {
      console.log(`💾 Saving ${chats.length} chat(s) to storage...`);
      const chatsJson = JSON.stringify(chats);
      await EncryptedStorage.setItem(ChatStorageService.CHATS_KEY, chatsJson);
      console.log(`✅ Successfully saved ${chats.length} chat(s) to storage`);
      
      // Verify save worked
      const verify = await EncryptedStorage.getItem(ChatStorageService.CHATS_KEY);
      if (verify) {
        const verified = JSON.parse(verify);
        console.log(`✅ Verified: ${verified.length} chat(s) in storage`);
      } else {
        console.error('❌ Verification failed: No chats found after save!');
      }
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
   */
  private normalizeChatId(chatId: string): string {
    if (!chatId) return chatId;
    // Always add 'chat_' prefix for consistency
    return chatId.startsWith('chat_') ? chatId : `chat_${chatId}`;
  }

  /**
   * Get base chatId (without prefix) for comparison
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
      const chats = await this.getChats();
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
        chats[chatIndex].lastMessage = message;
        chats[chatIndex].updatedAt = new Date().toISOString();
        
        // Ensure chatId matches normalized format
        if (chats[chatIndex].id !== normalizedChatId) {
          chats[chatIndex].id = normalizedChatId;
          console.log(`📝 Updated chat ID: ${chats[chatIndex].id} -> ${normalizedChatId}`);
        }
        
        // Increment unread count if message is from other user and incrementUnread is true
        if (message.senderId !== currentDeviceId && !message.isDeleted && incrementUnread) {
          chats[chatIndex].unreadCount = (chats[chatIndex].unreadCount || 0) + 1;
        }
        
        await this.saveChats(chats);
        console.log(`✅ Updated existing chat: ${normalizedChatId} (Total chats: ${chats.length})`);
      } else {
        // Chat doesn't exist - CREATE IT
        console.log(`📝 Chat not found, creating new chat...`);
        
        // Determine sender/receiver info
        const isFromMe = message.senderId === currentDeviceId;
        const otherDeviceId = isFromMe ? message.receiverId : message.senderId;
        
        if (otherDeviceId) {
          // Create chat with other device
          const otherUniqueCode = otherDeviceId.substring(0, 8).toUpperCase();
          const otherName = 'Unknown User'; // Default name
          
          const newChat: Chat = {
            id: normalizedChatId, // Use normalized chatId
            participantIds: [currentDeviceId, otherDeviceId],
            otherUser: {
              id: otherDeviceId,
              name: otherName,
              uniqueCode: otherUniqueCode,
              isAppUser: true,
            },
            lastMessage: message,
            unreadCount: isFromMe ? 0 : (incrementUnread ? 1 : 0),
            isBlocked: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          
          // Add to chats list
          chats.push(newChat);
          await this.saveChats(chats);
          console.log(`✅ Created new chat: ${normalizedChatId} with ${otherName} (${otherDeviceId})`);
        } else {
          console.warn(`⚠️ Cannot create chat - no other device ID found`);
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
   * Delete chat
   */
  async deleteChat(chatId: string): Promise<void> {
    try {
      const chats = await this.getChats();
      const filteredChats = chats.filter(chat => chat.id !== chatId);
      await this.saveChats(filteredChats);
      
      // Also delete messages for this chat
      await EncryptedStorage.removeItem(`${ChatStorageService.MESSAGES_KEY_PREFIX}${chatId}`);
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  }
}

export const chatStorageService = new ChatStorageService();

