import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadLastUser, saveLastUser, type LastShot } from './lastUser';
import { supabase } from './supabase';
import type { Profile } from './types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  ready: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  ready: false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) return setProfile(null);
    const { data } = await supabase
      .from('profiles')
      .select('id,username,display_name,avatar_url,bio,city')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user.id).finally(() => setReady(true));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // запоминаем вошедшего (с готовым профилем) для экрана «С возвращением»
  // 13.10: заодно — три последних снимка для полароидов на «С возвращением»
  useEffect(() => {
    const email = session?.user.email;
    const uid = session?.user.id;
    if (!email || !uid || !profile?.username) return;
    const base = { email, name: profile.display_name || profile.username, avatar: profile.avatar_url ?? null };
    supabase
      .from('photos')
      .select('storage_path,taken_at,place_name')
      .eq('user_id', uid)
      .order('taken_at', { ascending: false })
      .limit(3)
      .then(async ({ data, error }) => {
        let shots: LastShot[] | undefined;
        if (!error && data) shots = data.map((r) => ({ path: r.storage_path, taken_at: r.taken_at, place: r.place_name }));
        else {
          // нет связи — оставляем снимки, запомненные в прошлый раз (если это тот же человек)
          const old = await loadLastUser();
          if (old?.email === email) shots = old.shots;
        }
        saveLastUser({ ...base, shots });
      });
  }, [session?.user.email, session?.user.id, profile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session?.user.id]);

  return (
    <AuthContext.Provider value={{ session, profile, ready, refreshProfile }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
