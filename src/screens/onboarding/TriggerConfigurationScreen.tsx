import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Slider from '@react-native-community/slider';
import {useTheme} from '../../contexts/ThemeContext';
import {saveTriggerConfig, getStoredTheme, setSetupComplete, setOnboardingComplete} from '../../services/StorageService';
import LinearGradient from 'react-native-linear-gradient';

const TriggerConfigurationScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {currentTheme} = useTheme();
  const [triggerConfig, setTriggerConfig] = useState<any>({});

  React.useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    const themeId = await getStoredTheme();
    if (themeId === 'gst_calculator') {
      setTriggerConfig({
        amount: 10000,
        gst_rate: 10,
        quantity: 20,
      });
    } else if (themeId === 'emi_calculator') {
      setTriggerConfig({
        loan_amount: 500000,
        tenure: 5,
        interest_rate: 10,
      });
    } else if (themeId === 'photo_app') {
      setTriggerConfig({
        tap_sequence: [1, 2, 3, 4, 5],
      });
    } else if (themeId === 'notes_app') {
      setTriggerConfig({
        long_press_duration: 5000,
      });
    } else if (themeId === 'file_scanner') {
      setTriggerConfig({
        shake_count: 3,
      });
    } else if (themeId === 'weather_app') {
      setTriggerConfig({
        tap_sequence: [3, 1, 4, 1, 5],
      });
    }
  };

  const handleSave = async () => {
    try {
      await saveTriggerConfig(currentTheme.id, triggerConfig);
      await setSetupComplete();
      await setOnboardingComplete();
      // Setup is complete, AppNavigator will automatically show main app
      // and navigate directly to Chat List
      console.log('[TriggerConfig] Setup complete, navigating to Chat List');
    } catch (error) {
      Alert.alert('Error', 'Failed to save configuration');
    }
  };

  const renderGSTConfig = () => (
    <View>
      <Text style={styles.sectionTitle}>GST Calculator Trigger</Text>
      <Text style={styles.description}>
        Set the values that will trigger the chat to open
      </Text>

      <View style={styles.configCard}>
        <Text style={styles.configLabel}>Amount: ₹{triggerConfig.amount?.toLocaleString() || 0}</Text>
        <Slider
          style={styles.slider}
          minimumValue={1000}
          maximumValue={1000000}
          step={1000}
          value={triggerConfig.amount || 10000}
          onValueChange={value =>
            setTriggerConfig({...triggerConfig, amount: value})
          }
          minimumTrackTintColor={currentTheme.color}
          maximumTrackTintColor="#ccc"
        />
      </View>

      <View style={styles.configCard}>
        <Text style={styles.configLabel}>GST Rate: {triggerConfig.gst_rate || 0}%</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={28}
          step={1}
          value={triggerConfig.gst_rate || 10}
          onValueChange={value =>
            setTriggerConfig({...triggerConfig, gst_rate: value})
          }
          minimumTrackTintColor={currentTheme.color}
          maximumTrackTintColor="#ccc"
        />
      </View>

      <View style={styles.configCard}>
        <Text style={styles.configLabel}>Quantity: {triggerConfig.quantity || 0}</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={1000}
          step={1}
          value={triggerConfig.quantity || 20}
          onValueChange={value =>
            setTriggerConfig({...triggerConfig, quantity: value})
          }
          minimumTrackTintColor={currentTheme.color}
          maximumTrackTintColor="#ccc"
        />
      </View>
    </View>
  );

  const renderEMIConfig = () => (
    <View>
      <Text style={styles.sectionTitle}>EMI Calculator Trigger</Text>
      <Text style={styles.description}>
        Set the values that will trigger the chat to open
      </Text>

      <View style={styles.configCard}>
        <Text style={styles.configLabel}>
          Loan Amount: ₹{triggerConfig.loan_amount?.toLocaleString() || 0}
        </Text>
        <Slider
          style={styles.slider}
          minimumValue={100000}
          maximumValue={10000000}
          step={10000}
          value={triggerConfig.loan_amount || 500000}
          onValueChange={value =>
            setTriggerConfig({...triggerConfig, loan_amount: value})
          }
          minimumTrackTintColor={currentTheme.color}
          maximumTrackTintColor="#ccc"
        />
      </View>

      <View style={styles.configCard}>
        <Text style={styles.configLabel}>Tenure: {triggerConfig.tenure || 0} years</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={30}
          step={1}
          value={triggerConfig.tenure || 5}
          onValueChange={value =>
            setTriggerConfig({...triggerConfig, tenure: value})
          }
          minimumTrackTintColor={currentTheme.color}
          maximumTrackTintColor="#ccc"
        />
      </View>

      <View style={styles.configCard}>
        <Text style={styles.configLabel}>Interest Rate: {triggerConfig.interest_rate || 0}%</Text>
        <Slider
          style={styles.slider}
          minimumValue={1}
          maximumValue={20}
          step={0.5}
          value={triggerConfig.interest_rate || 10}
          onValueChange={value =>
            setTriggerConfig({...triggerConfig, interest_rate: value})
          }
          minimumTrackTintColor={currentTheme.color}
          maximumTrackTintColor="#ccc"
        />
      </View>
    </View>
  );

  const renderOtherConfig = () => (
    <View>
      <Text style={styles.sectionTitle}>Trigger Configuration</Text>
      <Text style={styles.description}>
        Your selected theme uses a different unlock method. The default trigger
        settings will be used.
      </Text>
    </View>
  );

  const renderConfig = () => {
    const themeId = currentTheme.id;
    if (themeId === 'gst_calculator') {
      return renderGSTConfig();
    } else if (themeId === 'emi_calculator') {
      return renderEMIConfig();
    } else {
      return renderOtherConfig();
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="settings" size={60} color={currentTheme.color} />
          <Text style={styles.title}>Configure Chat Trigger</Text>
          <Text style={styles.subtitle}>
            Set the values for {currentTheme.displayName} that will open the
            chat screen
          </Text>
        </View>

        {renderConfig()}

        <View style={styles.infoBox}>
          <Icon name="information-circle" size={20} color="#2196F3" />
          <Text style={styles.infoText}>
            When you set these exact values in the {currentTheme.displayName},
            the chat screen will automatically open.
          </Text>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save & Continue</Text>
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
    marginBottom: 30,
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  configCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  configLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 12,
    alignItems: 'flex-start',
    marginTop: 20,
    marginBottom: 30,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default TriggerConfigurationScreen;

