import type { PresetId } from "../enums/presetId";

export interface Preset {
  id: PresetId;
  label: string;
  starterQuestions: string[];
}
