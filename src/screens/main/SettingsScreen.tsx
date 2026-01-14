import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Modal,
  FlatList,
  BackHandler,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../contexts/ThemeContext';
import {useSecurity} from '../../contexts/SecurityContext';
import {themes} from '../../themes';
import {saveAppName, getAppName, saveAppIcon, getAppIcon, saveTriggerConfig} from '../../services/StorageService';
import {appCustomizationService} from '../../services/AppCustomizationService';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const {currentTheme, setTheme} = useTheme();
  const {securitySettings, updateSecuritySettings} = useSecurity();
  const [phoneTrigger, setPhoneTrigger] = useState(
    securitySettings?.phoneTriggerNumber || '',
  );
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [moduleAvailable, setModuleAvailable] = React.useState(false);

  React.useEffect(() => {
    loadAppSettings();
    checkModuleAvailability();
  }, []);

  const checkModuleAvailability = async () => {
    try {
      // Try to get app name to check if module is available
      const name = await appCustomizationService.getAppName();
      setModuleAvailable(true);
    } catch (error) {
      console.warn('AppCustomization module not available:', error);
      setModuleAvailable(false);
    }
  };

  const loadAppSettings = async () => {
    // Settings are now automatically managed by theme selection
  };

  const handleThemeSelect = async (themeId: string) => {
    if (!moduleAvailable) {
      Alert.alert(
        'Module Not Available',
        'Please rebuild the app first:\n\n1. Run: ./scripts/rebuild-app-customization.sh\n2. Or: cd android && ./gradlew clean && cd .. && npm run android\n\nNative modules require a full rebuild.',
      );
      return;
    }

    // Map theme IDs to app names and icons (must match AndroidManifest aliases)
    const themeToAppConfig: Record<string, {name: string; icon: string}> = {
      'gst_calculator': {name: 'Calculator', icon: 'calculator'},
      'emi_calculator': {name: 'Calculator', icon: 'calculator'},
      'photo_app': {name: 'Camera', icon: 'camera'},
      'notes_app': {name: 'Notes', icon: 'notes'},
      'file_scanner': {name: 'Scanner', icon: 'scanner'},
      'weather_app': {name: 'Weather', icon: 'weather'},
    };

    const config = themeToAppConfig[themeId] || {name: 'Stealth Vault', icon: 'default'};
    
    try {
      // Change theme
      await setTheme(themeId);
      
      // Automatically set the unlock trigger configuration for this theme
      // This ensures the chat list uses the correct unlock method
      const selectedTheme = themes.find(t => t.id === themeId);
      if (selectedTheme) {
        let triggerConfig: any = {};
        
        // Set default trigger config based on theme type
        if (themeId === 'gst_calculator') {
          triggerConfig = {
            amount: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'amount')?.max || 1000000,
            gst_rate: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'gst_rate')?.max || 28,
            quantity: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'quantity')?.max || 1000,
            customValues: {
              amount: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'amount')?.max || 1000000,
              gst_rate: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'gst_rate')?.max || 28,
              quantity: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'quantity')?.max || 1000,
            },
          };
        } else if (themeId === 'emi_calculator') {
          triggerConfig = {
            loan_amount: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'loan_amount')?.max || 10000000,
            tenure: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'tenure')?.max || 30,
            interest_rate: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'interest_rate')?.max || 20,
            customValues: {
              loan_amount: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'loan_amount')?.max || 10000000,
              tenure: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'tenure')?.max || 30,
              interest_rate: selectedTheme.unlockTrigger.config.sliders.find((s: any) => s.id === 'interest_rate')?.max || 20,
            },
          };
        } else if (themeId === 'photo_app') {
          triggerConfig = {
            tap_sequence: selectedTheme.unlockTrigger.config.sequence || [1, 2, 3, 4, 5],
          };
        } else if (themeId === 'notes_app') {
          triggerConfig = {
            long_press_duration: selectedTheme.unlockTrigger.config.duration || 5000,
          };
        } else if (themeId === 'file_scanner') {
          triggerConfig = {
            shake_count: selectedTheme.unlockTrigger.config.count || 3,
            intensity: selectedTheme.unlockTrigger.config.intensity || 0.8,
          };
        } else if (themeId === 'weather_app') {
          triggerConfig = {
            tap_sequence: selectedTheme.unlockTrigger.config.sequence || [3, 1, 4, 1, 5],
          };
        }
        
        // Save the trigger configuration
        await saveTriggerConfig(themeId, triggerConfig);
        console.log(`[SettingsScreen] Set unlock trigger config for theme: ${themeId}`, triggerConfig);
      }
      
      // Automatically change app name and icon based on theme
      const nameSuccess = await appCustomizationService.setAppName(config.name);
      const iconSuccess = await appCustomizationService.setAppIcon(config.icon);
      
      // Save the app name and icon
      await saveAppName(config.name);
      await saveAppIcon(config.icon);
      
      setShowThemeModal(false);
      
      if (nameSuccess && iconSuccess) {
        // Automatically restart the app to apply changes
        Alert.alert(
          'Theme Changed Successfully',
          `App theme, name, and icon have been changed to "${config.name}".\n\nThe app will restart automatically to apply the changes.`,
          [
            {
              text: 'Restart Now',
              style: 'default',
              onPress: async () => {
                // Restart the app automatically
                try {
                  const restartSuccess = await appCustomizationService.restartApp();
                  if (!restartSuccess) {
                    // Fallback to manual exit
                    BackHandler.exitApp();
                  }
                } catch (error) {
                  console.error('Error restarting app:', error);
                  BackHandler.exitApp();
                }
              },
            },
          ],
          {cancelable: false},
        );
        
        // Auto-restart after 2 seconds if user doesn't click
        setTimeout(async () => {
          try {
            const restartSuccess = await appCustomizationService.restartApp();
            if (!restartSuccess) {
              BackHandler.exitApp();
            }
          } catch (error) {
            console.error('Error auto-restarting app:', error);
            BackHandler.exitApp();
          }
        }, 2000);
      } else {
        Alert.alert(
          'Theme Changed',
          'Theme changed successfully, but app name/icon change may require app restart.',
          [
            {
              text: 'OK',
              onPress: () => {
                BackHandler.exitApp();
              },
            },
          ],
        );
      }
    } catch (error: any) {
      console.error('Error changing theme:', error);
      Alert.alert('Error', `Failed to change theme: ${error?.message || 'Unknown error'}`);
    }
  };


  const handlePasswordToggle = (value: boolean) => {
    if (value) {
      // Enable password - show setup modal
      setShowPasswordSetup(true);
    } else {
      // Disable password
      updateSecuritySettings({
        passwordEnabled: false,
        appPassword: undefined,
      });
      Alert.alert('Password Disabled', 'Password unlock has been disabled');
    }
  };

  const handlePasswordSetup = async () => {
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    updateSecuritySettings({
      passwordEnabled: true,
      appPassword: password,
    });
    setShowPasswordSetup(false);
    setPassword('');
    setConfirmPassword('');
    Alert.alert('Success', 'Password enabled. App will require password to unlock.');
  };

  const handleAppVisibleToggle = async (value: boolean) => {
    if (!value) {
      // Hiding app - check if phone trigger is set
      const currentTrigger = securitySettings?.phoneTriggerNumber;
      if (!currentTrigger || currentTrigger.length < 3) {
        Alert.alert(
          'Phone Trigger Required',
          'Please set a phone trigger number before hiding the app. This number will be used to access the app when it\'s hidden.',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Set Trigger',
              onPress: () => {
                setShowPhoneInput(true);
                updateSecuritySettings({phoneTriggerEnabled: true});
              },
            },
          ],
        );
        return;
      }

      // Hide the app using native module
      const hidden = await appCustomizationService.hideApp(true, currentTrigger);
      if (hidden) {
        updateSecuritySettings({appVisible: false});
        Alert.alert(
          'App Hidden',
          `App is now hidden from launcher. Dial ${currentTrigger} to access the app.`,
        );
      } else {
        Alert.alert('Error', 'Failed to hide app');
      }
    } else {
      // Showing app
      const shown = await appCustomizationService.hideApp(false, '');
      if (shown) {
        updateSecuritySettings({appVisible: true});
        Alert.alert('App Visible', 'App is now visible in launcher');
      } else {
        Alert.alert('Error', 'Failed to show app');
      }
    }
  };

  const handlePhoneTriggerToggle = (value: boolean) => {
    updateSecuritySettings({
      phoneTriggerEnabled: value,
      phoneTriggerNumber: value ? phoneTrigger : undefined,
    });
    setShowPhoneInput(value);
    if (value && !phoneTrigger) {
      Alert.alert(
        'Phone Trigger',
        'Enter a number (e.g., 1234) that will open this app when dialed.',
      );
    }
  };

  const handlePhoneTriggerSave = () => {
    if (phoneTrigger.length < 3) {
      Alert.alert('Error', 'Phone trigger must be at least 3 digits');
      return;
    }
    updateSecuritySettings({
      phoneTriggerNumber: phoneTrigger,
      phoneTriggerEnabled: true,
    });
    setShowPhoneInput(false);
    Alert.alert('Success', `Phone trigger set to: ${phoneTrigger}`);
  };

  const renderThemeItem = ({item}: {item: any}) => (
    <TouchableOpacity
      style={[
        styles.themeItem,
        currentTheme.id === item.id && styles.themeItemSelected,
      ]}
      onPress={() => handleThemeSelect(item.id)}>
      <Icon name={item.icon} size={30} color={item.color} />
      <Text style={styles.themeItemText}>{item.displayName}</Text>
      {currentTheme.id === item.id && (
        <Icon name="checkmark-circle" size={24} color="#2196F3" />
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Customization</Text>
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowThemeModal(true)}>
          <Icon name="color-palette" size={24} color="#2196F3" />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Change Category/Theme</Text>
            <Text style={styles.settingValue}>
              {currentTheme.displayName}
            </Text>
            <Text style={styles.settingSubValue}>
              App name and icon change automatically
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.settingItem}>
          <Icon name="lock-closed" size={24} color="#2196F3" />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Password Unlock</Text>
            <Text style={styles.settingValue}>
              {securitySettings?.passwordEnabled
                ? 'Password required'
                : 'No password'}
            </Text>
          </View>
          <Switch
            value={securitySettings?.passwordEnabled || false}
            onValueChange={handlePasswordToggle}
          />
        </View>
        {showPasswordSetup && (
          <View style={styles.passwordSetupContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter password (min 6 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.passwordButtons}>
              <TouchableOpacity
                style={[styles.passwordButton, styles.cancelButton]}
                onPress={() => {
                  setShowPasswordSetup(false);
                  setPassword('');
                  setConfirmPassword('');
                }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.passwordButton, styles.savePasswordButton]}
                onPress={handlePasswordSetup}>
                <Text style={styles.savePasswordButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.settingItem}>
          <Icon name="camera" size={24} color="#2196F3" />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Block Screenshots</Text>
          </View>
          <Switch
            value={securitySettings?.screenshotBlocking || false}
            onValueChange={value =>
              updateSecuritySettings({screenshotBlocking: value})
            }
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Visibility</Text>
        <View style={styles.settingItem}>
          <Icon name="eye" size={24} color="#2196F3" />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Hide App</Text>
            <Text style={styles.settingValue}>
              {securitySettings?.appVisible === false
                ? 'Hidden'
                : 'Visible'}
            </Text>
          </View>
          <Switch
            value={securitySettings?.appVisible === false}
            onValueChange={value => handleAppVisibleToggle(!value)}
          />
        </View>
        <View style={styles.settingItem}>
          <Icon name="call" size={24} color="#2196F3" />
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Phone Number Trigger</Text>
            <Text style={styles.settingValue}>
              {securitySettings?.phoneTriggerEnabled
                ? securitySettings.phoneTriggerNumber || 'Not set'
                : 'Disabled'}
            </Text>
          </View>
          <Switch
            value={securitySettings?.phoneTriggerEnabled || false}
            onValueChange={handlePhoneTriggerToggle}
          />
        </View>
        {showPhoneInput && (
          <View style={styles.phoneInputContainer}>
            <TextInput
              style={styles.phoneInput}
              placeholder="Enter trigger number (e.g., 1234)"
              value={phoneTrigger}
              onChangeText={setPhoneTrigger}
              keyboardType="phone-pad"
              maxLength={10}
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handlePhoneTriggerSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Version 1.0.0</Text>
      </View>

      {/* Theme Selection Modal */}
      <Modal
        visible={showThemeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowThemeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Theme</Text>
              <TouchableOpacity onPress={() => setShowThemeModal(false)}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={themes}
              renderItem={renderThemeItem}
              keyExtractor={item => item.id}
            />
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    paddingHorizontal: 20,
    paddingVertical: 10,
    textTransform: 'uppercase',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginLeft: 15,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 3,
  },
  settingValue: {
    fontSize: 14,
    color: '#999',
  },
  settingSubValue: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  phoneInputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#f9f9f9',
  },
  phoneInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  passwordSetupContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  passwordButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  passwordButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  savePasswordButton: {
    backgroundColor: '#2196F3',
  },
  savePasswordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  themeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  themeItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  themeItemText: {
    flex: 1,
    marginLeft: 15,
    fontSize: 16,
    color: '#333',
  },
  appNameInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    margin: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    justifyContent: 'space-between',
  },
  iconOption: {
    width: '30%',
    alignItems: 'center',
    padding: 15,
    marginBottom: 15,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  iconOptionSelected: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  iconOptionText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

export default SettingsScreen;
