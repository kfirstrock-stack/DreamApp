// Служебный адрес для проверки в разработке: сбрасывает «онбординг пройден» и открывает A1.
// Открыть на телефоне: exp://<адрес Metro>/--/reset-onboarding. В рабочей сборке просто ведёт на карту.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { D } from '@/lib/design';
import { hideSplash, resetOnboarded } from '@/lib/onboarding';

export default function ResetOnboarding() {
  useEffect(() => {
    if (!__DEV__) {
      hideSplash();
      return void router.replace('/');
    }
    resetOnboarded().then(() => {
      if (router.canGoBack()) {
        // приложение уже было открыто: карта под нами — меняем этот экран на A1, карту не показываем
        router.replace('/welcome');
      } else {
        // холодный запуск по ссылке: карта сама увидит сброс и откроет A1 (как при первом запуске)
        router.replace('/');
      }
    });
  }, []);
  return <View style={{ flex: 1, backgroundColor: D.night }} />;
}
