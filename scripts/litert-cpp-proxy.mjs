import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import readline from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as dotenvConfig } from "dotenv";
import { WebSocketServer } from "ws";

import { resolvePreset } from "./litert-cpp-presets.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenvConfig({ path: resolve(rootDir, ".env") });
const bridgeReadyTimeoutMs = 120_000;

function isDirectExecution() {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

function buildUserMessage(request) {
  const content = [];
  if (request.image) content.push({ type: "image", blob: request.image });
  if (request.audio) content.push({ type: "audio", blob: request.audio });
  if (request.text) content.push({ type: "text", text: request.text });
  return { role: "user", content };
}

function resolveBridgeCommand(binPath) {
  if (/\.(mjs|js|cjs)$/i.test(binPath)) {
    return { command: process.execPath, args: [binPath] };
  }
  return { command: binPath, args: [] };
}

function createStdioBridge() {
  const defaultBin = resolve(
    rootDir,
    "bin",
    process.platform === "win32" ? "litert_lm_main.exe" : "litert_lm_main",
  );
  const defaultModel = resolve(
    rootDir,
    "models",
    process.env.MODEL_FILE ?? "gemma-4-E2B-it.litertlm",
  );
  const binPath = resolve(process.env.LITERT_CPP_BIN ?? defaultBin);
  const modelPath = resolve(process.env.LITERT_CPP_MODEL ?? defaultModel);

  if (!existsSync(binPath)) {
    throw new Error(
      `LiteRT C++ bridge binary not found at ${binPath}. Set LITERT_CPP_BIN.`,
    );
  }
  if (!existsSync(modelPath)) {
    throw new Error(
      `LiteRT C++ model not found at ${modelPath}. Set LITERT_CPP_MODEL.`,
    );
  }

  const { command, args } = resolveBridgeCommand(binPath);
  const child = spawn(command, [...args, "--model_path", modelPath], {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let ready = false;
  let readyError = null;
  let backend = "litert-cpp";
  let model = modelPath;
  const pending = new Map();
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });

  const startupTimer = setTimeout(() => {
    const error = new Error(
      "LiteRT C++ bridge did not emit a JSON ready event. Raw litert_lm_main is not yet a drop-in Delfin sidecar.",
    );
    readyError = error;
    rejectReady(error);
    child.kill();
  }, bridgeReadyTimeoutMs);

  const flushPendingWithError = (message) => {
    for (const [requestId, handlers] of pending.entries()) {
      pending.delete(requestId);
      handlers.onError(message);
    }
  };

  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      if (!ready)
        console.warn("[litert-cpp-proxy] Non-JSON bridge output:", line);
      return;
    }

    if (event.type === "ready") {
      ready = true;
      backend = event.backend ?? backend;
      model = event.model ?? model;
      clearTimeout(startupTimer);
      resolveReady();
      return;
    }

    const handlers = pending.get(event.requestId);
    if (!handlers) return;
    if (event.type === "token") {
      handlers.onToken(event.text ?? "");
      return;
    }
    pending.delete(event.requestId);
    if (event.type === "done") {
      handlers.onDone(event);
      return;
    }
    if (event.type === "error" || event.type === "interrupted") {
      handlers.onError(event.message ?? "LiteRT C++ request failed.");
    }
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[litert-cpp-bridge] ${chunk}`);
  });

  child.once("exit", (code, signal) => {
    clearTimeout(startupTimer);
    ready = false;
    const message =
      readyError?.message ??
      `LiteRT C++ bridge exited unexpectedly (${signal ?? code ?? "unknown"}).`;
    if (!ready) rejectReady(new Error(message));
    flushPendingWithError(message);
  });

  return {
    async ready() {
      await readyPromise;
    },
    getInfo() {
      return { ready, backend, model };
    },
    async generate(request, handlers) {
      await readyPromise;
      pending.set(request.requestId, handlers);
      child.stdin.write(
        `${JSON.stringify({ type: "generate", ...request })}\n`,
      );
    },
    interrupt(requestId) {
      if (!ready || !requestId) return;
      child.stdin.write(
        `${JSON.stringify({ type: "interrupt", requestId })}\n`,
      );
    },
    resetSession(sessionId) {
      if (!ready || !sessionId) return;
      child.stdin.write(
        `${JSON.stringify({ type: "reset_session", sessionId })}\n`,
      );
    },
    async close() {
      clearTimeout(startupTimer);
      flushPendingWithError("LiteRT C++ bridge was closed.");
      child.kill();
    },
  };
}

export async function startLitertCppProxy(options = {}) {
  const host = options.host ?? process.env.SIDECAR_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.SIDECAR_PORT ?? "8321");
  const bridge = await (options.createBridge?.() ?? createStdioBridge());
  await bridge.ready();

  const sessions = new Map();
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      const info = bridge.getInfo();
      if (!info.ready) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "starting", backend: info.backend }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          backend: info.backend,
          model: info.model,
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit("connection", ws),
    );
  });

  wss.on("connection", (ws) => {
    const session = { sessionId: randomUUID(), activeRequestId: null };
    sessions.set(ws, session);

    ws.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.send(
          JSON.stringify({ type: "error", message: "Invalid JSON message." }),
        );
        return;
      }

      if (message.type === "interrupt") {
        bridge.interrupt(session.activeRequestId);
        return;
      }
      if (session.activeRequestId !== null) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "A LiteRT C++ request is already running.",
          }),
        );
        return;
      }

      const requestId = randomUUID();
      session.activeRequestId = requestId;

      try {
        await bridge.generate(
          {
            requestId,
            sessionId: session.sessionId,
            systemPrompt: resolvePreset(message.preset_id),
            message: buildUserMessage(message),
          },
          {
            onToken(text) {
              ws.send(JSON.stringify({ type: "token", text }));
            },
            onDone() {
              session.activeRequestId = null;
              ws.send(JSON.stringify({ type: "done" }));
            },
            onError(errorMessage) {
              session.activeRequestId = null;
              ws.send(JSON.stringify({ type: "error", message: errorMessage }));
            },
          },
        );
      } catch (error) {
        session.activeRequestId = null;
        ws.send(
          JSON.stringify({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "LiteRT C++ bridge request failed.",
          }),
        );
      }
    });

    ws.on("close", () => {
      bridge.interrupt(session.activeRequestId);
      bridge.resetSession(session.sessionId);
      sessions.delete(ws);
    });
  });

  await new Promise((resolvePromise) =>
    server.listen(port, host, resolvePromise),
  );
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;
  console.log(`[litert-cpp-proxy] Listening on http://${host}:${actualPort}`);

  return {
    host,
    port: actualPort,
    async close() {
      for (const client of wss.clients) client.close();
      await bridge.close();
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise(),
        );
      });
    },
  };
}

if (isDirectExecution()) {
  startLitertCppProxy()
    .then((proxy) => {
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(signal, async () => {
          await proxy.close();
          process.exit(0);
        });
      }
    })
    .catch((error) => {
      console.error("[litert-cpp-proxy] Failed to start:", error);
      process.exit(1);
    });
}
