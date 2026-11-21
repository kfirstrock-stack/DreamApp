// Тост с действием (G1: «Совпадение скрыто · Вернуть» на 5 с).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { D, F } from '@/lib/design';

export type Snack = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

type Api = { show: (s: Snack) => void; hide: () => void };
const SnackContext = createContext<Api>({ show: () => {}, hide: () => {} });

export function useSnack() {
  return useContext(SnackContext);
}

export function SnackProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setSnack(null);
  }, []);
  const show = useCallback(
    (s: Snack) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setSnack(s);
      hideTimer.current = setTimeout(hide, s.duration ?? 5000);
    },
    [hide],
  );
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);
  const insets = useSafeAreaInsets();
  return (
    <SnackContext.Provider value={{ show, hide }}>
      {children}
      {snack ? (
        <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.bar} accessibilityLiveRegion="polite">
            <Text style={styles.msg} numberOfLines={2}>{snack.message}</Text>
            {snack.actionLabel && snack.onAction ? (
              <Pressable
                onPress={() => {
                  const fn = snack.onAction;
                  hide();
                  fn?.();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={snack.actionLabel}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.actionText}>{snack.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </SnackContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 10000, elevation: 100 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: D.night,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 12,
    minHeight: 48,
  },
  msg: { flex: 1, fontFamily: F.sans, fontSize: 15, color: D.paper },
  action: { paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  actionText: { fontFamily: F.sansSemi, fontSize: 15, color: D.white },
});
