// Адрес и ключ Supabase приходят из окружения (EXPO_PUBLIC_*).
// В коде нет запасного ключа: тестовая сборка не должна молча открывать боевую базу.
// Ключ — только anon / publishable. service_role в репозиторий не кладём.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Задайте EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_KEY. Для тестовой базы скопируйте .env.test.example в .env.local.',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;
