// C2c · Загрузка пачки на месте плашки B1 (17.11): «Публикуем N снимков · k из N», ошибка одного снимка — «Повторить» только для него;
// по готовности — тост «Опубликовано N снимков» (скрывается сам) или «Опубликовано k из N» с «Повторить» (висит, пока не смахнут)
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/ui/Text';
import { dismissUpload, hhmm, plural, retryUpload, useUploadJob } from '@/lib/batch';
import { D, F } from '@/lib/design';

const AUTO_HIDE = 4000;

type Spot = { lat: number; lng: number; at: Date };
/** onAutoShow — перелёт к первому загруженному без нажатия; карта сама решает, уместен ли он (since — начало загрузки) */
export function UploadBanner({ top, onShow, onAutoShow, onFinished }: { top: number; onShow: (f: Spot) => void; onAutoShow: (f: Spot, since: number) => void; onFinished: () => void }) {
  const job = useUploadJob();
  const finished = !!job && !job.running;
  const allOk = finished && job.failed.length === 0;

  // готово — карта подтягивает новые снимки
  const was = useRef(false);
  useEffect(() => {
    if (finished && !was.current) onFinished();
    was.current = finished;
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  // первый снимок пачки записан — карта сама перелетает к нему, как по «Смотреть» (QA 17.11);
  // остальные встают на карту по мере загрузки, без ожидания конца пачки
  const flown = useRef<number | null>(null);
  useEffect(() => {
    if (!job?.firstDone || flown.current === job.id) return;
    flown.current = job.id;
    onAutoShow(job.firstDone, job.startedAt);
  }, [job?.id, job?.firstDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!allOk) return;
    const t = setTimeout(dismissUpload, AUTO_HIDE);
    return () => clearTimeout(t);
  }, [allOk, job?.id]);

  const swipe = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationY < -24) scheduleOnRN(dismissUpload);
    });

  if (!job) return null;
  const { total, done, failed } = job;

  if (!finished) {
    const f = failed[failed.length - 1];
    return (
      <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.wrap, { top }]} accessibilityLiveRegion="polite">
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              Публикуем {total} {plural(total, 'снимок', 'снимка', 'снимков')}
            </Text>
            <Text style={styles.count}>
              {done} из {total}
            </Text>
          </View>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
            <View style={[styles.fill, { width: `${(done / total) * 100}%` }]} />
          </View>
          <Text style={styles.sub}>
            Загружено {done} из {total} · можно пользоваться приложением
          </Text>
          {f && (
            <>
              <View style={styles.divider} />
              <View style={styles.failRow}>
                <View style={styles.failThumb}>
                  <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <View style={styles.failDim} />
                  <View style={styles.bang}>
                    <Text style={styles.bangText}>!</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.failTitle} numberOfLines={1}>
                    {[f.place, f.takenAt && hhmm(f.takenAt)].filter(Boolean).join(' · ') || 'Снимок'}
                  </Text>
                  <Text style={styles.failSub}>{failed.length > 1 ? `Не загрузились: ${failed.length}` : 'Не загрузился'}</Text>
                </View>
                <Pressable onPress={() => retryUpload(f.key)} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Повторить загрузку снимка">
                  <Text style={styles.retryText}>Повторить</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Animated.View>
    );
  }

  // тосты 281:363 / 281:706
  const ok = total - failed.length;
  return (
    <GestureDetector gesture={swipe}>
      <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[styles.wrap, { top }]} accessibilityLiveRegion="polite">
        <View style={[styles.card, styles.toast]}>
          <View style={[styles.toastIc, !allOk && { backgroundColor: D.errorOnDark }]}>
            {allOk ? <Icon name="check" size={16} color={D.ink} /> : <Text style={styles.bangText}>!</Text>}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title} numberOfLines={1}>
              {allOk ? `Опубликовано ${total} ${plural(total, 'снимок', 'снимка', 'снимков')}` : `Опубликовано ${ok} из ${total}`}
            </Text>
            <Text style={allOk ? styles.sub : styles.failSub} numberOfLines={1}>
              {allOk ? 'Все встали на карту' : `${failed.length} ${plural(failed.length, 'снимок не загрузился', 'снимка не загрузились', 'снимков не загрузились')}`}
            </Text>
          </View>
          {allOk ? (
            (job.firstDone ?? job.first) && (
              <Pressable
                onPress={() => {
                  onShow((job.firstDone ?? job.first)!);
                  dismissUpload();
                }}
                style={styles.see}
                accessibilityRole="button"
                accessibilityLabel="Смотреть снимки на карте"
              >
                <Text style={styles.seeText}>Смотреть</Text>
              </Pressable>
            )
          ) : (
            <Pressable onPress={() => retryUpload()} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Повторить загрузку незагруженных снимков">
              <Text style={styles.retryText}>Повторить</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 24, right: 24, zIndex: 1100, elevation: 32 },
  card: {
    backgroundColor: D.ink,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#17120D',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: F.sansSemi, fontSize: 14, lineHeight: 18, color: D.paper },
  count: { fontFamily: F.mono, fontSize: 12, lineHeight: 16, color: D.paper },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: D.sun },
  sub: { fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: 'rgba(244,239,230,0.6)' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  failThumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: D.night3 },
  failDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,14,12,0.4)' },
  bang: { width: 18, height: 18, borderRadius: 9, backgroundColor: D.errorOnDark, alignItems: 'center', justifyContent: 'center' },
  bangText: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.ink, textAlign: 'center' },
  failTitle: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 17, color: D.paper },
  failSub: { fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: D.errorOnDark },
  retry: { height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: D.sunBtn, justifyContent: 'center' },
  retryText: { fontFamily: F.sansSemi, fontSize: 14, color: D.white },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toastIc: { width: 28, height: 28, borderRadius: 14, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  see: { height: 44, justifyContent: 'center', paddingLeft: 8 },
  seeText: { fontFamily: F.sansSemi, fontSize: 14, color: D.sun },
});
