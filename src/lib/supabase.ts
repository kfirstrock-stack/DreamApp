import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

// Веб-сборка со статическими страницами (SSR, QA 17.11): на сервере нет window, AsyncStorage там падает.
// На сервере — пустое хранилище и без обновления токена; на телефоне всё как было.
export const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';
const noStorage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: isServerRender ? noStorage : AsyncStorage,
    autoRefreshToken: !isServerRender,
    persistSession: !isServerRender,
    detectSessionInUrl: false,
  },
});

// Обновляем токен, только пока приложение на экране
if (!isServerRender)
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
