import React, {createContext, useContext, useState, useEffect} from 'react';
import {Theme} from '../types';
import {themes, getThemeById, getDefaultTheme} from '../themes';
import {getStoredTheme, saveTheme, getTriggerConfig} from '../services/StorageService';

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => Promise<void>;
  isUnlocked: boolean;
  unlock: () => void;
  lock: () => void;
  checkUnlockTrigger: (triggerData: any) => Promise<boolean>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  initialTheme?: string | null;
}> = ({children, initialTheme}) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(getDefaultTheme());
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const themeId = initialTheme || (await getStoredTheme());
      if (themeId) {
        const theme = getThemeById(themeId);
        if (theme) {
          setCurrentTheme(theme);
        }
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const setTheme = async (themeId: string) => {
    const theme = getThemeById(themeId);
    if (theme) {
      setCurrentTheme(theme);
      await saveTheme(themeId);
    }
  };

  const unlock = () => {
    setIsUnlocked(true);
  };

  const lock = () => {
    setIsUnlocked(false);
  };

  const checkUnlockTrigger = async (triggerData: any): Promise<boolean> => {
    // First check if custom trigger config exists
    const customConfig = await getTriggerConfig(currentTheme.id);
    
    if (customConfig) {
      // Use custom trigger values
      const {type} = currentTheme.unlockTrigger;
      
      if (type === 'sliders') {
        // For GST Calculator
        if (currentTheme.id === 'gst_calculator') {
          // Get values - check both customValues and root level
          const targetAmount = customConfig.customValues?.amount ?? customConfig.amount ?? 0;
          const targetGstRate = customConfig.customValues?.gst_rate ?? customConfig.gst_rate ?? 0;
          const targetQuantity = customConfig.customValues?.quantity ?? customConfig.quantity ?? 0;
          
          // Allow some tolerance for slider values (within 1% or 1000 for amount)
          const amountMatch = Math.abs(triggerData.amount - targetAmount) <= Math.max(1000, targetAmount * 0.01);
          const gstRateMatch = Math.abs(triggerData.gst_rate - targetGstRate) < 1;
          const quantityMatch = Math.abs(triggerData.quantity - targetQuantity) < 1;
          
          console.log('[ThemeContext] GST Trigger Check:', {
            triggerData,
            customConfig,
            targetAmount,
            targetGstRate,
            targetQuantity,
            amountMatch,
            gstRateMatch,
            quantityMatch,
            result: amountMatch && gstRateMatch && quantityMatch,
          });
          
          return amountMatch && gstRateMatch && quantityMatch;
        }
        // For EMI Calculator
        if (currentTheme.id === 'emi_calculator') {
          // Get values - check both customValues and root level
          const targetLoanAmount = customConfig.customValues?.loan_amount ?? customConfig.loan_amount ?? 0;
          const targetTenure = customConfig.customValues?.tenure ?? customConfig.tenure ?? 0;
          const targetInterestRate = customConfig.customValues?.interest_rate ?? customConfig.interest_rate ?? 0;
          
          // Allow tolerance: 1% for loan_amount, 1 for tenure, 0.5% for interest_rate
          const loanAmountMatch = Math.abs(triggerData.loan_amount - targetLoanAmount) <= Math.max(10000, targetLoanAmount * 0.01);
          const tenureMatch = Math.abs(triggerData.tenure - targetTenure) < 1;
          const interestRateMatch = Math.abs(triggerData.interest_rate - targetInterestRate) < 0.5;
          
          console.log('[ThemeContext] EMI Trigger Check:', {
            triggerData,
            customConfig,
            targetLoanAmount,
            targetTenure,
            targetInterestRate,
            loanAmountMatch,
            tenureMatch,
            interestRateMatch,
            result: loanAmountMatch && tenureMatch && interestRateMatch,
          });
          
          return loanAmountMatch && tenureMatch && interestRateMatch;
        }
      }
    }
    
    // Fallback to default trigger logic
    const {type, config} = currentTheme.unlockTrigger;

    switch (type) {
      case 'sliders':
        if (config.triggerCondition === 'all_max') {
          return config.sliders.every((slider: any) => {
            const value = triggerData[slider.id];
            return value !== undefined && value >= slider.max;
          });
        }
        break;

      case 'tap_sequence':
        const sequence = triggerData.sequence || [];
        if (sequence.length !== config.sequence.length) return false;
        return sequence.every(
          (tap: number, index: number) => tap === config.sequence[index],
        );

      case 'long_press':
        return (
          triggerData.duration >= config.duration &&
          triggerData.element === config.element
        );

      case 'shake':
        return (
          triggerData.count >= config.count &&
          triggerData.intensity >= config.intensity
        );

      default:
        return false;
    }

    return false;
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        setTheme,
        isUnlocked,
        unlock,
        lock,
        checkUnlockTrigger,
      }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

