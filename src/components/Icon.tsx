import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

// Единый набор иконок: SF Symbols на iPhone, Material Symbols на Android
const ICONS = {
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  gallery: { ios: 'photo.on.rectangle', android: 'photo_library' },
  person: { ios: 'person', android: 'person' },
  grid: { ios: 'square.grid.2x2', android: 'grid_view' },
  map: { ios: 'map', android: 'map' },
  clock: { ios: 'clock', android: 'schedule' },
  locate: { ios: 'location', android: 'my_location' },
  info: { ios: 'info.circle', android: 'info' },
  people: { ios: 'person.2', android: 'groups' },
  back: { ios: 'chevron.left', android: 'arrow_back_ios_new' },
  close: { ios: 'xmark', android: 'close' },
  menu: { ios: 'line.3.horizontal', android: 'menu' },
  trash: { ios: 'trash', android: 'delete' },
  logo: { ios: 'shoeprints.fill', android: 'footprint' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on' },
  check: { ios: 'checkmark', android: 'check' },
  mail: { ios: 'envelope', android: 'mail' },
  edit: { ios: 'pencil', android: 'edit' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = '#1B1B1F' }: { name: IconName; size?: number; color?: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
