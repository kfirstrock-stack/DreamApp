import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { FIGMA_ICONS, ICON_ALIAS } from './figmaIcons';

// Иконки из макета (Figma, слои icon/*) — линейные, 24×24. Для тех, что в макете не нарисованы, — SF Symbols / Material.
const ICONS = {
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  gallery: { ios: 'photo.on.rectangle', android: 'photo_library' },
  person: { ios: 'person', android: 'person' },
  grid: { ios: 'square.grid.2x2', android: 'grid_view' },
  map: { ios: 'map', android: 'map' },
  clock: { ios: 'clock', android: 'schedule' },
  locate: { ios: 'scope', android: 'my_location' },
  info: { ios: 'info.circle', android: 'info' },
  people: { ios: 'person.2', android: 'groups' },
  back: { ios: 'chevron.left', android: 'arrow_back_ios_new' },
  chevL: { ios: 'chevron.left', android: 'chevron_left' },
  chevR: { ios: 'chevron.right', android: 'chevron_right' },
  chevD: { ios: 'chevron.down', android: 'expand_more' },
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
  sparkle: { ios: 'sparkle', android: 'auto_awesome' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color = '#16130F' }: { name: IconName; size?: number; color?: ColorValue }) {
  const parts = FIGMA_ICONS[ICON_ALIAS[name] ?? ''];
  if (parts) {
    const filled = name === 'heartFill' || name === 'more';
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {parts.map(([x, y, sw, d], i) => (
          <G key={i} transform={`translate(${x} ${y})`}>
            <Path d={d} fill={filled ? (color as string) : 'none'} stroke={color as string} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
      </Svg>
    );
  }
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
