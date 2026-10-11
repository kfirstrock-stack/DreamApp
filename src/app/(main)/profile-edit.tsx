// D4 · Редактирование профиля: аватар, имя, уникальный ник, «о себе». Фото — та же шторка, что в A6
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { PhotoSource } from '@/components/profile/PhotoSource';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { useAuth } from '@/lib/auth';
import { NICK_RE, nickHint, pickAvatarImage, uploadAvatar, type NickState } from '@/lib/avatar';
import { D, F } from '@/lib/design';
import { supabase } from '@/lib/supabase';

export default function ProfileEdit() {
  const insets = useSafeAreaInsets();
  const { session, profile, refreshProfile } = useAuth();
  const uid = session?.user.id;
  const [name, setName] = useState(profile?.display_name ?? '');
  const [nick, setNick] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [nickState, setNickState] = useState<NickState>('free');
  const [focus, setFocus] = useState<'name' | 'nick' | 'bio' | null>(null);
  const [avatar, setAvatar] = useState<{ uri: string; base64: string } | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // ник: формат и уникальность (свой текущий — свободен)
  useEffect(() => {
    const n = nick.trim().toLowerCase();
    if (!n) return setNickState('empty');
    if (!NICK_RE.test(n)) return setNickState('invalid');
    if (n === profile?.username) return setNickState('free');
    setNickState('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', n).maybeSingle();
      setNickState(!data || data.id === uid ? 'free' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [nick, uid, profile?.username]);

  const pick = async (src: 'camera' | 'gallery') => {
    setSourceOpen(false);
    const img = await pickAvatarImage(src);
    if (img) setAvatar(img);
  };

  const ready = name.trim().length > 0 && nickState === 'free' && !busy;
  const save = async () => {
    if (!uid || !ready) return;
    setBusy(true);
    try {
      let avatar_url = profile?.avatar_url ?? null;
      if (avatar?.base64) avatar_url = await uploadAvatar(uid, avatar.base64);
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim(), username: nick.trim().toLowerCase(), bio: bio.trim() || null, avatar_url })
        .eq('id', uid);
      if (error) throw error;
      await refreshProfile();
      router.back();
    } catch (e: any) {
      if (String(e?.message).includes('profiles_username_key')) setNickState('taken');
      else Alert.alert('Не получилось сохранить', 'Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const shownNickHint = nick.trim().toLowerCase() !== (profile?.username ?? '') ? nickHint(nickState) : '';
  const photo = avatar?.uri ?? profile?.avatar_url;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: D.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 9 }} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <Text style={styles.title}>Профиль</Text>
        </View>

        <Stagger i={0}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            setSourceOpen(true);
          }}
          style={styles.avatarWrap}
          accessibilityLabel="Изменить фото"
        >
          <View>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>{(name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.cam}>
              <Icon name="camera" size={18} color={D.white} />
            </View>
          </View>
          <Text style={styles.change}>Изменить фото</Text>
        </Pressable>

        </Stagger>
        <Stagger i={1}>
        <View style={styles.fields}>
          <View style={styles.group}>
            <Text style={styles.label}>ИМЯ</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onFocus={() => setFocus('name')}
              onBlur={() => setFocus(null)}
              placeholder="Как к вам обращаться"
              placeholderTextColor={D.ink40}
              selectionColor={D.sun}
              autoCapitalize="words"
              maxLength={60}
              style={[styles.field, focus === 'name' && styles.fieldOn]}
            />
          </View>
          <View style={styles.group}>
            <Text style={styles.label}>НИК</Text>
            <View style={[styles.fieldRow, focus === 'nick' && styles.fieldOn]}>
              <Text style={styles.at}>@</Text>
              <TextInput
                value={nick}
                onChangeText={(t) => setNick(t.toLowerCase().replace(/^@/, ''))}
                onFocus={() => setFocus('nick')}
                onBlur={() => setFocus(null)}
                selectionColor={D.sun}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                style={styles.nickInput}
              />
              {nickState === 'checking' && <ActivityIndicator size="small" color={D.ink40} />}
            </View>
            {shownNickHint ? <Text style={[styles.hint, nickState === 'taken' && { color: D.sun }]}>{shownNickHint}</Text> : null}
          </View>
          <View style={styles.group}>
            <Text style={styles.label}>О СЕБЕ</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              onFocus={() => setFocus('bio')}
              onBlur={() => setFocus(null)}
              placeholder="Пара слов о себе — по желанию"
              placeholderTextColor={D.ink40}
              selectionColor={D.sun}
              multiline
              maxLength={160}
              textAlignVertical="top"
              style={[styles.field, styles.bio, focus === 'bio' && styles.fieldOn]}
            />
          </View>
        </View>

        </Stagger>
        <View style={{ flex: 1, minHeight: 32 }} />
        <Stagger i={2}>
        <Pressable onPress={save} disabled={!ready} style={[styles.button, { marginBottom: Math.max(insets.bottom, 16) + 16 }, !ready && { opacity: 0.45 }]}>
          {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Сохранить</Text>}
        </Pressable>
        </Stagger>
      </ScrollView>
      {sourceOpen && <PhotoSource onPick={pick} onClose={() => setSourceOpen(false)} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  title: { fontFamily: F.serif, fontSize: 30, color: D.ink },
  avatarWrap: { alignSelf: 'center', alignItems: 'center', marginTop: 24 },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 3, borderColor: D.white, backgroundColor: D.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: D.sun },
  avatarLetter: { fontFamily: F.serif, fontSize: 44, color: D.white },
  cam: { position: 'absolute', left: 69.5, top: 70, width: 36, height: 36, borderRadius: 18, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  change: { marginTop: 12, fontFamily: F.sansSemi, fontSize: 14, color: D.sun },
  fields: { paddingHorizontal: 24, marginTop: 26, gap: 18 },
  group: { gap: 8 },
  label: { fontFamily: F.mono, fontSize: 11, letterSpacing: 0.66, color: D.ink60 },
  field: { borderRadius: 16, borderWidth: 1, borderColor: D.line, backgroundColor: D.white, padding: 16, fontFamily: F.sans, fontSize: 16, lineHeight: 22, color: D.ink },
  fieldOn: { borderWidth: 1.5, borderColor: D.sun },
  fieldRow: { height: 56, borderRadius: 16, borderWidth: 1, borderColor: D.line, backgroundColor: D.white, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 2 },
  at: { fontFamily: F.sans, fontSize: 16, color: D.ink },
  nickInput: { flex: 1, height: '100%', fontFamily: F.sans, fontSize: 16, color: D.ink, padding: 0 },
  hint: { fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: D.ink60 },
  bio: { height: 100, paddingTop: 16 },
  button: { marginHorizontal: 24, backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
});
