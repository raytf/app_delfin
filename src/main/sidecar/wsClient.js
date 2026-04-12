import WebSocket from "ws";
import { wsInboundMessageSchema } from "../../shared/schemas";
let socket = null;
let reconnectTimer = null;
let currentUrl = "";
let messageHandler = null;
let statusHandler = null;
let currentStatus = { connected: false };
function emitStatus(status) {
    currentStatus = status;
    statusHandler?.(status);
}
function scheduleReconnect() {
    if (!currentUrl || reconnectTimer !== null) {
        return;
    }
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToSidecar(currentUrl);
    }, 2000);
}
export function connectToSidecar(wsUrl) {
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
        const raw = data.toString();
        try {
            const parsed = wsInboundMessageSchema.parse(JSON.parse(raw));
            messageHandler?.(parsed);
        }
        catch (error) {
            console.error("[wsClient] Failed to parse sidecar message:", error);
            console.error("[wsClient] Raw payload that failed:", raw.substring(0, 500));
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
export function sendToSidecar(message) {
    if (socket?.readyState !== WebSocket.OPEN) {
        throw new Error("Sidecar WebSocket is not connected.");
    }
    socket.send(JSON.stringify(message));
}
export function onSidecarMessage(handler) {
    messageHandler = handler;
}
export function onSidecarStatus(handler) {
    statusHandler = handler;
}
export function getSidecarStatus() {
    return currentStatus;
}
export function disconnectFromSidecar() {
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    currentUrl = "";
    socket?.close();
    socket = null;
    currentStatus = { connected: false };
}
