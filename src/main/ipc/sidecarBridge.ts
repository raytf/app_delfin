import { ipcMain } from "electron";
import {
  MAIN_TO_RENDERER_CHANNELS,
  RENDERER_TO_MAIN_CHANNELS,
} from "../../shared/constants";
import {
  connectToSidecar,
  onSidecarMessage,
  sendToSidecar,
} from "../sidecar/session/ws";
import type { SidecarSessionStreamMessage } from "../../shared/schemas/sidecar";
import type { RegisterIpcHandlersOptions } from "./types";

export function registerSidecarBridge(
  options: RegisterIpcHandlersOptions,
): void {
  connectToSidecar(options.sidecarWsUrl);

  ipcMain.on(
    RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT,
    (_event, request?: { requestId?: string }) => {
      const requestId = request?.requestId;
      if (typeof requestId !== "string" || requestId.trim().length === 0) {
        return;
      }

      try {
        sendToSidecar({ type: "interrupt", requestId });
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
    },
  );

  onSidecarMessage(async (message: SidecarSessionStreamMessage) => {
    const mainWindow = options.getMainWindow();

    if (mainWindow === null || mainWindow.isDestroyed()) {
      return;
    }

    try {
      switch (message.type) {
        case "token":
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, {
            requestId: message.requestId ?? "",
            text: message.text ?? "",
          });
          return;
        case "audio_start":
          mainWindow.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START,
            {
              requestId: message.requestId ?? "",
              sampleRate: message.sample_rate ?? 24_000,
              sentenceCount: message.sentence_count ?? 0,
            },
          );
          return;
        case "audio_chunk":
          if (message.audio !== undefined) {
            mainWindow.webContents.send(
              MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK,
              {
                requestId: message.requestId ?? "",
                audio: message.audio,
                index: message.index,
              },
            );
          }
          return;
        case "audio_end":
          mainWindow.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END,
            {
              requestId: message.requestId ?? "",
              ttsTime: message.tts_time ?? 0,
            },
          );
          return;
        case "done":
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE, {
            requestId: message.requestId ?? "",
            interrupted: message.interrupted ?? false,
          });
          return;
        case "error":
          mainWindow.webContents.send(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, {
            ...(message.requestId !== undefined
              ? { requestId: message.requestId }
              : {}),
            message: message.message ?? "Unknown error",
          });
          return;
      }
    } catch (error) {
      console.error(
        "[sidecarBridge] Failed to forward sidecar message:",
        error,
      );
    }
  });
}
