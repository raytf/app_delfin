import { ipcMain } from "electron";
import {
  wsInterruptMessageSchema,
  wsOutboundMessageSchema,
} from "../../shared/schemas";
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
} from "../../shared/types";
import {
  connectToSidecar,
  onSidecarMessage,
  onSidecarStatus,
  sendToSidecar,
} from "../sidecar/wsClient";
import type { RegisterIpcHandlersOptions } from "./types";

export function registerSidecarBridge(
  options: RegisterIpcHandlersOptions,
): void {
  connectToSidecar(options.sidecarWsUrl);

  ipcMain.on(RENDERER_TO_MAIN_CHANNELS.SIDECAR_SEND, (_event, message) => {
    try {
      const parsed = wsOutboundMessageSchema.parse(message);
      sendToSidecar(parsed);
    } catch (error) {
      const mainWindow = options.getMainWindow();
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, {
          message:
            error instanceof Error
              ? error.message
              : "Failed to send message to sidecar.",
        });
      }
    }
  });

  ipcMain.on(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT, () => {
    try {
      const parsed = wsInterruptMessageSchema.parse({ type: "interrupt" });
      sendToSidecar(parsed);
    } catch (error) {
      const mainWindow = options.getMainWindow();
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, {
          message:
            error instanceof Error
              ? error.message
              : "Failed to interrupt sidecar.",
        });
      }
    }
  });

  onSidecarMessage(async (message) => {
    const mainWindow = options.getMainWindow();

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return;
    }

    try {
      switch (message.type) {
        case "token":
          await options.sessionPersistence.appendAssistantToken(
            message.text ?? "",
          );
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, {
            text: message.text ?? "",
          });
          return;
        case "audio_start":
          mainWindow.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START,
            {
              sampleRate: message.sample_rate ?? 24_000,
              sentenceCount: message.sentence_count ?? 0,
            },
          );
          return;
        case "audio_chunk":
          if (message.audio !== undefined) {
            mainWindow.webContents.send(
              MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK,
              { audio: message.audio, index: message.index },
            );
          }
          return;
        case "audio_end":
          mainWindow.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END,
            { ttsTime: message.tts_time ?? 0 },
          );
          return;
        case "done":
          await options.sessionPersistence.finishAssistantResponse();
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE);
          return;
        case "error":
          await options.sessionPersistence.failAssistantResponse(
            message.message ?? "Unknown error",
          );
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, {
            message: message.message ?? "Unknown error",
          });
          return;
        case "memory_progress":
          // Forward memory progress updates to renderer
          mainWindow.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_MEMORY_PROGRESS,
            message,
          );
          return;
      }
    } catch (error) {
      console.error(
        "[sidecarBridge] Failed to persist sidecar message:",
        error,
      );
    }
  });

  onSidecarStatus((status) => {
    const mainWindow = options.getMainWindow();

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(
      MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS,
      status,
    );
  });
}
