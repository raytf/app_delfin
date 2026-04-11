import { MAIN_TO_RENDERER_CHANNELS } from "../../shared/types";
import {
  connectToSidecar,
  onSidecarMessage,
  onSidecarStatus,
} from "../sidecar/wsClient";
import type { RegisterIpcHandlersOptions } from "./types";

export function registerSidecarBridge(
  options: RegisterIpcHandlersOptions,
): void {
  connectToSidecar(options.sidecarWsUrl);

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
          );
          return;
        case "audio_chunk":
          if (message.audio !== undefined) {
            mainWindow.webContents.send(
              MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK,
              { audio: message.audio },
            );
          }
          return;
        case "audio_end":
          mainWindow.webContents.send(
            MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END,
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
