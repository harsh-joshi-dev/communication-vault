import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

const PhotoAppScreen: React.FC = () => {
  const {currentTheme, checkUnlockTrigger, unlock} = useTheme();
  const [tapSequence, setTapSequence] = useState<number[]>([]);
  const [selectedEffect, setSelectedEffect] = useState('none');

  const effects = [
    {id: 'none', name: 'None', icon: 'image'},
    {id: 'vintage', name: 'Vintage', icon: 'color-filter'},
    {id: 'blackwhite', name: 'B&W', icon: 'contrast'},
    {id: 'sepia', name: 'Sepia', icon: 'brush'},
  ];

  const handleTap = (position: number) => {
    const newSequence = [...tapSequence, position];
    setTapSequence(newSequence);

    // Check unlock trigger
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
      colors={['#f5f5f5', '#e0e0e0']}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon name="camera" size={60} color={currentTheme.color} />
          <Text style={styles.title}>Photo Effects</Text>
          <Text style={styles.subtitle}>Apply amazing effects to your photos</Text>
        </View>

        <View style={styles.cameraPreview}>
          <TouchableOpacity
            style={styles.cameraArea}
            onPress={() => handleTap(1)}
            activeOpacity={0.9}>
            <Icon name="camera-outline" size={80} color="#ccc" />
            <Text style={styles.cameraHint}>Tap to capture</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.effectsContainer}>
          <Text style={styles.sectionTitle}>Effects</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {effects.map(effect => (
              <TouchableOpacity
                key={effect.id}
                style={[
                  styles.effectCard,
                  selectedEffect === effect.id && styles.effectCardSelected,
                ]}
                onPress={() => {
                  setSelectedEffect(effect.id);
                  handleTap(2);
                }}>
                <Icon
                  name={effect.icon}
                  size={30}
                  color={selectedEffect === effect.id ? currentTheme.color : '#666'}
                />
                <Text
                  style={[
                    styles.effectName,
                    selectedEffect === effect.id && styles.effectNameSelected,
                  ]}>
                  {effect.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleTap(3)}>
            <Icon name="images" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.captureButton]}
            onPress={() => handleTap(4)}>
            <Icon name="camera" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>Capture</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleTap(5)}>
            <Icon name="share" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
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
  cameraPreview: {
    backgroundColor: '#fff',
    borderRadius: 16,
    height: 300,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cameraArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHint: {
    marginTop: 10,
    color: '#999',
    fontSize: 14,
  },
  effectsContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  effectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  effectCardSelected: {
    borderColor: '#E91E63',
  },
  effectName: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  effectNameSelected: {
    color: '#E91E63',
    fontWeight: '600',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#666',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  captureButton: {
    backgroundColor: '#E91E63',
  },
  actionButtonText: {
    color: '#fff',
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default PhotoAppScreen;

