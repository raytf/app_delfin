import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
const streamingTtsSoftMinChars = Number(process.env.LITERT_CPP_TTS_SOFT_MIN_CHARS ?? "80");
const streamingTtsSoftMaxChars = Number(process.env.LITERT_CPP_TTS_SOFT_MAX_CHARS ?? "180");

function sendJson(ws, payload) {
  if (ws.readyState !== 1) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

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


function normalizeTtsSegment(text) {
  return text.replace(/\s+/g, " ").trim();
}

function splitCompleteSentences(buffer, options = {}) {
  const segments = [];
  let cursor = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char !== "." && char !== "!" && char !== "?") continue;

    const previous = buffer[index - 1] ?? "";
    const next = buffer[index + 1] ?? "";
    if (/^[0-9]$/.test(previous) && /^[0-9]$/.test(next)) continue;

    let end = index + 1;
    while (end < buffer.length && "\"')]}".includes(buffer[end])) {
      end += 1;
    }

    if (end < buffer.length && !/\s/.test(buffer[end])) continue;

    const segment = normalizeTtsSegment(buffer.slice(cursor, end));
    if (segment) segments.push(segment);

    cursor = end;
    while (cursor < buffer.length && /\s/.test(buffer[cursor])) cursor += 1;
    index = cursor - 1;
  }

  const remaining = buffer.slice(cursor);
  if (options.flush) {
    const finalSegment = normalizeTtsSegment(remaining);
    if (finalSegment) segments.push(finalSegment);
    return { segments, remaining: "" };
  }

  const softMaxChars = Number(options.softMaxChars ?? 0);
  const softMinChars = Number(options.softMinChars ?? Math.floor(softMaxChars / 2));
  if (softMaxChars > 0 && remaining.length >= softMaxChars) {
    let cut = remaining.lastIndexOf(" ", softMaxChars);
    if (cut < softMinChars) cut = remaining.indexOf(" ", softMinChars);
    if (cut >= softMinChars) {
      const segment = normalizeTtsSegment(remaining.slice(0, cut));
      if (segment) segments.push(segment);
      return { segments, remaining: remaining.slice(cut).trimStart() };
    }
  }

  return { segments, remaining };
}

function createNoopTtsBackend(info = {}) {
  return {
    getInfo() {
      return {
        backend: info.backend ?? "none",
        ready: false,
        model: info.model ?? null,
        error: info.error ?? null,
      };
    },
    start() {
      return null;
    },
    startStream() {
      return null;
    },
    async close() {},
  };
}

function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readPiperSampleRate(configPath, env = process.env) {
  const envSampleRate = parsePositiveNumber(env.PIPER_SAMPLE_RATE);
  if (envSampleRate !== null) return envSampleRate;

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const configSampleRate = parsePositiveNumber(
    config?.audio?.sample_rate ?? config?.audio?.sampleRate,
  );
  if (configSampleRate !== null) return configSampleRate;

  return 22050;
}

function resolveLitertCppTtsConfig() {
  const requestedBackend =
    process.env.LITERT_CPP_TTS_BACKEND?.trim().toLowerCase() ?? "none";

  if (requestedBackend === "" || requestedBackend === "none") {
    return { backend: "none", ready: false, model: null, error: null };
  }

  if (requestedBackend !== "piper") {
    return {
      backend: requestedBackend,
      ready: false,
      model: null,
      error: `Unknown LITERT_CPP_TTS_BACKEND=${requestedBackend}.`,
    };
  }

  const defaultBin = resolve(
    rootDir,
    "bin",
    "piper",
    "venv",
    process.platform === "win32" ? "Scripts/piper.exe" : "bin/piper",
  );
  const rawBinPath = process.env.PIPER_BIN ?? defaultBin;
  const binPath = resolve(rootDir, rawBinPath);
  if (!existsSync(binPath)) {
    return {
      backend: "piper",
      ready: false,
      model: null,
      error: `Piper binary not found at ${binPath}. Set PIPER_BIN.`,
    };
  }

  const rawModelPath = process.env.PIPER_MODEL;
  if (!rawModelPath) {
    return {
      backend: "piper",
      ready: false,
      model: null,
      error: "PIPER_MODEL is required when LITERT_CPP_TTS_BACKEND=piper.",
    };
  }

  const modelPath = resolve(rootDir, rawModelPath);
  if (!existsSync(modelPath)) {
    return {
      backend: "piper",
      ready: false,
      model: modelPath,
      error: `Piper model not found at ${modelPath}. Set PIPER_MODEL.`,
    };
  }

  const configPath = resolve(
    rootDir,
    process.env.PIPER_CONFIG ?? `${modelPath}.json`,
  );
  if (!existsSync(configPath)) {
    return {
      backend: "piper",
      ready: false,
      model: modelPath,
      error: `Piper config not found at ${configPath}. Set PIPER_CONFIG.`,
    };
  }

  let sampleRate;
  try {
    sampleRate = readPiperSampleRate(configPath);
  } catch (error) {
    return {
      backend: "piper",
      ready: false,
      model: modelPath,
      error: `Piper config could not be read at ${configPath}: ${error.message}`,
    };
  }

  return {
    backend: "piper",
    ready: true,
    model: modelPath,
    error: null,
    binPath,
    configPath,
    sampleRate,
  };
}

