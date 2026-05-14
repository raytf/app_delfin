import type { Nullable } from "../types/object";

export type TurnContent =
  | { type: "text"; text: string }
  | { type: "image"; blob: string }
  | { type: "audio"; blob: string };

export type TurnMessage = {
  role: "user" | "model" | "system";
  content: TurnContent[];
};

export type RunTurnInput = {
  requestId: string;
  conversationId: string;
  systemPrompt: string;
  message: TurnMessage;
};

export type CreateConversationInput = {
  conversationId: string;
  systemPrompt: string;
};

export type TurnDoneOutput = {
  text: string;
  message: TurnMessage;
};

export type RunTurnHandlers = {
  onToken: (text: string) => void;
  onDone: (output: TurnDoneOutput) => void;
  onError: (message: string) => void;
};

export type InferenceEngineInfo = {
  ready: boolean;
  backend: string;
  model: Nullable<string>;
  error: Nullable<string>;
};

export interface InferenceEngine {
  ready(): Promise<void>;
  getInfo(): InferenceEngineInfo;
  createConversation(input: CreateConversationInput): Promise<void>;
  dropConversation(conversationId: string): Promise<void>;
  runTurn(input: RunTurnInput, handlers: RunTurnHandlers): Promise<void>;
  interruptTurn(requestId: Nullable<string>): void;
  resetConversation(conversationId: Nullable<string>): void;
  close(): Promise<void>;
}
