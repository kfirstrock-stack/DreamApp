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
  chevL: { ios: 'chevron.left', android: 'chevron_left' },
  chevR: { ios: 'chevron.right', android: 'chevron_right' },
  close: { ios: 'xmark', android: 'close' },
  menu: { ios: 'line.3.horizontal', android: 'menu' },
  trash: { ios: 'trash', android: 'delete' },
  logo: { ios: 'shoeprints.fill', android: 'footprint' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on' },
  check: { ios: 'checkmark', android: 'check' },
  mail: { ios: 'envelope', android: 'mail' },
  edit: { ios: 'pencil', android: 'edit' },
  plus: { ios: 'plus', android: 'add' },
  heart: { ios: 'heart', android: 'favorite_border' },
  heartFill: { ios: 'heart.fill', android: 'favorite' },
  share: { ios: 'square.and.arrow.up', android: 'ios_share' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  search: { ios: 'magnifyingglass', android: 'search' },
  layers: { ios: 'square.3.layers.3d', android: 'layers' },
  flag: { ios: 'flag', android: 'flag' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  arrow: { ios: 'arrow.right', android: 'arrow_forward' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = '#16130F' }: { name: IconName; size?: number; color?: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
