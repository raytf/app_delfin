import { DomainException } from './domain-exception';
export class NotFoundException extends DomainException {
    constructor(message, detail) {
        super(message, detail);
        this.name = 'NotFoundException';
        Object.setPrototypeOf(this, NotFoundException.prototype);
    }
}
