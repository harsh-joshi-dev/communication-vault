import EncryptedStorage from 'react-native-encrypted-storage';
import {Message} from '../types';

/**
 * Service to store and retrieve messages locally
 * Ensures messages persist and are available offline
 */
class MessageStorageService {
  private static MESSAGES_KEY_PREFIX = 'chat_messages_';

  /**
   * Normalize chatId (remove 'chat_' prefix for consistency)
   */
  private normalizeChatId(chatId: string): string {
    if (!chatId) return chatId;
    return chatId.replace(/^chat_/, '');
  }

  /**
   * Get messages for a chat - tries multiple chatId formats
   */
  async getMessages(chatId: string): Promise<Message[]> {
    try {
      const normalizedChatId = this.normalizeChatId(chatId);
      
      // Try loading with both formats (with and without prefix)
      const keys = [
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${normalizedChatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}chat_${normalizedChatId}`,
      ];
      
      const allMessages: Message[] = [];
      const seenIds = new Set<string>();
      
      // Load from all possible keys
      for (const key of keys) {
        try {
          const messagesJson = await EncryptedStorage.getItem(key);
          if (messagesJson) {
            const messages = JSON.parse(messagesJson);
            if (Array.isArray(messages)) {
              // Only add messages we haven't seen yet
              for (const msg of messages) {
                if (msg.id && !seenIds.has(msg.id)) {
                  seenIds.add(msg.id);
                  allMessages.push(msg);
                }
              }
            }
          }
        } catch (e) {
          // Skip if key doesn't exist or parse error
        }
      }
      
      // Sort by createdAt (oldest first)
      return allMessages.sort((a: Message, b: Message) => {
        const dateA = new Date(a.createdAt || a.sentAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.sentAt || 0).getTime();
        return dateA - dateB;
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  /**
   * Save a message (optimized for speed) - saves to normalized chatId
   */
  async saveMessage(message: Message): Promise<void> {
    try {
      if (!message.chatId) {
        console.warn('Cannot save message without chatId');
        return;
      }
      
      // Normalize chatId for consistent storage
      const normalizedChatId = this.normalizeChatId(message.chatId);
      const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${normalizedChatId}`;
      
      // Use getItem directly for speed (avoid full parse if not needed)
      const messagesJson = await EncryptedStorage.getItem(key);
      let messages: Message[] = [];
      
      if (messagesJson) {
        try {
          messages = JSON.parse(messagesJson);
          if (!Array.isArray(messages)) {
            messages = [];
          }
        } catch (e) {
          messages = [];
        }
      }
      
      // Check if message already exists
      const existingIndex = messages.findIndex(msg => msg.id === message.id);
      if (existingIndex >= 0) {
        // Update existing message
        messages[existingIndex] = message;
      } else {
        // Add new message
        messages.push(message);
        // Sort only when needed
        messages.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.sentAt || 0).getTime();
          const dateB = new Date(b.createdAt || b.sentAt || 0).getTime();
          return dateA - dateB;
        });
      }
      
      // Save asynchronously (non-blocking) - always save with normalized chatId
      await EncryptedStorage.setItem(key, JSON.stringify(messages));
      
      // Also save to original format if different (for migration)
      if (message.chatId !== normalizedChatId) {
        const originalKey = `${MessageStorageService.MESSAGES_KEY_PREFIX}${message.chatId}`;
        await EncryptedStorage.setItem(originalKey, JSON.stringify(messages));
      }
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }

  /**
   * Save multiple messages - uses normalized chatId
   */
  async saveMessages(chatId: string, messages: Message[]): Promise<void> {
    try {
      const normalizedChatId = this.normalizeChatId(chatId);
      const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${normalizedChatId}`;
      await EncryptedStorage.setItem(key, JSON.stringify(messages));
      
      // Also save to original format if different
      if (chatId !== normalizedChatId) {
        const originalKey = `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`;
        await EncryptedStorage.setItem(originalKey, JSON.stringify(messages));
      }
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
   * Update message status - CRITICAL: Persists status to storage
   * Tries multiple chatId formats to find the message
   */
  async updateMessageStatus(
    chatId: string,
    messageId: string,
    status: Message['status'],
    deliveredAt?: string,
    readAt?: string,
  ): Promise<void> {
    try {
      const normalizedChatId = this.normalizeChatId(chatId);
      
      console.log(`💾 Updating message status: ${messageId} -> ${status} in chat ${chatId} (normalized: ${normalizedChatId})`);
      
      // Try multiple chatId formats (same as getMessages)
      const keys = [
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${normalizedChatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}chat_${normalizedChatId}`,
      ];
      
      let messages: Message[] | null = null;
      let foundKey: string | null = null;
      
      // Try to find messages in any of the possible keys
      for (const key of keys) {
        try {
          const messagesJson = await EncryptedStorage.getItem(key);
          if (messagesJson) {
            const parsed = JSON.parse(messagesJson);
            if (Array.isArray(parsed)) {
              // Check if message exists in this key
              const messageIndex = parsed.findIndex((msg: Message) => msg.id === messageId);
              if (messageIndex >= 0) {
                messages = parsed;
                foundKey = key;
                console.log(`✅ Found message in key: ${key}`);
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next key
        }
      }
      
      if (!messages || !foundKey) {
        // Message not found in any key - try loading all messages to find it
        console.log(`⚠️ Message ${messageId} not found in direct keys, searching all chats...`);
        const allMessages = await this.getMessages(chatId);
        const messageIndex = allMessages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex >= 0) {
          // Found message in getMessages - update it and save
          allMessages[messageIndex].status = status;
          if (deliveredAt) {
            allMessages[messageIndex].deliveredAt = deliveredAt;
          }
          if (readAt) {
            allMessages[messageIndex].readAt = readAt;
          }
          
          // Save to normalized key
          const key = `${MessageStorageService.MESSAGES_KEY_PREFIX}${normalizedChatId}`;
          await EncryptedStorage.setItem(key, JSON.stringify(allMessages));
          console.log(`✅ Message status updated via getMessages: ${messageId} -> ${status}`);
          
          // Also save to other formats
          for (const otherKey of keys) {
            if (otherKey !== key) {
              await EncryptedStorage.setItem(otherKey, JSON.stringify(allMessages));
            }
          }
        } else {
          console.warn(`⚠️ Message ${messageId} not found in any storage key for chat ${chatId}`);
        }
        return;
      }
      
      // Update message in found key
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex >= 0) {
        const oldStatus = messages[messageIndex].status;
        messages[messageIndex].status = status;
        
        if (deliveredAt) {
          messages[messageIndex].deliveredAt = deliveredAt;
        }
        if (readAt) {
          messages[messageIndex].readAt = readAt;
        }
        
        // Save updated messages to the found key
        await EncryptedStorage.setItem(foundKey, JSON.stringify(messages));
        console.log(`✅ Message status updated: ${messageId} from ${oldStatus} to ${status}`);
        
        // Also save to all other keys for consistency
        for (const key of keys) {
          if (key !== foundKey) {
            await EncryptedStorage.setItem(key, JSON.stringify(messages));
          }
        }
      }
    } catch (error) {
      console.error('❌ Error updating message status:', error);
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

