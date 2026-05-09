import { DomainException } from './domain-exception';
export class ConflictException extends DomainException {
    constructor(message, detail) {
        super(message, detail);
        Object.setPrototypeOf(this, ConflictException.prototype);
    }
}
