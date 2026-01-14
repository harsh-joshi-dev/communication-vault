import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {saveBackupSettings, setOnboardingComplete} from '../../services/StorageService';
import LinearGradient from 'react-native-linear-gradient';

const BackupPreferenceScreen: React.FC = () => {
  const navigation = useNavigation();
  const [backupSettings, setBackupSettings] = useState({
    chats: false,
    vault: false,
    cloudProvider: undefined as 'google_drive' | 'icloud' | undefined,
  });

  const handleFinish = async () => {
    try {
      await saveBackupSettings(backupSettings);
      // Navigate directly to trigger configuration screen
      // Don't set onboarding complete yet - wait until trigger config is done
      navigation.navigate('TriggerConfiguration' as never);
    } catch (error) {
      console.error('Error saving backup settings:', error);
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="cloud-upload" size={60} color="#2196F3" />
          <Text style={styles.title}>Backup Preferences</Text>
          <Text style={styles.subtitle}>
            Choose what you want to backup (you can change this later)
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <Icon name="chatbubbles" size={24} color="#2196F3" />
              <Text style={styles.optionTitle}>Backup Chats</Text>
            </View>
            <Text style={styles.optionDescription}>
              Automatically backup your chat messages
            </Text>
            <Switch
              value={backupSettings.chats}
              onValueChange={value =>
                setBackupSettings({...backupSettings, chats: value})
              }
              trackColor={{false: '#ccc', true: '#2196F3'}}
            />
          </View>

          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <Icon name="lock-closed" size={24} color="#2196F3" />
              <Text style={styles.optionTitle}>Backup Vault</Text>
            </View>
            <Text style={styles.optionDescription}>
              Automatically backup your vault files
            </Text>
            <Switch
              value={backupSettings.vault}
              onValueChange={value =>
                setBackupSettings({...backupSettings, vault: value})
              }
              trackColor={{false: '#ccc', true: '#2196F3'}}
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Icon name="information-circle" size={20} color="#666" />
          <Text style={styles.infoText}>
            You can enable cloud backup later in settings. For now, your data
            will be stored locally on your device.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.finishButton}
          onPress={handleFinish}>
          <Text style={styles.finishButtonText}>Finish Setup</Text>
        </TouchableOpacity>
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
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  optionsContainer: {
    marginBottom: 30,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 10,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 15,
    borderRadius: 12,
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#E65100',
    lineHeight: 20,
  },
  finishButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default BackupPreferenceScreen;

