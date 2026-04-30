import { readFile } from "node:fs/promises";
import { ipcMain } from "electron";
import {
  captureForegroundWindow,
  capturePrimaryScreen,
} from "../capture/captureService";
import { PresetId } from "../../shared/enums/presetId";
import { sendToSidecar } from "../sidecar/session/ws";
import { RENDERER_TO_MAIN_CHANNELS } from "../../shared/constants";
import type {
  SessionDetailRequest,
  SessionDeleteRequest,
  SessionMessageImageRequest,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionStopRequest,
} from "../../shared/types";
import type { RegisterIpcHandlersOptions } from "./types";

export function registerSessionIpcHandlers(
  options: RegisterIpcHandlersOptions,
): void {
  ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_START,
    async (
      _event,
      request: SessionStartRequest,
    ): Promise<SessionStartResponse> => {
      const sessionName = request.sessionName.trim();

      if (sessionName.length === 0) {
        throw new Error("Session name cannot be empty.");
      }

      const response = await options.sidecarSessionClient.createSession({
        sessionName,
        presetId: PresetId.LectureSlide,
      });
      await options.switchOverlayMode("minimized-compact");
      return response;
    },
  );

  ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_STOP,
    async (_event, request: SessionStopRequest) => {
      await options.sidecarSessionClient.endSession(request.sessionId);
      await options.switchOverlayMode("expanded");
    },
  );

  ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT,
    async (
      _event,
      request: SessionPromptRequest,
    ): Promise<SessionPromptResponse> => {
      const mainWindow = options.getMainWindow();

      if (mainWindow === null || mainWindow.isDestroyed()) {
        throw new Error("Main window is not available.");
      }

      const text = request.text.trim();
      const isVoiceTurn = Boolean(request.audio);

      // Allow submission when audio is present even if text is the voice constant.
      // Block only genuinely empty, non-audio submissions.
      if (text.length === 0 && !isVoiceTurn) {
        throw new Error("Prompt cannot be empty.");
      }

      const frame =
        options.getOverlayState().mode === "expanded"
          ? await captureForegroundWindow()
          : await capturePrimaryScreen();

      try {
        sendToSidecar({
          session_id: request.sessionId,
          image: frame.imageBase64,
          text,
          preset_id: request.presetId,
          ...(request.audio !== undefined ? { audio: request.audio } : {}),
        });
      } catch (error) {
        throw error;
      }

      return {
        messageId: request.messageId,
        imageDataUrl: `data:image/jpeg;base64,${frame.imageBase64}`,
      };
    },
  );

  ipcMain.handle(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST, async () =>
    options.sidecarSessionClient.listSessions(),
  );

  ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL,
    async (_event, request: SessionDetailRequest) =>
      options.sidecarSessionClient.getSessionDetail(request.sessionId),
  );

  ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE,
    async (_event, request: SessionDeleteRequest) =>
      options.sidecarSessionClient.deleteSession(request.sessionId),
  );

  ipcMain.handle(
    RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE,
    async (_event, request: SessionMessageImageRequest) => {
      const image = await readFile(request.imagePath);
      return `data:image/jpeg;base64,${image.toString("base64")}`;
    },
  );
}
