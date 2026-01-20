import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import {useRoute, useNavigation, useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Message} from '../../types';
import {format} from 'date-fns';
import {chatService} from '../../services/ChatService';
import {deviceService} from '../../services/DeviceService';
import {chatStorageService} from '../../services/ChatStorageService';
import {messageStorageService} from '../../services/MessageStorageService';
import {launchImageLibrary} from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import {mediaService} from '../../services/MediaService';

const ChatDetailScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {chatId, contactName, receiverId, receiverUniqueCode, phoneNumber, email, isAppUser} = route.params as {
    chatId: string;
    contactName: string;
    receiverId?: string | null;
    receiverUniqueCode?: string;
    phoneNumber?: string;
    email?: string;
    isAppUser?: boolean;
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | undefined>();
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{[key: string]: number}>({});
  const [audioDuration, setAudioDuration] = useState<{[key: string]: number}>({});
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [chatName, setChatName] = useState<string>(contactName); // Chat name (can be edited)
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameText, setEditNameText] = useState<string>('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;

  // Reload messages and chat name when screen comes into focus (like WhatsApp)
  useFocusEffect(
    React.useCallback(() => {
      loadMessages();
      loadChatName();
      chatStorageService.markChatAsRead(chatId);
      // Fetch pending (catches cross-instance / missed socket) so messages appear on emulator
      chatService.fetchPendingMessages().catch(() => {});
      const pendingInterval = setInterval(() => {
        chatService.fetchPendingMessages().catch(() => {});
      }, 10000);
      return () => { clearInterval(pendingInterval); };
    }, [chatId])
  );

  // Debug: Log when messages state changes
  useEffect(() => {
    console.log(`📊 Messages state changed: ${messages.length} message(s)`);
    if (messages.length > 0) {
      console.log(`   Message IDs: ${messages.map(m => m.id).join(', ')}`);
      console.log(`   First message: ${messages[0].content?.substring(0, 30)}`);
      console.log(`   Last message: ${messages[messages.length - 1].content?.substring(0, 30)}`);
    }
  }, [messages]);

  useEffect(() => {
    const unDeleted = chatService.onChatDeletedForEveryone((deletedId: string) => {
      const n = (s: string) => (s || '').replace(/^chat_/, '');
      if (n(deletedId) === n(chatId)) {
        chatStorageService.deleteChat(chatId).catch(() => {});
        chatService.notifyChatListRefresh();
        navigation.goBack();
      }
    });
    return () => { unDeleted(); };
  }, [chatId]);

  useEffect(() => {
    deviceService.getDeviceId().then(id => setCurrentDeviceId(id));
    loadMessages();
    const messageUnsubscribe = setupMessageListener();

    chatService.connect().then(() => {
      setupTypingListener();
      setupStatusUpdateListener();
      joinChat();
      loadMessages();
    }).catch(() => {
      setTimeout(() => {
        chatService.connect().then(() => {
          setupTypingListener();
          setupStatusUpdateListener();
          joinChat();
          loadMessages();
        }).catch(() => {});
      }, 3000);
    });

    chatStorageService.markChatAsRead(chatId);

    return () => {
      // Cleanup message listener
      if (messageUnsubscribe) {
        messageUnsubscribe();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typingEmissionTimeoutRef.current) {
        clearTimeout(typingEmissionTimeoutRef.current);
      }
      if (typingStopTimeoutRef.current) {
        clearTimeout(typingStopTimeoutRef.current);
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      // Stop any playing audio
      if (playingMessageId) {
        audioRecorderPlayer.stopPlayer();
      }
    };
  }, [chatId]); // Reload when chatId changes

  const joinChat = async () => {
    if (chatId) {
      try {
        await chatService.joinChat(chatId);
        console.log('✅ Joined chat room:', chatId);
      } catch (error) {
        console.error('❌ Failed to join chat room:', error);
      }
    }
  };

  const setupTypingListener = () => {
    const socket = (chatService as any).socketInstance;
    if (!socket) return;
    
    socket.on('user_typing', async (data: {deviceId: string; deviceName: string; chatId: string; isTyping: boolean}) => {
      console.log('⌨️ ChatDetailScreen: Typing event received:', data);
      
      const currentDevice = await deviceService.getDeviceId();
      const normalizedDataChatId = normalizeChatId(data.chatId);
      const normalizedCurrentChatId = normalizeChatId(chatId);
      
      // Check if this typing event is for the current chat
      const matchesChat = data.chatId === chatId ||
                         normalizedDataChatId === normalizedCurrentChatId ||
                         data.chatId === normalizedCurrentChatId ||
                         normalizedDataChatId === chatId;
      
      if (matchesChat && data.deviceId !== currentDevice) {
        console.log(`⌨️ Someone is typing in current chat: ${data.deviceName} (${data.isTyping ? 'typing' : 'stopped'})`);
        
        setIsTyping(data.isTyping);
        setTypingUser(data.isTyping ? data.deviceName : null);
        
        // Auto-hide typing after 3 seconds
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        if (data.isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            console.log('⌨️ Auto-hiding typing indicator (3s timeout)');
            setIsTyping(false);
            setTypingUser(null);
          }, 3000);
        }
      } else {
        console.log(`⌨️ Typing event ignored (not for current chat or from me)`);
      }
    });
  };

  const setupStatusUpdateListener = () => {
    const socket = (chatService as any).socketInstance;
    if (!socket) return;
    
    socket.on('message_status_update', async (data: {messageId: string; status: string; deliveredAt?: string; readAt?: string}) => {
      console.log('📨 Status update received:', data);
      
      // Update state
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.messageId) {
          const updated = {
            ...msg,
            status: data.status as any,
            deliveredAt: data.deliveredAt,
            readAt: data.readAt,
          };
          
          // Persist to storage
          const {messageStorageService} = require('../../services/MessageStorageService');
          messageStorageService.updateMessageStatus(
            chatId,
            data.messageId,
            data.status as any,
            data.deliveredAt,
            data.readAt
          ).catch(err => console.error('Error saving status update:', err));
          
          return updated;
        }
        return msg;
      }));
    });

    socket.on('messages_read', async (data: {chatId: string; messageIds: string[]; readAt: string}) => {
      console.log('📨 Messages read event:', data);
      
      // Normalize chatId for comparison
      const normalizedDataChatId = normalizeChatId(data.chatId);
      const normalizedCurrentChatId = normalizeChatId(chatId);
      
      if (normalizedDataChatId === normalizedCurrentChatId) {
        console.log('✅ Messages read for current chat, updating status...');
        
        // Update state and persist to storage
        setMessages(prev => prev.map(msg => {
          if (data.messageIds.includes(msg.id)) {
            const updated = {
              ...msg,
              status: 'read' as any,
              readAt: data.readAt,
            };
            
            // Persist to storage
            const {messageStorageService} = require('../../services/MessageStorageService');
            messageStorageService.updateMessageStatus(
              chatId,
              msg.id,
              'read',
              undefined,
              data.readAt
            ).catch(err => console.error('Error saving read status:', err));
            
            return updated;
          }
          return msg;
        }));
      }
    });
  };

  // Track typing emission to avoid spam
  const typingEmissionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingEmittedRef = useRef<boolean>(false);
  
  const handleTyping = (text: string) => {
    setInputText(text);
    
    const socket = (chatService as any).socketInstance;
    if (!socket?.connected || !chatId) {
      console.log('⚠️ Cannot emit typing - socket not connected or no chatId');
      return;
    }
    
    // Clear any existing stop timeout (reset timer on new keystroke)
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    
    const isTyping = text.length > 0;
    
    // Clear previous emission timeout
    if (typingEmissionTimeoutRef.current) {
      clearTimeout(typingEmissionTimeoutRef.current);
      typingEmissionTimeoutRef.current = null;
    }
    
    if (isTyping) {
      // User is typing - debounce emission (300ms)
      typingEmissionTimeoutRef.current = setTimeout(() => {
        // Emit typing indicator if not already emitted
        if (!isTypingEmittedRef.current) {
          console.log(`⌨️ Emitting typing indicator: START typing in chat ${chatId}`);
          
          // Emit to all possible chatId formats to ensure delivery
          socket.emit('typing', {chatId, isTyping: true});
          socket.emit('typing', {chatId: chatId.replace(/^chat_/, ''), isTyping: true});
          socket.emit('typing', {chatId: `chat_${chatId.replace(/^chat_/, '')}`, isTyping: true});
          
          isTypingEmittedRef.current = true;
        }
        
        // Set auto-stop timeout (3 seconds after last keystroke)
        typingStopTimeoutRef.current = setTimeout(() => {
          console.log('⌨️ Auto-stopping typing indicator (3s timeout)');
          socket.emit('typing', {chatId, isTyping: false});
          socket.emit('typing', {chatId: chatId.replace(/^chat_/, ''), isTyping: false});
          socket.emit('typing', {chatId: `chat_${chatId.replace(/^chat_/, '')}`, isTyping: false});
          isTypingEmittedRef.current = false;
        }, 3000);
      }, 300);
    } else {
      // Text is empty - stop typing immediately if was typing
      if (isTypingEmittedRef.current) {
        console.log(`⌨️ Emitting typing indicator: STOP typing in chat ${chatId} (input cleared)`);
        socket.emit('typing', {chatId, isTyping: false});
        socket.emit('typing', {chatId: chatId.replace(/^chat_/, ''), isTyping: false});
        socket.emit('typing', {chatId: `chat_${chatId.replace(/^chat_/, '')}`, isTyping: false});
        isTypingEmittedRef.current = false;
      }
    }
  };

  const handleCall = () => {
    Alert.alert('Call', `Calling ${contactName}...`);
    // TODO: Implement actual call functionality
  };

  const handleVideoCall = () => {
    Alert.alert('Video Call', `Starting video call with ${chatName}...`);
    // TODO: Implement actual video call functionality
  };

  /**
   * Load chat name from storage (user's custom name for the chat)
   */
  const loadChatName = async () => {
    try {
      const chat = await chatStorageService.getChat(chatId);
      if (chat && chat.otherUser?.name) {
        setChatName(chat.otherUser.name);
      }
    } catch (error) {
      console.error('Error loading chat name:', error);
    }
  };

  /**
   * Handle editing chat name - shows a custom input modal
   */
  const handleEditChatName = () => {
    setEditNameText(chatName === contactName ? '' : chatName);
    setIsEditingName(true);
  };

  /**
   * Save edited chat name
   */
  const handleSaveChatName = async () => {
    const newName = editNameText.trim();
    
    if (newName) {
      try {
        await chatStorageService.updateChatName(chatId, newName);
        setChatName(newName);
        // Update navigation params
        navigation.setParams({contactName: newName});
          // Notify chat listeners to reload chat list
          // The chat list will refresh via the chat listeners automatically
        console.log(`✅ Chat name updated to: "${newName}"`);
        setIsEditingName(false);
      } catch (error) {
        console.error('❌ Error updating chat name:', error);
        Alert.alert('Error', 'Failed to update chat name');
      }
    } else {
      // Reset to default name if empty
      try {
        await chatStorageService.updateChatName(chatId, contactName);
        setChatName(contactName);
        navigation.setParams({contactName: contactName});
        console.log(`✅ Chat name reset to default: "${contactName}"`);
        setIsEditingName(false);
      } catch (error) {
        console.error('❌ Error resetting chat name:', error);
      }
    }
  };

  /**
   * Cancel editing chat name
   */
  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditNameText('');
  };

  /**
   * Clear whole chat history (with confirmation)
   */
  const handleClearChatHistory = () => {
    Alert.alert(
      'Clear Chat History',
      'Delete all messages in this chat? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatStorageService.clearChatHistory(chatId);
              setMessages([]);
              chatService.notifyChatListRefresh();
            } catch (e) {
              console.error('Clear chat history error:', e);
              Alert.alert('Error', 'Failed to clear chat history');
            }
          },
        },
      ]
    );
  };

  const handleDeleteChatForMeOnly = async () => {
    try {
      await chatStorageService.deleteChat(chatId);
      chatService.notifyChatListRefresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to delete chat');
    }
  };

  const handleDeleteChatForEveryone = async () => {
    try {
      await chatStorageService.deleteChat(chatId);
      chatService.deleteChatForEveryone(chatId, receiverId ?? undefined, receiverUniqueCode);
      chatService.notifyChatListRefresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to delete chat');
    }
  };

  const handleDeleteChat = () => {
    Alert.alert('Delete Chat', 'Remove this chat?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete for me only', onPress: handleDeleteChatForMeOnly },
      { text: 'Delete for everyone (both ends)', style: 'destructive', onPress: handleDeleteChatForEveryone },
    ]);
  };

  // Normalize chatId (remove or add 'chat_' prefix for consistency)
  const normalizeChatId = (id: string): string => {
    if (!id) return id;
    // Remove 'chat_' prefix if present
    return id.replace(/^chat_/, '');
  };

  const loadMessages = async () => {
    try {
      const normalizedChatId = normalizeChatId(chatId);
      console.log('📥 Loading messages for chat:', chatId, '(normalized:', normalizedChatId + ')');
      
      // Get current device ID to determine which messages are "mine"
      const currentDevice = await deviceService.getDeviceInfo();
      const myDeviceId = currentDevice.deviceId;
      
      // Try loading with multiple chatId formats to ensure we get all messages
      const chatIdVariants = [
        chatId,
        normalizedChatId,
        normalizedChatId.replace(/^chat_/, ''),
        `chat_${normalizedChatId}`,
      ];
      
      // Remove duplicates
      const uniqueVariants = Array.from(new Set(chatIdVariants.filter(Boolean)));
      
      console.log(`📥 Trying to load messages with chatId variants:`, uniqueVariants);
      
      // Load from all variants
      const allMessagesArrays = await Promise.all(
        uniqueVariants.map(id => chatService.getMessages(id))
      );
      
      // Flatten and combine all messages
      const allMsgs = allMessagesArrays.flat();
      console.log(`✅ Loaded ${allMsgs.length} total message(s) from storage (across ${uniqueVariants.length} variants)`);
      
      // Deduplicate by id (use id or _id so same message from different keys collapses to one)
      const uniqueMessages = Array.from(
        new Map(allMsgs.map(msg => [msg.id || (msg as any)._id, msg])).values()
      );
      
      // Filter messages that match this chat (normalize their chatIds too)
      // Also include messages where sender or receiver matches (for device-based chats)
      const matchingMessages = uniqueMessages.filter(msg => {
        const msgChatId = normalizeChatId(msg.chatId || '');
        const msgMatchesChatId = msgChatId === normalizedChatId || 
                                 msg.chatId === chatId || 
                                 msg.chatId === normalizedChatId ||
                                 msgChatId === chatId ||
                                 msg.chatId === `chat_${normalizedChatId}` ||
                                 msgChatId === `chat_${normalizedChatId}`;
        
        // Also match if sender or receiver is part of this chat
        const msgMatchesParticipants = (msg.senderId === myDeviceId || 
                                        msg.receiverId === myDeviceId ||
                                        msg.senderId === receiverId ||
                                        msg.receiverId === receiverId);
        
        return msgMatchesChatId || msgMatchesParticipants;
      });
      
      // Sort by timestamp
      const sortedMessages = matchingMessages.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.sentAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.sentAt || 0).getTime();
        return dateA - dateB;
      });
      
      console.log(`✅ Filtered and deduplicated: ${allMsgs.length} → ${sortedMessages.length} unique messages for this chat`);
      console.log(`📋 Message details:`);
      sortedMessages.forEach((msg, idx) => {
        console.log(`   ${idx + 1}. ${msg.id} - ${msg.senderId === myDeviceId ? 'ME' : 'THEM'}: ${msg.content?.substring(0, 30) || msg.type}`);
      });
      
      // Set messages - WhatsApp style: oldest at top, newest at bottom
      setMessages(sortedMessages);
      
      // Scroll to bottom (newest messages) after messages are set
      setTimeout(() => {
        scrollToBottom(false); // No animation on initial load for speed
      }, 50);
      setTimeout(() => {
        scrollToBottom(true); // Animated scroll as backup
      }, 200);
    } catch (error) {
      console.error('❌ Error loading messages:', error);
      setMessages([]);
    }
  };

  const setupMessageListener = () => {
    const unsubscribe = chatService.onMessage(async (message: Message) => {
      console.log('📨 Message listener received:', {
        messageChatId: message.chatId,
        currentChatId: chatId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content?.substring(0, 30),
      });
      
      // Normalize chatIds for comparison
      const normalizedCurrentChatId = normalizeChatId(chatId);
      const normalizedMessageChatId = normalizeChatId(message.chatId || '');
      
      // Check if message is for this chat
      const deviceInfo = await deviceService.getDeviceInfo();
      const isFromReceiver = message.senderId === receiverId || message.senderId === receiverUniqueCode;
      const isToMe = message.receiverId === deviceInfo.deviceId || message.receiverId === deviceInfo.uniqueCode || !message.receiverId;
      
      // Match chatId (with or without prefix)
      const matchesChat = normalizedMessageChatId === normalizedCurrentChatId || 
                         message.chatId === chatId ||
                         (message.chatId && chatId && (
                           message.chatId.replace(/^chat_/, '') === chatId.replace(/^chat_/, '')
                         ));
      
      // Show message if:
      // 1. ChatId matches (normalized), OR
      // 2. Message is from/to the receiver we're chatting with
      const shouldShow = matchesChat || (isFromReceiver && isToMe);
      
      if (!shouldShow) {
        console.log('⚠️ Message not for this chat, ignoring', {
          messageChatId: normalizedMessageChatId,
          currentChatId: normalizedCurrentChatId,
          matches: matchesChat,
          isFromReceiver,
          isToMe
        });
        return;
      }
      
      console.log('✅ Message is for this chat, displaying it');
      
      // Normalize message chatId to match current chatId format
      if (message.chatId && normalizedMessageChatId === normalizedCurrentChatId) {
        // Update message chatId to match current format for consistency
        message.chatId = chatId; // Use current chatId format
      }
      
      if (message.isDeleted) {
        setMessages(prev => prev.filter(msg => msg.id !== message.id));
        return;
      }
      
      const mid = message.id || (message as any)._id || `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const created = message.createdAt || message.sentAt || new Date().toISOString();
      const sent = message.sentAt || message.createdAt || new Date().toISOString();
      setMessages(prev => {
        const normalizedMessage = { ...message, id: mid, chatId, createdAt: created, sentAt: sent };
        const existingIndex = prev.findIndex(msg => (msg.id || (msg as any)._id) === mid);
        
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = normalizedMessage;
          const uniqueMap = new Map<string, Message>();
          updated.forEach((msg, i) => {
            const k = msg.id || (msg as any)._id || `x-${i}`;
            if (!uniqueMap.has(k)) uniqueMap.set(k, msg);
          });
          return Array.from(uniqueMap.values()).sort((a, b) =>
            new Date(a.createdAt || a.sentAt || 0).getTime() - new Date(b.createdAt || b.sentAt || 0).getTime()
          );
        }

        const updated = [...prev, normalizedMessage];
        const uniqueMap = new Map<string, Message>();
        updated.forEach((msg, i) => {
          const k = msg.id || (msg as any)._id || `x-${i}`;
          if (!uniqueMap.has(k)) uniqueMap.set(k, msg);
        });
        return Array.from(uniqueMap.values()).sort((a, b) =>
          new Date(a.createdAt || a.sentAt || 0).getTime() - new Date(b.createdAt || b.sentAt || 0).getTime()
        );
      });
      
      setTimeout(() => scrollToBottom(true), 150);
      setTimeout(() => scrollToBottom(true), 400);
      const messageChatId = message.chatId || chatId;
      chatStorageService.updateChatWithMessage(messageChatId, { ...message, id: mid, chatId: messageChatId, createdAt: created, sentAt: sent }, false).catch(() => {});
      chatService.markAsRead(messageChatId, [mid]).catch(() => {});
    });
    
    // Store unsubscribe function for cleanup
    return unsubscribe;
  };

  const scrollToBottom = (animated: boolean = true) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({animated});
        }
      });
    });
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;

    const messageText = inputText.trim();
    setInputText('');
    
    // Stop typing indicator when message is sent
    const socket = (chatService as any).socketInstance;
    if (socket?.connected && chatId) {
      console.log('⌨️ Stopping typing indicator (message sent)');
      // Emit to all possible chatId formats
      socket.emit('typing', {chatId, isTyping: false});
      socket.emit('typing', {chatId: chatId.replace(/^chat_/, ''), isTyping: false});
      socket.emit('typing', {chatId: `chat_${chatId.replace(/^chat_/, '')}`, isTyping: false});
      isTypingEmittedRef.current = false;
    }
    
    // Clear typing emission timeouts
    if (typingEmissionTimeoutRef.current) {
      clearTimeout(typingEmissionTimeoutRef.current);
      typingEmissionTimeoutRef.current = null;
    }
    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    // Add message optimistically with pending status
    const tempMessageId = `temp_${Date.now()}`;
    const tempMessage: Message = {
      id: tempMessageId,
      chatId,
      senderId: currentDeviceId || '',
      receiverId: receiverUniqueCode || receiverId || '',
      type: 'text',
      content: messageText,
      status: 'sending',
      isViewOnce: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, tempMessage]);
    scrollToBottom();

    // Send message (never throws errors - always succeeds optimistically)
    chatService.sendMessage(
      chatId,
      receiverId || undefined,
      'text',
      messageText,
      undefined,
      {
        phoneNumber,
        contactName,
        email,
        isAppUser: isAppUser ?? false,
        receiverUniqueCode: receiverUniqueCode,
      },
    ).then((sentMessage) => {
      // Replace temp message with real message (or add if not found)
      setMessages(prev => {
        const exists = prev.find(msg => msg.id === tempMessageId);
        if (exists) {
          return prev.map(msg => 
            msg.id === tempMessageId ? {...sentMessage, status: sentMessage.status || 'sent'} : msg
          );
        }
        // If temp message not found, add the sent message
        return [...prev, {...sentMessage, status: sentMessage.status || 'sent'}].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      
      // Update chat storage with new message (for ChatsScreen)
      chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
        console.error('Error updating chat:', err)
      );
      
      scrollToBottom();
      
      // Mark messages as read if receiver is viewing
      if (receiverId) {
        setTimeout(() => {
          chatService.markAsRead(chatId, [sentMessage.id]);
        }, 1000);
      }
    }).catch((error: any) => {
      // Even if there's an error, keep the message (optimistic)
      console.warn('Message send warning (message kept locally):', error?.message);
      // Update status to show it's pending
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessageId ? {...msg, status: 'pending'} : msg
      ));
    });
  };

  const handleSendImage = async () => {
    try {
      launchImageLibrary(
        {
          mediaType: 'photo',
          quality: 0.8,
        },
        async response => {
          if (response.assets && response.assets[0]) {
            const asset = response.assets[0];
            // Send image (never throws errors)
            chatService.sendMessage(
              chatId,
              receiverId || undefined,
              'image',
              asset.fileName || 'image.jpg',
              asset.uri,
              {
                fileName: asset.fileName,
                fileSize: asset.fileSize,
                isAppUser: isAppUser ?? false,
                phoneNumber,
                contactName,
                email,
                receiverUniqueCode: receiverUniqueCode,
              },
            ).then((sentMessage) => {
              chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
                console.error('Error updating chat:', err)
              );
              scrollToBottom();
            }).catch((error: any) => {
              console.warn('Image send warning (saved locally):', error?.message);
            });
          }
        },
      );
    } catch (error) {
      console.error('Error sending image:', error);
    }
  };

  const handleSendVideo = async () => {
    try {
      launchImageLibrary(
        {
          mediaType: 'video',
          quality: 0.8,
        },
        async response => {
          if (response.assets && response.assets[0]) {
            const asset = response.assets[0];
            // Send video (never throws errors)
            chatService.sendMessage(
              chatId,
              receiverId || undefined,
              'video',
              asset.fileName || 'video.mp4',
              asset.uri,
              {
                fileName: asset.fileName,
                fileSize: asset.fileSize,
                duration: asset.duration,
                isAppUser: isAppUser ?? false,
                phoneNumber,
                contactName,
                email,
                receiverUniqueCode: receiverUniqueCode,
              },
            ).then((sentMessage) => {
              chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
                console.error('Error updating chat:', err)
              );
              scrollToBottom();
            }).catch((error: any) => {
              console.warn('Video send warning (saved locally):', error?.message);
            });
          }
        },
      );
    } catch (error) {
      console.error('Error sending video:', error);
    }
  };

  const handleSendDocument = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });

      if (result.length > 0) {
        const file = result[0];
        // Send document (never throws errors)
        chatService.sendMessage(
          chatId,
          receiverId || undefined,
          'document',
          file.name || 'document',
          file.uri,
          {
            fileName: file.name,
            fileSize: file.size,
            isAppUser: isAppUser ?? false,
            phoneNumber,
            contactName,
            email,
            receiverUniqueCode: receiverUniqueCode,
          },
        ).then((sentMessage) => {
          chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
            console.error('Error updating chat:', err)
          );
          scrollToBottom();
        }).catch((error: any) => {
          console.warn('Document send warning (saved locally):', error?.message);
        });
      }
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        console.error('Error sending document:', error);
      }
    }
  };

  const startRecording = async () => {
    try {
      // Request permissions
      const audioSet = {
        AudioEncoderAndroid: 3,
        AudioSourceAndroid: 1,
        AVEncoderAudioQualityKeyIOS: 'high',
        AVNumberOfChannelsKeyIOS: 2,
        AVFormatIDKeyIOS: 'm4a',
      };
      
      const uri = await audioRecorderPlayer.startRecorder(undefined, audioSet);
      setIsRecording(true);
      setRecordingTime(0);

      // Update recording time every second
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      setIsRecording(false);
      const duration = recordingTime;

      // Clear recording interval
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (result && duration > 0) {
        // Send voice message (never throws errors)
        chatService.sendMessage(
          chatId,
          receiverId || undefined,
          'voice',
          `Voice message ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
          result,
          {
            duration,
            autoDeleteAfter: 24,
            isAppUser: isAppUser ?? false,
            phoneNumber,
            contactName,
            email,
            receiverUniqueCode: receiverUniqueCode,
          },
        ).then((sentMessage) => {
          chatStorageService.updateChatWithMessage(chatId, sentMessage).catch(err => 
            console.error('Error updating chat:', err)
          );
        }).catch((error: any) => {
          console.warn('Voice message send warning (saved locally):', error?.message);
        });
      }

      setRecordingTime(0);
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const toggleAudioPlayback = async (message: Message) => {
    try {
      if (!message.mediaUrl) {
        Alert.alert('Error', 'Audio file not available');
        return;
      }

      // If this message is already playing, pause it
      if (playingMessageId === message.id) {
        await audioRecorderPlayer.pausePlayer();
        setPlayingMessageId(null);
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        return;
      }

      // Stop any currently playing audio
      if (playingMessageId) {
        await audioRecorderPlayer.stopPlayer();
        setAudioProgress(prev => ({...prev, [playingMessageId]: 0}));
      }

      // Get full URL for audio (always use production so emulator and device use same server)
      const getBaseUrl = () => 'https://communication-vault.onrender.com';
      
      const audioUrl = message.mediaUrl?.startsWith('http') 
        ? message.mediaUrl 
        : `${getBaseUrl()}${message.mediaUrl}`;

      // Start playing
      const msg = await audioRecorderPlayer.startPlayer(audioUrl);
      setPlayingMessageId(message.id);
      
      // Get duration
      const duration = await audioRecorderPlayer.getDuration();
      setAudioDuration(prev => ({...prev, [message.id]: duration}));

      // Update progress
      playbackIntervalRef.current = setInterval(async () => {
        const position = await audioRecorderPlayer.getCurrentPosition();
        setAudioProgress(prev => ({...prev, [message.id]: position}));
        
        // Check if finished
        if (position >= duration) {
          setPlayingMessageId(null);
          setAudioProgress(prev => ({...prev, [message.id]: 0}));
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
        }
      }, 100);

      // Handle playback finish
      audioRecorderPlayer.addRecordBackListener((e: any) => {
        if (e.currentPosition >= e.duration) {
          setPlayingMessageId(null);
          setAudioProgress(prev => ({...prev, [message.id]: 0}));
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
      setPlayingMessageId(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: string) => {
    // WhatsApp-style status indicators
    switch (status) {
      case 'pending':
      case 'sending':
        // Clock icon while sending
        return <Icon name="time-outline" size={14} color="#999" />;
      case 'sent':
        // Single grey tick when sent (server received)
        return <Icon name="checkmark" size={14} color="#999" />;
      case 'delivered':
        // Double grey tick when delivered (receiver's device received)
        return <Icon name="checkmark-done" size={14} color="#999" />;
      case 'read':
        // Double BLUE tick when read (receiver has seen the message)
        return <Icon name="checkmark-done" size={16} color="#4A9EFF" style={{fontWeight: 'bold'}} />;
      default:
        // Default to clock if status unknown
        return <Icon name="time-outline" size={14} color="#999" />;
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteMessage(chatId, messageId);
              setMessages(prev => prev.filter(msg => msg.id !== messageId));
              // Also update chat storage
              const updatedMessages = await messageStorageService.getMessages(chatId);
              const lastMessage = updatedMessages[updatedMessages.length - 1];
              if (lastMessage) {
                await chatStorageService.updateChatWithMessage(chatId, lastMessage);
              }
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message');
            }
          },
        },
      ],
    );
  };

  const renderMessage = ({item}: {item: Message}) => {
    if (item.isDeleted) {
      return null; // Don't render deleted messages
    }
    
    const isMe = item.senderId === currentDeviceId;
    const isViewOnce = item.isViewOnce && item.readAt;

    return (
      <View
        style={[
          styles.messageWrapper,
          isMe ? styles.myMessageWrapper : styles.theirMessageWrapper,
        ]}>
        {!isMe && otherUserAvatar && (
          <Image source={{uri: otherUserAvatar}} style={styles.messageAvatar} />
        )}
        <TouchableOpacity
          style={[
            styles.messageContainer,
            isMe ? styles.myMessage : styles.theirMessage,
          ]}
          onLongPress={() => handleDeleteMessage(item.id)}
          activeOpacity={0.7}>
          <View style={styles.messageContent}>
          {item.type === 'text' && (
            <Text
              style={[
                styles.messageText,
                isMe ? styles.myMessageText : styles.theirMessageText,
              ]}
              selectable>
              {item.content}
            </Text>
          )}

        {item.type === 'image' && item.mediaUrl && (
          <Image 
            source={{uri: item.mediaUrl}} 
            style={styles.messageImage} 
          />
        )}

        {item.type === 'video' && item.mediaUrl && (
          <TouchableOpacity 
            style={styles.videoContainer}
            onPress={() => {
              // TODO: Open video player
              Alert.alert('Video', 'Video playback coming soon');
            }}>
            {item.thumbnailUrl ? (
              <Image 
                source={{uri: item.thumbnailUrl}} 
                style={styles.videoThumbnail} 
              />
            ) : (
              <View style={[styles.videoThumbnail, {backgroundColor: '#000', justifyContent: 'center', alignItems: 'center'}]}>
                <Icon name="videocam" size={40} color="#fff" />
              </View>
            )}
            <View style={styles.videoOverlay}>
              <Icon name="play-circle" size={40} color="#fff" />
              {item.duration && (
                <Text style={styles.videoDuration}>
                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {item.type === 'voice' && (
          <TouchableOpacity 
            style={styles.voiceMessage}
            onPress={() => toggleAudioPlayback(item)}
            activeOpacity={0.7}>
            <Icon 
              name={playingMessageId === item.id ? "pause-circle" : "play-circle"} 
              size={32} 
              color={isMe ? '#075E54' : '#34B7F1'} 
            />
            <View style={styles.voiceMessageContent}>
              <View style={styles.voiceProgressContainer}>
                <View 
                  style={[
                    styles.voiceProgressBar,
                    {
                      width: `${audioProgress[item.id] && audioDuration[item.id] 
                        ? (audioProgress[item.id] / audioDuration[item.id]) * 100 
                        : 0}%`,
                      backgroundColor: isMe ? '#075E54' : '#34B7F1',
                    }
                  ]} 
                />
              </View>
              <Text
                style={[
                  styles.voiceText,
                  isMe ? styles.myMessageText : styles.theirMessageText,
                ]}>
                {audioProgress[item.id] && audioDuration[item.id]
                  ? formatDuration(audioProgress[item.id])
                  : item.duration
                  ? formatDuration(item.duration)
                  : '0:00'}
              </Text>
            </View>
            <Icon 
              name="waveform" 
              size={20} 
              color={isMe ? '#075E54' : '#34B7F1'} 
              style={styles.voiceWaveIcon}
            />
          </TouchableOpacity>
        )}

        {item.type === 'document' && (
          <View style={styles.documentMessage}>
            <Icon name="document" size={24} color={isMe ? '#075E54' : '#075E54'} />
            <Text
              style={[
                styles.documentText,
                isMe ? styles.myMessageText : styles.theirMessageText,
              ]}
              numberOfLines={1}>
              {item.fileName || 'Document'}
            </Text>
            {item.fileSize && (
              <Text style={styles.fileSizeText}>
                {(item.fileSize / 1024).toFixed(1)} KB
              </Text>
            )}
          </View>
        )}

          </View>
          
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.theirMessageTime]}>
              {format(new Date(item.createdAt || item.sentAt || Date.now()), 'HH:mm')}
            </Text>
            {/* Status indicators - only show for sent messages (my messages) */}
            {isMe && (
              <View style={styles.statusIconContainer}>
                {getStatusIcon(item.status || 'sent')}
              </View>
            )}
            {item.isViewOnce && !item.readAt && (
              <Icon name="eye" size={12} color={isMe ? "#075E54" : "#34B7F1"} style={styles.viewOnceIcon} />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#075E54" />
      {/* WhatsApp-style Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => {
              // TODO: Open profile
            }}>
            {otherUserAvatar ? (
              <Image source={{uri: otherUserAvatar}} style={styles.headerAvatar} />
            ) : (
              <Icon name="person-circle" size={40} color="#fff" />
            )}
          </TouchableOpacity>
          <View style={styles.nameContainer}>
            <TouchableOpacity 
              style={styles.nameRow}
              onPress={handleEditChatName}
              onLongPress={handleEditChatName}
              activeOpacity={0.7}>
              <Text style={styles.headerName} numberOfLines={1}>
                {chatName}
              </Text>
              <TouchableOpacity 
                onPress={handleEditChatName}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                activeOpacity={0.7}>
                <Icon name="create-outline" size={16} color="#fff" style={styles.editIcon} />
              </TouchableOpacity>
            </TouchableOpacity>
            <Text style={styles.headerStatus} numberOfLines={1}>
              {isTyping && typingUser ? `${typingUser} is typing...` : (isAppUser ? 'online' : 'tap to add to contacts')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleVideoCall}>
          <Icon name="videocam" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleCall}>
          <Icon name="call" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            Alert.alert(
              'Chat Options',
              '',
              [
                { text: 'Edit Chat Name', onPress: handleEditChatName },
                { text: 'Clear Chat History', onPress: handleClearChatHistory },
                { text: 'Delete Chat', onPress: handleDeleteChat, style: 'destructive' },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          }}>
          <Icon name="ellipsis-vertical" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <View style={styles.messagesContainer}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start the conversation</Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item, index) => item.id || (item as any)._id || `msg-${index}`}
              extraData={messages}
              removeClippedSubviews={false}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => {
                // Scroll to bottom when new messages are added (WhatsApp style)
                if (messages.length > 0) {
                  scrollToBottom(true);
                }
              }}
              onLayout={() => {
                // Scroll to bottom when layout changes (initial load)
                if (messages.length > 0) {
                  scrollToBottom(false);
                }
              }}
            />
            {isTyping && typingUser && (
              <View style={styles.typingIndicator}>
                <View style={styles.typingBubble}>
                  <View style={styles.typingDot} />
                  <View style={[styles.typingDot, styles.typingDotDelay1]} />
                  <View style={[styles.typingDot, styles.typingDotDelay2]} />
                </View>
                <Text style={styles.typingText}>{typingUser} is typing...</Text>
              </View>
            )}
          </>
        )}
      </View>

      {isRecording ? (
        <View style={styles.recordingContainer}>
          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopRecording}>
            <Icon name="stop" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.recordingTime}>
            {Math.floor(recordingTime / 60)}:
            {(recordingTime % 60).toString().padStart(2, '0')}
          </Text>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleSendImage}>
            <Icon name="image" size={24} color="#2196F3" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleSendVideo}>
            <Icon name="videocam" size={24} color="#2196F3" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleSendDocument}>
            <Icon name="document-attach" size={24} color="#2196F3" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={handleTyping}
            placeholder="Type a message..."
            multiline
            onSubmitEditing={handleSendText}
          />

          {inputText.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendText}>
              <Icon name="send" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.voiceButton}
              onPressIn={startRecording}
              onPressOut={stopRecording}>
              <Icon name="mic" size={24} color="#2196F3" />
            </TouchableOpacity>
          )}
        </View>
      )}
      </KeyboardAvoidingView>

      {/* Edit Chat Name Modal */}
      {isEditingName && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCancelEditName}>
          <TouchableOpacity
            style={styles.modalContainer}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Chat Name</Text>
            <Text style={styles.modalSubtitle}>Enter a name for this chat</Text>
            <TextInput
              style={styles.modalInput}
              value={editNameText}
              onChangeText={setEditNameText}
              placeholder={contactName}
              placeholderTextColor="#999"
              autoFocus
              maxLength={50}
              onSubmitEditing={handleSaveChatName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={handleCancelEditName}>
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave]}
                onPress={handleSaveChatName}>
                <Text style={styles.modalButtonTextSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    backgroundColor: '#f9f9f9',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonSave: {
    backgroundColor: '#075E54',
  },
  modalButtonTextCancel: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextSave: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: '#ECE5DD',
  },
  chatContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#075E54',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
    marginRight: 5,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 5,
  },
  avatarContainer: {
    marginRight: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  messageAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    alignSelf: 'flex-end', // Align avatar to bottom of message
    backgroundColor: '#ddd',
  },
  messageContent: {
    // Remove flex: 1 to allow content to wrap naturally
    width: '100%',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    paddingTop: 2, // Small padding to separate from content
    gap: 4, // Space between time and status icon
  },
  statusIcon: {
    marginLeft: 4,
  },
  statusIconContainer: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 16, // Ensure icon has space
    height: 16, // Match icon size
  },
  myMessageTime: {
    fontSize: 11,
    color: '#667781', // WhatsApp grey for sent messages
  },
  theirMessageTime: {
    fontSize: 11,
    color: '#667781', // Same grey for received messages
  },
  nameContainer: {
    flex: 1,
    marginLeft: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  editIcon: {
    opacity: 0.7,
  },
  headerStatus: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
  headerButton: {
    padding: 8,
    marginLeft: 5,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 15,
  },
  messageWrapper: {
    width: '100%',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  myMessageWrapper: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  theirMessageWrapper: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  messageContainer: {
    maxWidth: '75%',
    minWidth: 60, // Minimum width for small messages
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden', // Prevent content overflow
  },
  myMessage: {
    backgroundColor: '#DCF8C6', // WhatsApp green for sent messages
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 8,
    borderTopLeftRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  theirMessage: {
    backgroundColor: '#fff', // White for received messages
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 0, // Remove any extra margin
  },
  myMessageText: {
    color: '#000',
  },
  theirMessageText: {
    color: '#000',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 0, // No margin between image and footer
  },
  videoContainer: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 0, // No margin between video and footer
    position: 'relative',
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    color: '#fff',
    fontSize: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    maxWidth: 250,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  voiceMessageContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  voiceProgressContainer: {
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 1,
    marginBottom: 4,
    overflow: 'hidden',
  },
  voiceProgressBar: {
    height: '100%',
    backgroundColor: '#075E54',
    borderRadius: 1,
  },
  voiceText: {
    fontSize: 14,
    fontWeight: '500',
  },
  voiceWaveIcon: {
    marginLeft: 4,
  },
  documentMessage: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentText: {
    marginLeft: 10,
    fontSize: 16,
    flex: 1,
  },
  fileSizeText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    marginLeft: 34,
  },
  messageTime: {
    fontSize: 11,
    color: '#667781',
  },
  viewOnceIcon: {
    marginLeft: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 10,
    backgroundColor: '#F0F0F0',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  attachButton: {
    padding: 8,
    marginRight: 5,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    fontSize: 15,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#075E54',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#F44336',
  },
  stopButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  recordingTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
    alignItems: 'center',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#999',
    marginHorizontal: 2,
  },
  typingDotDelay1: {
    animationDelay: '0.2s',
  },
  typingDotDelay2: {
    animationDelay: '0.4s',
  },
  typingText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});

export default ChatDetailScreen;

