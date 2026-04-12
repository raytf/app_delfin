export interface CaptureFrame {
    imageBase64: string;
    width: number;
    height: number;
    capturedAt: number;
    sourceLabel: string;
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    latencyMs?: number;
    isVoiceTurn?: boolean;
    imagePath?: string;
}
export interface WsOutboundMessage {
    image?: string;
    text: string;
    preset_id: string;
    audio?: string;
}
export interface SessionPromptRequest {
    messageId: string;
    text: string;
    presetId: PresetId;
    audio?: string;
}
export interface SessionStartRequest {
    sessionName: string;
}
export interface SessionPromptResponse {
    imagePath: string;
    messageId: string;
}
export interface SessionMessageImageRequest {
    imagePath: string;
}
export interface SessionDetailRequest {
    sessionId: string;
}
export interface SessionDeleteRequest {
    sessionId: string;
}
export interface EndedSessionSnapshot {
    sessionName: string;
    duration: number;
    messageCount: number;
}
export interface SessionStopRequest {
    endedSessionData: EndedSessionSnapshot | null;
}
export interface WsInterruptMessage {
    type: 'interrupt';
}
export type WsInboundType = 'token' | 'audio_start' | 'audio_chunk' | 'audio_end' | 'done' | 'error';
export interface WsInboundMessage {
    type: WsInboundType;
    text?: string;
    audio?: string;
    message?: string;
    /** Present on audio_start — sample rate of the PCM stream (e.g. 24000). */
    sample_rate?: number;
    /** Present on audio_start — number of sentences being synthesised. */
    sentence_count?: number;
    /** Present on audio_chunk — zero-based sentence index. */
    index?: number;
    /** Present on audio_end — total TTS synthesis time in seconds. */
    tts_time?: number;
}
export declare const RENDERER_TO_MAIN_CHANNELS: {
    readonly CAPTURE_NOW: "capture:now";
    readonly CAPTURE_AUTO_REFRESH: "capture:auto-refresh";
    readonly SIDECAR_SEND: "sidecar:send";
    readonly SIDECAR_INTERRUPT: "sidecar:interrupt";
    readonly OVERLAY_GET_STATE: "overlay:get-state";
    readonly OVERLAY_MINIMIZE: "overlay:minimize";
    readonly OVERLAY_RESTORE: "overlay:restore";
    readonly OVERLAY_SET_MINIMIZED_VARIANT: "overlay:set-minimized-variant";
    readonly OVERLAY_CLEAR_ENDED_SESSION: "overlay:clear-ended-session";
    readonly SESSION_START: "session:start";
    readonly SESSION_STOP: "session:stop";
    readonly SESSION_SUBMIT_PROMPT: "session:submit-prompt";
    readonly SESSION_LIST: "session:list";
    readonly SESSION_GET_DETAIL: "session:get-detail";
    readonly SESSION_DELETE: "session:delete";
    readonly SESSION_GET_MESSAGE_IMAGE: "session:get-message-image";
};
export declare const MAIN_TO_RENDERER_CHANNELS: {
    readonly FRAME_CAPTURED: "frame:captured";
    readonly OVERLAY_ERROR: "overlay:error";
    readonly SIDECAR_TOKEN: "sidecar:token";
    readonly SIDECAR_AUDIO_START: "sidecar:audio_start";
    readonly SIDECAR_AUDIO_CHUNK: "sidecar:audio_chunk";
    readonly SIDECAR_AUDIO_END: "sidecar:audio_end";
    readonly SIDECAR_DONE: "sidecar:done";
    readonly SIDECAR_ERROR: "sidecar:error";
    readonly SIDECAR_STATUS: "sidecar:status";
};
export type PresetId = 'lecture-slide' | 'generic-screen';
export interface Preset {
    id: PresetId;
    label: string;
    starterQuestions: string[];
}
export interface SidecarStatus {
    connected: boolean;
    backend?: string;
    model?: string;
    visionTokens?: string;
}
export type PersistedSessionStatus = 'active' | 'completed' | 'failed' | 'aborted';
export interface SessionListItem {
    id: string;
    startedAt: number;
    endedAt: number | null;
    status: PersistedSessionStatus;
    presetId: PresetId | null;
    sessionName: string;
    sourceLabel: string | null;
    messageCount: number;
    lastUpdatedAt: number;
}
export interface SessionDetail {
    session: SessionListItem;
    messages: ChatMessage[];
}
export type OverlayMode = 'expanded' | 'minimized';
export type MinimizedOverlayVariant = 'compact' | 'prompt-input' | 'prompt-response';
export type SessionMode = 'home' | 'active';
export interface OverlayState {
    overlayMode: OverlayMode;
    minimizedVariant: MinimizedOverlayVariant;
    sessionMode: SessionMode;
    endedSessionData: EndedSessionSnapshot | null;
}
export interface ElectronAPI {
    /** True when VOICE_ENABLED=true in .env. Read synchronously by renderer. */
    voiceEnabled: boolean;
    /** True when TTS_ENABLED=true in .env. Used by renderer fallback logic. */
    ttsEnabled: boolean;
    captureNow: () => Promise<void>;
    captureAutoRefresh: (config: {
        enabled: boolean;
        intervalMs: number;
    }) => void;
    sidecarSend: (msg: WsOutboundMessage) => void;
    sidecarInterrupt: () => void;
    getOverlayState: () => Promise<OverlayState>;
    startSession: (request: SessionStartRequest) => Promise<void>;
    stopSession: (request: SessionStopRequest) => Promise<void>;
    submitSessionPrompt: (request: SessionPromptRequest) => Promise<SessionPromptResponse>;
    listSessions: () => Promise<SessionListItem[]>;
    getSessionDetail: (request: SessionDetailRequest) => Promise<SessionDetail>;
    deleteSession: (request: SessionDeleteRequest) => Promise<void>;
    getSessionMessageImage: (request: SessionMessageImageRequest) => Promise<string>;
    minimizeOverlay: () => Promise<void>;
    restoreOverlay: () => Promise<void>;
    setMinimizedOverlayVariant: (variant: MinimizedOverlayVariant) => Promise<void>;
    clearEndedSession: () => Promise<void>;
    onFrameCaptured: (cb: (frame: CaptureFrame) => void) => void;
    onOverlayError: (cb: (data: {
        message: string;
    }) => void) => void;
    onSidecarToken: (cb: (data: {
        text: string;
    }) => void) => void;
    onSidecarAudioStart: (cb: (data: {
        sampleRate: number;
        sentenceCount: number;
    }) => void) => void;
    onSidecarAudioChunk: (cb: (data: {
        audio: string;
        index?: number;
    }) => void) => void;
    onSidecarAudioEnd: (cb: (data: {
        ttsTime: number;
    }) => void) => void;
    onSidecarDone: (cb: () => void) => void;
    onSidecarError: (cb: (data: {
        message: string;
    }) => void) => void;
    onSidecarStatus: (cb: (data: SidecarStatus) => void) => void;
    removeAllListeners: (channel: string) => void;
}
