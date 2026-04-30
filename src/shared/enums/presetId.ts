export const PRESET_IDS = ["lecture-slide", "generic-screen"] as const;

export type PresetId = (typeof PRESET_IDS)[number];
