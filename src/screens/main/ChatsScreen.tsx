import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
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

  // Load chats when screen is focused (like WhatsApp)
  useFocusEffect(
    useCallback(() => {
      loadChats();
      
      // Listen for new messages to update chat list
      const unsubscribe = chatService.onMessage(() => {
        // Reload chats when new message arrives
        loadChats();
      });
      
      return () => {
        unsubscribe();
      };
    }, [])
  );

  const loadChats = async () => {
    try {
      setLoading(true);
      const loadedChats = await chatStorageService.getChats();
      setChats(loadedChats);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderChatItem = ({item}: {item: Chat}) => {
    const lastMessageTime = item.lastMessage
      ? format(new Date(item.lastMessage.createdAt), 'HH:mm')
      : '';
    
    const contactName = item.otherUser?.name || 'Unknown Device';
    const contactAvatar = item.otherUser?.avatar;

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
            {lastMessageTime && (
              <Text style={styles.chatTime}>{lastMessageTime}</Text>
            )}
          </View>
          {item.lastMessage && (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage.type === 'text'
                ? item.lastMessage.content
                : item.lastMessage.type === 'image'
                ? '📷 Photo'
                : item.lastMessage.type === 'video'
                ? '🎥 Video'
                : item.lastMessage.type === 'audio'
                ? '🎤 Audio'
                : item.lastMessage.type === 'document'
                ? '📄 Document'
                : `📎 ${item.lastMessage.type}`}
            </Text>
          )}
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

