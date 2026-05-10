import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CreateConversationInput,
  InferenceEngine,
  InferenceEngineInfo,
  RunTurnHandlers,
  RunTurnInput,
  TurnDoneOutput,
} from "../../shared/abstractions/inference-engine";
import type { Nullable } from "../../shared/types/object";

type PendingTurn = RunTurnHandlers;

const BRIDGE_READY_TIMEOUT_MS = 120_000;

type BridgeEvent = {
  type?: unknown;
  backend?: unknown;
  model?: unknown;
  requestId?: unknown;
  text?: unknown;
  message?: unknown;
};

export class LitertCppInferenceEngine implements InferenceEngine {
  private readonly child: ChildProcessWithoutNullStreams;

  private readonly pending = new Map<string, PendingTurn>();

  private readonly readyPromise: Promise<void>;

  private readyResolve!: () => void;

  private readyReject!: (error: Error) => void;

  private readyState = false;

  private backend = "litert-cpp";

  private model: Nullable<string>;

  private startupError: Nullable<Error> = null;

  private startupTimer: ReturnType<typeof setTimeout>;
  private readonly bridgeMarkerPath: string;
  private gracefulShutdown = false;

  constructor(
    private readonly config: {
      binPath: string;
      modelPath: string;
      rootDir?: string;
    },
  ) {
    this.model = config.modelPath;
    this.bridgeMarkerPath = join(dirname(config.modelPath), ".bridge-running");

    const rootDir =
      config.rootDir ??
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const { command, args } = this.resolveBridgeCommand(config.binPath);
    const env = { ...process.env };
    const binDir = dirname(config.binPath);
    if (process.platform === "linux") {
      env.LD_LIBRARY_PATH = [binDir, env.LD_LIBRARY_PATH ?? ""]
        .filter(Boolean)
        .join(":");
    } else if (process.platform === "darwin") {
      env.DYLD_LIBRARY_PATH = [binDir, env.DYLD_LIBRARY_PATH ?? ""]
        .filter(Boolean)
        .join(":");
    }
    this.clearStaleXnnpackCaches();
    this.writeBridgeMarker();

    this.child = spawn(command, [...args, "--model_path", config.modelPath], {
      cwd: rootDir,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    this.readyPromise = new Promise<void>((resolvePromise, rejectPromise) => {
      this.readyResolve = resolvePromise;
      this.readyReject = rejectPromise;
    });
    this.readyPromise.catch(() => {});

    this.startupTimer = setTimeout(() => {
      const error = new Error(
        "LiteRT C++ bridge did not emit a ready event before timeout.",
      );
      this.startupError = error;
      this.readyReject(error);
      this.child.kill();
    }, BRIDGE_READY_TIMEOUT_MS);

    this.wireProcess();
  }

  async ready(): Promise<void> {
    await this.readyPromise;
  }

  getInfo(): InferenceEngineInfo {
    return {
      ready: this.readyState,
      backend: this.backend,
      model: this.model,
      error: this.startupError?.message ?? null,
    };
  }

  async createConversation(input: CreateConversationInput): Promise<void> {
    await this.readyPromise;
    this.child.stdin.write(
      `${JSON.stringify({
        type: "create_conversation",
        conversationId: input.conversationId,
        systemPrompt: input.systemPrompt,
      })}\n`,
    );
  }

  async dropConversation(conversationId: string): Promise<void> {
    if (!this.readyState) return;
    this.child.stdin.write(
      `${JSON.stringify({ type: "drop_conversation", conversationId })}\n`,
    );
  }

  async runTurn(input: RunTurnInput, handlers: RunTurnHandlers): Promise<void> {
    await this.readyPromise;
    this.pending.set(input.turnId, handlers);

    const payload = {
      type: "generate",
      requestId: input.turnId,
      conversationId: input.conversationId,
      systemPrompt: input.systemPrompt,
      message: input.message,
    };

    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  interruptTurn(turnId: Nullable<string>): void {
    if (!this.readyState || !turnId) return;
    this.child.stdin.write(
      `${JSON.stringify({ type: "interrupt", requestId: turnId })}\n`,
    );
  }

  resetConversation(conversationId: Nullable<string>): void {
    if (!this.readyState || !conversationId) return;
    this.child.stdin.write(
      `${JSON.stringify({ type: "reset_conversation", conversationId })}\n`,
    );
  }

  async close(): Promise<void> {
    this.gracefulShutdown = true;
    clearTimeout(this.startupTimer);
    for (const [turnId, handlers] of this.pending.entries()) {
      handlers.onError("LiteRT C++ bridge was closed.");
      this.pending.delete(turnId);
    }

    await new Promise<void>((resolvePromise) => {
      this.child.once("exit", () => resolvePromise());
      this.child.kill();
    });
  }

  private wireProcess(): void {
    readline
      .createInterface({ input: this.child.stdout })
      .on("line", (line) => {
        let event: BridgeEvent;
        try {
          event = JSON.parse(line) as BridgeEvent;
        } catch {
          return;
        }

        const eventType = this.readString(event.type);
        if (eventType === "ready") {
          this.readyState = true;
          this.backend = this.readString(event.backend) ?? this.backend;
          this.model = this.readString(event.model) ?? this.model;
          clearTimeout(this.startupTimer);
          this.readyResolve();
          return;
        }

        const turnId = this.readString(event.requestId) ?? "";
        const handlers = this.pending.get(turnId);
        if (!handlers) return;

        if (eventType === "token") {
          handlers.onToken(this.readString(event.text) ?? "");
          return;
        }

        this.pending.delete(turnId);
        if (eventType === "done") {
          handlers.onDone(this.toTurnDoneOutput(event));
          return;
        }

        handlers.onError(
          this.readString(event.message) ?? "LiteRT C++ turn failed.",
        );
      });

    this.child.stderr.on("data", (chunk) => {
      process.stderr.write(`[litert-cpp-bridge] ${chunk}`);
    });

    this.child.once("exit", (code, signal) => {
      clearTimeout(this.startupTimer);
      this.readyState = false;
      if (this.gracefulShutdown || code === 0) {
        this.clearBridgeMarker();
      }
      const message =
        this.startupError?.message ??
        `LiteRT C++ bridge exited unexpectedly (${signal ?? code ?? "unknown"}).`;
      this.startupError ??= new Error(message);
      this.readyReject(new Error(message));

      for (const [turnId, handlers] of this.pending.entries()) {
        handlers.onError(message);
        this.pending.delete(turnId);
      }
    });
  }

  private writeBridgeMarker(): void {
    try {
      writeFileSync(this.bridgeMarkerPath, "");
    } catch (error) {
      process.stderr.write(
        `[litert-cpp-bridge] failed to write marker: ${(error as Error).message}\n`,
      );
    }
  }

  private clearBridgeMarker(): void {
    try {
      if (existsSync(this.bridgeMarkerPath)) {
        unlinkSync(this.bridgeMarkerPath);
      }
    } catch {
      // best effort only
    }
  }

  private clearStaleXnnpackCaches(): void {
    if (!existsSync(this.bridgeMarkerPath)) {
      return;
    }
    const modelDir = dirname(this.config.modelPath);
    if (!existsSync(modelDir)) {
      return;
    }
    let removed = 0;
    for (const entry of readdirSync(modelDir)) {
      if (!entry.endsWith(".xnnpack_cache")) continue;
      try {
        rmSync(join(modelDir, entry), { force: true });
        removed += 1;
      } catch (error) {
        process.stderr.write(
          `[litert-cpp-bridge] failed to remove stale cache ${entry}: ${(error as Error).message}\n`,
        );
      }
    }
    if (removed > 0) {
      process.stdout.write(
        `[litert-cpp-bridge] cleared ${removed} stale .xnnpack_cache file(s)\n`,
      );
    }
  }

  private resolveBridgeCommand(binPath: string): {
    command: string;
    args: string[];
  } {
    if (/\.(mjs|js|cjs)$/i.test(binPath)) {
      return { command: process.execPath, args: [binPath] };
    }
    return { command: binPath, args: [] };
  }

  private toTurnDoneOutput(event: BridgeEvent): TurnDoneOutput {
    const content = (event.message as { content?: unknown } | undefined)
      ?.content;
    const text = this.readString(event.text) ?? "";
    return {
      text,
      message: {
        role: "model",
        content: Array.isArray(content)
          ? (content as TurnDoneOutput["message"]["content"])
          : [{ type: "text", text }],
      },
    };
  }

  private readString(value: unknown): Nullable<string> {
    return typeof value === "string" ? value : null;
  }
}
