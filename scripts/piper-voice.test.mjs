import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readPiperSampleRate } from "./litert-cpp-proxy.mjs";
import {
  installVoice,
  listInstalledVoices,
  parseCliArgs,
  readSampleRateFromConfigText,
  useVoice,
  voiceNameFromPath,
} from "./piper-voice.mjs";

function piperConfig(sampleRate) {
  return JSON.stringify({ audio: { sample_rate: sampleRate }, espeak: { voice: "en-us" } });
}

async function createTempRoot() {
  const rootDir = await mkdtemp(join(tmpdir(), "piper-voice-"));
  const modelsDir = join(rootDir, "models", "piper");
  await mkdir(modelsDir, { recursive: true });
  return { rootDir, modelsDir, envPath: join(rootDir, ".env") };
}

function createMockResponse(content) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async arrayBuffer() {
      return Buffer.from(content);
    },
  };
}

describe("piper voice helper", () => {
  it("derives official Piper voice names from paths and URLs", () => {
    expect(voiceNameFromPath("en/en_US/hfc_female/medium")).toBe("en_US-hfc_female-medium");
    expect(
      voiceNameFromPath("https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/hfc_female/medium"),
    ).toBe("en_US-hfc_female-medium");
  });

  it("recognizes npm run-script boolean flags", () => {
    expect(parseCliArgs(["install", "en/en_US/hfc_female/medium"], { npm_config_use: "true" })).toMatchObject({
      command: "install",
      arg: "en/en_US/hfc_female/medium",
      use: true,
      force: false,
    });
  });

  it("reads sample rates from Piper config JSON", () => {
    expect(readSampleRateFromConfigText(piperConfig(22050))).toBe(22050);
  });

  it("lists locally installed voices with sample-rate metadata", async () => {
    const { modelsDir } = await createTempRoot();
    await writeFile(join(modelsDir, "en_US-a-medium.onnx"), "model-a");
    await writeFile(join(modelsDir, "en_US-a-medium.onnx.json"), piperConfig(22050));
    await writeFile(join(modelsDir, "en_US-b-low.onnx"), "model-b");

    const voices = await listInstalledVoices({ modelsDir });

    expect(voices.map((voice) => ({ name: voice.name, sampleRate: voice.sampleRate, ready: voice.ready }))).toEqual([
      { name: "en_US-a-medium", sampleRate: 22050, ready: true },
      { name: "en_US-b-low", sampleRate: null, ready: false },
    ]);
  });

  it("switches .env to an installed voice", async () => {
    const { rootDir, modelsDir, envPath } = await createTempRoot();
    await writeFile(envPath, "SIDECAR_PORT=8321\nPIPER_SAMPLE_RATE=16000\n");
    await writeFile(join(modelsDir, "en_US-hfc_female-medium.onnx"), "model");
    await writeFile(join(modelsDir, "en_US-hfc_female-medium.onnx.json"), piperConfig(22050));

    const result = await useVoice("en_US-hfc_female-medium", { rootDir, modelsDir, envPath });
    const env = await readFile(envPath, "utf8");

    expect(result.sampleRate).toBe(22050);
    expect(env).toContain("LITERT_CPP_TTS_BACKEND=piper");
    expect(env).toContain("PIPER_MODEL=./models/piper/en_US-hfc_female-medium.onnx");
    expect(env).toContain("PIPER_CONFIG=./models/piper/en_US-hfc_female-medium.onnx.json");
    expect(env).toContain("PIPER_SAMPLE_RATE=22050");
  });

  it("downloads an official voice and can switch to it", async () => {
    const { rootDir, modelsDir, envPath } = await createTempRoot();
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return createMockResponse(url.endsWith(".json") ? piperConfig(22050) : "onnx-bytes");
    };

    const result = await installVoice("en/en_US/hfc_female/medium", {
      rootDir,
      modelsDir,
      envPath,
      fetchImpl,
      use: true,
    });

    expect(result).toMatchObject({ name: "en_US-hfc_female-medium", sampleRate: 22050, downloaded: true });
    expect(urls).toEqual([
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx",
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx.json",
    ]);
    await expect(readFile(join(modelsDir, "en_US-hfc_female-medium.onnx"), "utf8")).resolves.toBe("onnx-bytes");
    await expect(readFile(envPath, "utf8")).resolves.toContain("PIPER_MODEL=./models/piper/en_US-hfc_female-medium.onnx");
  });

  it("lets the proxy infer PIPER_SAMPLE_RATE from PIPER_CONFIG when env is unset", async () => {
    const { modelsDir } = await createTempRoot();
    const configPath = join(modelsDir, "voice.onnx.json");
    await writeFile(configPath, piperConfig(16000));

    expect(readPiperSampleRate(configPath, {})).toBe(16000);
    expect(readPiperSampleRate(configPath, { PIPER_SAMPLE_RATE: "22050" })).toBe(22050);
  });
});