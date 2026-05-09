import { DomainException } from './domain-exception';
import errorMessage from '../constants/messages/error-message';

export class UnauthorizedException extends DomainException {
  constructor(message?: string, detail?: unknown) {
    super(message ?? errorMessage.UNAUTHENTICATED_ACCESS, detail);
    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}
