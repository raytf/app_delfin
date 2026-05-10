import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  applyNpmConfig,
  parseArgs,
  resolvePlan,
  usage,
  validatePlan,
} from "./build-litert-cpp-bridge.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function createLiteRtTree() {
  const root = await mkdtemp(join(tmpdir(), "litert-lm-"));
  const engineDir = join(root, "runtime", "engine");
  await mkdir(engineDir, { recursive: true });
  await writeFile(
    join(engineDir, "BUILD"),
    'cc_binary(name = "litert_lm_main")\n',
  );
  return root;
}

describe("build-litert-cpp-bridge helper", () => {
  it("parses the supported CLI options", () => {
    const options = parseArgs([
      "--litert-lm-dir",
      "C:/src/LiteRT-LM",
      "--output-dir",
      "bin/custom",
      "--bazel",
      "bazelisk.exe",
      "--dry-run",
    ]);

    expect(options).toMatchObject({
      bazel: "bazelisk.exe",
      dryRun: true,
      litertLmDir: "C:/src/LiteRT-LM",
      outputDir: "bin/custom",
    });
  });

  it("reads npm config env vars when npm consumes run-script flags", () => {
    const options = applyNpmConfig(parseArgs([]), {
      npm_config_dry_run: "true",
      npm_config_litert_lm_dir: "C:/src/LiteRT-LM",
      npm_config_output_dir: "bin/custom",
    });

    expect(options).toMatchObject({
      dryRun: true,
      litertLmDir: "C:/src/LiteRT-LM",
      outputDir: "bin/custom",
    });
  });

  it("supports --plan as an npm-safe dry-run alias", () => {
    expect(parseArgs(["--plan"])).toMatchObject({ dryRun: true });
    expect(
      applyNpmConfig(parseArgs([]), { npm_config_plan: "true" }),
    ).toMatchObject({ dryRun: true });
  });

  it("resolves the Bazel build and output paths", async () => {
    const litertLmDir = await createLiteRtTree();
    const plan = resolvePlan({
      litertLmDir,
      outputDir: join(litertLmDir, "out"),
      bazel: "bazelisk",
      bazelConfig: "--config=windows",
    });

    expect(plan.bazelArgs).toEqual([
      "build",
      "--repo_env=ANDROID_NDK_HOME=",
      "//runtime/engine/delfin_bridge:delfin_litert_bridge",
      "--config=windows",
    ]);
    expect(plan.copiedBridgeSourceDir).toBe(
      join(litertLmDir, "runtime", "engine", "delfin_bridge"),
    );
    expect(plan.outputBinary).toContain("delfin_litert_bridge");
  });

  it("clears ambient Android NDK detection for desktop bridge builds", async () => {
    const litertLmDir = await createLiteRtTree();
    const plan = resolvePlan({ litertLmDir, bazel: "bazelisk" });

    expect(plan.bazelArgs).toContain("--repo_env=ANDROID_NDK_HOME=");
  });

  it("allows dry-run validation without Bazel installed", async () => {
    const litertLmDir = await createLiteRtTree();
    const plan = resolvePlan({ litertLmDir, dryRun: true });

    expect(() => validatePlan(plan, { dryRun: true })).not.toThrow();
  });

  it("fails clearly when Bazel is missing outside dry-run mode", async () => {
    const litertLmDir = await createLiteRtTree();
    const plan = resolvePlan({
      litertLmDir,
      bazel: join(tmpdir(), "not-a-real-bazel"),
    });

    expect(() => validatePlan(plan, { dryRun: false })).toThrow(
      "Bazel command not found",
    );
  });

  it("reports a missing LiteRT-LM checkout clearly", () => {
    const plan = resolvePlan({
      litertLmDir: join(tmpdir(), "missing-litert-lm-tree"),
    });

    expect(() => validatePlan(plan, { dryRun: true })).toThrow(
      "LiteRT-LM checkout not found",
    );
  });

  it("documents the required checkout argument in help text", () => {
    expect(usage()).toContain("--litert-lm-dir <path>");
    expect(usage()).toContain("default: litert-cpp-bridge/deps/LiteRT-LM");
  });

  it("defaults LiteRT-LM dir to litert-cpp-bridge/deps/LiteRT-LM", () => {
    const plan = resolvePlan({});
    expect(plan.litertLmDir).toBe(
      resolve(rootDir, "litert-cpp-bridge", "deps", "LiteRT-LM"),
    );
  });
});
