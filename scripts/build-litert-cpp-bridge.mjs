import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LITERT_LM_DIR = join(
  rootDir,
  "litert-cpp-bridge",
  "deps",
  "LiteRT-LM",
);
const bridgeSourceDir = join(rootDir, "litert-cpp-bridge");
const bridgeBuildTargetSource = join(
  rootDir,
  "litert-cpp-bridge",
  "BUILD.bazel",
);
const desktopBridgeRepoEnv = ["--repo_env=ANDROID_NDK_HOME="];

function resolveMacSdkVersion() {
  if (process.platform !== "darwin") return null;
  const result = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

function isDirectExecution() {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

export function parseArgs(argv) {
  const options = {
    bazel: undefined,
    dryRun: false,
    litertLmDir: undefined,
    outputDir: join(rootDir, "bin"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run" || arg === "--plan") {
      options.dryRun = true;
    } else if (arg === "--litert-lm-dir") {
      options.litertLmDir = argv[++index];
    } else if (arg === "--output-dir") {
      options.outputDir = argv[++index];
    } else if (arg === "--bazel") {
      options.bazel = argv[++index];
    } else if (arg === "--bazel-config") {
      options.bazelConfig = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("--") && options.litertLmDir === undefined) {
      options.litertLmDir = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function applyNpmConfig(options, env = process.env) {
  return {
    ...options,
    bazel: options.bazel ?? env.npm_config_bazel,
    bazelConfig: options.bazelConfig ?? env.npm_config_bazel_config,
    dryRun:
      options.dryRun ||
      env.npm_config_dry_run === "true" ||
      env.npm_config_plan === "true",
    litertLmDir: options.litertLmDir ?? env.npm_config_litert_lm_dir,
    outputDir: env.npm_config_output_dir ?? options.outputDir,
  };
}

export function usage() {
  return `Usage: node scripts/build-litert-cpp-bridge.mjs [options]

Options:
  --litert-lm-dir <path>  Local google-ai-edge/LiteRT-LM checkout
                           (default: litert-cpp-bridge/deps/LiteRT-LM)
  --output-dir <path>     Directory for delfin_litert_bridge(.exe) (default: bin/)
  --bazel <command>       Bazelisk/Bazel command to run (default: bazelisk, then bazel)
  --bazel-config <flag>   Bazel --config value (default: windows on Win32, none on macOS/Linux)
  --dry-run, --plan       Print planned actions without running Bazel
`;
}

export function resolvePlan(options, env = process.env) {
  if (options.help) return { help: true };

  const litertLmDir = resolve(options.litertLmDir ?? DEFAULT_LITERT_LM_DIR);
  const outputDir = resolve(options.outputDir ?? join(rootDir, "bin"));
  const executableName =
    process.platform === "win32"
      ? "delfin_litert_bridge.exe"
      : "delfin_litert_bridge";
  const upstreamEngineDir = join(litertLmDir, "runtime", "engine");
  const copiedBridgeSourceDir = join(upstreamEngineDir, "delfin_bridge");
  const bazelCommand =
    options.bazel ??
    env.BAZELISK_BIN ??
    (commandExists("bazelisk") ? "bazelisk" : "bazel");
  // Desktop bridge builds do not need Android toolchains. Hosted Windows
  // runners expose ANDROID_NDK_HOME by default, which makes LiteRT-LM register
  // @androidndk and hit a rules_android_ndk symlink bug during analysis.
  // --config=windows sets up the MSVC toolchain; macOS/Linux let Bazel
  // auto-detect the local C++ toolchain (no platform config needed).
  const platformConfig =
    options.bazelConfig !== undefined
      ? [options.bazelConfig]
      : process.platform === "win32"
        ? ["--config=windows"]
        : process.platform === "darwin"
          ? process.arch === "arm64"
            ? ["--config=macos_arm64"]
            : ["--config=macos"]
        : [];
  const bazelArgs = [
    "build",
    ...desktopBridgeRepoEnv,
    "//runtime/engine/delfin_bridge:delfin_litert_bridge",
    ...platformConfig,
  ];
  const usesMacConfig = platformConfig.some((value) =>
    value === "--config=macos" || value === "--config=macos_arm64",
  );
  const sdkVersion = usesMacConfig ? resolveMacSdkVersion() : null;
  if (usesMacConfig && sdkVersion !== null) {
    bazelArgs.push(`--macos_sdk_version=${sdkVersion}`);
  }
  const builtBinary = join(
    litertLmDir,
    "bazel-bin",
    "runtime",
    "engine",
    "delfin_bridge",
    executableName,
  );
  const constraintProviderLibName =
    process.platform === "win32"
      ? "libGemmaModelConstraintProvider.dll"
      : process.platform === "darwin"
        ? "libGemmaModelConstraintProvider.dylib"
        : "libGemmaModelConstraintProvider.so";
  const prebuiltArch =
    process.platform === "win32"
      ? "windows_x86_64"
      : process.platform === "darwin"
        ? "macos_arm64"
        : "linux_x86_64";
  const prebuiltConstraintProviderLib = join(
    litertLmDir,
    "prebuilt",
    prebuiltArch,
    constraintProviderLibName,
  );
  const outputConstraintProviderLib = join(outputDir, constraintProviderLibName);

  return {
    bazelArgs,
    bazelCommand,
    bridgeBuildTargetSource,
    bridgeSourceDir,
    builtBinary,
    copiedBridgeSourceDir,
    executableName,
    constraintProviderLibName,
    prebuiltConstraintProviderLib,
    litertLmDir,
    outputBinary: join(outputDir, executableName),
    outputConstraintProviderLib,
    outputDir,
    upstreamEngineDir,
  };
}

export function validatePlan(plan, options = {}) {
  if (!existsSync(plan.litertLmDir))
    throw new Error(`LiteRT-LM checkout not found: ${plan.litertLmDir}`);
  if (!existsSync(plan.bridgeSourceDir))
    throw new Error(`Bridge source directory not found: ${plan.bridgeSourceDir}`);
  if (!existsSync(plan.bridgeBuildTargetSource)) {
    throw new Error(
      `Bridge BUILD target not found: ${plan.bridgeBuildTargetSource}`,
    );
  }
  if (!options.dryRun && !commandExists(plan.bazelCommand)) {
    throw new Error(
      `Bazel command not found: ${plan.bazelCommand}. Install Bazelisk or pass --bazel <path>.`,
    );
  }
}

export function commandExists(command) {
  if (command.includes("/") || command.includes("\\"))
    return existsSync(command);
  const pathValue = process.env.PATH ?? "";
  const extensions =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  return pathValue
    .split(process.platform === "win32" ? ";" : ":")
    .some((entry) => {
      if (!entry) return false;
      return extensions.some((extension) =>
        existsSync(join(entry, `${command}${extension}`)),
      );
    });
}

function runProcess(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else
        rejectPromise(
          new Error(`${command} exited with code ${code ?? "unknown"}`),
        );
    });
  });
}

function copyBridgeSources(plan) {
  mkdirSync(plan.copiedBridgeSourceDir, { recursive: true });
  for (const entry of readdirSync(plan.bridgeSourceDir, { withFileTypes: true })) {
    if (entry.name === "deps") continue;

    const sourcePath = join(plan.bridgeSourceDir, entry.name);
    const destPath = join(plan.copiedBridgeSourceDir, entry.name);
    cpSync(sourcePath, destPath, { recursive: true, force: true });
  }
}

function removeLegacyMergedTarget(plan) {
  const upstreamBuildPath = join(plan.upstreamEngineDir, "BUILD");
  if (!existsSync(upstreamBuildPath)) return false;

  let buildText = readFileSync(upstreamBuildPath, "utf8");
  let removed = false;
  const targetName = 'name = "delfin_litert_bridge"';

  while (true) {
    const nameIndex = buildText.indexOf(targetName);
    if (nameIndex < 0) break;

    const ruleStart = buildText.lastIndexOf("cc_binary(", nameIndex);
    if (ruleStart < 0) break;

    let depth = 0;
    let ruleEnd = -1;
    for (let i = ruleStart; i < buildText.length; i += 1) {
      const ch = buildText[i];
      if (ch === "(") depth += 1;
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          ruleEnd = i + 1;
          break;
        }
      }
    }
    if (ruleEnd < 0) break;

    const before = buildText.slice(0, ruleStart).replace(/\s*$/, "\n");
    const after = buildText.slice(ruleEnd).replace(/^\s*/, "\n");
    buildText = `${before}${after}`;
    removed = true;
  }

  if (removed) {
    writeFileSync(upstreamBuildPath, buildText, "utf8");
  }
  return removed;
}

