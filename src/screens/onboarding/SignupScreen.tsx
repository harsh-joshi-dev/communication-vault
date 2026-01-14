import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAuth} from '../../contexts/AuthContext';
import LinearGradient from 'react-native-linear-gradient';

const SignupScreen: React.FC = () => {
  const navigation = useNavigation();
  const {signup, checkUsernameAvailability} = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    username: '',
  });
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (formData.username.length >= 3) {
      checkUsername();
    } else {
      setUsernameAvailable(null);
    }
  }, [formData.username]);

  const checkUsername = async () => {
    setCheckingUsername(true);
    try {
      const available = await checkUsernameAvailability(formData.username);
      setUsernameAvailable(available);
    } catch (error) {
      setUsernameAvailable(false);
    } finally {
      setCheckingUsername(false);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return false;
    }
    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return false;
    }
    if (!formData.mobile.trim() || formData.mobile.length < 10) {
      Alert.alert('Error', 'Please enter a valid mobile number');
      return false;
    }
    if (!formData.username.trim() || formData.username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return false;
    }
    if (usernameAvailable === false) {
      Alert.alert('Error', 'Username is not available');
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Navigate to OTP screen with form data
      navigation.navigate('OTP' as never, {formData} as never);
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>
            Enter your details to get started
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Icon name="person" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={formData.name}
              onChangeText={text => setFormData({...formData, name: text})}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Icon name="mail" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              value={formData.email}
              onChangeText={text => setFormData({...formData, email: text})}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Icon name="call" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Mobile Number"
              value={formData.mobile}
              onChangeText={text => setFormData({...formData, mobile: text})}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Icon
              name="at"
              size={20}
              color="#666"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Username"
              value={formData.username}
              onChangeText={text => setFormData({...formData, username: text})}
              autoCapitalize="none"
            />
            {checkingUsername && (
              <ActivityIndicator size="small" color="#2196F3" />
            )}
            {!checkingUsername && formData.username.length >= 3 && (
              <Icon
                name={
                  usernameAvailable
                    ? 'checkmark-circle'
                    : 'close-circle'
                }
                size={20}
                color={usernameAvailable ? '#4CAF50' : '#F44336'}
              />
            )}
          </View>

          {formData.username.length >= 3 && usernameAvailable === false && (
            <Text style={styles.errorText}>Username is not available</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.continueButton,
            loading && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
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
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 15,
  },
  continueButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
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

export default SignupScreen;

