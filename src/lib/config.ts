// Публичные настройки Supabase. Этот ключ можно хранить в приложении:
// доступ к данным ограничен правилами безопасности (RLS) в самой базе.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://xxuzjmjkgfjxmdqehvap.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_-P83XQ3cpD__9W51C4eQvA_L01uwA08';
