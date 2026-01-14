import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Share from 'react-native-share';
import {Contact} from '../../types';
import Contacts from 'react-native-contacts';

const ContactsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      // Request permissions directly
      const permission = await Contacts.requestPermission();
      if (permission === 'authorized' || permission === 'granted') {
        const phoneContacts = await Contacts.getAll();
        console.log(`[ContactsScreen] Loaded ${phoneContacts.length} contacts`);
        
        const appContacts: Contact[] = phoneContacts
          .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
          .map(contact => ({
            id: contact.recordID || Math.random().toString(),
            name: contact.displayName || contact.givenName || contact.familyName || 'Unknown',
            phoneNumber: contact.phoneNumbers[0]?.number?.replace(/\s/g, ''),
            email: contact.emailAddresses?.[0]?.email,
            isAppUser: false, // In production, check against backend
            isInvited: false,
            createdAt: new Date().toISOString(),
          }));

        setContacts(appContacts);
        console.log(`[ContactsScreen] Processed ${appContacts.length} contacts`);
      } else {
        Alert.alert(
          'Permission Required',
          'Please grant contact permissions in Settings',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Open Settings', onPress: () => Contacts.openContactForm({})},
          ],
        );
      }
    } catch (error: any) {
      console.error('[ContactsScreen] Error loading contacts:', error);
      Alert.alert('Error', `Failed to load contacts: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phoneNumber?.includes(searchQuery),
  );

  const handleAddContact = () => {
    navigation.navigate('QRCode' as never);
  };

  const handleScanQR = () => {
    navigation.navigate('QRScanner' as never);
  };

  const handleContactPress = async (contact: Contact) => {
    // Allow chatting with any contact, app user or not
    if (contact.isAppUser && contact.userId) {
      // Navigate to chat with app user - create or open existing chat
      navigation.navigate('ChatDetail' as never, {
        chatId: `chat_${contact.userId}`,
        contactName: contact.name,
        receiverId: contact.userId,
        phoneNumber: contact.phoneNumber,
        email: contact.email,
        isAppUser: true,
      } as never);
    } else {
      // Navigate to chat with non-app user
      navigation.navigate('ChatDetail' as never, {
        chatId: `chat_${contact.phoneNumber || contact.id}`,
        contactName: contact.name,
        receiverId: null,
        phoneNumber: contact.phoneNumber,
        email: contact.email,
        isAppUser: false,
      } as never);
    }
  };

  const handleInvite = async (contact: Contact) => {
    try {
      const shareOptions = {
        title: 'Join Stealth Vault',
        message: `Hi ${contact.name}! Join me on Stealth Vault - a secure messaging app. Download it here: [App Store/Play Store Link]`,
        subject: 'Join Stealth Vault',
      };
      
      await Share.open(shareOptions);
      Alert.alert('Invite Sent', `Invite sent to ${contact.name}`);
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.error('[ContactsScreen] Error sending invite:', error);
        Alert.alert('Error', 'Failed to send invite');
      }
    }
  };

  const renderContact = ({item}: {item: Contact}) => {
    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => handleContactPress(item)}>
        <View style={styles.avatarContainer}>
          <Icon name="person-circle" size={50} color="#2196F3" />
          {item.isAppUser && (
            <View style={styles.appBadge}>
              <Icon name="checkmark-circle" size={16} color="#4CAF50" />
            </View>
          )}
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.phoneNumber && (
            <Text style={styles.contactPhone}>{item.phoneNumber}</Text>
          )}
        </View>
        <Icon name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={handleScanQR}>
          <Icon name="qr-code" size={20} color="#2196F3" />
          <Text style={styles.actionText}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleAddContact}>
          <Icon name="person-add" size={20} color="#2196F3" />
          <Text style={styles.actionText}>Add Contact</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <Text>Loading contacts...</Text>
        </View>
      ) : filteredContacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="people-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>No contacts found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredContacts}
          renderItem={renderContact}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    margin: 15,
    height: 50,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  actionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
  },
  actionText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  listContent: {
    padding: 15,
  },
  contactItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    alignItems: 'center',
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
  appBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  contactPhone: {
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ContactsScreen;

