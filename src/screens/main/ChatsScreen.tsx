import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Chat, Message} from '../../types';
import {format} from 'date-fns';

type NavigationProp = CompositeNavigationProp<
  StackNavigationProp<any>,
  BottomTabNavigationProp<any>
>;

const ChatsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [chats, setChats] = useState<Chat[]>([]);

  // Mock data for now
  useEffect(() => {
    // In production, fetch from service
    setChats([]);
  }, []);

  const renderChatItem = ({item}: {item: Chat}) => {
    const lastMessageTime = item.lastMessage
      ? format(new Date(item.lastMessage.createdAt), 'HH:mm')
      : '';

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => {
          navigation.navigate('ChatDetail' as never, {
            chatId: item.id,
            contactName: 'Contact Name',
          } as never);
        }}>
        <View style={styles.avatarContainer}>
          <Icon name="person-circle" size={50} color="#2196F3" />
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
            <Text style={styles.chatName}>Contact Name</Text>
            {lastMessageTime && (
              <Text style={styles.chatTime}>{lastMessageTime}</Text>
            )}
          </View>
          {item.lastMessage && (
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage.type === 'text'
                ? item.lastMessage.content
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
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="chatbubbles-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No chats yet</Text>
          <Text style={styles.emptySubtext}>
            Start a conversation from Contacts
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          navigation.navigate('Contacts' as never);
        }}>
        <Icon name="add" size={28} color="#fff" />
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

