import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {getFocusedRouteNameFromRoute} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import ChatsScreen from '../screens/main/ChatsScreen';
import VaultScreen from '../screens/main/VaultScreen';
import ContactsScreen from '../screens/main/ContactsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';
import ChatDetailScreen from '../screens/chat/ChatDetailScreen';
import QRScannerScreen from '../screens/contacts/QRScannerScreen';
import QRCodeScreen from '../screens/contacts/QRCodeScreen';
import VaultItemScreen from '../screens/vault/VaultItemScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const ChatsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="ChatsList"
      component={ChatsScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="ChatDetail"
      component={ChatDetailScreen}
      options={{
        headerShown: false,
        tabBarStyle: {display: 'none'},
      }}
    />
  </Stack.Navigator>
);

const VaultStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="VaultList"
      component={VaultScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="VaultItem"
      component={VaultItemScreen}
      options={{headerShown: false}}
    />
  </Stack.Navigator>
);

const ContactsStack = () => (
  <Stack.Navigator>
    <Stack.Screen
      name="ContactsList"
      component={ContactsScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="QRScanner"
      component={QRScannerScreen}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="QRCode"
      component={QRCodeScreen}
      options={{headerShown: false}}
    />
  </Stack.Navigator>
);

interface MainTabsNavigatorProps {
  initialRouteName?: string;
}

const MainTabsNavigator: React.FC<MainTabsNavigatorProps> = ({initialRouteName}) => {
  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={({route}) => {
        // Hide tabs on ChatDetail screen
        const routeName = getFocusedRouteNameFromRoute(route) ?? route.name;
        const isChatDetail = routeName === 'ChatDetail';
        
        return {
          tabBarIcon: ({focused, color, size}) => {
            let iconName: string;

            if (route.name === 'Chats') {
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
            } else if (route.name === 'Vault') {
              iconName = focused ? 'lock-closed' : 'lock-closed-outline';
            } else if (route.name === 'Contacts') {
              iconName = focused ? 'people' : 'people-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            } else {
              iconName = 'help-outline';
            }

            return <Icon name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#2196F3',
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
          tabBarStyle: isChatDetail ? {display: 'none'} : undefined,
        };
      }}>
      <Tab.Screen 
        name="Chats" 
        component={ChatsStack}
        options={({route}) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'ChatsList';
          return {
            tabBarStyle: routeName === 'ChatDetail' ? {display: 'none'} : undefined,
          };
        }}
      />
      <Tab.Screen name="Vault" component={VaultStack} />
      <Tab.Screen name="Contacts" component={ContactsStack} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default MainTabsNavigator;

