import { randomUUID } from "crypto";
import { PRESETS } from "../constants/preset-prompts";

/**
 * Generates a random UUID.
 * @returns UUID
 */
export const getUUID = () => randomUUID();

export const resolvePresetPrompt = (presetId: string): string =>
  PRESETS[presetId] ?? PRESETS["generic-screen"];
