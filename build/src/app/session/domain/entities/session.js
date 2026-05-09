import { getCurrentUTCDate } from '../../../../shared/utils/date';
import { getUUID } from '../../../../shared/utils/common';
export class Session {
    id;
    name;
    presetId;
    startedAt;
    endedAt;
    status;
    messageCount;
    updatedAt;
    constructor(params) {
        const now = getCurrentUTCDate();
        this.id = getUUID();
        this.name = params.name;
        this.presetId = params.presetId ?? 'lecture-slide';
        this.startedAt = now;
        this.endedAt = null;
        this.status = 'active';
        this.messageCount = 0;
        this.updatedAt = now;
    }
    touch() {
        this.updatedAt = getCurrentUTCDate();
    }
    end() {
        const now = getCurrentUTCDate();
        this.status = 'ended';
        this.endedAt = now;
        this.updatedAt = now;
    }
}
