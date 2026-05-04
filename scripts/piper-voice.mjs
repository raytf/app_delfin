import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoBaseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
export const PIPER_TTS_PACKAGE = process.env.PIPER_TTS_PACKAGE ?? "piper-tts";
export const PIPER_TTS_VERSION = process.env.PIPER_TTS_VERSION ?? "1.4.1";
export const PIPER_RUNTIME_EXTRA_PACKAGES = ["pathvalidate>=3,<4"];

function isDirectExecution() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function toEnvPath(path, rootDir = defaultRootDir) {
  const relPath = relative(rootDir, path).replaceAll("\\", "/");
  return relPath.startsWith(".") ? relPath : `./${relPath}`;
}

function readEnvValue(text, key) {
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : null;
}

function commandExists(command) {
  if (command.includes("/") || command.includes("\\")) return existsSync(command);
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  return pathValue
    .split(process.platform === "win32" ? ";" : ":")
    .some((entry) => entry && extensions.some((extension) => existsSync(join(entry, `${command}${extension}`))));
}

async function runCommand(command, args, cwd) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function resolvePiperVenvDir(rootDir = defaultRootDir) {
  return join(rootDir, "bin", "piper", "venv");
}

export function resolvePiperPythonPath(rootDir = defaultRootDir) {
  const venvDir = resolvePiperVenvDir(rootDir);
  return process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

export function resolveDefaultPiperBinPath(rootDir = defaultRootDir) {
  const venvDir = resolvePiperVenvDir(rootDir);
  return process.platform === "win32"
    ? join(venvDir, "Scripts", "piper.exe")
    : join(venvDir, "bin", "piper");
}

function resolvePiperPythonForBin(binPath, rootDir = defaultRootDir) {
  const adjacentPython = process.platform === "win32"
    ? join(dirname(binPath), "python.exe")
    : join(dirname(binPath), "python");
  return existsSync(adjacentPython) ? adjacentPython : resolvePiperPythonPath(rootDir);
}

function defaultCheckRuntimeHealthy(venvPython, rootDir = defaultRootDir) {
  if (!existsSync(venvPython)) return false;
  const result = spawnSync(venvPython, ["-c", "import piper, pathvalidate"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

async function ensurePiperRuntimeHealthy(options) {
  const { rootDir, venvPython, runCommandImpl } = options;
  const checkRuntimeHealthy = options.checkRuntimeHealthy ?? defaultCheckRuntimeHealthy;
  if (await checkRuntimeHealthy(venvPython, rootDir)) return { repaired: false };

  await runCommandImpl(venvPython, ["-m", "pip", "install", ...PIPER_RUNTIME_EXTRA_PACKAGES], rootDir);

  if (!(await checkRuntimeHealthy(venvPython, rootDir))) {
    throw new Error(
      `Piper runtime is missing required Python modules after repair. Tried: ${PIPER_RUNTIME_EXTRA_PACKAGES.join(", ")}`,
    );
  }
  return { repaired: true };
}

function findPythonCommand() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push(process.env.PYTHON);
  if (process.platform === "win32") candidates.push("python");
  else candidates.push("python3", "python");

  return candidates.find((candidate) => commandExists(candidate)) ?? null;
}

export async function ensurePiperRuntime(options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const envPath = options.envPath ?? join(rootDir, ".env");
  const existingEnv = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const configuredBin = readEnvValue(existingEnv, "PIPER_BIN");
  const runCommandImpl = options.runCommand ?? runCommand;
  const writeEnv = options.writeEnv ?? true;

  if (configuredBin) {
    const configuredBinPath = resolve(rootDir, configuredBin);
    if (existsSync(configuredBinPath)) {
      const health = await ensurePiperRuntimeHealthy({
        rootDir,
        venvPython: options.venvPython ?? resolvePiperPythonForBin(configuredBinPath, rootDir),
        runCommandImpl,
        checkRuntimeHealthy: options.checkRuntimeHealthy,
      });
      return { binPath: configuredBinPath, installed: false, source: "env", repaired: health.repaired };
    }
  }

  const defaultBinPath = options.binPath ?? resolveDefaultPiperBinPath(rootDir);
  if (existsSync(defaultBinPath)) {
    const health = await ensurePiperRuntimeHealthy({
      rootDir,
      venvPython: options.venvPython ?? resolvePiperPythonForBin(defaultBinPath, rootDir),
      runCommandImpl,
      checkRuntimeHealthy: options.checkRuntimeHealthy,
    });
    if (writeEnv) {
      const nextEnv = upsertEnvValue(existingEnv, "PIPER_BIN", toEnvPath(defaultBinPath, rootDir));
      await writeFile(envPath, nextEnv);
    }
    return { binPath: defaultBinPath, installed: false, source: "existing", repaired: health.repaired };
  }

  const pythonCommand = options.pythonCommand ?? findPythonCommand();
  if (!pythonCommand) {
    throw new Error(
      "Python 3.9+ is required to install the repo-local Piper runtime. Install Python and retry.",
    );
  }

  const venvDir = options.venvDir ?? resolvePiperVenvDir(rootDir);
  await mkdir(dirname(venvDir), { recursive: true });
  await runCommandImpl(pythonCommand, ["-m", "venv", venvDir], rootDir);

  const venvPython = options.venvPython ?? resolvePiperPythonPath(rootDir);
  await runCommandImpl(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], rootDir);
  await runCommandImpl(venvPython, ["-m", "pip", "install", `${PIPER_TTS_PACKAGE}==${PIPER_TTS_VERSION}`], rootDir);
  const health = await ensurePiperRuntimeHealthy({
    rootDir,
    venvPython,
    runCommandImpl,
    checkRuntimeHealthy: options.checkRuntimeHealthy,
  });

  if (!existsSync(defaultBinPath)) {
    throw new Error(`Piper CLI was not installed at the expected path: ${defaultBinPath}`);
  }

  if (writeEnv) {
    const refreshedEnv = existsSync(envPath) ? await readFile(envPath, "utf8") : existingEnv;
    const nextEnv = upsertEnvValue(refreshedEnv, "PIPER_BIN", toEnvPath(defaultBinPath, rootDir));
    await writeFile(envPath, nextEnv);
  }

  return { binPath: defaultBinPath, installed: true, source: "installed", version: PIPER_TTS_VERSION, repaired: health.repaired };
}

export function normalizeVoicePath(input) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Voice path is required.");

  try {
    const url = new URL(trimmed);
    const marker = url.pathname.includes("/tree/main/") ? "/tree/main/" : "/resolve/main/";
    const index = url.pathname.indexOf(marker);
    if (index >= 0) return decodeURIComponent(url.pathname.slice(index + marker.length)).replace(/^\/+|\/+$/g, "");
  } catch {
    // Not a URL; continue with path normalization.
  }

  return trimmed.replace(/^\/+|\/+$/g, "");
}

export function voiceNameFromPath(input) {
  const voicePath = normalizeVoicePath(input);
  const parts = voicePath.split("/").filter(Boolean);
  if (parts.length < 4) {
    throw new Error("Use the official path format, e.g. en/en_US/hfc_female/medium.");
  }

  const [, locale, speaker, quality] = parts.slice(-4);
  return `${locale}-${speaker}-${quality}`;
}

export function readSampleRateFromConfigText(text) {
  const config = JSON.parse(text);
  const sampleRate = Number(config?.audio?.sample_rate ?? config?.audio?.sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("Piper config does not contain audio.sample_rate.");
  }
  return sampleRate;
}

export async function readSampleRateFromConfig(configPath) {
  return readSampleRateFromConfigText(await readFile(configPath, "utf8"));
}

function upsertEnvValue(text, key, value) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length ? text.split(/\r?\n/) : [];
  const replacement = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));

  if (index >= 0) lines[index] = replacement;
  else lines.push(replacement);

  return lines.join(newline).replace(new RegExp(`${newline}+$`), "") + newline;
}

