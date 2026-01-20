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
              for (const msg of messages) {
                const kid = msg.id || (msg as any)._id || `noid-${msg.createdAt || msg.sentAt || ''}-${(msg.content || '').slice(0, 30)}`;
                if (seenIds.has(kid)) continue;
                seenIds.add(kid);
                if (!msg.id && !(msg as any)._id) {
                  (msg as any).id = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                }
                allMessages.push(msg);
              }
            }
          }
        } catch (e) {
          /* skip */
        }
      }
      
      // Sort by timestamp (oldest first) - use consistent timestamp field for perfect ordering
      // Prefer sentAt (when message was sent) over createdAt for accurate chronological order
      const getMessageTimestamp = (msg: Message): number => {
        const timestamp = msg.sentAt || msg.createdAt;
        if (!timestamp) return 0;
        const date = new Date(timestamp).getTime();
        return isNaN(date) ? 0 : date;
      };
      
      return allMessages.sort((a: Message, b: Message) => {
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

  /**
   * Save a message - ALWAYS loads full history from all keys, merges, then persists.
   * Prevents multiple messages being replaced by the last one.
   */
  async saveMessage(message: Message): Promise<void> {
    try {
      if (!message.chatId) {
        console.warn('Cannot save message without chatId');
        return;
      }
      const messages = await this.getMessages(message.chatId);
      const existingIndex = messages.findIndex(msg => (msg.id || (msg as any)._id) === message.id);
      if (existingIndex >= 0) {
        messages[existingIndex] = message;
      } else {
        messages.push(message);
        // Sort using consistent timestamp for perfect ordering
        const getMessageTimestamp = (msg: Message): number => {
          const timestamp = msg.sentAt || msg.createdAt;
          if (!timestamp) return 0;
          const date = new Date(timestamp).getTime();
          return isNaN(date) ? 0 : date;
        };
        
        messages.sort((a, b) => {
          const dateA = getMessageTimestamp(a);
          const dateB = getMessageTimestamp(b);
          if (dateA !== dateB) {
            return dateA - dateB;
          }
          // Stable sort by ID if timestamps equal
          const idA = (a.id || '').toString();
          const idB = (b.id || '').toString();
          return idA.localeCompare(idB);
        });
      }
      await this.saveMessages(message.chatId, messages);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }

  /**
   * Save multiple messages - writes to ALL key variants getMessages reads from,
   * so no partial overwrite can leave only the last message.
   */
  async saveMessages(chatId: string, messages: Message[]): Promise<void> {
    try {
      const normalizedChatId = this.normalizeChatId(chatId);
      const keys = [
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${normalizedChatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}chat_${normalizedChatId}`,
      ];
      const uniq = Array.from(new Set(keys));
      const json = JSON.stringify(messages);
      for (const key of uniq) {
        await EncryptedStorage.setItem(key, json);
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
   * Update message status - uses getMessages + saveMessages so the full list is never overwritten.
   */
  async updateMessageStatus(
    chatId: string,
    messageId: string,
    status: Message['status'],
    deliveredAt?: string,
    readAt?: string,
  ): Promise<void> {
    try {
      const all = await this.getMessages(chatId);
      const i = all.findIndex(m => (m.id || (m as any)._id) === messageId);
      if (i < 0) return;
      all[i].status = status;
      if (deliveredAt) all[i].deliveredAt = deliveredAt;
      if (readAt) all[i].readAt = readAt;
      await this.saveMessages(chatId, all);
    } catch (error) {
      console.error('❌ Error updating message status:', error);
    }
  }

  /**
   * Clear all messages for a chat (removes all key variants)
   */
  async clearMessages(chatId: string): Promise<void> {
    try {
      const n = this.normalizeChatId(chatId);
      const keys = [
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${chatId}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}${n}`,
        `${MessageStorageService.MESSAGES_KEY_PREFIX}chat_${n}`,
      ];
      for (const key of keys) {
        await EncryptedStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  }
}

export const messageStorageService = new MessageStorageService();

