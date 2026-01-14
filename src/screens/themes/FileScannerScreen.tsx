import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import DeviceMotion from 'react-native-device-motion';

const FileScannerScreen: React.FC = () => {
  const {currentTheme, checkUnlockTrigger, unlock} = useTheme();
  const [shakeCount, setShakeCount] = useState(0);
  const [lastShakeTime, setLastShakeTime] = useState(0);

  React.useEffect(() => {
    let subscription: any;
    
    // Simulate shake detection
    const handleShake = () => {
      const now = Date.now();
      if (now - lastShakeTime < 1000) {
        const newCount = shakeCount + 1;
        setShakeCount(newCount);
        
        const triggerData = {
          count: newCount,
          intensity: 0.8,
        };

        if (checkUnlockTrigger(triggerData)) {
          Alert.prompt(
            'Enter Password',
            'Enter your app password to continue',
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Unlock',
                onPress: (password) => {
                  if (password) unlock();
                  setShakeCount(0);
                },
              },
            ],
            'secure-text',
          );
        }
      } else {
        setShakeCount(1);
      }
      setLastShakeTime(now);
    };

    // In production, use actual device motion
    // For now, this is a placeholder
    return () => {
      if (subscription) subscription.remove();
    };
  }, [shakeCount, lastShakeTime]);

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="document" size={60} color={currentTheme.color} />
          <Text style={styles.title}>PDF Scanner</Text>
          <Text style={styles.subtitle}>Scan documents and create PDFs</Text>
        </View>

        <View style={styles.scannerArea}>
          <Icon name="scan" size={100} color="#ccc" />
          <Text style={styles.scannerHint}>
            Place document here to scan
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="camera" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Icon name="folder" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.recentFiles}>
          <Text style={styles.sectionTitle}>Recent Scans</Text>
          <View style={styles.fileCard}>
            <Icon name="document-text" size={40} color="#9C27B0" />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName}>Document_001.pdf</Text>
              <Text style={styles.fileDate}>2 days ago</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  scannerArea: {
    backgroundColor: '#fff',
    borderRadius: 16,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scannerHint: {
    marginTop: 15,
    color: '#999',
    fontSize: 14,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#9C27B0',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  actionButtonText: {
    color: '#fff',
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600',
  },
  recentFiles: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  fileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  fileInfo: {
    marginLeft: 15,
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  fileDate: {
    fontSize: 12,
    color: '#999',
  },
});

export default FileScannerScreen;

