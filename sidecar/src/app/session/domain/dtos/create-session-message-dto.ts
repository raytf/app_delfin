import type { SessionMessageAuthor } from '../entities/session-message';
import type { Nullable } from '../../../../shared/types/object';

export type CreateSessionMessageDto = {
  author: SessionMessageAuthor;
  content: string;
  timestamp?: Date;
  errorMessage?: Nullable<string>;
  interrupted?: boolean;
  imageBase64?: string;
  audioBase64?: string;
};
