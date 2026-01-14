import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import QRCodeScanner from 'react-native-qrcode-scanner';
import Icon from 'react-native-vector-icons/Ionicons';
import {Contact} from '../../types';
import {uuidv4} from '../../utils/uuid';
import {Platform} from 'react-native';
import {deviceService} from '../../services/DeviceService';
import EncryptedStorage from 'react-native-encrypted-storage';

const QRScannerScreen: React.FC = () => {
  const navigation = useNavigation();
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);

  const onSuccess = async (e: any) => {
    if (processing) return;

    setScanning(false);
    setProcessing(true);

    try {
      console.log('QR Code scanned data:', e.data);
      
      // Try to parse JSON
      let data;
      try {
        data = JSON.parse(e.data);
      } catch (parseError) {
        console.error('Failed to parse QR code as JSON:', parseError);
        throw new Error('Invalid QR code format: Not a valid JSON');
      }
      
      console.log('Parsed QR data:', data);
      
      // Validate QR data structure - must have uniqueCode
      if (!data.uniqueCode) {
        console.error('QR data missing uniqueCode:', data);
        throw new Error('Invalid QR code format: Missing uniqueCode');
      }

      // Get current device info
      const currentDeviceInfo = await deviceService.getDeviceInfo();
      
      // Don't allow adding yourself
      if (data.uniqueCode === currentDeviceInfo.uniqueCode) {
        Alert.alert(
          'Cannot Add Yourself',
          'This is your own QR code. Please scan someone else\'s QR code.',
          [
            {
              text: 'OK',
              onPress: () => {
                setScanning(true);
                setProcessing(false);
              },
            },
          ],
        );
        return;
      }

      // Store contact locally (no backend needed)
      const contactsKey = 'device_contacts';
      const existingContactsJson = await EncryptedStorage.getItem(contactsKey);
      const existingContacts: Contact[] = existingContactsJson 
        ? JSON.parse(existingContactsJson) 
        : [];

      // Check if contact already exists
      const existingContact = existingContacts.find(
        c => c.uniqueCode === data.uniqueCode
      );

      if (existingContact) {
        Alert.alert(
          'Contact Already Added',
          `${data.deviceName || 'This device'} is already in your contacts`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ],
        );
        return;
      }

      // Create new contact
      const newContact: Contact = {
        id: uuidv4(),
        uniqueCode: data.uniqueCode,
        deviceId: data.deviceId,
        name: data.deviceName || `Device ${data.uniqueCode}`,
        isAppUser: true,
        isInvited: false,
        createdAt: new Date().toISOString(),
      };

      // Add to contacts
      existingContacts.push(newContact);
      await EncryptedStorage.setItem(contactsKey, JSON.stringify(existingContacts));

      Alert.alert(
        'Contact Added',
        `${data.deviceName || 'Device'} has been added to your contacts`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error: any) {
      console.error('QR scan error:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to add contact',
        [
          {
            text: 'Try Again',
            onPress: () => {
              setScanning(true);
              setProcessing(false);
            },
          },
          {
            text: 'Cancel',
            onPress: () => navigation.goBack(),
            style: 'cancel',
          },
        ],
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}>
          <Icon name="close" size={30} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={styles.placeholder} />
      </View>

      {scanning && !processing ? (
        <QRCodeScanner
          onRead={onSuccess}
          flashMode="auto"
          topContent={
            <View style={styles.topContent}>
              <Text style={styles.topText}>Position the QR code</Text>
              <Text style={styles.topSubtext}>
                within the frame to scan
              </Text>
            </View>
          }
          bottomContent={
            <View style={styles.bottomContent}>
              <Icon name="qr-code-outline" size={60} color="#2196F3" />
              <Text style={styles.bottomText}>
                Make sure the QR code is clear and well-lit
              </Text>
            </View>
          }
          cameraStyle={styles.camera}
          showMarker
          markerStyle={styles.marker}
        />
      ) : (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.processingText}>Processing QR code...</Text>
        </View>
      )}
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
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#000',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  camera: {
    flex: 1,
  },
  marker: {
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  topContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  topText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  topSubtext: {
    fontSize: 14,
    color: '#ccc',
  },
  bottomContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  bottomText: {
    fontSize: 14,
    color: '#fff',
    marginTop: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  processingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#fff',
  },
});

export default QRScannerScreen;

