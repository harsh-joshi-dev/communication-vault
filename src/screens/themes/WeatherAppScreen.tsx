import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const WeatherAppScreen: React.FC = () => {
  const {currentTheme, checkUnlockTrigger, unlock} = useTheme();
  const [tapSequence, setTapSequence] = useState<number[]>([]);
  const [temperature, setTemperature] = useState(25);

  const handleTap = (position: number) => {
    const newSequence = [...tapSequence, position];
    setTapSequence(newSequence);

    // Check unlock trigger (sequence: 3, 1, 4, 1, 5)
    const triggerData = {sequence: newSequence};
    if (checkUnlockTrigger(triggerData)) {
      Alert.prompt(
        'Enter Password',
        'Enter your app password to continue',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Unlock',
            onPress: (password) => {
              if (password) unlock();
              setTapSequence([]);
            },
          },
        ],
        'secure-text',
      );
    }

    // Reset sequence after timeout
    setTimeout(() => {
      setTapSequence([]);
    }, 5000);
  };

  return (
    <LinearGradient
      colors={['#00BCD4', '#0097A7']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="cloud" size={80} color="#fff" />
          <Text style={styles.temperature}>{temperature}°C</Text>
          <Text style={styles.location}>New Delhi, India</Text>
        </View>

        <View style={styles.weatherCard}>
          <View style={styles.weatherRow}>
            <Icon name="sunny" size={40} color="#FFC107" />
            <View style={styles.weatherInfo}>
              <Text style={styles.weatherLabel}>Sunny</Text>
              <Text style={styles.weatherValue}>Clear sky</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsContainer}>
          <TouchableOpacity
            style={styles.detailCard}
            onPress={() => handleTap(3)}>
            <Icon name="water" size={30} color="#00BCD4" />
            <Text style={styles.detailLabel}>Humidity</Text>
            <Text style={styles.detailValue}>65%</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailCard}
            onPress={() => handleTap(1)}>
            <Icon name="speedometer" size={30} color="#00BCD4" />
            <Text style={styles.detailLabel}>Wind</Text>
            <Text style={styles.detailValue}>12 km/h</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailCard}
            onPress={() => handleTap(4)}>
            <Icon name="eye" size={30} color="#00BCD4" />
            <Text style={styles.detailLabel}>Visibility</Text>
            <Text style={styles.detailValue}>10 km</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailCard}
            onPress={() => handleTap(1)}>
            <Icon name="thermometer" size={30} color="#00BCD4" />
            <Text style={styles.detailLabel}>Feels Like</Text>
            <Text style={styles.detailValue}>27°C</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailCard}
            onPress={() => handleTap(5)}>
            <Icon name="rainy" size={30} color="#00BCD4" />
            <Text style={styles.detailLabel}>Precipitation</Text>
            <Text style={styles.detailValue}>0%</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.forecastContainer}>
          <Text style={styles.sectionTitle}>7-Day Forecast</Text>
          {[1, 2, 3, 4, 5, 6, 7].map(day => (
            <View key={day} style={styles.forecastItem}>
              <Text style={styles.forecastDay}>Day {day}</Text>
              <Icon name="sunny" size={24} color="#FFC107" />
              <Text style={styles.forecastTemp}>28°C / 22°C</Text>
            </View>
          ))}
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
  temperature: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
  },
  location: {
    fontSize: 20,
    color: '#fff',
    opacity: 0.9,
    marginTop: 10,
  },
  weatherCard: {
    backgroundColor: '#fff3',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherInfo: {
    marginLeft: 15,
  },
  weatherLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  weatherValue: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
  },
  detailsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  detailCard: {
    width: '48%',
    backgroundColor: '#fff3',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
    marginTop: 8,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 5,
  },
  forecastContainer: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 15,
  },
  forecastItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff3',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  forecastDay: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  forecastTemp: {
    fontSize: 16,
    color: '#fff',
  },
});

export default WeatherAppScreen;

