import { app } from "electron";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { downloadFile } from "../../shared/utils/download";

export type AssetId = "gemma-4" | "piper-runtime";

export interface AssetStatus {
  ready: boolean;
  missing: AssetId[];
  downloadInProgress: boolean;
}

export interface AssetDownloadProgress {
  asset: AssetId;
  receivedBytes: number;
  totalBytes?: number;
  percent?: number;
}

type AssetManifest = {
  schema: number;
  assets: Record<
    AssetId,
    {
      downloaded: boolean;
      version: string;
    }
  >;
};

type AssetDefinition = {
  id: AssetId;
  version: string;
  requiredFiles: string[];
  download: (
    onProgress: (progress: AssetDownloadProgress) => void,
  ) => Promise<void>;
};

const USER_DATA_DIR = app.getPath("userData");
const MANIFEST_PATH = join(USER_DATA_DIR, "manifest.json");

const MODEL_REPO = "litert-community/gemma-4-E2B-it-litert-lm";
const MODEL_FILE = "gemma-4-E2B-it.litertlm";
const MODEL_REVISION = "84b6978eff6e4eea02825bc2ee4ea48579f13109";
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${MODEL_FILE}`;

const PIPER_RELEASE_TAG = "2023.11.14-2";
const PIPER_VOICE_ID = "en_US-hfc_female-medium";
const PIPER_VOICE_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/hfc_female/medium";

function piperBinArchiveUrl(): string {
  if (process.platform === "win32") {
    return `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/piper_windows_amd64.zip`;
  }
  if (process.platform === "darwin") {
    return `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/piper_macos_aarch64.tar.gz`;
  }
  return `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE_TAG}/piper_linux_x86_64.tar.gz`;
}

function piperBinPath(): string {
  return process.platform === "win32"
    ? join(USER_DATA_DIR, "bin", "piper", "piper.exe")
    : join(USER_DATA_DIR, "bin", "piper", "piper");
}

function piperVoiceOnnxPath(): string {
  return join(USER_DATA_DIR, "models", "piper", `${PIPER_VOICE_ID}.onnx`);
}

function piperVoiceConfigPath(): string {
  return join(USER_DATA_DIR, "models", "piper", `${PIPER_VOICE_ID}.onnx.json`);
}

let downloadInProgress = false;

const ASSET_DEFINITIONS: AssetDefinition[] = [
  {
    id: "gemma-4",
    version: MODEL_REVISION,
    requiredFiles: [join(USER_DATA_DIR, "models", MODEL_FILE)],
    download: async (onProgress) => {
      const destination = join(USER_DATA_DIR, "models", MODEL_FILE);
      await downloadFile(MODEL_URL, destination, (received, total) => {
        onProgress({
          asset: "gemma-4",
          receivedBytes: received,
          totalBytes: total,
          percent: total ? Math.round((received / total) * 100) : undefined,
        });
      });
    },
  },
  {
    id: "piper-runtime",
    version: `${PIPER_RELEASE_TAG}+${PIPER_VOICE_ID}`,
    requiredFiles: [
      piperBinPath(),
      piperVoiceOnnxPath(),
      piperVoiceConfigPath(),
    ],
    download: async (onProgress) => {
      await downloadAndExtractPiperBinary(onProgress);
      await downloadPiperVoice(onProgress);
    },
  },
];

const ASSET_BY_ID: Record<AssetId, AssetDefinition> = {
  "gemma-4": ASSET_DEFINITIONS[0],
  "piper-runtime": ASSET_DEFINITIONS[1],
};

function createDefaultManifest(): AssetManifest {
  return {
    schema: 1,
    assets: {
      "gemma-4": {
        downloaded: false,
        version: ASSET_BY_ID["gemma-4"].version,
      },
      "piper-runtime": {
        downloaded: false,
        version: ASSET_BY_ID["piper-runtime"].version,
      },
    },
  };
}

function loadManifest(): AssetManifest {
  if (!existsSync(MANIFEST_PATH)) {
    const manifest = createDefaultManifest();
    saveManifest(manifest);
    return manifest;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(MANIFEST_PATH, "utf-8"),
    ) as AssetManifest;
    return parsed;
  } catch {
    const manifest = createDefaultManifest();
    saveManifest(manifest);
    return manifest;
  }
}

function saveManifest(manifest: AssetManifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

export function getModelStatus(): AssetStatus {
  const manifest = loadManifest();
  const missing: AssetId[] = [];

  for (const definition of ASSET_DEFINITIONS) {
    const state = manifest.assets[definition.id];
    const filesPresent = definition.requiredFiles.every((path) =>
      existsSync(path),
    );
    const versionMatches = state?.version === definition.version;
    const downloaded = state?.downloaded === true;

    if (!downloaded || !versionMatches || !filesPresent) {
      missing.push(definition.id);
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    downloadInProgress,
  };
}

export async function downloadAssets(
  assetsToDownload: AssetId[],
  onProgress: (progress: AssetDownloadProgress) => void,
  onComplete: (asset: AssetId) => void,
  onError: (asset: AssetId, message: string) => void,
): Promise<void> {
  if (downloadInProgress) return;
  downloadInProgress = true;
  const manifest = loadManifest();

  try {
    for (const id of assetsToDownload) {
      const definition = ASSET_BY_ID[id];
      if (!definition) continue;

      try {
        await definition.download(onProgress);
        manifest.assets[id] = {
          downloaded: true,
          version: definition.version,
        };
        saveManifest(manifest);
        onComplete(id);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Download failed";
        onError(id, message);
        throw error;
      }
    }
  } finally {
    downloadInProgress = false;
  }
}

async function downloadAndExtractPiperBinary(
  onProgress: (progress: AssetDownloadProgress) => void,
): Promise<void> {
  const isWindows = process.platform === "win32";
  const archiveExt = isWindows ? ".zip" : ".tar.gz";
  const archivePath = join(USER_DATA_DIR, `piper-archive${archiveExt}`);
  const binDir = join(USER_DATA_DIR, "bin");
  const piperDir = join(binDir, "piper");

  mkdirSync(binDir, { recursive: true });

  await downloadFile(piperBinArchiveUrl(), archivePath, (received, total) => {
    onProgress({
      asset: "piper-runtime",
      receivedBytes: received,
      totalBytes: total,
      percent: total ? Math.round((received / total) * 100) : undefined,
    });
  });

  if (isWindows) {
    const extraction = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${binDir}' -Force`,
      ],
      { encoding: "utf8" },
    );
    if (extraction.status !== 0) {
      throw new Error(
        `Piper extraction failed: ${extraction.stderr || extraction.stdout}`,
      );
    }
  } else {
    const extraction = spawnSync("tar", ["-xzf", archivePath, "-C", binDir], {
      encoding: "utf8",
    });
    if (extraction.status !== 0) {
      throw new Error(`Piper extraction failed: ${extraction.stderr}`);
    }
    const executablePath = join(piperDir, "piper");
    if (existsSync(executablePath)) {
      chmodSync(executablePath, 0o755);
    }
  }

  try {
    unlinkSync(archivePath);
  } catch {
    // best-effort cleanup
  }
}

async function downloadPiperVoice(
  onProgress: (progress: AssetDownloadProgress) => void,
): Promise<void> {
  const voiceDir = join(USER_DATA_DIR, "models", "piper");
  mkdirSync(voiceDir, { recursive: true });

  const onnxUrl = `${PIPER_VOICE_BASE}/${PIPER_VOICE_ID}.onnx`;
  const configUrl = `${PIPER_VOICE_BASE}/${PIPER_VOICE_ID}.onnx.json`;

  await downloadFile(onnxUrl, piperVoiceOnnxPath(), (received, total) => {
    onProgress({
      asset: "piper-runtime",
      receivedBytes: received,
      totalBytes: total,
      percent: total ? Math.round((received / total) * 100) : undefined,
    });
  });

  await downloadFile(configUrl, piperVoiceConfigPath(), () => {});
}
