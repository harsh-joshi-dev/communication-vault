import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import Icon from 'react-native-vector-icons/Ionicons';
import {deviceService} from '../../services/DeviceService';
import LinearGradient from 'react-native-linear-gradient';

const QRCodeScreen: React.FC = () => {
  const navigation = useNavigation();
  const [deviceInfo, setDeviceInfo] = useState<{
    uniqueCode: string;
    deviceId: string;
    deviceName: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeviceInfo();
  }, []);

  const loadDeviceInfo = async () => {
    try {
      const info = await deviceService.getDeviceInfo();
      setDeviceInfo(info);
    } catch (error) {
      console.error('Error loading device info:', error);
      Alert.alert('Error', 'Failed to load device information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#f5f5f5', '#e0e0e0']}
        style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My QR Code</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Generating QR code...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!deviceInfo) {
    return (
      <LinearGradient
        colors={['#f5f5f5', '#e0e0e0']}
        style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My QR Code</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={60} color="#f44336" />
          <Text style={styles.errorText}>
            Unable to generate QR code
          </Text>
          <Text style={styles.errorSubtext}>
            Failed to load device information. Please try again.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  const qrData = JSON.stringify({
    uniqueCode: deviceInfo.uniqueCode,
    deviceId: deviceInfo.deviceId,
    deviceName: deviceInfo.deviceName,
  });

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Add me on Stealth Vault! Scan my QR code.\nDevice: ${deviceInfo.deviceName}\nCode: ${deviceInfo.uniqueCode}`,
        title: 'Share Contact',
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share');
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My QR Code</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Icon name="share" size={24} color="#2196F3" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.qrContainer}>
          <QRCode
            value={qrData}
            size={250}
            color="#000"
            backgroundColor="#fff"
          />
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.avatarContainer}>
            <Icon name="person-circle" size={60} color="#2196F3" />
          </View>
          <Text style={styles.name}>{deviceInfo.deviceName}</Text>
          <Text style={styles.username}>Code: {deviceInfo.uniqueCode}</Text>
        </View>

        <View style={styles.instructionsContainer}>
          <Icon name="information-circle" size={24} color="#2196F3" />
          <Text style={styles.instructionsText}>
            Share this QR code with others so they can add you as a contact
          </Text>
        </View>

        <TouchableOpacity style={styles.shareButtonLarge} onPress={handleShare}>
          <Icon name="share-outline" size={24} color="#fff" />
          <Text style={styles.shareButtonText}>Share QR Code</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  shareButton: {
    padding: 5,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 30,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarContainer: {
    marginBottom: 15,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  username: {
    fontSize: 16,
    color: '#666',
  },
  instructionsContainer: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 12,
    marginBottom: 30,
    maxWidth: '90%',
  },
  instructionsText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  shareButtonLarge: {
    flexDirection: 'row',
    backgroundColor: '#2196F3',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  placeholder: {
    width: 40,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f44336',
    marginTop: 20,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
});

export default QRCodeScreen;

