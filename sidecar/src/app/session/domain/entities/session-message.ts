import { getCurrentUTCDate } from '../../../../shared/utils/date';
import { getUUID } from '../../../../shared/utils/common';

export type SessionMessageAuthor = 'user' | 'assistant' | 'system';

export class SessionMessage {
  id: string;
  sessionId: string;
  author: SessionMessageAuthor;
  content: string;
  timestamp: number;
  imagePath: string | null;
  audioPath: string | null;
  errorMessage: string | null;
  interrupted: boolean;

  constructor(params: {
    sessionId: string;
    author: SessionMessageAuthor;
    content: string;
    timestamp?: number;
    id?: string;
    imagePath?: string | null;
    audioPath?: string | null;
    errorMessage?: string | null;
    interrupted?: boolean;
  }) {
    this.id = params.id ?? getUUID();
    this.sessionId = params.sessionId;
    this.author = params.author;
    this.content = params.content;
    this.timestamp = params.timestamp ?? getCurrentUTCDate().getTime() / 1000;
    this.imagePath = params.imagePath ?? null;
    this.audioPath = params.audioPath ?? null;
    this.errorMessage = params.errorMessage ?? null;
    this.interrupted = params.interrupted ?? false;
  }
}
