import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useTheme} from '../../contexts/ThemeContext';
import {useSecurity} from '../../contexts/SecurityContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const GSTCalculatorScreen: React.FC = () => {
  const {currentTheme, checkUnlockTrigger, unlock} = useTheme();
  const {securitySettings, unlockApp} = useSecurity();
  const [amount, setAmount] = useState(10000);
  const [gstRate, setGstRate] = useState(18);
  const [quantity, setQuantity] = useState(1);

  const calculateGST = () => {
    const baseAmount = amount * quantity;
    const gstAmount = (baseAmount * gstRate) / 100;
    const totalAmount = baseAmount + gstAmount;
    return {baseAmount, gstAmount, totalAmount};
  };

  React.useEffect(() => {
    const checkTrigger = async () => {
      const triggerData = {
        amount: amount,
        gst_rate: gstRate,
        quantity: quantity,
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
    
    checkTrigger();
  }, [amount, gstRate, quantity, securitySettings]);

  const {baseAmount, gstAmount, totalAmount} = calculateGST();

  return (
    <LinearGradient
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="calculator" size={60} color={currentTheme.color} />
          <Text style={styles.title}>GST Calculator</Text>
          <Text style={styles.subtitle}>Calculate GST for your transactions</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Amount</Text>
          <Text style={styles.amount}>₹{amount.toLocaleString()}</Text>
          <Slider
            style={styles.slider}
            minimumValue={1000}
            maximumValue={1000000}
            step={1000}
            value={amount}
            onValueChange={setAmount}
            minimumTrackTintColor={currentTheme.color}
            maximumTrackTintColor="#ccc"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>GST Rate (%)</Text>
          <Text style={styles.amount}>{gstRate}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={28}
            step={1}
            value={gstRate}
            onValueChange={setGstRate}
            minimumTrackTintColor={currentTheme.color}
            maximumTrackTintColor="#ccc"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Quantity</Text>
          <Text style={styles.amount}>{quantity}</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={1000}
            step={1}
            value={quantity}
            onValueChange={setQuantity}
            minimumTrackTintColor={currentTheme.color}
            maximumTrackTintColor="#ccc"
          />
        </View>

        <View style={styles.resultCard}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Base Amount</Text>
            <Text style={styles.resultValue}>₹{baseAmount.toLocaleString()}</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>GST Amount</Text>
            <Text style={styles.resultValue}>₹{gstAmount.toLocaleString()}</Text>
          </View>
          <View style={[styles.resultRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>₹{totalAmount.toLocaleString()}</Text>
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
  resultCard: {
    backgroundColor: '#4CAF50',
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
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#fff3',
    paddingTop: 15,
    marginTop: 5,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default GSTCalculatorScreen;

