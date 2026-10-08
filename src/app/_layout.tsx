import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="photo/[id]" options={{ contentStyle: { backgroundColor: colors.dark } }} />
        <Stack.Screen name="stack" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="add" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen
          name="menu"
          options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
      </Stack>
    </AuthProvider>
    </GestureHandlerRootView>
  );
}