export function updatePiperEnvText(text, values) {
  let next = text;
  next = upsertEnvValue(next, "LITERT_CPP_TTS_BACKEND", "piper");
  if (values.bin) next = upsertEnvValue(next, "PIPER_BIN", values.bin);
  next = upsertEnvValue(next, "PIPER_MODEL", values.model);
  next = upsertEnvValue(next, "PIPER_CONFIG", values.config);
  next = upsertEnvValue(next, "PIPER_SAMPLE_RATE", String(values.sampleRate));
  return next;
}

export async function listInstalledVoices(options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const modelsDir = options.modelsDir ?? join(rootDir, "models", "piper");
  if (!existsSync(modelsDir)) return [];

  const files = await readdir(modelsDir);
  const modelFiles = files.filter((file) => file.endsWith(".onnx"));
  const voices = [];

  for (const modelFile of modelFiles) {
    const name = modelFile.slice(0, -".onnx".length);
    const configPath = join(modelsDir, `${modelFile}.json`);
    let sampleRate = null;
    let ready = existsSync(configPath);

    if (ready) {
      try {
        sampleRate = await readSampleRateFromConfig(configPath);
      } catch {
        ready = false;
      }
    }

    voices.push({ name, modelPath: join(modelsDir, modelFile), configPath, sampleRate, ready });
  }

  return voices.sort((a, b) => a.name.localeCompare(b.name));
}