export async function buildBridge(options) {
  const plan = resolvePlan(options);
  validatePlan(plan, { dryRun: options.dryRun });

  console.log(
    "[build-litert-cpp-bridge] LiteRT-LM checkout:",
    plan.litertLmDir,
  );
  console.log("[build-litert-cpp-bridge] Copy source:", plan.bridgeSourceDir);
  console.log("[build-litert-cpp-bridge] To:", plan.copiedBridgeSourceDir);
  console.log("[build-litert-cpp-bridge] BUILD file:", plan.bridgeBuildTargetSource);
  console.log(
    "[build-litert-cpp-bridge] Build:",
    plan.bazelCommand,
    plan.bazelArgs.join(" "),
  );
  console.log("[build-litert-cpp-bridge] Output:", plan.outputBinary);
  console.log(
    "[build-litert-cpp-bridge] Constraint provider lib:",
    plan.outputConstraintProviderLib,
  );

  if (options.dryRun) {
    console.log(
      "[build-litert-cpp-bridge] Dry run complete; no files changed.",
    );
    return plan;
  }

  copyBridgeSources(plan);
  const removedLegacyTarget = removeLegacyMergedTarget(plan);
  if (removedLegacyTarget) {
    console.log(
      "[build-litert-cpp-bridge] Removed legacy delfin_litert_bridge target from runtime/engine/BUILD",
    );
  }
  await runProcess(plan.bazelCommand, plan.bazelArgs, plan.litertLmDir);
  if (!existsSync(plan.builtBinary)) {
    throw new Error(`Expected built binary not found: ${plan.builtBinary}`);
  }
  if (!existsSync(plan.prebuiltConstraintProviderLib)) {
    throw new Error(
      `Constraint provider library not found: ${plan.prebuiltConstraintProviderLib}`,
    );
  }
  mkdirSync(plan.outputDir, { recursive: true });
  if (existsSync(plan.outputBinary)) {
    rmSync(plan.outputBinary, { force: true });
  }
  if (existsSync(plan.outputConstraintProviderLib)) {
    rmSync(plan.outputConstraintProviderLib, { force: true });
  }
  copyFileSync(plan.builtBinary, plan.outputBinary);
  copyFileSync(plan.prebuiltConstraintProviderLib, plan.outputConstraintProviderLib);
  console.log(
    "[build-litert-cpp-bridge] ✅ Bridge copied to:",
    plan.outputBinary,
  );
  console.log(
    "[build-litert-cpp-bridge] ✅ Constraint provider copied to:",
    plan.outputConstraintProviderLib,
  );
  return plan;
}

if (isDirectExecution()) {
  const options = applyNpmConfig(parseArgs(process.argv.slice(2)));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }
  buildBridge(options).catch((error) => {
    console.error("[build-litert-cpp-bridge] ❌", error.message);
    process.exit(1);
  });
}
