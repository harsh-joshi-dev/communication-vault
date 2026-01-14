/**
 * Simple UUID v4 generator that works in React Native without native modules
 * This is a fallback when react-native-get-random-values is not available
 */

function generateUUID(): string {
  // Generate random hex values
  const getRandomHex = (): string => {
    // Use Math.random() as fallback
    return Math.floor(Math.random() * 16).toString(16);
  };

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function uuidv4(): string {
  try {
    // Try to use the real uuid library if available
    const {v4} = require('uuid');
    return v4();
  } catch (error) {
    // Fallback to our simple generator
    console.warn('UUID library not available, using fallback generator');
    return generateUUID();
  }
}

