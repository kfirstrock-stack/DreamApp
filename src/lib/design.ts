// Дизайн-токены концепции «Слои времени» (Figma → «DreamApp — новое видение»)
export const D = {
  paper: '#F4EFE6',
  paper2: '#EAE3D6',
  ink: '#16130F',
  ink60: '#6E665B',
  ink40: '#A39A8C',
  line: '#D9D0C1',
  sun: '#FF5A36',
  sunSoft: '#FFE1D6',
  night: '#0F0E0C',
  night2: '#1C1A17',
  night3: '#2A2723',
  white: '#FFFFFF',
  mapBase: '#ECE5D8',
};

export const F = {
  serif: 'PlayfairDisplay_400Regular',
  serifItalic: 'PlayfairDisplay_400Regular_Italic',
  sans: 'Onest_400Regular',
  sansMedium: 'Onest_500Medium',
  sansSemi: 'Onest_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
};

export const softShadow = {
  shadowColor: '#17120D',
  shadowOpacity: 0.16,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

export const lightShadow = {
  shadowColor: '#17120D',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

// Шаг шкалы времени — 15 минут, 96 интервалов в сутках
export const STEP_MIN = 15;
export const BUCKETS = (24 * 60) / STEP_MIN;

// Выезд нижних панелей: плавно, с лёгким «докатом» (затухание ≈ 0.78 — отскок около 2%)
export const SHEET_SPRING = { damping: 22, stiffness: 200, mass: 1 };
