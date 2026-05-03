import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyNpmConfig,
  mergeBuildTarget,
  parseArgs,
  resolvePlan,
  usage,
  validatePlan,
} from "./build-litert-cpp-bridge.mjs";

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
    });

    expect(plan.bazelArgs).toEqual([
      "build",
      "//runtime/engine:delfin_litert_bridge",
      "--config=windows",
    ]);
    expect(plan.copiedBridgeSource).toBe(
      join(litertLmDir, "runtime", "engine", "delfin_litert_bridge.cc"),
    );
    expect(plan.outputBinary).toContain("delfin_litert_bridge");
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

  it("merges the bridge Bazel target into the upstream BUILD file once", async () => {
    const litertLmDir = await createLiteRtTree();
    const plan = resolvePlan({ litertLmDir, dryRun: true });

    expect(mergeBuildTarget(plan)).toBe(true);
    expect(mergeBuildTarget(plan)).toBe(false);
    const buildFile = await readFile(plan.upstreamBuildFile, "utf8");
    expect(buildFile.match(/delfin_litert_bridge/g)).toHaveLength(2);
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
  });
});
