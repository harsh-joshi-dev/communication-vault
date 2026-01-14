/**
 * @format
 */

// Import polyfill for crypto.getRandomValues (required for uuid)
import 'react-native-get-random-values';

// Polyfill for TextEncoder/TextDecoder (required for QR code libraries)
if (typeof global.TextEncoder === 'undefined') {
  const {TextEncoder, TextDecoder} = require('text-encoding');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

