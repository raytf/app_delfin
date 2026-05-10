import { envSchema, type ElectronEnv } from "./validation/env";

type ElectronRuntimeConfig = {
  sidecarWsUrl: string;
  electronRendererUrl?: string;
  isDev: boolean;
};

type ElectronFeatureConfig = {
  voiceEnabled: boolean;
  ttsEnabled: boolean;
};

type ElectronBackendConfig = {
  inferenceBackend?: "litert" | "litert-cpp";
  rawEnv: NodeJS.ProcessEnv;
};

export class ConfigService {
  private readonly envData: ElectronEnv;
  private readonly rawEnv: NodeJS.ProcessEnv;

  constructor(rawEnv: NodeJS.ProcessEnv = process.env) {
    this.rawEnv = { ...rawEnv };
    this.envData = envSchema.parse(rawEnv);
  }

  get runtime(): ElectronRuntimeConfig {
    const electronRendererUrl = this.envData.ELECTRON_RENDERER_URL;
    return {
      sidecarWsUrl: this.envData.SIDECAR_WS_URL ?? "ws://localhost:8321/ws",
      electronRendererUrl,
      isDev: Boolean(electronRendererUrl),
    };
  }

  get features(): ElectronFeatureConfig {
    return {
      voiceEnabled: this.envData.VOICE_ENABLED !== "false",
      ttsEnabled: this.envData.TTS_ENABLED === "true",
    };
  }

  get backend(): ElectronBackendConfig {
    return {
      inferenceBackend: this.envData.INFERENCE_BACKEND,
      rawEnv: { ...this.rawEnv },
    };
  }

  get env(): ElectronEnv {
    return this.envData;
  }
}
