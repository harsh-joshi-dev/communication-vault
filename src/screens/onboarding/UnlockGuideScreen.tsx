import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useTheme} from '../../contexts/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';

const UnlockGuideScreen: React.FC = () => {
  const navigation = useNavigation();
  const {currentTheme} = useTheme();

  const getUnlockInstructions = () => {
    const {type, config} = currentTheme.unlockTrigger;

    switch (type) {
      case 'sliders':
        return {
          title: 'Secret Unlock Method',
          steps: [
            'Open the app to see your theme',
            `Set all ${config.sliders.length} sliders to maximum value`,
            'A password prompt will appear',
            'Enter your app password to access',
          ],
          icon: 'sliders',
        };
      case 'tap_sequence':
        return {
          title: 'Secret Tap Sequence',
          steps: [
            'Open the app',
            `Tap in sequence: ${config.sequence.join(' → ')}`,
            'Password prompt will appear',
            'Enter your app password',
          ],
          icon: 'finger-print',
        };
      case 'long_press':
        return {
          title: 'Long Press to Unlock',
          steps: [
            'Open the app',
            `Long press on the header for ${config.duration / 1000} seconds`,
            'Password prompt will appear',
            'Enter your app password',
          ],
          icon: 'hand-left',
        };
      case 'shake':
        return {
          title: 'Shake to Unlock',
          steps: [
            'Open the app',
            `Shake your device ${config.count} times`,
            'Password prompt will appear',
            'Enter your app password',
          ],
          icon: 'phone-portrait',
        };
      default:
        return {
          title: 'Secret Unlock',
          steps: ['Follow the unlock method'],
          icon: 'lock-closed',
        };
    }
  };

  const instructions = getUnlockInstructions();

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Icon name={instructions.icon} size={60} color="#2196F3" />
          </View>
          <Text style={styles.title}>{instructions.title}</Text>
          <Text style={styles.subtitle}>
            This is how you'll access your secure app
          </Text>
        </View>

        <View style={styles.stepsContainer}>
          {instructions.steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.warningBox}>
          <Icon name="warning" size={24} color="#FF9800" />
          <Text style={styles.warningText}>
            Remember: The app will look like a normal utility app. Only you know
            the secret unlock method!
          </Text>
        </View>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => navigation.navigate('BackupPreference' as never)}>
          <Text style={styles.continueButtonText}>Got It, Continue</Text>
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
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2196F320',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  stepsContainer: {
    marginBottom: 30,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 15,
    borderRadius: 12,
    marginBottom: 30,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#E65100',
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

export default UnlockGuideScreen;

