import { getCurrentUTCDate } from '../../../../shared/utils/date';
import { getUUID } from '../../../../shared/utils/common';
export class SessionMessage {
    id;
    sessionId;
    author;
    content;
    timestamp;
    imagePath;
    audioPath;
    errorMessage;
    interrupted;
    constructor(params) {
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
