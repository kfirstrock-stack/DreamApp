import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold } from '@expo-google-fonts/onest';
import { PlayfairDisplay_400Regular, PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/lib/auth';
import { D } from '@/lib/design';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: D.paper }, orientation: 'portrait_up' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="moment" />
          <Stack.Screen name="photo/[id]" options={{ animation: 'fade', contentStyle: { backgroundColor: D.night }, orientation: 'all' }} />
          <Stack.Screen name="profile" />
          <Stack.Screen name="search" options={{ animation: 'fade', animationDuration: 200 }} />
          <Stack.Screen name="add" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="proto" />
          <Stack.Screen
            name="menu"
            options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
