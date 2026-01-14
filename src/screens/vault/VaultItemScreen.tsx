import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Video from 'react-native-video';
import {VaultItem} from '../../types';
import {format} from 'date-fns';
import {vaultService} from '../../services/VaultService';
import RNFS from 'react-native-fs';

const VaultItemScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {item} = route.params as {item: VaultItem};
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    try {
      setLoading(true);
      const exportPath = await vaultService.exportItem(item);
      await Share.share({
        url: `file://${exportPath}`,
        type: item.mimeType,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share item');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item? This action cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await vaultService.deleteItem(item.id);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ],
    );
  };

  const renderContent = () => {
    if (item.type === 'photo') {
      return (
        <Image source={{uri: `file://${item.path}`}} style={styles.media} />
      );
    }

    if (item.type === 'video') {
      return (
        <Video
          source={{uri: `file://${item.path}`}}
          style={styles.media}
          controls
          resizeMode="contain"
        />
      );
    }

    return (
      <View style={styles.documentContainer}>
        <Icon name="document" size={80} color="#666" />
        <Text style={styles.documentName}>{item.name}</Text>
        <Text style={styles.documentSize}>
          {(item.size / 1024 / 1024).toFixed(2)} MB
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => {
            Alert.alert(
              'Options',
              '',
              [
                {text: 'Share', onPress: handleShare},
                {text: 'Delete', onPress: handleDelete, style: 'destructive'},
                {text: 'Cancel', style: 'cancel'},
              ],
            );
          }}>
          <Icon name="ellipsis-vertical" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}>
        {renderContent()}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Icon name="calendar" size={20} color="#666" />
            <Text style={styles.infoText}>
              {format(new Date(item.createdAt), 'MMMM dd, yyyy HH:mm')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="document-text" size={20} color="#666" />
            <Text style={styles.infoText}>
              {(item.size / 1024 / 1024).toFixed(2)} MB
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="lock-closed" size={20} color="#666" />
            <Text style={styles.infoText}>
              {item.isEncrypted ? 'Encrypted' : 'Not Encrypted'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    paddingTop: 50,
    backgroundColor: '#000',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginHorizontal: 10,
  },
  moreButton: {
    padding: 5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    padding: 20,
  },
  media: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    marginBottom: 20,
  },
  documentContainer: {
    width: '100%',
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
  },
  documentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
  },
  documentSize: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  infoText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
});

export default VaultItemScreen;

