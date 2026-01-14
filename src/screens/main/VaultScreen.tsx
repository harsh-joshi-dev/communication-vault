import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {VaultItem} from '../../types';
import {format} from 'date-fns';
import {vaultService} from '../../services/VaultService';

const {width} = Dimensions.get('window');
const ITEM_SIZE = (width - 60) / 3;

const VaultScreen: React.FC = () => {
  const navigation = useNavigation();
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedType, setSelectedType] = useState<'all' | 'photo' | 'video' | 'document'>('all');

  useEffect(() => {
    loadVaultItems();
  }, []);

  const loadVaultItems = async () => {
    try {
      const items = await vaultService.getItems();
      setVaultItems(items);
    } catch (error) {
      console.error('Error loading vault items:', error);
    }
  };

  const handleAddPhoto = async () => {
    try {
      const item = await vaultService.addPhoto();
      setVaultItems([...vaultItems, item]);
    } catch (error) {
      Alert.alert('Error', 'Failed to add photo');
    }
  };

  const handleAddVideo = async () => {
    try {
      const item = await vaultService.addVideo();
      setVaultItems([...vaultItems, item]);
    } catch (error) {
      Alert.alert('Error', 'Failed to add video');
    }
  };

  const handleAddDocument = async () => {
    try {
      const item = await vaultService.addDocument();
      setVaultItems([...vaultItems, item]);
    } catch (error) {
      Alert.alert('Error', 'Failed to add document');
    }
  };

  const filteredItems = vaultItems.filter(
    item => selectedType === 'all' || item.type === selectedType,
  );

  const renderGridItem = ({item}: {item: VaultItem}) => {
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => {
          navigation.navigate('VaultItem' as never, {item} as never);
        }}>
        {item.type === 'photo' || item.type === 'video' ? (
          <Image
            source={{uri: item.thumbnailPath || item.path}}
            style={styles.gridImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.documentIcon}>
            <Icon name="document" size={40} color="#666" />
          </View>
        )}
        {item.type === 'video' && (
          <View style={styles.videoBadge}>
            <Icon name="play" size={16} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderListItem = ({item}: {item: VaultItem}) => {
    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => {
          navigation.navigate('VaultItem' as never, {item} as never);
        }}>
        {item.type === 'photo' || item.type === 'video' ? (
          <Image
            source={{uri: item.thumbnailPath || item.path}}
            style={styles.listThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.listDocumentIcon}>
            <Icon name="document" size={30} color="#666" />
          </View>
        )}
        <View style={styles.listInfo}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.listMeta}>
            {format(new Date(item.createdAt), 'MMM dd, yyyy')} •{' '}
            {(item.size / 1024 / 1024).toFixed(2)} MB
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.filterContainer}>
          {(['all', 'photo', 'video', 'document'] as const).map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                selectedType === type && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedType(type)}>
              <Text
                style={[
                  styles.filterText,
                  selectedType === type && styles.filterTextActive,
                ]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.viewModeButton}
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
          <Icon
            name={viewMode === 'grid' ? 'list' : 'grid'}
            size={24}
            color="#2196F3"
          />
        </TouchableOpacity>
      </View>

      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="lock-closed-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>Your vault is empty</Text>
          <Text style={styles.emptySubtext}>
            Add photos, videos, or documents to keep them secure
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
          keyExtractor={item => item.id}
          numColumns={viewMode === 'grid' ? 3 : 1}
          contentContainerStyle={styles.listContent}
          key={viewMode}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Alert.alert(
            'Add to Vault',
            'Choose what to add',
            [
              {text: 'Photo', onPress: () => handleAddPhoto()},
              {text: 'Video', onPress: () => handleAddVideo()},
              {text: 'Document', onPress: () => handleAddDocument()},
              {text: 'Cancel', style: 'cancel'},
            ],
          );
        }}>
        <Icon name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
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
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#2196F3',
  },
  filterText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },
  viewModeButton: {
    padding: 8,
  },
  listContent: {
    padding: 10,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: 5,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  documentIcon: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#0008',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItem: {
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
  listThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 15,
  },
  listDocumentIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  listMeta: {
    fontSize: 12,
    color: '#999',
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

export default VaultScreen;

