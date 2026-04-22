import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { get } from "node:http";
import { dirname, join } from "node:path";
import { app } from "electron";

function getSidecarEnv(isDev: boolean): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!isDev) {
    // Production / packaged mode: redirect model caches into userData so
    // they survive across app restarts and stay inside the app sandbox.
    const cacheDir = join(app.getPath("userData"), "cache");
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    env.HF_HOME = join(cacheDir, "huggingface");
    env.LITERT_CACHE_DIR = join(cacheDir, "litert");
    env.KOKORO_MODEL_PATH = join(cacheDir, "kokoro-v1.0.onnx");
    env.KOKORO_VOICES_PATH = join(cacheDir, "voices-v1.0.bin");
  }
  return env;
}

function getPlatformTag(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32") return "win-x64";
  if (platform === "darwin")
    return arch === "arm64" ? "macos-arm64" : "macos-x64";
  if (platform === "linux") return "linux-x64";
  return `${platform}-${arch}`;
}

function getBinaryName(): string {
  return process.platform === "win32" ? "delfin-sidecar.exe" : "delfin-sidecar";
}

function discoverSidecarBinary(): string | null {
  const platformTag = getPlatformTag();
  const binaryName = getBinaryName();

  // Development path (repo root — npm run dev:full runs from repo root)
  const devPath = join(
    process.cwd(),
    "dist",
    "sidecar",
    platformTag,
    binaryName,
  );
  if (existsSync(devPath)) {
    return devPath;
  }

  // Production path (packaged app resources)
  const prodPath = join(
    process.resourcesPath,
    "sidecar",
    platformTag,
    binaryName,
  );
  if (existsSync(prodPath)) {
    return prodPath;
  }

  return null;
}

function discoverVenvPython(): string | null {
  // Try repo root first (works for dev:full and most dev workflows)
  const cwdSidecarDir = join(process.cwd(), "sidecar");
  const venvPythonCwd =
    process.platform === "win32"
      ? join(cwdSidecarDir, ".venv", "Scripts", "python.exe")
      : join(cwdSidecarDir, ".venv", "bin", "python");
  if (existsSync(venvPythonCwd)) {
    return venvPythonCwd;
  }

  // Fallback to app path (useful when Electron is launched outside repo root)
  try {
    const appSidecarDir = join(app.getAppPath(), "sidecar");
    const venvPythonApp =
      process.platform === "win32"
        ? join(appSidecarDir, ".venv", "Scripts", "python.exe")
        : join(appSidecarDir, ".venv", "bin", "python");
    if (existsSync(venvPythonApp)) {
      return venvPythonApp;
    }
  } catch {
    // getAppPath() may throw in some contexts — ignore
  }

  return null;
}

function isSidecarAlreadyRunning(
  host: string,
  port: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(
      `http://${host}:${port}/health`,
      { timeout: 1500 },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

let sidecarProcess: ChildProcess | null = null;

export async function startSidecar(): Promise<{
  success: boolean;
  url: string;
  error?: string;
}> {
  const host = process.env.SIDECAR_HOST ?? "127.0.0.1";
  const port = process.env.SIDECAR_PORT ?? "8321";
  const isDev = !!process.env.ELECTRON_RENDERER_URL;

  // If a sidecar is already listening (e.g. `npm run dev:full` started one
  // externally), just reuse it.
  if (await isSidecarAlreadyRunning(host, port)) {
    const url = `ws://${host}:${port}/ws`;
    console.log(
      `[sidecarProcess] existing sidecar detected on ${url}, reusing it`,
    );
    return { success: true, url };
  }

  const venvPython = discoverVenvPython();
  const binaryPath = discoverSidecarBinary();

  // Dev mode: prefer virtualenv Python so developers iterate without
  // rebuilding the frozen binary after every sidecar change.
  if (isDev && venvPython !== null) {
    const cwdSidecarDir = join(process.cwd(), "sidecar");

    sidecarProcess = spawn(
      venvPython,
      ["-m", "uvicorn", "server:app", "--host", host, "--port", port],
      {
        cwd: cwdSidecarDir,
        env: getSidecarEnv(isDev),
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    sidecarProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[sidecar] ${data.toString().trimEnd()}`);
    });

    sidecarProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[sidecar] ${data.toString().trimEnd()}`);
    });

    sidecarProcess.on("exit", (code) => {
      console.log(`[sidecar] exited with code ${code}`);
      sidecarProcess = null;
    });

    sidecarProcess.on("error", (err) => {
      console.error("[sidecar] failed to start:", err.message);
      sidecarProcess = null;
    });

    const url = `ws://${host}:${port}/ws`;
    console.log(
      `[sidecarProcess] started dev sidecar via ${venvPython}, connecting to ${url}`,
    );
    return { success: true, url };
  }

  // Production / packaged mode: use frozen binary if available
  if (binaryPath !== null) {
    // Ensure executable on Unix
    if (process.platform === "darwin" || process.platform === "linux") {
      try {
        chmodSync(binaryPath, 0o755);
      } catch {
        // ignore — binary may already be executable
      }
    }

    sidecarProcess = spawn(binaryPath, [], {
      cwd: dirname(binaryPath),
      env: getSidecarEnv(isDev),
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    sidecarProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[sidecar] ${data.toString().trimEnd()}`);
    });

    sidecarProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[sidecar] ${data.toString().trimEnd()}`);
    });

    sidecarProcess.on("exit", (code) => {
      console.log(`[sidecar] exited with code ${code}`);
      sidecarProcess = null;
    });

    sidecarProcess.on("error", (err) => {
      console.error("[sidecar] failed to start:", err.message);
      sidecarProcess = null;
    });

    const url = `ws://${host}:${port}/ws`;
    console.log(
      `[sidecarProcess] started frozen sidecar at ${binaryPath}, connecting to ${url}`,
    );
    return { success: true, url };
  }

  return {
    success: false,
    url: "",
    error:
      "Frozen sidecar binary not found." +
      (isDev && venvPython === null
        ? " Dev mode fallback also unavailable: no virtualenv Python found. Run `npm run setup:sidecar` first."
        : ""),
  };
}

export function stopSidecar(): void {
  if (sidecarProcess === null) return;

  const proc = sidecarProcess;
  sidecarProcess = null;

  proc.kill("SIGTERM");

  setTimeout(() => {
    if (!proc.killed) {
      console.warn(
        "[sidecarProcess] sidecar did not exit within 5 s, sending SIGKILL",
      );
      proc.kill("SIGKILL");
    }
  }, 5000);
}
