import {Theme} from '../types';

export const themes: Theme[] = [
  {
    id: 'gst_calculator',
    name: 'GST Calculator',
    displayName: 'GST Calculator',
    icon: 'calculator',
    color: '#4CAF50',
    description: 'Calculate GST for your business transactions',
    unlockTrigger: {
      type: 'sliders',
      config: {
        sliders: [
          {id: 'amount', max: 1000000},
          {id: 'gst_rate', max: 28},
          {id: 'quantity', max: 1000},
        ],
        triggerCondition: 'all_max',
      },
    },
  },
  {
    id: 'emi_calculator',
    name: 'EMI Calculator',
    displayName: 'EMI Calculator',
    icon: 'credit-card',
    color: '#2196F3',
    description: 'Calculate your loan EMI and interest',
    unlockTrigger: {
      type: 'sliders',
      config: {
        sliders: [
          {id: 'loan_amount', max: 10000000},
          {id: 'tenure', max: 30},
          {id: 'interest_rate', max: 20},
        ],
        triggerCondition: 'all_max',
      },
    },
  },
  {
    id: 'photo_app',
    name: 'Photo App',
    displayName: 'Photo Effects',
    icon: 'camera',
    color: '#E91E63',
    description: 'Take photos with amazing effects and filters',
    unlockTrigger: {
      type: 'tap_sequence',
      config: {
        sequence: [1, 2, 3, 4, 5], // Tap positions
        timeout: 3000,
      },
    },
  },
  {
    id: 'notes_app',
    name: 'Notes App',
    displayName: 'Notes & To-Do',
    icon: 'document-text',
    color: '#FF9800',
    description: 'Organize your notes and tasks',
    unlockTrigger: {
      type: 'long_press',
      config: {
        duration: 5000, // 5 seconds
        element: 'header',
      },
    },
  },
  {
    id: 'file_scanner',
    name: 'File Scanner',
    displayName: 'PDF Scanner',
    icon: 'document',
    color: '#9C27B0',
    description: 'Scan documents and create PDFs',
    unlockTrigger: {
      type: 'shake',
      config: {
        intensity: 0.8,
        count: 3,
      },
    },
  },
  {
    id: 'weather_app',
    name: 'Weather App',
    displayName: 'Weather Forecast',
    icon: 'cloud',
    color: '#00BCD4',
    description: 'Check weather forecasts and conditions',
    unlockTrigger: {
      type: 'tap_sequence',
      config: {
        sequence: [3, 1, 4, 1, 5], // Secret sequence
        timeout: 5000,
      },
    },
  },
];

export const getThemeById = (id: string): Theme | undefined => {
  return themes.find(theme => theme.id === id);
};

export const getDefaultTheme = (): Theme => {
  return themes[0];
};

