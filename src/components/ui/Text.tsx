import type { Ref } from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputInstance, type TextInputProps, type TextProps } from 'react-native';

// Макет нарисован в одном размере текста: системная настройка «Размер текста» на iPhone
// не должна менять вёрстку (иначе цифры в окне времени обрезаются, подписи не помещаются).
export function Text(props: TextProps) {
  return <RNText allowFontScaling={false} {...props} />;
}

export function TextInput(props: TextInputProps & { ref?: Ref<TextInputInstance> }) {
  return <RNTextInput allowFontScaling={false} {...props} />;
}
