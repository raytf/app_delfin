import { DomainException } from './domain-exception';

export class BadRequestException extends DomainException {
  constructor(message: string, detail?: unknown) {
    super(message, detail);
    Object.setPrototypeOf(this, BadRequestException.prototype);
  }
}
