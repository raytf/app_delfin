import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridgeSource = join(
  rootDir,
  "native",
  "litert-cpp-bridge",
  "delfin_litert_bridge.cc",
);
const bridgeBuildTargetSource = join(
  rootDir,
  "native",
  "litert-cpp-bridge",
  "BUILD.bazel",
);

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
  return `Usage: node scripts/build-litert-cpp-bridge.mjs --litert-lm-dir <path> [options]

Options:
  --litert-lm-dir <path>  Local google-ai-edge/LiteRT-LM checkout
  --output-dir <path>     Directory for delfin_litert_bridge(.exe) (default: bin/)
  --bazel <command>       Bazelisk/Bazel command to run (default: bazelisk, then bazel)
  --bazel-config <flag>   Bazel --config value (default: windows on Win32, none on macOS/Linux)
  --dry-run, --plan       Print planned actions without running Bazel
`;
}

export function resolvePlan(options, env = process.env) {
  if (options.help) return { help: true };
  if (!options.litertLmDir)
    throw new Error("Missing required --litert-lm-dir <path>.");

  const litertLmDir = resolve(options.litertLmDir);
  const outputDir = resolve(options.outputDir ?? join(rootDir, "bin"));
  const executableName =
    process.platform === "win32"
      ? "delfin_litert_bridge.exe"
      : "delfin_litert_bridge";
  const upstreamEngineDir = join(litertLmDir, "runtime", "engine");
  const upstreamBuildFile = join(upstreamEngineDir, "BUILD");
  const copiedBridgeSource = join(upstreamEngineDir, "delfin_litert_bridge.cc");
  const bazelCommand =
    options.bazel ??
    env.BAZELISK_BIN ??
    (commandExists("bazelisk") ? "bazelisk" : "bazel");
  // --config=windows sets up the MSVC toolchain; macOS/Linux let Bazel
  // auto-detect the local C++ toolchain (no platform config needed).
  const platformConfig =
    options.bazelConfig !== undefined
      ? [options.bazelConfig]
      : process.platform === "win32"
        ? ["--config=windows"]
        : [];
  const bazelArgs = [
    "build",
    "//runtime/engine:delfin_litert_bridge",
    ...platformConfig,
  ];
  const builtBinary = join(
    litertLmDir,
    "bazel-bin",
    "runtime",
    "engine",
    executableName,
  );

  return {
    bazelArgs,
    bazelCommand,
    bridgeBuildTargetSource,
    bridgeSource,
    builtBinary,
    copiedBridgeSource,
    executableName,
    litertLmDir,
    outputBinary: join(outputDir, executableName),
    outputDir,
    upstreamBuildFile,
    upstreamEngineDir,
  };
}

export function validatePlan(plan, options = {}) {
  if (!existsSync(plan.litertLmDir))
    throw new Error(`LiteRT-LM checkout not found: ${plan.litertLmDir}`);
  if (!existsSync(plan.upstreamBuildFile)) {
    throw new Error(
      `LiteRT-LM runtime/engine/BUILD not found: ${plan.upstreamBuildFile}`,
    );
  }
  if (!existsSync(plan.bridgeSource))
    throw new Error(`Bridge source not found: ${plan.bridgeSource}`);
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

export function mergeBuildTarget(plan) {
  const existingBuild = readFileSync(plan.upstreamBuildFile, "utf8");
  if (existingBuild.includes('name = "delfin_litert_bridge"')) return false;

  const target = readFileSync(plan.bridgeBuildTargetSource, "utf8").trimEnd();
  writeFileSync(
    plan.upstreamBuildFile,
    `${existingBuild.trimEnd()}\n\n${target}\n`,
    "utf8",
  );
  return true;
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

export async function buildBridge(options) {
  const plan = resolvePlan(options);
  validatePlan(plan, { dryRun: options.dryRun });

  console.log(
    "[build-litert-cpp-bridge] LiteRT-LM checkout:",
    plan.litertLmDir,
  );
  console.log("[build-litert-cpp-bridge] Copy source:", plan.bridgeSource);
  console.log("[build-litert-cpp-bridge] To:", plan.copiedBridgeSource);
  console.log(
    "[build-litert-cpp-bridge] Ensure BUILD target:",
    plan.upstreamBuildFile,
  );
  console.log(
    "[build-litert-cpp-bridge] Build:",
    plan.bazelCommand,
    plan.bazelArgs.join(" "),
  );
  console.log("[build-litert-cpp-bridge] Output:", plan.outputBinary);

  if (options.dryRun) {
    console.log(
      "[build-litert-cpp-bridge] Dry run complete; no files changed.",
    );
    return plan;
  }

  copyFileSync(plan.bridgeSource, plan.copiedBridgeSource);
  mergeBuildTarget(plan);
  await runProcess(plan.bazelCommand, plan.bazelArgs, plan.litertLmDir);
  if (!existsSync(plan.builtBinary)) {
    throw new Error(`Expected built binary not found: ${plan.builtBinary}`);
  }
  mkdirSync(plan.outputDir, { recursive: true });
  copyFileSync(plan.builtBinary, plan.outputBinary);
  console.log(
    "[build-litert-cpp-bridge] ✅ Bridge copied to:",
    plan.outputBinary,
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
