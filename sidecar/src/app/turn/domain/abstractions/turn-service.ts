import type { TurnRequestDto } from "../dtos/turn-dtos";
import type { TurnStreamer } from "./turn-streamer";

export interface TurnService {
  handleTurn(
    sessionId: string,
    turnRequest: TurnRequestDto,
    streamer: TurnStreamer,
  ): void;
  interruptTurn(requestId: string): void;
  closeConnection(): void;
}
