import { getCurrentUTCDate } from '../../../../shared/utils/date';
import { getUUID } from '../../../../shared/utils/common';
import type { Nullable } from '../../../../shared/types/object';

export type SessionMessageAuthor = 'user' | 'assistant' | 'system';

export class SessionMessage {
  id: string;
  sessionId: string;
  author: SessionMessageAuthor;
  content: string;
  timestamp: Date;
  imagePath: Nullable<string>;
  audioPath: Nullable<string>;
  errorMessage: Nullable<string>;
  interrupted: boolean;

  constructor(params: {
    sessionId: string;
    author: SessionMessageAuthor;
    content: string;
    timestamp?: Date;
    id?: string;
    imagePath?: Nullable<string>;
    audioPath?: Nullable<string>;
    errorMessage?: Nullable<string>;
    interrupted?: boolean;
  }) {
    this.id = params.id ?? getUUID();
    this.sessionId = params.sessionId;
    this.author = params.author;
    this.content = params.content;
    this.timestamp = params.timestamp ?? getCurrentUTCDate();
    this.imagePath = params.imagePath ?? null;
    this.audioPath = params.audioPath ?? null;
    this.errorMessage = params.errorMessage ?? null;
    this.interrupted = params.interrupted ?? false;
  }
}
