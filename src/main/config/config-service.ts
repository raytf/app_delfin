import {
  envSchema,
  type ElectronChildProcessEnv,
  type ElectronEnv,
} from "./validation/env";

type ElectronRuntimeConfig = {
  sidecarWsUrl: string;
  sidecarUrl: string;
  electronRendererUrl?: string;
  isDev: boolean;
};

type ElectronFeatureConfig = {
  voiceEnabled: boolean;
  ttsEnabled: boolean;
};

type ElectronChildProcessConfig = ElectronChildProcessEnv;

/**
 * Derive the sidecar WebSocket endpoint from its HTTP base URL. SIDECAR_URL is
 * the single source of truth for the sidecar location:
 *   http://host:port[/...]  →  ws://host:port/ws
 *   https://host:port[/...] →  wss://host:port/ws
 */
export function deriveSidecarWsUrl(httpUrl: string): string {
  const url = new URL(httpUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${url.host}/ws`;
}

export class ConfigService {
  private readonly envData: ElectronEnv;

  constructor(rawEnv: NodeJS.ProcessEnv = process.env) {
    this.envData = envSchema.parse(rawEnv);
  }

  get runtime(): ElectronRuntimeConfig {
    const electronRendererUrl = this.envData.ELECTRON_RENDERER_URL;
    const sidecarUrl = this.envData.SIDECAR_URL;

    return {
      sidecarUrl,
      sidecarWsUrl: deriveSidecarWsUrl(sidecarUrl),
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

  get env(): ElectronEnv {
    return this.envData;
  }

  get childProcessEnv(): ElectronChildProcessConfig {
    return {
      SIDECAR_PORT: this.envData.SIDECAR_PORT,
      MODEL_FILE: this.envData.MODEL_FILE,
      LITERT_CPP_BIN: this.envData.LITERT_CPP_BIN,
      LITERT_CPP_MODEL: this.envData.LITERT_CPP_MODEL,
      TTS_BACKEND: this.envData.TTS_BACKEND,
      PIPER_BIN: this.envData.PIPER_BIN,
      PIPER_MODEL: this.envData.PIPER_MODEL,
      PIPER_CONFIG: this.envData.PIPER_CONFIG,
      PIPER_SAMPLE_RATE: this.envData.PIPER_SAMPLE_RATE,
      PIPER_VOICE: this.envData.PIPER_VOICE,
    };
  }
}
