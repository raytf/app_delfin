import { resolve } from 'node:path';
import { envSchema } from './validation/env';
import {
  SidecarConfigService,
  type InferenceRuntimeConfig,
  type SidecarRuntimeConfig,
  type TtsRuntimeConfig,
} from '../shared/abstractions/sidecar-config-service';

export class ConfigService extends SidecarConfigService {
  private readonly envData;

  constructor(
    private readonly rootDir: string,
    rawEnv: NodeJS.ProcessEnv = process.env,
  ) {
    super();
    this.envData = envSchema.parse(rawEnv);
  }

  get runtime(): SidecarRuntimeConfig {
    return {
      port: this.envData.SIDECAR_PORT ?? 8321,
    };
  }

  get inference(): InferenceRuntimeConfig {
    const defaultBridgeBin =
      process.platform === 'win32'
        ? './bin/delfin_litert_bridge.exe'
        : './bin/delfin_litert_bridge';

    return {
      bridgeBinPath: this.resolvePath(
        this.envData.LITERT_CPP_BIN ?? defaultBridgeBin,
      ),
      modelPath: this.resolvePath(
        this.envData.LITERT_CPP_MODEL ?? './models/gemma-4-E2B-it.litertlm',
      ),
    };
  }

  get tts(): TtsRuntimeConfig {
    const defaultPiperBin =
      process.platform === 'win32'
        ? './bin/piper/venv/Scripts/piper.exe'
        : './bin/piper/venv/bin/piper';

    // Only `piper` enables sidecar TTS; any other value (incl. the Python
    // sidecar's kokoro/mlx/web-speech) falls back to renderer Web Speech.
    const backend = this.envData.TTS_BACKEND === 'piper' ? 'piper' : 'none';
    const piperModel = this.envData.PIPER_MODEL
      ? this.resolvePath(this.envData.PIPER_MODEL)
      : '';

    const piperConfig = this.envData.PIPER_CONFIG
      ? this.resolvePath(this.envData.PIPER_CONFIG)
      : piperModel
        ? `${piperModel}.json`
        : '';

    return {
      backend,
      softMinChars: this.envData.TTS_SOFT_MIN_CHARS ?? 80,
      softMaxChars: this.envData.TTS_SOFT_MAX_CHARS ?? 180,
      piperBinPath: this.resolvePath(this.envData.PIPER_BIN ?? defaultPiperBin),
      piperModelPath: piperModel,
      piperConfigPath: piperConfig,
      piperSampleRate: this.envData.PIPER_SAMPLE_RATE ?? 24000,
    };
  }

  private resolvePath(pathValue: string): string {
    if (pathValue.startsWith('/') || /^[A-Za-z]:\\/.test(pathValue)) {
      return pathValue;
    }
    return resolve(this.rootDir, pathValue);
  }
}
