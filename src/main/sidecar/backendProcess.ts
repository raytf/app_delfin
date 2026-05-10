import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ElectronChildProcessEnv } from "../config/validation/env";

let backendProcess: ChildProcess | null = null;

function resolvePackagedSidecarEntry(): string {
  return join(process.resourcesPath, "app.asar", "dist", "sidecar", "index.js");
}

function createChildEnv(baseChildConfig: ElectronChildProcessEnv): {
  childEnv: NodeJS.ProcessEnv;
  piperReady: boolean;
  piperBinPath: string;
  piperModelPath: string;
  piperConfigPath: string;
} {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  const modelFile = baseChildConfig.MODEL_FILE ?? "gemma-4-E2B-it.litertlm";
  const bridgeBinName =
    process.platform === "win32" ? "delfin_litert_bridge.exe" : "delfin_litert_bridge";
  const piperBinName = process.platform === "win32" ? "piper.exe" : "piper";
  const piperVoice = baseChildConfig.PIPER_VOICE ?? "en_US-hfc_female-medium";

  childEnv.SIDECAR_PORT = baseChildConfig.SIDECAR_PORT ?? "8321";
  childEnv.LITERT_CPP_BIN =
    baseChildConfig.LITERT_CPP_BIN ?? join(process.resourcesPath, bridgeBinName);
  childEnv.LITERT_CPP_MODEL =
    baseChildConfig.LITERT_CPP_MODEL ??
    join(app.getPath("userData"), "models", modelFile);

  const piperBinPath = join(app.getPath("userData"), "bin", "piper", piperBinName);
  const piperModelPath = join(
    app.getPath("userData"),
    "models",
    "piper",
    `${piperVoice}.onnx`,
  );
  const piperConfigPath = `${piperModelPath}.json`;
  const piperReady =
    existsSync(piperBinPath) &&
    existsSync(piperModelPath) &&
    existsSync(piperConfigPath);

  childEnv.TTS_BACKEND = piperReady ? "piper" : "none";
  if (piperReady) {
    childEnv.PIPER_BIN = baseChildConfig.PIPER_BIN ?? piperBinPath;
    childEnv.PIPER_MODEL = baseChildConfig.PIPER_MODEL ?? piperModelPath;
    childEnv.PIPER_CONFIG = baseChildConfig.PIPER_CONFIG ?? piperConfigPath;
    if (baseChildConfig.PIPER_SAMPLE_RATE !== undefined) {
      childEnv.PIPER_SAMPLE_RATE = baseChildConfig.PIPER_SAMPLE_RATE;
    }
  }

  // Spawn node process from Electron binary.
  childEnv.ELECTRON_RUN_AS_NODE = "1";
  return {
    childEnv,
    piperReady,
    piperBinPath,
    piperModelPath,
    piperConfigPath,
  };
}

export function spawnBackend(baseChildConfig: ElectronChildProcessEnv): void {
  if (!app.isPackaged) {
    return;
  }
  if (backendProcess !== null) {
    return;
  }

  const sidecarEntry = resolvePackagedSidecarEntry();
  if (!existsSync(sidecarEntry)) {
    console.error(`[backendProcess] Packaged sidecar entry not found: ${sidecarEntry}`);
    return;
  }

  const {
    childEnv,
    piperReady,
    piperBinPath,
    piperModelPath,
    piperConfigPath,
  } = createChildEnv(baseChildConfig);
  if (!piperReady) {
    console.warn(
      `[backendProcess] Piper assets missing; sidecar TTS disabled. bin=${existsSync(
        piperBinPath,
      )} model=${existsSync(piperModelPath)} config=${existsSync(piperConfigPath)}`,
    );
  }

  backendProcess = spawn(process.execPath, [sidecarEntry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });

  backendProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[sidecar] ${chunk}`);
  });
  backendProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[sidecar] ${chunk}`);
  });
  backendProcess.on("exit", (code, signal) => {
    console.warn(
      `[backendProcess] Sidecar exited (code=${code ?? "null"} signal=${signal ?? "none"})`,
    );
    backendProcess = null;
  });
}

export function killBackend(): void {
  if (backendProcess === null) {
    return;
  }
  backendProcess.kill();
  backendProcess = null;
}
