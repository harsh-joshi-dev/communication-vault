import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  AppState,
  AppStateStatus,
} from 'react-native';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Chat, Message} from '../../types';
import {format} from 'date-fns';
import {chatStorageService} from '../../services/ChatStorageService';
import {chatService} from '../../services/ChatService';

const ChatsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  // Track typing status per chat
  const [typingStatus, setTypingStatus] = useState<{[chatId: string]: {isTyping: boolean; typingUser: string}}>({});

  // Subscribe to new messages and chat updates ONCE on mount; stay subscribed until unmount
  // so chat list updates even when we're on ChatDetail or app was in background
  useEffect(() => {
    const unM = chatService.onMessage(() => { loadChats(true); });
    const unC = chatService.onChatUpdate(() => { loadChats(true); });
    const unD = chatService.onChatDeletedForEveryone((id) => {
      chatStorageService.deleteChat(id).catch(() => {});
      loadChats(true);
    });
    return () => { unM(); unC(); unD(); };
  }, []);

  // When app comes to foreground, refresh chat list (in case we missed events while backgrounded)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        console.log('📱 ChatsScreen: App active, refreshing chats');
        loadChats(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Load chats when screen is focused + connect + typing + periodic refresh
  useFocusEffect(
    useCallback(() => {
      console.log('📱 ChatsScreen: Screen focused, loading chats...');
      chatService.connect().then(() => { loadChats(); }).catch(() => {
        loadChats();
        setTimeout(() => chatService.connect().catch(() => {}), 3000);
      });

      // Listen for typing indicators
      const setupTypingListener = () => {
        const socket = (chatService as any).socketInstance;
        if (!socket) {
          console.log('⚠️ Socket not ready for typing listener, will retry');
          return () => {};
        }
        
        const handleTyping = async (data: {deviceId: string; deviceName: string; chatId: string; isTyping: boolean}) => {
          console.log('⌨️ ChatsScreen: Typing event received:', data);
          
          // Get current device ID to ignore own typing
          const {deviceService} = await import('../../services/DeviceService');
          const currentDevice = await deviceService.getDeviceInfo();
          
          // Ignore typing from self
          if (data.deviceId === currentDevice.deviceId) {
            console.log('⌨️ Ignoring own typing indicator');
            return;
          }
          
          const normalizedChatId = data.chatId?.replace(/^chat_/, '') || data.chatId;
          const chatWithPrefix = data.chatId.startsWith('chat_') ? data.chatId : `chat_${normalizedChatId}`;
          
          // Update typing status for all possible chatId formats
          setTypingStatus(prev => {
            const updated = {...prev};
            
            if (data.isTyping) {
              updated[data.chatId] = {isTyping: true, typingUser: data.deviceName};
              updated[normalizedChatId] = {isTyping: true, typingUser: data.deviceName};
              updated[chatWithPrefix] = {isTyping: true, typingUser: data.deviceName};
              
              console.log(`⌨️ Setting typing status for chat: ${data.chatId} (${data.deviceName} is typing)`);
              
              // Auto-hide typing after 3 seconds
              setTimeout(() => {
                setTypingStatus(current => {
                  const cleared = {...current};
                  delete cleared[data.chatId];
                  delete cleared[normalizedChatId];
                  delete cleared[chatWithPrefix];
                  console.log(`⌨️ Auto-hiding typing for chat: ${data.chatId} (3s timeout)`);
                  return cleared;
                });
                loadChats(true);
              }, 3000);
            } else {
              // Stop typing
              delete updated[data.chatId];
              delete updated[normalizedChatId];
              delete updated[chatWithPrefix];
              console.log(`⌨️ Stopped typing for chat: ${data.chatId}`);
            }
            
            return updated;
          });
          
          // Update chats state to reflect typing status
          setChats(prev => prev.map(chat => {
            const chatNormalizedId = chat.id.replace(/^chat_/, '');
            const dataNormalizedId = data.chatId.replace(/^chat_/, '');
            
            // Check if this typing event is for this chat
            const matchesChatId = chat.id === data.chatId || 
                                 chat.id === dataNormalizedId ||
                                 chatNormalizedId === dataNormalizedId ||
                                 chatNormalizedId === data.chatId ||
                                 (data.chatId.startsWith('chat_') && chatNormalizedId === dataNormalizedId);
            
            if (matchesChatId) {
              console.log(`⌨️ Updating chat ${chat.id} typing status: ${data.isTyping ? 'typing' : 'stopped'}`);
              return {
                ...chat,
                isTyping: data.isTyping,
                typingUser: data.isTyping ? data.deviceName : undefined,
              };
            }
            return chat;
          }));
        };
        
        socket.on('user_typing', handleTyping);
        console.log('✅ Typing listener set up in ChatsScreen');
        
        return () => {
          socket.off('user_typing', handleTyping);
        };
      };
      
      // Setup typing listener after socket is connected (with delay to ensure socket is ready)
      let typingUnsubscribe: (() => void) | null = null;
      let typingSetupTimeout: NodeJS.Timeout | null = null;
      
      // Try to setup typing listener immediately
      typingUnsubscribe = setupTypingListener();
      
      // Also try again after delay if socket wasn't ready
      typingSetupTimeout = setTimeout(() => {
        if (!typingUnsubscribe) {
          typingUnsubscribe = setupTypingListener();
        }
      }, 1000);
      
      // Periodic refresh (every 5 seconds) to catch missed updates; 2s was too aggressive
      const refreshInterval = setInterval(() => loadChats(true), 5000);
      
      return () => {
        if (typingUnsubscribe) typingUnsubscribe();
        if (typingSetupTimeout) clearTimeout(typingSetupTimeout);
        if (refreshInterval) clearInterval(refreshInterval);
      };
    }, [])
  );

  const loadChats = async (silent?: boolean) => {
    try {
      if (!silent) setLoading(true);
      const loadedChats = await chatStorageService.getChats();
      setChats(loadedChats);
      if (loadedChats.length === 0) {
        setTimeout(() => { chatStorageService.getChats().then(c => { if (c.length > 0) setChats(c); }); }, 400);
      }
    } catch (error) {
      console.error('❌ Error loading chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderChatItem = ({item}: {item: Chat}) => {
    const lastMessageTime = item.lastMessage
      ? format(new Date(item.lastMessage.createdAt), 'HH:mm')
      : '';
    
    const contactName = item.otherUser?.name || 'Unknown User';
    const contactAvatar = item.otherUser?.avatar;
    
    // Check typing status (from state or chat item)
    const normalizedChatId = item.id.replace(/^chat_/, '');
    const chatTypingStatus = typingStatus[item.id] || typingStatus[normalizedChatId] || typingStatus[`chat_${normalizedChatId}`];
    const isSomeoneTyping = item.isTyping || chatTypingStatus?.isTyping || false;
    const typingUserName = item.typingUser || chatTypingStatus?.typingUser || contactName;

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => {
          navigation.navigate('ChatDetail' as never, {
            chatId: item.id,
            contactName: contactName,
            receiverId: item.otherUser?.id || item.participantIds?.[0],
            receiverUniqueCode: item.otherUser?.uniqueCode,
            isAppUser: item.otherUser?.isAppUser || false,
          } as never);
        }}>
        <View style={styles.avatarContainer}>
          {contactAvatar ? (
            <Image source={{uri: contactAvatar}} style={styles.avatar} />
          ) : (
            <Icon name="person-circle" size={50} color="#2196F3" />
          )}
          {item.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{contactName}</Text>
            {lastMessageTime && !isSomeoneTyping && (
              <Text style={styles.chatTime}>{lastMessageTime}</Text>
            )}
            {isSomeoneTyping && (
              <View style={styles.typingIndicatorContainer}>
                <View style={styles.typingDots}>
                  <View style={[styles.typingDot, styles.typingDot1]} />
                  <View style={[styles.typingDot, styles.typingDot2]} />
                  <View style={[styles.typingDot, styles.typingDot3]} />
                </View>
              </View>
            )}
          </View>
          {isSomeoneTyping ? (
            <View style={styles.typingContainer}>
              <Text 
                style={[
                  styles.lastMessage,
                  styles.typingMessage
                ]} 
                numberOfLines={1}>
                <Text style={styles.typingUserName}>{typingUserName}</Text>
                {' is typing...'}
              </Text>
            </View>
          ) : item.lastMessage ? (
            <Text 
              style={[
                styles.lastMessage,
                item.unreadCount > 0 && styles.unreadLastMessage
              ]} 
              numberOfLines={1}>
              {item.lastMessage.type === 'text'
                ? item.lastMessage.content
                : item.lastMessage.type === 'image'
                ? '📷 Photo'
                : item.lastMessage.type === 'video'
                ? '🎥 Video'
                : item.lastMessage.type === 'voice'
                ? '🎤 Voice'
                : item.lastMessage.type === 'document'
                ? '📄 Document'
                : `📎 ${item.lastMessage.type}`}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => {
            // Navigate to Settings tab (parent tab navigator)
            const parent = navigation.getParent();
            if (parent) {
              parent.navigate('Settings');
            }
          }}>
          <Icon name="settings" size={24} color="#2196F3" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading chats...</Text>
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="chatbubbles-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No chats yet</Text>
          <Text style={styles.emptySubtext}>
            Scan a QR code to start chatting
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadChats}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          // Navigate to QR Scanner to scan and start chat
          navigation.navigate('QRScanner' as never);
        }}>
        <Icon name="qr-code" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 5,
  },
  listContent: {
    padding: 10,
  },
  chatItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  unreadLastMessage: {
    fontWeight: '600',
    color: '#333',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingMessage: {
    fontStyle: 'italic',
    color: '#999',
  },
  typingUserName: {
    fontWeight: '600',
    color: '#666',
  },
  typingIndicatorContainer: {
    marginLeft: 8,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#999',
  },
  typingDot1: {
    opacity: 1,
  },
  typingDot2: {
    opacity: 0.6,
  },
  typingDot3: {
    opacity: 0.3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 10,
    textAlign: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
});

export default ChatsScreen;