export async function useVoice(name, options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const modelsDir = options.modelsDir ?? join(rootDir, "models", "piper");
  const envPath = options.envPath ?? join(rootDir, ".env");
  const modelPath = join(modelsDir, `${name}.onnx`);
  const configPath = join(modelsDir, `${name}.onnx.json`);

  if (!existsSync(modelPath)) throw new Error(`Piper model not found: ${modelPath}`);
  if (!existsSync(configPath)) throw new Error(`Piper config not found: ${configPath}`);

  const sampleRate = await readSampleRateFromConfig(configPath);
  const existingEnv = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const nextEnv = updatePiperEnvText(existingEnv, {
    model: toEnvPath(modelPath, rootDir),
    config: toEnvPath(configPath, rootDir),
    sampleRate,
  });

  await writeFile(envPath, nextEnv);
  return { name, modelPath, configPath, sampleRate };
}

async function downloadFile(url, destPath, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);

  await mkdir(dirname(destPath), { recursive: true });
  const tempPath = `${destPath}.part`;
  try {
    await writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
    await rename(tempPath, destPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function installVoice(inputPath, options = {}) {
  const rootDir = options.rootDir ?? defaultRootDir;
  const modelsDir = options.modelsDir ?? join(rootDir, "models", "piper");
  const voicePath = normalizeVoicePath(inputPath);
  const name = voiceNameFromPath(voicePath);
  const modelPath = join(modelsDir, `${name}.onnx`);
  const configPath = join(modelsDir, `${name}.onnx.json`);

  if (!options.force && existsSync(modelPath) && existsSync(configPath)) {
    const sampleRate = await readSampleRateFromConfig(configPath);
    if (options.use) await useVoice(name, { rootDir, modelsDir, envPath: options.envPath });
    return { name, modelPath, configPath, sampleRate, downloaded: false };
  }

  await downloadFile(`${repoBaseUrl}/${voicePath}/${name}.onnx`, modelPath, options);
  await downloadFile(`${repoBaseUrl}/${voicePath}/${name}.onnx.json`, configPath, options);

  const sampleRate = await readSampleRateFromConfig(configPath);
  if (options.use) await useVoice(name, { rootDir, modelsDir, envPath: options.envPath });
  return { name, modelPath, configPath, sampleRate, downloaded: true };
}

export function usage() {
  return [
    "Usage:",
    "  node scripts/piper-voice.mjs list",
    "  node scripts/piper-voice.mjs use <voice-name>",
    "  node scripts/piper-voice.mjs install <hf-path-or-url> [--use] [--force]",
    "",
    "Example:",
    "  node scripts/piper-voice.mjs install en/en_US/hfc_female/medium --use",
  ].join("\n");
}

export function parseCliArgs(argv, env = process.env) {
  const [command, arg, ...flags] = argv;
  return {
    command,
    arg,
    use: flags.includes("--use") || env.npm_config_use === "true",
    force: flags.includes("--force") || env.npm_config_force === "true",
  };
}

async function main(argv = process.argv.slice(2)) {
  const { command, arg, use, force } = parseCliArgs(argv);

  if (command === "list") {
    const voices = await listInstalledVoices();
    if (!voices.length) console.log("No Piper voices found in models/piper.");
    else for (const voice of voices) console.log(`${voice.ready ? "✅" : "⚠️"} ${voice.name} ${voice.sampleRate ?? "unknown"}Hz`);
    return;
  }

  if (command === "use") {
    if (!arg) throw new Error(`Missing voice name.\n${usage()}`);
    const result = await useVoice(arg);
    console.log(`Using Piper voice ${result.name} (${result.sampleRate}Hz).`);
    return;
  }

  if (command === "install") {
    if (!arg) throw new Error(`Missing HuggingFace voice path.\n${usage()}`);
    const result = await installVoice(arg, { use, force });
    console.log(`${result.downloaded ? "Downloaded" : "Already installed"} ${result.name} (${result.sampleRate}Hz).`);
    if (use) console.log(`Using Piper voice ${result.name}.`);
    return;
  }

  console.log(usage());
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(`[piper-voice] ${error.message}`);
    process.exit(1);
  });
}