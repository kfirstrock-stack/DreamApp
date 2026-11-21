import type { Ref } from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputInstance, type TextInputProps, type TextProps } from 'react-native';

// Dynamic Type включён (WCAG 1.4.4, HIG). Цифрам-героям и подписям на карте задавайте maxFontSizeMultiplier={1.3}.
export function Text({ allowFontScaling = true, maxFontSizeMultiplier = 2, ...props }: TextProps) {
  return <RNText allowFontScaling={allowFontScaling} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}

export function TextInput({ allowFontScaling = true, maxFontSizeMultiplier = 2, ...props }: TextInputProps & { ref?: Ref<TextInputInstance> }) {
  return <RNTextInput allowFontScaling={allowFontScaling} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}
