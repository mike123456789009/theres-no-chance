export type PixelAvatarOption = {
  id: string;
  label: string;
  url: string;
  accent: string;
};

export const PIXEL_AVATAR_OPTIONS: PixelAvatarOption[] = [
  {
    id: "scout",
    label: "Scout",
    url: "/assets/avatars/pixel-scout.svg",
    accent: "#70a1b7",
  },
  {
    id: "ranger",
    label: "Ranger",
    url: "/assets/avatars/pixel-ranger.svg",
    accent: "#8a9f5a",
  },
  {
    id: "ember",
    label: "Ember",
    url: "/assets/avatars/pixel-ember.svg",
    accent: "#c4684d",
  },
  {
    id: "cobalt",
    label: "Cobalt",
    url: "/assets/avatars/pixel-cobalt.svg",
    accent: "#4a7ea8",
  },
  {
    id: "moss",
    label: "Moss",
    url: "/assets/avatars/pixel-moss.svg",
    accent: "#5e9a72",
  },
  {
    id: "solar",
    label: "Solar",
    url: "/assets/avatars/pixel-solar.svg",
    accent: "#c99c35",
  },
];

export function isPixelAvatarUrl(value: string): boolean {
  return PIXEL_AVATAR_OPTIONS.some((option) => option.url === value);
}
