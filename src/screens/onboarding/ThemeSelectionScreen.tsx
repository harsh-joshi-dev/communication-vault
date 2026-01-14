import React, {useState} from 'react';
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
import {themes} from '../../themes';
import {useTheme} from '../../contexts/ThemeContext';
import LinearGradient from 'react-native-linear-gradient';

const ThemeSelectionScreen: React.FC = () => {
  const navigation = useNavigation();
  const {setTheme} = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const handleThemeSelect = async (themeId: string) => {
    setSelectedTheme(themeId);
    await setTheme(themeId);
  };

  const handleContinue = () => {
    if (selectedTheme) {
      navigation.navigate('UnlockGuide' as never);
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your App Theme</Text>
          <Text style={styles.subtitle}>
            Select a theme that will disguise your app. This can be changed
            later in settings.
          </Text>
        </View>

        <View style={styles.themesGrid}>
          {themes.map(theme => (
            <TouchableOpacity
              key={theme.id}
              style={[
                styles.themeCard,
                selectedTheme === theme.id && styles.themeCardSelected,
              ]}
              onPress={() => handleThemeSelect(theme.id)}>
              <View
                style={[
                  styles.themeIconContainer,
                  {backgroundColor: theme.color + '20'},
                ]}>
                <Icon name={theme.icon} size={40} color={theme.color} />
              </View>
              <Text style={styles.themeName}>{theme.displayName}</Text>
              <Text style={styles.themeDescription}>{theme.description}</Text>
              {selectedTheme === theme.id && (
                <View style={styles.checkmark}>
                  <Icon name="checkmark-circle" size={24} color={theme.color} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.continueButton,
            !selectedTheme && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedTheme}>
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
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  themesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  themeCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  themeCardSelected: {
    borderColor: '#2196F3',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  themeIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  themeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
    textAlign: 'center',
  },
  themeDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  checkmark: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  continueButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  continueButtonDisabled: {
    backgroundColor: '#ccc',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default ThemeSelectionScreen;

