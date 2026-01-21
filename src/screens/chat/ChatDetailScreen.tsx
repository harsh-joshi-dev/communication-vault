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
  AppState,
  AppStateStatus,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {useRoute, useNavigation, useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Message, Contact} from '../../types';
import {format} from 'date-fns';
import {chatService} from '../../services/ChatService';
import {deviceService} from '../../services/DeviceService';
import {chatStorageService} from '../../services/ChatStorageService';
import {messageStorageService} from '../../services/MessageStorageService';
import {launchImageLibrary, launchCamera} from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import {mediaService} from '../../services/MediaService';
import Video from 'react-native-video';
import Contacts from 'react-native-contacts';

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
  const [chatCreatedAt, setChatCreatedAt] = useState<string | null>(null); // Chat creation timestamp
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [videoPaused, setVideoPaused] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;
  const messageUnsubscribeRef = useRef<(() => void) | null>(null); // Store message listener unsubscribe function

  // Handle app state changes to reconnect when app comes back from background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('📱 App came to foreground - FORCE reconnecting socket immediately...');
        // Force immediate reconnection - reset connection state first
        const socket = (chatService as any).socketInstance;
        if (socket) {
          // Force disconnect stale connection if exists
          socket.removeAllListeners();
          socket.disconnect();
        }
        (chatService as any).socket = null;
        (chatService as any).isAuthenticated = false;
        (chatService as any).connectionPromise = null;
        
        // Immediate connection attempt (non-blocking but urgent)
        chatService.connect().then(() => {
          console.log('✅ Reconnected after app state change');
          // Re-join chat after reconnection
          chatService.joinChat(chatId).then(() => {
            console.log('✅ Rejoined chat after reconnect');
            // Fetch any pending messages immediately
            chatService.fetchPendingMessages().then(() => {
              loadMessages();
            }).catch(() => {
              loadMessages();
            });
          }).catch(() => {
            console.log('⚠️ Failed to rejoin chat after reconnect, retrying...');
            // Retry join after short delay
            setTimeout(() => {
              chatService.joinChat(chatId).catch(() => {});
            }, 1000);
            loadMessages();
          });
        }).catch(() => {
          console.log('⚠️ Reconnection failed after app state change, retrying...');
          // Retry immediately after short delay
          setTimeout(() => {
            chatService.connect().then(() => {
              chatService.joinChat(chatId).catch(() => {});
            }).catch(() => {});
          }, 500);
        });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [chatId]);

  // Reload messages and chat name when screen comes into focus (like WhatsApp)
  useFocusEffect(
    React.useCallback(() => {
      // CRITICAL: Re-setup message listener when screen comes into focus
      // This ensures messages are received when navigating back to the screen
      if (messageUnsubscribeRef.current) {
        console.log('🔄 Cleaning up old message listener before re-setup...');
        messageUnsubscribeRef.current();
        messageUnsubscribeRef.current = null;
      }
      
      // Setup message listener immediately
      console.log('📨 Setting up message listener on screen focus...');
      messageUnsubscribeRef.current = setupMessageListener();
      
      // Load messages and chat name immediately
      loadMessages();
      loadChatName();
      chatStorageService.markChatAsRead(chatId);
      
      // Connect and join chat (wait for connection before joining)
      // AGGRESSIVE reconnection check when screen comes into focus
      // Force reset connection state for immediate reconnect
      const socket = (chatService as any).socketInstance;
      if (socket && (!socket.connected || !(chatService as any).isAuthenticated)) {
        console.log('🔄 Screen focused - forcing connection reset...');
        socket.removeAllListeners();
        socket.disconnect();
        (chatService as any).socket = null;
        (chatService as any).isAuthenticated = false;
        (chatService as any).connectionPromise = null;
      }
      
      chatService.connect().then(() => {
        console.log('✅ Connected when screen focused');
        setupTypingListener();
        setupStatusUpdateListener();
        // Join chat after connection is established
        chatService.joinChat(chatId).then(() => {
          console.log('✅ Joined chat when screen focused');
        }).catch(() => {
          // Join failed, retry immediately
          console.log('⚠️ Failed to join chat initially, retrying...');
          setTimeout(() => {
            chatService.joinChat(chatId).catch(() => {});
          }, 500);
        });
        // Fetch pending messages when connected
        chatService.fetchPendingMessages().then(() => {
          loadMessages();
        }).catch(() => {
          loadMessages();
        });
      }).catch(() => {
        // Connection failed, retry immediately with aggressive attempts
        console.log('⚠️ Connection failed on focus, retrying aggressively...');
        // Immediate retry
        setTimeout(() => {
          chatService.connect().then(() => {
            setupTypingListener();
            setupStatusUpdateListener();
            chatService.joinChat(chatId).catch(() => {});
          }).catch(() => {
            // Second retry after delay
            setTimeout(() => {
              chatService.connect().then(() => {
                setupTypingListener();
                setupStatusUpdateListener();
                chatService.joinChat(chatId).catch(() => {});
              }).catch(() => {});
            }, 1000);
          });
        }, 300);
      });
      
      // Fetch pending messages immediately when screen focuses
      chatService.fetchPendingMessages().then(() => {
        loadMessages(); // Reload messages after fetching pending
      }).catch(() => {
        // Errors are handled internally
      });
      
      // Poll for pending messages every 5 seconds (critical when socket is disconnected)
      const pendingInterval = setInterval(() => {
        chatService.fetchPendingMessages().then(() => {
          loadMessages(); // Reload messages after fetching pending
        }).catch(() => {
          // Errors are handled internally, reload messages anyway to catch any local updates
          loadMessages();
        });
      }, 5000);
      
      // Also reload messages periodically to catch any missed messages
      const reloadInterval = setInterval(() => {
        loadMessages();
      }, 5000);
      
      return () => { 
        clearInterval(pendingInterval);
        clearInterval(reloadInterval);
        // Don't cleanup message listener here - it will be cleaned up in useEffect cleanup
        // We want the listener to persist while screen is focused
      };
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
    
    // Setup message listener on mount
    // Note: This will also be re-setup in useFocusEffect when screen comes into focus
    console.log('📨 Setting up message listener on mount...');
    messageUnsubscribeRef.current = setupMessageListener();

    chatService.connect().then(() => {
      setupTypingListener();
      setupStatusUpdateListener();
      joinChat();
      loadMessages();
      // Fetch pending messages after connecting
      chatService.fetchPendingMessages().then(() => {
        loadMessages();
      }).catch(() => {});
    }).catch(() => {
      // Even if connection fails, fetch pending messages (important for offline receiving)
      chatService.fetchPendingMessages().then(() => {
        loadMessages();
      }).catch(() => {});
      
      // Retry connection after delay
      setTimeout(() => {
        chatService.connect().then(() => {
          setupTypingListener();
          setupStatusUpdateListener();
          joinChat();
          loadMessages();
          chatService.fetchPendingMessages().then(() => {
            loadMessages();
          }).catch(() => {});
        }).catch(() => {});
      }, 3000);
      
      // Poll for pending messages every 5 seconds when socket is disconnected
      const pollInterval = setInterval(() => {
        chatService.fetchPendingMessages().then(() => {
          loadMessages();
        }).catch(() => {
          // Errors are handled internally, reload messages anyway
          loadMessages();
        });
      }, 5000);
      
      // Clear interval on cleanup
      return () => {
        clearInterval(pollInterval);
      };
    });

    chatStorageService.markChatAsRead(chatId);

    return () => {
      // Cleanup message listener
      if (messageUnsubscribeRef.current) {
        console.log('🧹 Cleaning up message listener on unmount...');
        messageUnsubscribeRef.current();
        messageUnsubscribeRef.current = null;
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
   * Load chat name and creation date from storage
   */
  const loadChatName = async () => {
    try {
      const chat = await chatStorageService.getChat(chatId);
      if (chat) {
        if (chat.otherUser?.name) {
          setChatName(chat.otherUser.name);
        }
        // Load creation timestamp
        if (chat.createdAt) {
          setChatCreatedAt(chat.createdAt);
        }
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
      const myUniqueCode = currentDevice.uniqueCode;
      
      // Load messages using the chat service (it handles multiple formats internally)
      const allMsgs = await chatService.getMessages(chatId);
      console.log(`✅ Loaded ${allMsgs.length} message(s) from storage`);
      
      // Filter out deleted messages and unsent messages (status 'sending' or 'pending')
      // This ensures unsent messages don't appear in the chat view
      const visibleMessages = allMsgs.filter(msg => {
        if (msg.isDeleted) return false;
        // Filter out messages with 'sending' or 'pending' status (unsent messages)
        const status = msg.status || 'sent';
        return status !== 'sending' && status !== 'pending';
      });
      
      // Filter messages that match this chat - be more precise
      const matchingMessages = visibleMessages.filter(msg => {
        const msgChatId = normalizeChatId(msg.chatId || '');
        const msgMatchesChatId = msgChatId === normalizedChatId;
        
        // Also match by participants if chatId doesn't match but participants do
        // (handles cases where chatId might differ but it's the same conversation)
        if (!msgMatchesChatId) {
          const isFromMe = msg.senderId === myDeviceId || msg.senderId === myUniqueCode;
          const isToMe = msg.receiverId === myDeviceId || msg.receiverId === myUniqueCode;
          const isFromReceiver = msg.senderId === receiverId || msg.senderId === receiverUniqueCode;
          const isToReceiver = msg.receiverId === receiverId || msg.receiverId === receiverUniqueCode;
          
          // Match if message involves me and the receiver we're chatting with
          return (isFromMe && isToReceiver) || (isFromReceiver && isToMe);
        }
        
        return true;
      });
      
      // Deduplicate by message ID
      const uniqueMap = new Map<string, Message>();
      matchingMessages.forEach(msg => {
        const msgId = msg.id || (msg as any)._id || '';
        if (msgId && !uniqueMap.has(msgId)) {
          uniqueMap.set(msgId, msg);
        }
      });
      
      // Sort by timestamp (ascending - oldest first, newest at bottom) - WhatsApp style
      // Use a consistent timestamp field: prefer sentAt (when message was actually sent) over createdAt
      // This ensures messages appear in the exact order they were sent, not when they were created
      const getMessageTimestamp = (msg: Message): number => {
        // Use sentAt if available (more accurate for message order), fallback to createdAt
        const timestamp = msg.sentAt || msg.createdAt;
        if (!timestamp) return 0;
        const date = new Date(timestamp).getTime();
        // If invalid date, return 0
        return isNaN(date) ? 0 : date;
      };
      
      const sortedMessages = Array.from(uniqueMap.values()).sort((a, b) => {
        const dateA = getMessageTimestamp(a);
        const dateB = getMessageTimestamp(b);
        
        // Primary sort: by timestamp (ascending - oldest first)
        if (dateA !== dateB) {
          return dateA - dateB;
        }
        
        // Secondary sort: if timestamps are equal, sort by message ID (stable sort)
        // This ensures messages sent at the exact same time maintain a consistent order
        const idA = (a.id || '').toString();
        const idB = (b.id || '').toString();
        if (idA && idB) {
          return idA.localeCompare(idB);
        }
        
        // Tertiary sort: by content hash if IDs are equal (shouldn't happen but safety)
        return (a.content || '').localeCompare(b.content || '');
      });
      
      console.log(`✅ Filtered and deduplicated: ${allMsgs.length} → ${sortedMessages.length} unique messages for this chat`);
      if (sortedMessages.length > 0) {
        console.log(`📋 First message: ${sortedMessages[0].content?.substring(0, 30) || sortedMessages[0].type} (${new Date(sortedMessages[0].createdAt || sortedMessages[0].sentAt || 0).toLocaleTimeString()})`);
        console.log(`📋 Last message: ${sortedMessages[sortedMessages.length - 1].content?.substring(0, 30) || sortedMessages[sortedMessages.length - 1].type} (${new Date(sortedMessages[sortedMessages.length - 1].createdAt || sortedMessages[sortedMessages.length - 1].sentAt || 0).toLocaleTimeString()})`);
      }
      
      // Set messages - WhatsApp style: oldest at top, newest at bottom
      setMessages(sortedMessages);
      
      // Scroll to bottom (newest messages) after messages are set
      setTimeout(() => {
        scrollToBottom(false); // No animation on initial load for speed
      }, 100);
      setTimeout(() => {
        scrollToBottom(true); // Animated scroll as backup
      }, 300);
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
      
      // Normalize chatIds for comparison - remove 'chat_' prefix for consistent comparison
      const normalizedCurrentChatId = normalizeChatId(chatId);
      const normalizedMessageChatId = normalizeChatId(message.chatId || '');
      
      // Check if message is for this chat
      const deviceInfo = await deviceService.getDeviceInfo();
      const myDeviceId = deviceInfo.deviceId;
      const myUniqueCode = deviceInfo.uniqueCode;
      
      // Match by chatId (normalized comparison)
      const matchesChatId = normalizedMessageChatId === normalizedCurrentChatId;
      
      // Match by participants (for device-based chats)
      const isFromReceiver = message.senderId === receiverId || 
                            message.senderId === receiverUniqueCode ||
                            (receiverId && message.senderId && message.senderId === receiverId) ||
                            (receiverUniqueCode && message.senderId && message.senderId === receiverUniqueCode);
      
      const isToMe = message.receiverId === myDeviceId || 
                     message.receiverId === myUniqueCode ||
                     (!message.receiverId && message.senderId !== myDeviceId);
      
      const isFromMe = message.senderId === myDeviceId || message.senderId === myUniqueCode;
      
      // Show message if chatId matches OR (message is from receiver AND is to me) OR (message is from me AND is to receiver)
      const shouldShow = matchesChatId || 
                        (isFromReceiver && isToMe && !isFromMe) ||
                        (isFromMe && (message.receiverId === receiverId || message.receiverId === receiverUniqueCode));
      
      if (!shouldShow) {
        console.log('⚠️ Message not for this chat, ignoring', {
          messageChatId: normalizedMessageChatId,
          currentChatId: normalizedCurrentChatId,
          matchesChatId,
          isFromReceiver,
          isToMe,
          isFromMe
        });
        return;
      }
      
      // Filter out unsent messages (status 'sending' or 'pending') from displaying
      // This ensures unsent messages don't appear in the chat view
      const messageStatus = message.status || 'sent';
      if (messageStatus === 'sending' || messageStatus === 'pending') {
        console.log('⚠️ Ignoring unsent message (status:', messageStatus + ')');
        return;
      }
      
      // Check if this is an echo-back of a message we just sent (prevent duplicates)
      // Reuse isFromMe already declared above
      if (isFromMe) {
        // Check if message already exists in current messages state (might be echo-back)
        const existingMessage = messages.find(msg => 
          msg.id === message.id || 
          (msg as any)._id === message.id ||
          // Also check by content and timestamp to catch duplicates
          (msg.content === message.content && 
           msg.senderId === message.senderId &&
           Math.abs(new Date(msg.sentAt || msg.createdAt || 0).getTime() - new Date(message.sentAt || message.createdAt || 0).getTime()) < 5000)
        );
        
        if (existingMessage) {
          console.log('⚠️ Ignoring echo-back of my own message - already displayed:', message.id);
          // Still update the existing message's status if needed
          if (message.status && message.status !== existingMessage.status) {
            setMessages(prev => prev.map(msg => 
              msg.id === existingMessage.id ? {...msg, status: message.status} : msg
            ));
          }
          return;
        }
      }
      
      console.log('✅ Message is for this chat, displaying it!', message);
      
      // Normalize message chatId to match current chatId format for consistency
      const messageChatId = message.chatId ? chatId : chatId;
      const normalizedMessage = { ...message, chatId: messageChatId };
      
      if (normalizedMessage.isDeleted) {
        setMessages(prev => {
          const filtered = prev.filter(msg => msg.id !== normalizedMessage.id && (msg as any)._id !== normalizedMessage.id);
          // Ensure sorted order after filtering - use consistent timestamp
          const getMessageTimestamp = (msg: Message): number => {
            const timestamp = msg.sentAt || msg.createdAt;
            if (!timestamp) return 0;
            const date = new Date(timestamp).getTime();
            return isNaN(date) ? 0 : date;
          };
          
          return filtered.sort((a, b) => {
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
        });
        return;
      }
      
      const mid = normalizedMessage.id || (normalizedMessage as any)._id || `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const created = normalizedMessage.createdAt || normalizedMessage.sentAt || new Date().toISOString();
      const sent = normalizedMessage.sentAt || normalizedMessage.createdAt || new Date().toISOString();
      
      // Update messages state with proper sorting
      setMessages(prev => {
        // Remove duplicates based on message ID
        const existingIndex = prev.findIndex(msg => {
          const msgId = msg.id || (msg as any)._id;
          return msgId === mid || msgId === normalizedMessage.id || msgId === (normalizedMessage as any)._id;
        });
        
        let updated: Message[];
        if (existingIndex !== -1) {
          // Update existing message
          updated = [...prev];
          updated[existingIndex] = { ...normalizedMessage, id: mid, chatId: messageChatId, createdAt: created, sentAt: sent };
        } else {
          // Add new message
          updated = [...prev, { ...normalizedMessage, id: mid, chatId: messageChatId, createdAt: created, sentAt: sent }];
        }
        
        // Remove any duplicates and sort by timestamp (ascending - oldest first, newest last)
        const uniqueMap = new Map<string, Message>();
        updated.forEach((msg) => {
          const msgId = msg.id || (msg as any)._id || '';
          if (msgId && !uniqueMap.has(msgId)) {
            uniqueMap.set(msgId, msg);
          }
        });
        
        // Use consistent timestamp calculation for perfect ordering
        const getMessageTimestamp = (msg: Message): number => {
          const timestamp = msg.sentAt || msg.createdAt;
          if (!timestamp) return 0;
          const date = new Date(timestamp).getTime();
          return isNaN(date) ? 0 : date;
        };
        
        const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
          const dateA = getMessageTimestamp(a);
          const dateB = getMessageTimestamp(b);
          
          // Primary sort: by timestamp (ascending - oldest first)
          if (dateA !== dateB) {
            return dateA - dateB;
          }
          
          // Secondary sort: by message ID (stable sort)
          const idA = (a.id || '').toString();
          const idB = (b.id || '').toString();
          if (idA && idB) {
            return idA.localeCompare(idB);
          }
          
          // Tertiary sort: by content
          return (a.content || '').localeCompare(b.content || '');
        });
        
        return sorted;
      });
      
      // Scroll to bottom after message is added
      setTimeout(() => scrollToBottom(true), 100);
      setTimeout(() => scrollToBottom(true), 300);
      
      // Update chat storage and mark as read
      const finalMessage: Message = { ...normalizedMessage, id: mid, chatId: messageChatId, createdAt: created, sentAt: sent };
      chatStorageService.updateChatWithMessage(messageChatId, finalMessage, !isFromMe).catch((err) => {
        console.error('Error updating chat with message:', err);
      });
      
      // Mark as read if message is from other user
      if (!isFromMe) {
        setTimeout(() => {
          chatService.markAsRead(messageChatId, [mid]).catch(() => {});
        }, 500);
      }
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

    // Send message (ALWAYS succeeds immediately - message saved locally, socket send happens in background)
    // This ensures message appears immediately and chat appears in chat list
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
      console.log('✅ Message sent (optimistic):', sentMessage.id);
      
      // Replace temp message with real message from sendMessage (which is already saved)
      setMessages(prev => {
        // Remove temp message and add the real message (which sendMessage already saved)
        const withoutTemp = prev.filter(msg => msg.id !== tempMessageId);
        
        // Check if real message already exists (it might if message listener processed it)
        // Check by ID first, then by content+timestamp to catch duplicates
        const existsIndex = withoutTemp.findIndex(msg => 
          msg.id === sentMessage.id || 
          (msg as any)._id === sentMessage.id ||
          // Also check by content and timestamp (within 5 seconds) to catch duplicates
          (msg.content === sentMessage.content && 
           msg.senderId === sentMessage.senderId &&
           Math.abs(new Date(msg.sentAt || msg.createdAt || 0).getTime() - new Date(sentMessage.sentAt || sentMessage.createdAt || 0).getTime()) < 5000)
        );
        
        if (existsIndex >= 0) {
          // Update existing message (don't add duplicate)
          withoutTemp[existsIndex] = {...sentMessage, status: sentMessage.status || 'sent', chatId};
        } else {
          // Add the sent message only if it doesn't exist
          withoutTemp.push({...sentMessage, status: sentMessage.status || 'sent', chatId});
        }
        
        // Remove duplicates by ID and by content+timestamp (prevent duplicate messages)
        const uniqueMap = new Map<string, Message>();
        const seenContent = new Set<string>();
        
        withoutTemp.forEach(msg => {
          const msgId = msg.id || (msg as any)._id || '';
          // Create a unique key based on ID, or content+timestamp if no ID
          const contentKey = `${msg.content}_${msg.senderId}_${new Date(msg.sentAt || msg.createdAt || 0).getTime()}`;
          
          if (msgId) {
            // Dedupe by ID
            if (!uniqueMap.has(msgId)) {
              uniqueMap.set(msgId, msg);
              seenContent.add(contentKey);
            }
          } else if (!seenContent.has(contentKey)) {
            // Dedupe by content+timestamp for messages without IDs
            const generatedId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            uniqueMap.set(generatedId, {...msg, id: generatedId});
            seenContent.add(contentKey);
          }
        });
        
        // Use consistent timestamp calculation for perfect ordering
        const getMessageTimestamp = (msg: Message): number => {
          const timestamp = msg.sentAt || msg.createdAt;
          if (!timestamp) return 0;
          const date = new Date(timestamp).getTime();
          return isNaN(date) ? 0 : date;
        };
        
        return Array.from(uniqueMap.values()).sort((a, b) => {
          const dateA = getMessageTimestamp(a);
          const dateB = getMessageTimestamp(b);
          
          // Primary sort: by timestamp (ascending - oldest first)
          if (dateA !== dateB) {
            return dateA - dateB;
          }
          
          // Secondary sort: by message ID (stable sort)
          const idA = (a.id || '').toString();
          const idB = (b.id || '').toString();
          if (idA && idB) {
            return idA.localeCompare(idB);
          }
          
          // Tertiary sort: by content
          return (a.content || '').localeCompare(b.content || '');
        });
      });
      
      // Chat is already updated by sendMessage, but refresh to ensure it's visible
      chatService.notifyChatListRefresh();
      scrollToBottom();
      
      // Message will be updated again when socket confirms (if connected)
    }).catch((error: any) => {
      // Should never happen - sendMessage always succeeds immediately
      console.warn('Message send error (should not happen):', error?.message);
      // Update status to show it's pending
      setMessages(prev => prev.map(msg => 
        msg.id === tempMessageId ? {...msg, status: 'pending'} : msg
      ));
    });
  };

  const handleSendImage = async (useCamera: boolean = false) => {
    try {
      setShowAttachmentMenu(false);
      const options = {
        mediaType: 'photo' as const,
        quality: 0.8 as const,
        saveToPhotos: false,
      };
      
      const picker = useCamera ? launchCamera : launchImageLibrary;
      
      picker(options, async response => {
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
            chatStorageService.updateChatWithMessage(chatId, sentMessage, false).then(() => {
              chatService.notifyChatListRefresh();
            }).catch(err => 
              console.error('Error updating chat:', err)
            );
            scrollToBottom();
          }).catch((error: any) => {
            console.warn('Image send warning (saved locally):', error?.message);
          });
        }
      });
    } catch (error) {
      console.error('Error sending image:', error);
    }
  };

  const handleSendVideo = async (useCamera: boolean = false) => {
    try {
      setShowAttachmentMenu(false);
      const options = {
        mediaType: 'video' as const,
        videoQuality: 'high' as const,
        saveToPhotos: false,
      };
      
      const picker = useCamera ? launchCamera : launchImageLibrary;
      
      picker(options, async response => {
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
            chatStorageService.updateChatWithMessage(chatId, sentMessage, false).then(() => {
              chatService.notifyChatListRefresh();
            }).catch(err => 
              console.error('Error updating chat:', err)
            );
            scrollToBottom();
          }).catch((error: any) => {
            console.warn('Video send warning (saved locally):', error?.message);
          });
        }
      });
    } catch (error) {
      console.error('Error sending video:', error);
    }
  };

  const handleSendDocument = async () => {
    try {
      setShowAttachmentMenu(false);
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
          chatStorageService.updateChatWithMessage(chatId, sentMessage, false).then(() => {
            chatService.notifyChatListRefresh();
          }).catch(err => 
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

  const handleSendContact = async () => {
    try {
      setShowAttachmentMenu(false);
      // Request contact permissions
      const permission = await Contacts.requestPermission();
      
      if (permission === 'authorized') {
        // Get all contacts
        const allContacts = await Contacts.getAll();
        
        // Show contact picker
        Alert.alert(
          'Select Contact',
          'Choose a contact to share',
          [
            {text: 'Cancel', style: 'cancel'},
            ...allContacts.slice(0, 10).map(contact => ({
              text: contact.displayName || contact.givenName || 'Unknown',
              onPress: async () => {
                const selectedContact: Contact = {
                  id: contact.recordID || Math.random().toString(),
                  name: contact.displayName || contact.givenName || contact.familyName || 'Unknown',
                  phoneNumber: contact.phoneNumbers?.[0]?.number?.replace(/\s/g, ''),
                  email: contact.emailAddresses?.[0]?.email,
                  isAppUser: false,
                  isInvited: false,
                  createdAt: new Date().toISOString(),
                };
                
                // Send contact as message
                const contactContent = JSON.stringify(selectedContact);
                chatService.sendMessage(
                  chatId,
                  receiverId || undefined,
                  'contact',
                  contactContent,
                  undefined,
                  {
                    isAppUser: isAppUser ?? false,
                    phoneNumber,
                    contactName,
                    email,
                    receiverUniqueCode: receiverUniqueCode,
                    contactData: selectedContact,
                  },
                ).then((sentMessage) => {
                  chatStorageService.updateChatWithMessage(chatId, sentMessage, false).then(() => {
                    chatService.notifyChatListRefresh();
                  }).catch(err => 
                    console.error('Error updating chat:', err)
                  );
                  scrollToBottom();
                }).catch((error: any) => {
                  console.warn('Contact send warning (saved locally):', error?.message);
                });
              },
            })),
          ],
          {cancelable: true}
        );
      } else {
        Alert.alert('Permission Required', 'Please grant contact permissions in Settings');
      }
    } catch (error) {
      console.error('Error sending contact:', error);
      Alert.alert('Error', 'Failed to send contact');
    }
  };

  const handleOpenVideoPlayer = (videoUrl: string) => {
    setCurrentVideoUrl(videoUrl);
    setShowVideoPlayer(true);
    setVideoPaused(false);
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
          chatStorageService.updateChatWithMessage(chatId, sentMessage, false).then(() => {
            chatService.notifyChatListRefresh();
          }).catch(err => 
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
              const videoUrl = item.mediaUrl?.startsWith('http') 
                ? item.mediaUrl 
                : `https://communication-vault.onrender.com${item.mediaUrl}`;
              handleOpenVideoPlayer(videoUrl);
            }}
            activeOpacity={0.8}>
            {item.thumbnailUrl ? (
              <Image 
                source={{uri: item.thumbnailUrl}} 
                style={styles.videoThumbnail} 
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.videoThumbnail, {backgroundColor: '#000', justifyContent: 'center', alignItems: 'center'}]}>
                <Icon name="videocam" size={40} color="#fff" />
              </View>
            )}
            <View style={styles.videoOverlay}>
              <Icon name="play-circle" size={50} color="#fff" />
              {item.duration && (
                <Text style={styles.videoDuration}>
                  {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        {item.type === 'contact' && item.contactData && (
          <TouchableOpacity 
            style={styles.contactMessage}
            onPress={() => {
              // Navigate to contact or show contact details
              Alert.alert(
                item.contactData!.name,
                `${item.contactData!.phoneNumber || ''}\n${item.contactData!.email || ''}`,
                [
                  {text: 'OK', style: 'default'},
                  item.contactData!.phoneNumber ? {
                    text: 'Call',
                    onPress: () => {
                      // TODO: Implement call functionality
                      Alert.alert('Call', `Calling ${item.contactData!.phoneNumber}...`);
                    },
                  } : null,
                ].filter(Boolean) as any,
              );
            }}
            activeOpacity={0.7}>
            <View style={styles.contactIconContainer}>
              {item.contactData.avatar ? (
                <Image source={{uri: item.contactData.avatar}} style={styles.contactAvatar} />
              ) : (
                <View style={[styles.contactAvatar, styles.contactAvatarPlaceholder]}>
                  <Icon name="person" size={24} color={isMe ? '#075E54' : '#34B7F1'} />
                </View>
              )}
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactName, isMe ? styles.myMessageText : styles.theirMessageText]}>
                {item.contactData.name}
              </Text>
              {item.contactData.phoneNumber && (
                <View style={styles.contactDetailRow}>
                  <Icon name="call" size={12} color="#999" />
                  <Text style={styles.contactDetail}> {item.contactData.phoneNumber}</Text>
                </View>
              )}
              {item.contactData.email && (
                <View style={styles.contactDetailRow}>
                  <Icon name="mail" size={12} color="#999" />
                  <Text style={styles.contactDetail}> {item.contactData.email}</Text>
                </View>
              )}
            </View>
            <Icon name="chevron-forward" size={20} color={isMe ? '#075E54' : '#34B7F1'} />
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
              {isTyping && typingUser ? `${typingUser} is typing...` : (
                chatCreatedAt ? (() => {
                  try {
                    const chatDate = new Date(chatCreatedAt);
                    if (isNaN(chatDate.getTime())) {
                      return isAppUser ? 'online' : 'tap to add to contacts';
                    }
                    return `Started chatting on ${format(chatDate, 'MMM d, yyyy')} at ${format(chatDate, 'h:mm a')}`;
                  } catch (e) {
                    return isAppUser ? 'online' : 'tap to add to contacts';
                  }
                })() : (
                  isAppUser ? 'online' : 'tap to add to contacts'
                )
              )}
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
            {chatCreatedAt && (
              <View style={[styles.chatStartHeader, styles.emptyChatStartHeader]}>
                <View style={styles.chatStartContent}>
                  <Icon name="chatbubbles" size={22} color="#075E54" style={styles.chatStartIcon} />
                  <View style={styles.chatStartTextContainer}>
                    <Text style={styles.chatStartLabel}>Chat started</Text>
                    <Text style={styles.chatStartDate}>
                      {(() => {
                        try {
                          const chatDate = new Date(chatCreatedAt);
                          if (isNaN(chatDate.getTime())) return null;
                          return format(chatDate, 'EEEE, MMMM d, yyyy');
                        } catch (e) {
                          return null;
                        }
                      })()}
                    </Text>
                    <Text style={styles.chatStartTime}>
                      {(() => {
                        try {
                          const chatDate = new Date(chatCreatedAt);
                          if (isNaN(chatDate.getTime())) return null;
                          return format(chatDate, 'h:mm a');
                        } catch (e) {
                          return null;
                        }
                      })()}
                    </Text>
                  </View>
                </View>
              </View>
            )}
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
              ListHeaderComponent={
                chatCreatedAt ? (
                  <View style={styles.chatStartHeader}>
                    <View style={styles.chatStartContent}>
                      <Icon name="chatbubbles" size={20} color="#075E54" style={styles.chatStartIcon} />
                      <View style={styles.chatStartTextContainer}>
                        <Text style={styles.chatStartLabel}>Chat started</Text>
                        <Text style={styles.chatStartDate}>
                          {(() => {
                            try {
                              const chatDate = new Date(chatCreatedAt);
                              if (isNaN(chatDate.getTime())) return null;
                              return format(chatDate, 'EEEE, MMMM d, yyyy');
                            } catch (e) {
                              return null;
                            }
                          })()}
                        </Text>
                        <Text style={styles.chatStartTime}>
                          {(() => {
                            try {
                              const chatDate = new Date(chatCreatedAt);
                              if (isNaN(chatDate.getTime())) return null;
                              return format(chatDate, 'h:mm a');
                            } catch (e) {
                              return null;
                            }
                          })()}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null
              }
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
        <>
          <View style={styles.inputContainer}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => setShowAttachmentMenu(!showAttachmentMenu)}>
              <Icon name="add-circle" size={28} color="#075E54" />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={handleTyping}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              multiline
              onSubmitEditing={handleSendText}
            />

            {inputText.trim() ? (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSendText}>
                <Icon name="send" size={22} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.voiceButton}
                onPressIn={startRecording}
                onPressOut={stopRecording}>
                <Icon name="mic" size={24} color="#075E54" />
              </TouchableOpacity>
            )}
          </View>

          {/* Attachment Menu */}
          {showAttachmentMenu && (
            <View style={styles.attachmentMenu}>
              <TouchableOpacity
                style={styles.attachmentMenuItem}
                onPress={() => handleSendImage(false)}>
                <View style={[styles.attachmentIcon, {backgroundColor: '#E3F2FD'}]}>
                  <Icon name="images" size={24} color="#2196F3" />
                </View>
                <Text style={styles.attachmentLabel}>Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentMenuItem}
                onPress={() => handleSendImage(true)}>
                <View style={[styles.attachmentIcon, {backgroundColor: '#FFF3E0'}]}>
                  <Icon name="camera" size={24} color="#FF9800" />
                </View>
                <Text style={styles.attachmentLabel}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentMenuItem}
                onPress={() => handleSendVideo(false)}>
                <View style={[styles.attachmentIcon, {backgroundColor: '#F3E5F5'}]}>
                  <Icon name="videocam" size={24} color="#9C27B0" />
                </View>
                <Text style={styles.attachmentLabel}>Video</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentMenuItem}
                onPress={() => handleSendVideo(true)}>
                <View style={[styles.attachmentIcon, {backgroundColor: '#E1F5FE'}]}>
                  <Icon name="videocam-outline" size={24} color="#00BCD4" />
                </View>
                <Text style={styles.attachmentLabel}>Record</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentMenuItem}
                onPress={handleSendDocument}>
                <View style={[styles.attachmentIcon, {backgroundColor: '#E8F5E9'}]}>
                  <Icon name="document" size={24} color="#4CAF50" />
                </View>
                <Text style={styles.attachmentLabel}>Document</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachmentMenuItem}
                onPress={handleSendContact}>
                <View style={[styles.attachmentIcon, {backgroundColor: '#FFF9C4'}]}>
                  <Icon name="person" size={24} color="#FBC02D" />
                </View>
                <Text style={styles.attachmentLabel}>Contact</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Video Player Modal */}
      <Modal
        visible={showVideoPlayer}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVideoPlayer(false)}>
        <View style={styles.videoPlayerModal}>
          <TouchableOpacity
            style={styles.videoPlayerClose}
            onPress={() => setShowVideoPlayer(false)}>
            <Icon name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {currentVideoUrl && (
            <Video
              source={{uri: currentVideoUrl}}
              style={styles.videoPlayer}
              controls={true}
              paused={videoPaused}
              resizeMode="contain"
              onError={(error) => {
                console.error('Video playback error:', error);
                Alert.alert('Error', 'Failed to play video');
                setShowVideoPlayer(false);
              }}
            />
          )}
        </View>
      </Modal>
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
    fontSize: 12,
    color: '#fff',
    opacity: 0.85,
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
    paddingTop: 10,
  },
  chatStartHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    marginTop: 10,
    marginHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  chatStartContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  chatStartIcon: {
    marginRight: 14,
    opacity: 0.8,
  },
  chatStartTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  chatStartLabel: {
    fontSize: 10,
    color: '#667781',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  chatStartDate: {
    fontSize: 16,
    color: '#075E54',
    fontWeight: '700',
    marginBottom: 3,
    lineHeight: 22,
  },
  chatStartTime: {
    fontSize: 14,
    color: '#667781',
    fontWeight: '500',
    marginTop: 2,
  },
  emptyChatStartHeader: {
    marginBottom: 30,
    marginTop: 0,
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
    width: 250,
    height: 250,
    borderRadius: 8,
    marginBottom: 0, // No margin between image and footer
    maxWidth: '100%',
  },
  videoContainer: {
    width: 250,
    height: 200,
    borderRadius: 8,
    marginBottom: 0, // No margin between video and footer
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000',
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
    minHeight: 60,
  },
  attachButton: {
    padding: 8,
    marginRight: 5,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
  attachmentMenu: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    justifyContent: 'space-around',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  attachmentMenuItem: {
    alignItems: 'center',
    minWidth: 70,
  },
  attachmentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  attachmentLabel: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
  },
  contactMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    minWidth: 200,
    maxWidth: 280,
  },
  contactIconContainer: {
    marginRight: 12,
  },
  contactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E0E0E0',
  },
  contactAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  contactDetail: {
    fontSize: 13,
    color: '#666',
  },
  videoPlayerModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
  videoPlayer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.6,
  },
});

export default ChatDetailScreen;

