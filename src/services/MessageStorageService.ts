import EncryptedStorage from 'react-native-encrypted-storage';
import {Message} from '../types';

/**
 * Service to store and retrieve messages locally
 * Ensures messages persist and are available offline
 */
class MessageStorageService {
  private static MESSAGES_KEY_PREFIX = 'chat_messages_';

  /**
   * Get messages for a chat
   */
  async getMessages(chatId: string): Promise<Message[]> {
    try {
      const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`;
      const messagesJson = await EncryptedStorage.getItem(key);
      if (!messagesJson) {
        return [];
      }
      const messages = JSON.parse(messagesJson);
      // Sort by createdAt (oldest first)
      return messages.sort((a: Message, b: Message) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  /**
   * Save a message
   */
  async saveMessage(message: Message): Promise<void> {
    try {
      const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${message.chatId}`;
      const messages = await this.getMessages(message.chatId);
      
      // Check if message already exists
      const existingIndex = messages.findIndex(msg => msg.id === message.id);
      if (existingIndex >= 0) {
        // Update existing message
        messages[existingIndex] = message;
      } else {
        // Add new message
        messages.push(message);
      }
      
      await EncryptedStorage.setItem(key, JSON.stringify(messages));
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }

  /**
   * Save multiple messages
   */
  async saveMessages(chatId: string, messages: Message[]): Promise<void> {
    try {
      const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`;
      await EncryptedStorage.setItem(key, JSON.stringify(messages));
    } catch (error) {
      console.error('Error saving messages:', error);
    }
  }

  /**
   * Delete a message (mark as deleted)
   */
  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      const messages = await this.getMessages(chatId);
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      
      if (messageIndex >= 0) {
        messages[messageIndex].isDeleted = true;
        await this.saveMessages(chatId, messages);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(
    chatId: string,
    messageId: string,
    status: Message['status'],
    deliveredAt?: string,
    readAt?: string,
  ): Promise<void> {
    try {
      const messages = await this.getMessages(chatId);
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      
      if (messageIndex >= 0) {
        messages[messageIndex].status = status;
        if (deliveredAt) {
          messages[messageIndex].deliveredAt = deliveredAt;
        }
        if (readAt) {
          messages[messageIndex].readAt = readAt;
        }
        await this.saveMessages(chatId, messages);
      }
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  }

  /**
   * Clear all messages for a chat
   */
  async clearMessages(chatId: string): Promise<void> {
    try {
      const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`;
      await EncryptedStorage.removeItem(key);
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  }
}

export const messageStorageService = new MessageStorageService();

