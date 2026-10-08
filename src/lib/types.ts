export type Photo = {
  id: string;
  user_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  taken_at: string;
  lat: number;
  lng: number;
  place_name: string | null;
  caption: string | null;
  author_username: string | null;
  author_name: string | null;
  author_avatar: string | null;
};

export type Bounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export type TimeWindow = { from: Date; to: Date };

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};
