import { Session } from '../entities/session';
import type { SessionMessage } from '../entities/session-message';

export class SessionAggregate extends Session {
  messages: SessionMessage[];

  constructor(session: Session, messages: SessionMessage[]) {
    super({ name: session.name, presetId: session.presetId });
    Object.assign(this, session);
    this.messages = messages;
  }
}
