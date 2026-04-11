import WebSocket from "ws";
import { wsInboundMessageSchema } from "../../shared/schemas";
import type {
  SidecarStatus,
  WsInboundMessage,
  WsInterruptMessage,
  WsOutboundMessage,
} from "../../shared/types";

let socket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let currentUrl: string = "";
let messageHandler: ((message: WsInboundMessage) => void) | null = null;
let statusHandler: ((status: SidecarStatus) => void) | null = null;
let currentStatus: SidecarStatus = { connected: false };

function emitStatus(status: SidecarStatus): void {
  currentStatus = status;
  statusHandler?.(status);
}

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
    emitStatus({ connected: true });
  });

  socket.on("message", (data) => {
    try {
      const parsed = wsInboundMessageSchema.parse(JSON.parse(data.toString()));
      messageHandler?.(parsed);
    } catch (error) {
      console.error("Failed to parse sidecar message:", error);
    }
  });

  socket.on("close", () => {
    emitStatus({ connected: false });
    socket = null;
    scheduleReconnect();
  });

  socket.on("error", (error) => {
    console.error("Sidecar WebSocket error:", error.message);
    emitStatus({ connected: false });
  });
}

export function sendToSidecar(
  message: WsOutboundMessage | WsInterruptMessage,
): void {
  if (socket?.readyState !== WebSocket.OPEN) {
    throw new Error("Sidecar WebSocket is not connected.");
  }

  socket.send(JSON.stringify(message));
}

export function onSidecarMessage(
  handler: (message: WsInboundMessage) => void,
): void {
  messageHandler = handler;
}

export function onSidecarStatus(
  handler: (status: SidecarStatus) => void,
): void {
  statusHandler = handler;
}

export function getSidecarStatus(): SidecarStatus {
  return currentStatus;
}

export function disconnectFromSidecar(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  currentUrl = "";
  socket?.close();
  socket = null;
  currentStatus = { connected: false };
}
