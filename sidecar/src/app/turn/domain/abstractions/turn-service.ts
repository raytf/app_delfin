import type { Nullable } from '../../../../shared/types/object';
import type { TurnRequestDto } from '../dtos/turn-dtos';
import type { TurnStreamer } from './turn-streamer';

export interface TurnService {
  handleTurn(
    sessionId: string,
    turnRequest: TurnRequestDto,
    streamer: TurnStreamer,
    interrupted: { current: boolean },
    activeTurnIdRef: { current: Nullable<string> },
  ): Promise<void>;
}
