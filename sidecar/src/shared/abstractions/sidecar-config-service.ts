export type SidecarRuntimeConfig = {
  port: number;
};

export type InferenceRuntimeConfig = {
  bridgeBinPath: string;
  modelPath: string;
};

export type TtsRuntimeConfig = {
  backend: 'none' | 'piper';
  softMinChars: number;
  softMaxChars: number;
  piperBinPath: string;
  piperModelPath: string;
  piperConfigPath: string;
  piperSampleRate: number;
};

export abstract class SidecarConfigService {
  abstract get runtime(): SidecarRuntimeConfig;
  abstract get inference(): InferenceRuntimeConfig;
  abstract get tts(): TtsRuntimeConfig;
}
