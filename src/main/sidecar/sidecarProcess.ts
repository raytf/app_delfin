import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

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

let sidecarProcess: ChildProcess | null = null;

export function startSidecar(): { success: boolean; url: string; error?: string } {
  const binaryPath = discoverSidecarBinary();
  if (binaryPath === null) {
    return {
      success: false,
      url: "",
      error: "Frozen sidecar binary not found.",
    };
  }

  const host = process.env.SIDECAR_HOST ?? "127.0.0.1";
  const port = process.env.SIDECAR_PORT ?? "8321";

  // Ensure executable on Unix
  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      chmodSync(binaryPath, 0o755);
    } catch {
      // ignore — binary may already be executable
    }
  }

  sidecarProcess = spawn(binaryPath, [], {
    cwd: join(binaryPath, ".."),
    env: { ...process.env },
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
    `[sidecarProcess] started sidecar at ${binaryPath}, connecting to ${url}`,
  );
  return { success: true, url };
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
