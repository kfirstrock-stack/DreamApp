// Просьба к карте «перелети сюда» — например, из экрана фото: «Кто ещё был здесь в это время»
export type FocusRequest = { lat: number; lng: number; at?: Date };

let pending: FocusRequest | null = null;

export const requestMapFocus = (f: FocusRequest) => {
  pending = f;
};

export const consumeMapFocus = (): FocusRequest | null => {
  const f = pending;
  pending = null;
  return f;
};
