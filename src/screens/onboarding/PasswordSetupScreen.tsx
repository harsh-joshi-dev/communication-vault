import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSecurity} from '../../contexts/SecurityContext';
import LinearGradient from 'react-native-linear-gradient';

const PasswordSetupScreen: React.FC = () => {
  const navigation = useNavigation();
  const {updateSecuritySettings} = useSecurity();
  const [appPassword, setAppPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fakePassword, setFakePassword] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    app: false,
    confirm: false,
    fake: false,
  });

  const validatePassword = (password: string): boolean => {
    return password.length >= 6;
  };

  const handleContinue = async () => {
    if (!validatePassword(appPassword)) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (appPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      // Save security settings (password only, no signup needed)
      await updateSecuritySettings({
        appPassword,
        fakePassword: fakePassword || undefined,
        autoLockEnabled: true,
        autoLockDelay: 30, // 30 seconds
        breakInAlertEnabled: true,
        screenshotBlocking: true,
        screenRecordingDetection: true,
        unlockMethod: 'password',
        appVisible: true, // Default to visible
        phoneTriggerEnabled: false,
      });
      console.log('[PasswordSetup] Security settings saved');

      navigation.navigate('BackupPreference' as never);
    } catch (error: any) {
      console.error('[PasswordSetup] Error saving password:', error?.message || error);
      Alert.alert('Error', 'Failed to save password. Please try again.');
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="lock-closed" size={60} color="#2196F3" />
          <Text style={styles.title}>Set Your App Password</Text>
          <Text style={styles.subtitle}>
            This password will unlock your secure app
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Icon name="key" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="App Password (min 6 characters)"
              value={appPassword}
              onChangeText={setAppPassword}
              secureTextEntry={!showPasswords.app}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() =>
                setShowPasswords({...showPasswords, app: !showPasswords.app})
              }>
              <Icon
                name={showPasswords.app ? 'eye-off' : 'eye'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Icon name="key" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPasswords.confirm}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() =>
                setShowPasswords({
                  ...showPasswords,
                  confirm: !showPasswords.confirm,
                })
              }>
              <Icon
                name={showPasswords.confirm ? 'eye-off' : 'eye'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Icon
              name="shield-checkmark"
              size={20}
              color="#666"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Fake Password (Optional)"
              value={fakePassword}
              onChangeText={setFakePassword}
              secureTextEntry={!showPasswords.fake}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() =>
                setShowPasswords({...showPasswords, fake: !showPasswords.fake})
              }>
              <Icon
                name={showPasswords.fake ? 'eye-off' : 'eye'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Icon name="information-circle" size={20} color="#2196F3" />
            <Text style={styles.infoText}>
              Fake password shows dummy data if someone tries to access your
              app. Leave empty if not needed.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
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
  },
  form: {
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    height: 56,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 12,
    alignItems: 'flex-start',
    marginTop: 10,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  continueButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default PasswordSetupScreen;

