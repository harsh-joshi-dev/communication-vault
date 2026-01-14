import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useSecurity} from '../../contexts/SecurityContext';
import {useTheme} from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const UnlockScreen: React.FC = () => {
  const {unlockApp, checkFakePassword} = useSecurity();
  const {currentTheme} = useTheme();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleUnlock = async () => {
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter password');
      return;
    }

    setLoading(true);
    try {
      const unlocked = await unlockApp(password);
      if (unlocked) {
        if (checkFakePassword(password)) {
          // Show fake interface - handled by navigation
          Alert.alert('Access Granted', 'Showing dummy data');
        } else {
          // Real unlock - handled by navigation
        }
        setPassword('');
      } else {
        Alert.alert('Error', 'Incorrect password');
        setPassword('');
      }
    } catch (error) {
      Alert.alert('Error', 'Unlock failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[currentTheme.color, currentTheme.color + 'DD']}
      style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Icon name={currentTheme.icon} size={80} color="#fff" />
          <Text style={styles.title}>{currentTheme.displayName}</Text>
          <Text style={styles.subtitle}>Enter password to unlock</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Icon name="key" size={20} color="#fff" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#fff8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={handleUnlock}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Icon
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.unlockButton, loading && styles.unlockButtonDisabled]}
          onPress={handleUnlock}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color={currentTheme.color} />
          ) : (
            <Text style={[styles.unlockButtonText, {color: currentTheme.color}]}>
              Unlock
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    opacity: 0.9,
  },
  form: {
    marginBottom: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    height: 56,
    borderWidth: 1,
    borderColor: '#fff5',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  unlockButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  unlockButtonDisabled: {
    backgroundColor: '#ccc',
  },
  unlockButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});

export default UnlockScreen;

