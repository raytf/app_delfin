import { getCurrentUTCDate } from '../../../../shared/utils/date';
import { getUUID } from '../../../../shared/utils/common';

export type SessionStatus = 'active' | 'ended';

export class Session {
  id: string;
  name: string;
  presetId: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  messageCount: number;
  updatedAt: number;

  constructor(params: { name: string; presetId?: string }) {
    const now = getCurrentUTCDate().getTime() / 1000;
    this.id = getUUID();
    this.name = params.name;
    this.presetId = params.presetId ?? 'lecture-slide';
    this.startedAt = now;
    this.endedAt = null;
    this.status = 'active';
    this.messageCount = 0;
    this.updatedAt = now;
  }

  touch(): void {
    this.updatedAt = getCurrentUTCDate().getTime() / 1000;
  }

  end(): void {
    const now = getCurrentUTCDate().getTime() / 1000;
    this.status = 'ended';
    this.endedAt = now;
    this.updatedAt = now;
  }
}
