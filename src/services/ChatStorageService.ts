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
        return [];
      }
      const chats = JSON.parse(chatsJson);
      // Sort by updatedAt (most recent first)
      return chats.sort((a: Chat, b: Chat) => {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error getting chats:', error);
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

      // Create new chat
      const newChat: Chat = {
        id: `chat_${deviceId}`,
        participantIds: [deviceId],
        otherUser: {
          id: deviceId,
          name: deviceName,
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
    await EncryptedStorage.setItem(ChatStorageService.CHATS_KEY, JSON.stringify(chats));
  }

  /**
   * Update chat (e.g., when new message arrives)
   */
  async updateChat(chatId: string, updates: Partial<Chat>): Promise<void> {
    try {
      const chats = await this.getChats();
      const chatIndex = chats.findIndex(chat => chat.id === chatId);
      
      if (chatIndex >= 0) {
        chats[chatIndex] = {
          ...chats[chatIndex],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.saveChats(chats);
      }
    } catch (error) {
      console.error('Error updating chat:', error);
    }
  }

  /**
   * Update chat with last message
   */
  async updateChatWithMessage(chatId: string, message: Message): Promise<void> {
    try {
      const chats = await this.getChats();
      const chatIndex = chats.findIndex(chat => chat.id === chatId);
      
      if (chatIndex >= 0) {
        chats[chatIndex].lastMessage = message;
        chats[chatIndex].updatedAt = new Date().toISOString();
        
        // Increment unread count if message is from other user
        const currentDeviceId = await this.getCurrentDeviceId();
        if (message.senderId !== currentDeviceId) {
          chats[chatIndex].unreadCount = (chats[chatIndex].unreadCount || 0) + 1;
        }
        
        await this.saveChats(chats);
      } else {
        // Chat doesn't exist, create it
        // This shouldn't happen, but handle it gracefully
        console.warn(`Chat ${chatId} not found when updating with message`);
      }
    } catch (error) {
      console.error('Error updating chat with message:', error);
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

