import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from './CircleButton';

type Tab = 'map' | 'mosaic' | 'profile' | null;

type Props = {
  active: Tab;
  onMap: () => void;
  onMosaic: () => void;
  onAdd: () => void;
  onProfile: () => void;
  onMenu: () => void;
};

// Нижняя панель из макета: логотип (карта), мозаика, камера, профиль, меню
export function BottomBar({ active, onMap, onMosaic, onAdd, onProfile, onMenu }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <CircleButton icon="logo" onPress={onMap} active={active === 'map'} accessibilityLabel="Карта" />
      <CircleButton icon="grid" onPress={onMosaic} active={active === 'mosaic'} accessibilityLabel="Мозаика" />
      <CircleButton icon="camera" variant="camera" size={56} onPress={onAdd} accessibilityLabel="Добавить фото" />
      <CircleButton icon="person" onPress={onProfile} active={active === 'profile'} accessibilityLabel="Профиль" />
      <CircleButton icon="menu" onPress={onMenu} accessibilityLabel="Меню" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingTop: 8,
  },
});
