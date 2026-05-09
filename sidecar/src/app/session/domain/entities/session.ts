import { getCurrentUTCDate } from '../../../../shared/utils/date';
import { getUUID } from '../../../../shared/utils/common';
import type { Nullable } from '../../../../shared/types/object';

export type SessionStatus = 'active' | 'ended';

export class Session {
  id: string;
  name: string;
  presetId: string;
  startedAt: Date;
  endedAt: Nullable<Date>;
  status: SessionStatus;
  messageCount: number;
  updatedAt: Date;

  constructor(params: { name: string; presetId?: string }) {
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

  touch(): void {
    this.updatedAt = getCurrentUTCDate();
  }

  end(): void {
    const now = getCurrentUTCDate();
    this.status = 'ended';
    this.endedAt = now;
    this.updatedAt = now;
  }
}
