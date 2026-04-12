import type { SidecarStatus, WsInboundMessage, WsInterruptMessage, WsOutboundMessage } from "../../shared/types";
export declare function connectToSidecar(wsUrl: string): void;
export declare function sendToSidecar(message: WsOutboundMessage | WsInterruptMessage): void;
export declare function onSidecarMessage(handler: (message: WsInboundMessage) => void): void;
export declare function onSidecarStatus(handler: (status: SidecarStatus) => void): void;
export declare function getSidecarStatus(): SidecarStatus;
export declare function disconnectFromSidecar(): void;
