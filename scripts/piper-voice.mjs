import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoBaseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

function isDirectExecution() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function toEnvPath(path, rootDir = defaultRootDir) {
  const relPath = relative(rootDir, path).replaceAll("\\", "/");
  return relPath.startsWith(".") ? relPath : `./${relPath}`;
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