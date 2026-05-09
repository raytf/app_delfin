import { DomainException } from './domain-exception';
export class BadRequestException extends DomainException {
    constructor(message, detail) {
        super(message, detail);
        Object.setPrototypeOf(this, BadRequestException.prototype);
    }
}
