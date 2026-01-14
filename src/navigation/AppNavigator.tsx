import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';
import {useSecurity} from '../contexts/SecurityContext';
import {isOnboardingComplete, isSetupComplete} from '../services/StorageService';

// Onboarding Screens
import ThemeSelectionScreen from '../screens/onboarding/ThemeSelectionScreen';
import UnlockGuideScreen from '../screens/onboarding/UnlockGuideScreen';
import BackupPreferenceScreen from '../screens/onboarding/BackupPreferenceScreen';
import TriggerConfigurationScreen from '../screens/onboarding/TriggerConfigurationScreen';

// Auth Screens
import UnlockScreen from '../screens/auth/UnlockScreen';

// Theme Disguise Screens
import GSTCalculatorScreen from '../screens/themes/GSTCalculatorScreen';
import EMICalculatorScreen from '../screens/themes/EMICalculatorScreen';
import PhotoAppScreen from '../screens/themes/PhotoAppScreen';
import NotesAppScreen from '../screens/themes/NotesAppScreen';
import FileScannerScreen from '../screens/themes/FileScannerScreen';
import WeatherAppScreen from '../screens/themes/WeatherAppScreen';

// Main App Screens
import MainTabsNavigator from './MainTabsNavigator';

const Stack = createStackNavigator();

const AppNavigator: React.FC = () => {
  const {currentTheme, isUnlocked} = useTheme();
  const {isLocked, securitySettings} = useSecurity();
  const [onboardingComplete, setOnboardingComplete] = React.useState(false);
  const [setupComplete, setSetupComplete] = React.useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = React.useState(true);

  React.useEffect(() => {
    checkOnboardingStatus();
    
    // Set up interval to check for onboarding status changes
    // This allows the navigator to react when onboarding is completed
    const interval = setInterval(() => {
      checkOnboardingStatus();
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const complete = await isOnboardingComplete();
      const setup = await isSetupComplete();
      if (complete !== onboardingComplete) {
        setOnboardingComplete(complete);
      }
      if (setup !== setupComplete) {
        setSetupComplete(setup);
      }
      if (checkingOnboarding) {
        setCheckingOnboarding(false);
      }
    } catch (error) {
      console.error('Error checking onboarding:', error);
      if (checkingOnboarding) {
        setCheckingOnboarding(false);
      }
    }
  };

  if (checkingOnboarding) {
    return null; // Or a loading screen
  }

  // Show onboarding if not complete
  if (!onboardingComplete) {
    return (
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen
          name="ThemeSelection"
          component={ThemeSelectionScreen}
        />
        <Stack.Screen name="UnlockGuide" component={UnlockGuideScreen} />
        <Stack.Screen
          name="BackupPreference"
          component={BackupPreferenceScreen}
        />
        <Stack.Screen
          name="TriggerConfiguration"
          component={TriggerConfigurationScreen}
        />
      </Stack.Navigator>
    );
  }

  // Check if password is enabled
  const passwordEnabled = securitySettings?.passwordEnabled === true && securitySettings?.appPassword && securitySettings?.appPassword.length > 0;

  // Show unlock screen if locked AND password is enabled
  if (isLocked && passwordEnabled) {
    return (
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen name="Unlock" component={UnlockScreen} />
      </Stack.Navigator>
    );
  }

  // Show theme disguise if not unlocked
  // If password is enabled, show theme disguise until unlocked
  // If password is NOT enabled, show theme disguise until trigger is matched
  if (!isUnlocked) {
    const ThemeScreen = getThemeScreen(currentTheme.id);
    return (
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen
          name="ThemeDisguise"
          component={ThemeScreen}
          options={{gestureEnabled: false}}
        />
      </Stack.Navigator>
    );
  }

  // Show main app - navigate directly to Chat List (when unlocked)
  return <MainTabsNavigator initialRouteName="Chats" />;
};

const getThemeScreen = (themeId: string) => {
  switch (themeId) {
    case 'gst_calculator':
      return GSTCalculatorScreen;
    case 'emi_calculator':
      return EMICalculatorScreen;
    case 'photo_app':
      return PhotoAppScreen;
    case 'notes_app':
      return NotesAppScreen;
    case 'file_scanner':
      return FileScannerScreen;
    case 'weather_app':
      return WeatherAppScreen;
    default:
      return GSTCalculatorScreen;
  }
};

export default AppNavigator;