function createPiperTtsBackend(config, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;

  function startStream(handlers) {
    if (!config.ready) return null;

    const { command, args } = resolveBridgeCommand(config.binPath);
    const child = spawnProcess(
      command,
      [...args, "--model", config.model, "--config", config.configPath, "--output-raw"],
      {
        cwd: rootDir,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const startedAt = Date.now();
    let emittedAudio = false;
    let cancelled = false;
    let finishedInput = false;
    let chunkIndex = 0;
    const stderrChunks = [];

    const promise = new Promise((resolvePromise, rejectPromise) => {
      child.once("error", (error) => {
        rejectPromise(error);
      });

      child.stdin.on("error", (error) => {
        if (!cancelled) rejectPromise(error);
      });

      child.stderr.on("data", (chunk) => {
        stderrChunks.push(chunk.toString());
        process.stderr.write(`[piper] ${chunk}`);
      });

      child.stdout.on("data", (chunk) => {
        if (!chunk.length) return;
        if (!emittedAudio) {
          emittedAudio = true;
          handlers.onStart({
            sampleRate: config.sampleRate,
            sentenceCount: 0,
          });
        }
        handlers.onChunk({
          audio: Buffer.from(chunk).toString("base64"),
          index: chunkIndex++,
        });
      });

      child.once("exit", (code, signal) => {
        if (cancelled) {
          resolvePromise(false);
          return;
        }

        if (code === 0) {
          if (emittedAudio) {
            handlers.onEnd({ ttsTime: (Date.now() - startedAt) / 1000 });
          }
          resolvePromise(emittedAudio);
          return;
        }

        const details = stderrChunks.join("").trim();
        rejectPromise(
          new Error(
            `Piper exited unexpectedly (${signal ?? code ?? "unknown"})${details ? `: ${details}` : "."}`,
          ),
        );
      });
    });

    return {
      promise,
      enqueue(text) {
        const normalizedText = normalizeTtsSegment(text);
        if (!normalizedText || cancelled || finishedInput) return;
        child.stdin.write(`${normalizedText}\n`);
      },
      finish() {
        if (cancelled || finishedInput) return;
        finishedInput = true;
        child.stdin.end();
      },
      cancel() {
        cancelled = true;
        if (!finishedInput) {
          finishedInput = true;
          child.stdin.destroy();
        }
        child.kill();
      },
    };
  }

  return {
    getInfo() {
      return {
        backend: config.backend,
        ready: config.ready,
        model: config.model,
        error: config.error,
      };
    },
    start(text, handlers) {
      const normalizedText = text.trim();
      if (!config.ready || !normalizedText) return null;

      const run = startStream(handlers);
      if (!run) return null;
      run.enqueue(normalizedText);
      run.finish();

      return {
        promise: run.promise,
        cancel() {
          run.cancel();
        },
      };
    },
    startStream,
    async close() {},
  };
}

function createTtsBackend(options = {}) {
  const config = resolveLitertCppTtsConfig();
  if (config.backend !== "piper") {
    return createNoopTtsBackend(config);
  }
  if (!config.ready) {
    return createNoopTtsBackend(config);
  }
  return createPiperTtsBackend(config, options);
}

function createErroredBridge(message, options = {}) {
  const error = message instanceof Error ? message : new Error(message);
  const backend = options.backend ?? "litert-cpp";
  const model = options.model ?? null;

  return {
    async ready() {
      throw error;
    },
    getInfo() {
      return { ready: false, backend, model, error: error.message };
    },
    async generate(_request, handlers) {
      handlers.onError(error.message);
    },
    interrupt() {},
    resetSession() {},
    async close() {},
  };
}

function createStdioBridge() {
  const defaultBin = resolve(
    rootDir,
    "bin",
    process.platform === "win32"
      ? "delfin_litert_bridge.exe"
      : "delfin_litert_bridge",
  );
  const defaultModel = resolve(
    rootDir,
    "models",
    process.env.MODEL_FILE ?? "gemma-4-E2B-it.litertlm",
  );
  const binPath = resolve(process.env.LITERT_CPP_BIN ?? defaultBin);
  const modelPath = resolve(process.env.LITERT_CPP_MODEL ?? defaultModel);

  if (!existsSync(binPath)) {
    return createErroredBridge(
      `LiteRT C++ bridge binary not found at ${binPath}. Set LITERT_CPP_BIN.`,
      { model: modelPath },
    );
  }
  if (!existsSync(modelPath)) {
    return createErroredBridge(
      `LiteRT C++ model not found at ${modelPath}. Set LITERT_CPP_MODEL.`,
      { model: modelPath },
    );
  }

  const { command, args } = resolveBridgeCommand(binPath);
  const binDir = dirname(binPath);
  // Set library path so the bridge can find libGemmaModelConstraintProvider.so/.dylib/.dll
  const env = { ...process.env };
  if (process.platform === "linux") {
    env.LD_LIBRARY_PATH = [binDir, env.LD_LIBRARY_PATH ?? ""].filter(Boolean).join(":");
  } else if (process.platform === "darwin") {
    env.DYLD_LIBRARY_PATH = [binDir, env.DYLD_LIBRARY_PATH ?? ""].filter(Boolean).join(":");
  }
  const child = spawn(command, [...args, "--model_path", modelPath], {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "pipe"],
    env,
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
  readyPromise.catch(() => {});

  const startupTimer = setTimeout(() => {
    const error = new Error(
      "LiteRT C++ bridge did not emit a JSON ready event within the timeout. Ensure LITERT_CPP_BIN points at delfin_litert_bridge[.exe] built from native/litert-cpp-bridge/ — the upstream litert_lm_main demo binary does not speak the Delfin JSONL protocol.",
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
    readyError ??= new Error(message);
    if (!ready) rejectReady(new Error(message));
    flushPendingWithError(message);
  });

  return {
    async ready() {
      await readyPromise;
    },
    getInfo() {
      return { ready, backend, model, error: readyError?.message ?? null };
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
  let bridge;
  let tts;
  try {
    bridge = await (options.createBridge?.() ?? createStdioBridge());
  } catch (error) {
    bridge = createErroredBridge(
      error instanceof Error ? error.message : "LiteRT C++ bridge failed to start.",
    );
  }
  try {
    tts = await (options.createTtsBackend?.() ?? createTtsBackend());
  } catch (error) {
    tts = createNoopTtsBackend({
      backend: process.env.LITERT_CPP_TTS_BACKEND?.trim().toLowerCase() ?? "none",
      error:
        error instanceof Error
          ? error.message
          : "LiteRT C++ proxy TTS backend failed to start.",
    });
  }
  void bridge.ready().catch((error) => {
    console.error(
      "[litert-cpp-proxy] Bridge unavailable:",
      error instanceof Error ? error.message : error,
    );
  });

  const sessions = new Map();
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      const info = bridge.getInfo();
      const ttsInfo = tts.getInfo();
      if (!info.ready) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: info.error ? "error" : "starting",
            backend: info.backend,
            ...(info.model ? { model: info.model } : {}),
            ...(info.error ? { message: info.error } : {}),
            tts_backend: ttsInfo.backend,
            tts_ready: ttsInfo.ready,
            ...(ttsInfo.model ? { tts_model: ttsInfo.model } : {}),
            ...(ttsInfo.error ? { tts_error: ttsInfo.error } : {}),
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          backend: info.backend,
          model: info.model,
          tts_backend: ttsInfo.backend,
          tts_ready: ttsInfo.ready,
          ...(ttsInfo.model ? { tts_model: ttsInfo.model } : {}),
          ...(ttsInfo.error ? { tts_error: ttsInfo.error } : {}),
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
    const session = {
      sessionId: randomUUID(),
      activeRequestId: null,
      activeTtsRun: null,
    };
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
        session.activeTtsRun?.cancel();
        bridge.interrupt(session.activeRequestId);
        return;
      }
      if (session.activeRequestId !== null) {
        sendJson(ws, {
          type: "error",
          message: "A LiteRT C++ request is already running.",
        });
        return;
      }

      const requestId = randomUUID();
      session.activeRequestId = requestId;
      let streamedText = "";
      let ttsBuffer = "";
      let streamingTtsRun = null;

      const audioHandlers = {
        onStart(payload) {
          sendJson(ws, {
            type: "audio_start",
            sample_rate: payload.sampleRate,
            sentence_count: payload.sentenceCount,
          });
        },
        onChunk(payload) {
          sendJson(ws, {
            type: "audio_chunk",
            audio: payload.audio,
            index: payload.index,
          });
        },
        onEnd(payload) {
          sendJson(ws, {
            type: "audio_end",
            tts_time: payload.ttsTime,
          });
        },
      };

      const ensureStreamingTtsRun = () => {
        if (streamingTtsRun || typeof tts.startStream !== "function") {
          return streamingTtsRun;
        }

        const run = tts.startStream(audioHandlers);
        if (!run) return null;

        streamingTtsRun = run;
        session.activeTtsRun = run;
        run.promise.catch(() => {});
        return run;
      };

      const enqueueStreamingTtsText = (text, options = {}) => {
        if (!streamingTtsRun) return;

        ttsBuffer += text;
        const result = splitCompleteSentences(ttsBuffer, options);
        ttsBuffer = result.remaining;
        for (const segment of result.segments) {
          streamingTtsRun.enqueue(segment);
        }
      };

      const awaitTtsRun = async (run) => {
        if (!run) return;

        try {
          await run.promise;
        } catch (error) {
          console.warn(
            "[litert-cpp-proxy] Piper synthesis failed:",
            error instanceof Error ? error.message : error,
          );
        } finally {
          if (session.activeTtsRun === run) {
            session.activeTtsRun = null;
          }
        }
      };

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
              streamedText += text;
              sendJson(ws, { type: "token", text });

              if (text.trim()) ensureStreamingTtsRun();
              enqueueStreamingTtsText(text, {
                softMinChars: streamingTtsSoftMinChars,
                softMaxChars: streamingTtsSoftMaxChars,
              });
            },
            async onDone() {
              try {
                const finalText = streamedText;

                if (streamingTtsRun) {
                  enqueueStreamingTtsText("", { flush: true });
                  streamingTtsRun.finish();
                  await awaitTtsRun(streamingTtsRun);
                } else {
                  const run = tts.start(finalText, audioHandlers);
                  if (run) {
                    session.activeTtsRun = run;
                    await awaitTtsRun(run);
                  }
                }
              } finally {
                session.activeRequestId = null;
                sendJson(ws, { type: "done" });
              }
            },
            onError(errorMessage) {
              session.activeTtsRun?.cancel();
              session.activeTtsRun = null;
              session.activeRequestId = null;
              sendJson(ws, { type: "error", message: errorMessage });
            },
          },
        );
      } catch (error) {
        session.activeTtsRun?.cancel();
        session.activeTtsRun = null;
        session.activeRequestId = null;
        sendJson(ws, {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "LiteRT C++ bridge request failed.",
        });
      }
    });

    ws.on("close", () => {
      session.activeTtsRun?.cancel();
      session.activeTtsRun = null;
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
      await tts.close();
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
