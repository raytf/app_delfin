import WebSocket from "ws";
import { sidecarSessionInboundMessageSchema } from "../../../shared/schemas";
import type { SidecarSessionStreamMessage } from "../../../shared/schemas/sidecar";

type SidecarSessionPromptMessage = {
  type?: "turn";
  requestId: string;
  sessionId: string;
  text?: string | null;
  presetId: string;
  imageBase64?: string | null;
  audioBase64?: string | null;
};

type SidecarSessionInterruptMessage = {
  type: "interrupt";
  requestId: string;
};

let socket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let currentUrl: string = "";
let messageHandler: ((message: SidecarSessionStreamMessage) => void) | null =
  null;

function scheduleReconnect(): void {
  if (!currentUrl || reconnectTimer !== null) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToSidecar(currentUrl);
  }, 2000);
}

export function connectToSidecar(wsUrl: string): void {
  currentUrl = wsUrl;

  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    return;
  }

  socket = new WebSocket(wsUrl);

  socket.on("open", () => {
    console.log(`Connected to FastAPI sidecar WebSocket at ${wsUrl}`);
  });

  socket.on("message", (data) => {
    const raw = data.toString();
    try {
      const parsed = sidecarSessionInboundMessageSchema.parse(JSON.parse(raw));
      messageHandler?.(parsed);
    } catch (error) {
      console.error("[wsClient] Failed to parse sidecar message:", error);
      console.error(
        "[wsClient] Raw payload that failed:",
        raw.substring(0, 500),
      );
    }
  });

  socket.on("close", () => {
    socket = null;
    scheduleReconnect();
  });

  socket.on("error", (error) => {
    console.error("Sidecar WebSocket error:", error.message);
  });
}

export function sendToSidecar(
  message: SidecarSessionPromptMessage | SidecarSessionInterruptMessage,
): void {
  if (socket?.readyState !== WebSocket.OPEN) {
    throw new Error("Sidecar WebSocket is not connected.");
  }

  socket.send(JSON.stringify(message));
}

export function onSidecarMessage(
  handler: (message: SidecarSessionStreamMessage) => void,
): void {
  messageHandler = handler;
}

export function disconnectFromSidecar(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  currentUrl = "";
  socket?.close();
  socket = null;
}
