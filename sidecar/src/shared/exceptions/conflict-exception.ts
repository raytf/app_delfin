import { DomainException } from './domain-exception';

export class ConflictException extends DomainException {
  constructor(message: string, detail?: unknown) {
    super(message, detail);
    Object.setPrototypeOf(this, ConflictException.prototype);
  }
}
