import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const SplashScreen: React.FC = () => {
  return (
    <LinearGradient
      colors={['#2196F3', '#1976D2']}
      style={styles.container}>
      <ActivityIndicator size="large" color="#fff" />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SplashScreen;

