import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useTheme} from '../../contexts/ThemeContext';
import {useSecurity} from '../../contexts/SecurityContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const EMICalculatorScreen: React.FC = () => {
  const {currentTheme, checkUnlockTrigger, unlock} = useTheme();
  const {securitySettings, unlockApp} = useSecurity();
  const [loanAmount, setLoanAmount] = useState(500000);
  const [tenure, setTenure] = useState(5);
  const [interestRate, setInterestRate] = useState(8);

  const calculateEMI = () => {
    const principal = loanAmount;
    const rate = interestRate / 12 / 100;
    const time = tenure * 12;
    const emi =
      (principal * rate * Math.pow(1 + rate, time)) /
      (Math.pow(1 + rate, time) - 1);
    return Math.round(emi);
  };

  React.useEffect(() => {
    const checkUnlock = async () => {
      const triggerData = {
        loan_amount: loanAmount,
        tenure: tenure,
        interest_rate: interestRate,
      };

      const isTriggered = await checkUnlockTrigger(triggerData);
      if (isTriggered) {
        const passwordEnabled = securitySettings?.passwordEnabled === true;
        
        if (passwordEnabled) {
          // Password is enabled - show password prompt
          Alert.prompt(
            'Enter Password',
            'Enter your app password to continue',
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Unlock',
                onPress: async (password) => {
                  if (password) {
                    const unlocked = await unlockApp(password);
                    if (unlocked) {
                      unlock(); // Unlock theme context
                    } else {
                      Alert.alert('Error', 'Incorrect password');
                    }
                  }
                },
              },
            ],
            'secure-text',
          );
        } else {
          // No password required - unlock directly
          unlock();
        }
      }
    };
    
    checkUnlock();
  }, [loanAmount, tenure, interestRate, securitySettings]);

  const emi = calculateEMI();
  const totalAmount = emi * tenure * 12;
  const totalInterest = totalAmount - loanAmount;

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="calculator" size={60} color={currentTheme.color} />
          <Text style={styles.title}>EMI Calculator</Text>
          <Text style={styles.subtitle}>
            Calculate your loan EMI and interest
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Loan Amount</Text>
          <Text style={styles.amount}>₹{loanAmount.toLocaleString()}</Text>
          <Slider
            style={styles.slider}
            minimumValue={100000}
            maximumValue={10000000}
            step={50000}
            value={loanAmount}
            onValueChange={setLoanAmount}
            minimumTrackTintColor={currentTheme.color}
            maximumTrackTintColor="#ccc"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>₹1L</Text>
            <Text style={styles.sliderLabel}>₹1Cr</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Tenure (Years)</Text>
          <Text style={styles.amount}>{tenure} years</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={30}
            step={1}
            value={tenure}
            onValueChange={setTenure}
            minimumTrackTintColor={currentTheme.color}
            maximumTrackTintColor="#ccc"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>1 year</Text>
            <Text style={styles.sliderLabel}>30 years</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Interest Rate (%)</Text>
          <Text style={styles.amount}>{interestRate}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={20}
            step={0.1}
            value={interestRate}
            onValueChange={setInterestRate}
            minimumTrackTintColor={currentTheme.color}
            maximumTrackTintColor="#ccc"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>5%</Text>
            <Text style={styles.sliderLabel}>20%</Text>
          </View>
        </View>

        <View style={styles.resultCard}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Monthly EMI</Text>
            <Text style={styles.resultValue}>₹{emi.toLocaleString()}</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Total Amount</Text>
            <Text style={styles.resultValue}>
              ₹{totalAmount.toLocaleString()}
            </Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Total Interest</Text>
            <Text style={styles.resultValue}>
              ₹{totalInterest.toLocaleString()}
            </Text>
          </View>
        </View>
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
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#999',
  },
  resultCard: {
    backgroundColor: '#2196F3',
    borderRadius: 16,
    padding: 20,
    marginTop: 10,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  resultLabel: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  resultValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default EMICalculatorScreen;

