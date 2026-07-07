import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { color } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.gold600,
        tabBarInactiveTintColor: color.gray400,
        tabBarStyle: { backgroundColor: color.white, borderTopColor: color.gray100 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Learn',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🌼</Text>,
          tabBarLabelStyle: { fontWeight: '600' },
        }}
      />
      <Tabs.Screen
        name="tutor"
        options={{
          title: 'Tutor',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🎙️</Text>,
          tabBarLabelStyle: { fontWeight: '600' },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>👤</Text>,
          tabBarLabelStyle: { fontWeight: '600' },
        }}
      />
    </Tabs>
  );
}
