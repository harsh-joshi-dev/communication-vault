import React, {useEffect, useState} from 'react';
import {StatusBar, Platform} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ThemeProvider} from './contexts/ThemeContext';
import {AuthProvider} from './contexts/AuthContext';
import {SecurityProvider} from './contexts/SecurityContext';
import AppNavigator from './navigation/AppNavigator';
import SplashScreen from './screens/SplashScreen';
import {preventScreenshot} from './services/SecurityService';
import {checkFirstLaunch, getStoredTheme} from './services/StorageService';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [initialTheme, setInitialTheme] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Prevent screenshots
      if (Platform.OS === 'android') {
        await preventScreenshot(true);
      }

      // Check if first launch
      const isFirstLaunch = await checkFirstLaunch();
      
      if (!isFirstLaunch) {
        const theme = await getStoredTheme();
        setInitialTheme(theme);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('App initialization error:', error);
      setIsLoading(false);
    }
  };

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <ThemeProvider initialTheme={initialTheme}>
          <AuthProvider>
            <SecurityProvider>
              {isLoading ? (
                <SplashScreen />
              ) : (
                <NavigationContainer>
                  <StatusBar
                    barStyle="dark-content"
                    backgroundColor="transparent"
                    translucent
                  />
                  <AppNavigator />
                </NavigationContainer>
              )}
            </SecurityProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;

