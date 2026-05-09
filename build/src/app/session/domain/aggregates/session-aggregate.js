import { Session } from '../entities/session';
export class SessionAggregate extends Session {
    messages;
    constructor(session, messages) {
        super({ name: session.name, presetId: session.presetId });
        Object.assign(this, session);
        this.messages = messages;
    }
}
